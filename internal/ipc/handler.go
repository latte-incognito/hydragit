package ipc

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"hydragit/internal/git"
	"hydragit/internal/graph"
	"hydragit/internal/logger"
)

type Request struct {
	ID     string          `json:"id"`
	Cmd    string          `json:"cmd"`
	Repo   string          `json:"repo,omitempty"` // active repo root; falls back to spawn default
	Params json.RawMessage `json:"params"`
}

type Response struct {
	ID    string `json:"id"`
	OK    bool   `json:"ok"`
	Data  any    `json:"data,omitempty"`
	Error string `json:"error,omitempty"`
}

func ok(id string, data any) Response {
	return Response{ID: id, OK: true, Data: data}
}

func fail(id string, err error) Response {
	return Response{ID: id, OK: false, Error: err.Error()}
}

// missingParam validates required string params for mutating commands, given
// as ("name", value) pairs; it returns a failure Response naming the first
// empty one, or nil when all are present. Git would reject most of these
// anyway, but failing fast keeps garbage out of the exec layer and the error
// readable (SECURITY.md "empty-param rejection").
func missingParam(id string, pairs ...string) *Response {
	for i := 0; i+1 < len(pairs); i += 2 {
		if strings.TrimSpace(pairs[i+1]) == "" {
			r := fail(id, fmt.Errorf("missing required parameter: %s", pairs[i]))
			return &r
		}
	}
	return nil
}

// logSilentCmds suppresses IPC request/response logging for high-frequency
// commands. Errors are always logged regardless of this map.
var logSilentCmds = map[string]bool{
	"status": true,
}

// lastStatusHash tracks the last seen status payload per repo, to log only on
// change. Keyed by repo path — a multi-repo workspace polls several repos, and
// a single global would ping-pong between their hashes and log forever.
var (
	statusLogMu    sync.Mutex
	lastStatusHash = map[string]string{}
)

// Per-repo locking. Mutating commands take the repo's exclusive lock — git
// must never run two state-changing operations on the same .git concurrently
// (index/ref-lock corruption). Everything else shares a read lock, so reads
// run concurrently and a hung network op can't freeze the status poll.
// Distinct repos never block each other.
var (
	repoLocksMu sync.Mutex
	repoLocks   = map[string]*sync.RWMutex{}
)

func lockFor(repoPath string) *sync.RWMutex {
	repoLocksMu.Lock()
	defer repoLocksMu.Unlock()
	l, ok := repoLocks[repoPath]
	if !ok {
		l = &sync.RWMutex{}
		repoLocks[repoPath] = l
	}
	return l
}

// mutatingCmds lists commands that modify the index, working tree, HEAD, local
// refs or config — they serialize per repo. Commands not listed are treated as
// shared: pure reads, plus remote-only ops (fetch, push, push.force, push.upto,
// branch.*.remote) that touch refs/remotes at most and are safe alongside
// reads — deliberately, so a 30s-hung fetch doesn't block the status poll.
var mutatingCmds = map[string]bool{
	"checkout":              true,
	"branch.create":         true,
	"branch.delete":         true,
	"branch.rename":         true,
	"branch.rename.folder":  true,
	"merge":                 true,
	"rebase":                true,
	"rebase.drop":           true,
	"rebase.interactive":    true,
	"rebase.reword":         true,
	"rebase.continue":       true,
	"rebase.skip":           true,
	"rebase.abort":          true,
	"commit":                true,
	"commit.push":           true,
	"commit.amend":          true,
	"commit.squash":         true,
	"cherrypick":            true,
	"revert":                true,
	"reset":                 true,
	"undo.last":             true,
	"pull":                  true,
	"pull.mode":             true,
	"stash.pop":             true,
	"stash.apply":           true,
	"stash.drop":            true,
	"stash.clear":           true,
	"stash.save":            true,
	"conflict.keepCurrent":  true,
	"conflict.keepIncoming": true,
	"conflict.resolve":      true,
	"conflict.continue":     true,
	"conflict.abort":        true,
	"tag.create":            true,
	"tag.delete":            true,
	"user.set":              true,
	"worktree.add":          true,
	"worktree.remove":       true,
	"worktree.lock":         true,
	"worktree.unlock":       true,
	"worktree.move":         true,
	"worktree.prune":        true,
	"commit.fixup":          true,
	"rebase.autosquash":     true,
	"rerere.enable":         true,
	"snapshot.save":         true,
	"snapshot.restore":      true,
	"snapshot.drop":         true,
	"discard":               true,
	"stage":                 true,
	"unstage":               true,
}

// autoSnapshotCmds trigger a working-tree snapshot (refs/hydragit/snapshots)
// right before they run — the safety net for operations that can eat
// uncommitted work. Best-effort: a clean tree skips silently, and a snapshot
// failure never blocks the operation itself. Runs inside the repo's exclusive
// lock, so the captured state is exactly what the operation sees.
var autoSnapshotCmds = map[string]bool{
	"merge":              true,
	"rebase":             true,
	"rebase.interactive": true,
	"rebase.autosquash":  true,
	"rebase.drop":        true,
	"commit.squash":      true,
	"reset":              true,
	"pull":               true,
	"cherrypick":         true,
	"revert":             true,
	"undo.last":          true,
	"checkout":           true,
	"stash.pop":          true,
	"stash.apply":        true,
	"snapshot.restore":   true,
	"discard":            true,
}

func Handle(repoPath string, req Request) Response {
	// Per-request repo override: a multi-repo workspace sends the active repo
	// root on each request; when absent, fall back to the spawn-time default
	// (HYDRAGIT_REPO). Resolved here so locking targets the real repo.
	if req.Repo != "" {
		repoPath = req.Repo
	}

	id := req.ID
	start := time.Now()
	silent := logSilentCmds[req.Cmd]

	if !silent {
		logger.IPCRequest(id, req.Cmd)
	}

	l := lockFor(repoPath)
	if mutatingCmds[req.Cmd] {
		l.Lock()
		defer l.Unlock()
	} else {
		l.RLock()
		defer l.RUnlock()
	}

	if autoSnapshotCmds[req.Cmd] {
		if _, err := git.SnapshotCreate(repoPath, "before "+req.Cmd); err != nil {
			logger.Error("snapshot", "auto-snapshot before "+req.Cmd+" failed: "+err.Error())
		}
	}

	resp := handle(repoPath, req)

	durationMs := time.Since(start).Milliseconds()

	if !silent {
		errMsg := ""
		if !resp.OK {
			errMsg = resp.Error
		}
		logger.IPCResponse(id, req.Cmd, resp.OK, durationMs, errMsg)
	} else if !resp.OK {
		// silent cmd errored — always surface errors
		logger.IPCResponse(id, req.Cmd, false, durationMs, resp.Error)
	}

	return resp
}

// handle contains the actual dispatch logic, kept separate so Handle() can
// wrap it cleanly with timing, logging and per-repo locking. repoPath arrives
// already resolved (per-request repo override applied in Handle).
func handle(repoPath string, req Request) Response {
	id := req.ID

	switch req.Cmd {

	case "ping":
		return ok(id, "pong")

	case "status":
		s, err := git.Status(repoPath)
		if err != nil {
			return fail(id, err)
		}
		// Only log when this repo's status actually changes
		b, _ := json.Marshal(s)
		sum := sha256.Sum256(b)
		h := hex.EncodeToString(sum[:8])
		statusLogMu.Lock()
		if h != lastStatusHash[repoPath] {
			lastStatusHash[repoPath] = h
			logger.Info("status", "status changed")
		}
		statusLogMu.Unlock()

		return ok(id, s)

	case "branches":
		b, err := git.Branches(repoPath)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, b)

	case "log":
		var p struct {
			Branch  string `json:"branch"`
			Limit   int    `json:"limit"`
			Grep    string `json:"grep"`
			Author  string `json:"author"`
			Pickaxe string `json:"pickaxe"`
		}
		json.Unmarshal(req.Params, &p)
		// p.Limit == 0 means "no limit" — load the full history. The webview
		// virtualizes rendering (LogPane), so it can hold the whole log.
		commits, err := git.LogWith(repoPath, git.LogOptions{
			Branch:  p.Branch,
			Limit:   p.Limit,
			Grep:    p.Grep,
			Author:  p.Author,
			Pickaxe: p.Pickaxe,
		})
		if err != nil {
			return fail(id, err)
		}
		laid := graph.AssignLanes(commits)
		return ok(id, laid)

	case "log.file":
		var p struct {
			Path string `json:"path"`
		}
		json.Unmarshal(req.Params, &p)
		commits, err := git.LogFile(repoPath, p.Path)
		if err != nil {
			return fail(id, err)
		}
		laid := graph.AssignLanes(commits)
		return ok(id, laid)

	case "file.history":
		var p struct {
			Path string `json:"path"`
			Ref  string `json:"ref"`
		}
		json.Unmarshal(req.Params, &p)
		commits, err := git.FileHistory(repoPath, p.Ref, p.Path)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, commits)

	case "line.history":
		var p struct {
			Path  string `json:"path"`
			Start int    `json:"start"`
			End   int    `json:"end"`
		}
		json.Unmarshal(req.Params, &p)
		commits, err := git.LineHistory(repoPath, p.Path, p.Start, p.End)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, commits)

	case "diff":
		var p struct {
			Commit  string `json:"commit"`
			File    string `json:"file"`
			Pickaxe string `json:"pickaxe"` // restrict file list to pickaxe matches
		}
		json.Unmarshal(req.Params, &p)
		if p.File != "" {
			hunks, err := git.DiffFile(repoPath, p.Commit, p.File)
			if err != nil {
				return fail(id, err)
			}
			return ok(id, hunks)
		}
		var files []git.FileStat
		var err error
		if p.Pickaxe != "" {
			files, err = git.DiffCommitPickaxe(repoPath, p.Commit, p.Pickaxe)
		} else {
			files, err = git.DiffCommit(repoPath, p.Commit)
		}
		if err != nil {
			return fail(id, err)
		}
		return ok(id, files)

	case "diff.ref":
		var p struct {
			Ref  string `json:"ref"`
			File string `json:"file"`
		}
		json.Unmarshal(req.Params, &p)
		if p.File != "" {
			hunks, err := git.DiffRefFile(repoPath, p.Ref, p.File)
			if err != nil {
				return fail(id, err)
			}
			return ok(id, hunks)
		}
		files, err := git.DiffRefFiles(repoPath, p.Ref)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, files)

	case "diff.range":
		var p struct {
			Base string `json:"base"`
			Head string `json:"head"`
			File string `json:"file"`
		}
		json.Unmarshal(req.Params, &p)
		if p.File != "" {
			hunks, err := git.DiffRangeFile(repoPath, p.Base, p.Head, p.File)
			if err != nil {
				return fail(id, err)
			}
			return ok(id, hunks)
		}
		files, err := git.DiffRangeFiles(repoPath, p.Base, p.Head)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, files)

	case "patch.format":
		var p struct {
			Commit string `json:"commit"`
		}
		json.Unmarshal(req.Params, &p)
		patch, err := git.FormatPatch(repoPath, p.Commit)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, patch)

	case "user":
		u, err := git.User(repoPath)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, u)

	case "user.set":
		var p struct {
			Name   string `json:"name"`
			Email  string `json:"email"`
			Global bool   `json:"global"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.SetUser(repoPath, p.Name, p.Email, p.Global); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "blame":
		var p struct {
			Path     string `json:"path"`
			Ref      string `json:"ref"`      // "" = working tree, else a commit-ish
			Contents string `json:"contents"` // editor buffer for unsaved files
			Dirty    bool   `json:"dirty"`    // true → blame Contents, not disk
		}
		json.Unmarshal(req.Params, &p)
		var contents []byte
		if p.Dirty {
			// non-nil (possibly empty) slice flips Blame into --contents - mode
			contents = []byte(p.Contents)
		}
		lines, err := git.Blame(repoPath, p.Path, p.Ref, contents)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, lines)

	case "stash":
		entries, err := git.StashList(repoPath)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, entries)

	case "stash.pop":
		var p struct {
			Index int `json:"index"`
		}
		json.Unmarshal(req.Params, &p)
		if p.Index < 0 {
			return fail(id, fmt.Errorf("invalid stash index: %d", p.Index))
		}
		if err := git.StashPop(repoPath, p.Index); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "stash.apply":
		var p struct {
			Index int `json:"index"`
		}
		json.Unmarshal(req.Params, &p)
		if p.Index < 0 {
			return fail(id, fmt.Errorf("invalid stash index: %d", p.Index))
		}
		if err := git.StashApply(repoPath, p.Index); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "stash.drop":
		var p struct {
			Index int `json:"index"`
		}
		json.Unmarshal(req.Params, &p)
		if p.Index < 0 {
			return fail(id, fmt.Errorf("invalid stash index: %d", p.Index))
		}
		if err := git.StashDrop(repoPath, p.Index); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "stash.clear":
		if err := git.StashClear(repoPath); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "stash.show":
		var p struct {
			Index int `json:"index"`
		}
		json.Unmarshal(req.Params, &p)
		hunks, err := git.StashShow(repoPath, p.Index)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, hunks)

	case "stash.files":
		var p struct {
			Index int `json:"index"`
		}
		json.Unmarshal(req.Params, &p)
		files, err := git.StashFiles(repoPath, p.Index)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, files)

	case "stash.save":
		var p struct {
			Message string `json:"message"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.StashSave(repoPath, p.Message); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "checkout":
		var p struct {
			Branch string `json:"branch"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "branch", p.Branch); r != nil {
			return *r
		}
		if err := git.Checkout(repoPath, p.Branch); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "branch.create":
		var p struct {
			Name string `json:"name"`
			From string `json:"from"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "name", p.Name); r != nil {
			return *r
		}
		if err := git.CreateBranch(repoPath, p.Name, p.From); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "branch.delete":
		var p struct {
			Name  string `json:"name"`
			Force bool   `json:"force"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "name", p.Name); r != nil {
			return *r
		}
		if err := git.DeleteBranch(repoPath, p.Name, p.Force); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "branch.delete.remote":
		var p struct {
			Remote string `json:"remote"`
			Branch string `json:"branch"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "remote", p.Remote, "branch", p.Branch); r != nil {
			return *r
		}
		if err := git.DeleteRemoteBranch(repoPath, p.Remote, p.Branch); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "branch.rename":
		var p struct {
			From string `json:"from"`
			To   string `json:"to"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "from", p.From, "to", p.To); r != nil {
			return *r
		}
		if err := git.RenameBranch(repoPath, p.From, p.To); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "branch.rename.remote":
		var p struct {
			Remote string `json:"remote"`
			Old    string `json:"old"`
			New    string `json:"new"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.RenameRemoteBranch(repoPath, p.Remote, p.Old, p.New); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "branch.rename.folder":
		var p struct {
			OldPrefix string `json:"oldPrefix"`
			NewPrefix string `json:"newPrefix"`
		}
		json.Unmarshal(req.Params, &p)
		renamed, err := git.RenameBranchFolder(repoPath, p.OldPrefix, p.NewPrefix)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, renamed)

	case "branch.rename.folder.remote":
		var p struct {
			NewPrefix string `json:"newPrefix"`
		}
		json.Unmarshal(req.Params, &p)
		propagated, err := git.RenameBranchFolderRemote(repoPath, p.NewPrefix)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, propagated)

	case "branch.containing":
		var p struct {
			Commit string `json:"commit"`
		}
		json.Unmarshal(req.Params, &p)
		branch, err := git.BranchContaining(repoPath, p.Commit)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, branch)

	case "merge":
		var p struct {
			Branch string `json:"branch"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "branch", p.Branch); r != nil {
			return *r
		}
		if err := git.Merge(repoPath, p.Branch); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "merge.preview":
		var p struct {
			Ours   string `json:"ours"`
			Theirs string `json:"theirs"`
		}
		json.Unmarshal(req.Params, &p)
		if p.Ours == "" {
			p.Ours = "HEAD"
		}
		if r := missingParam(id, "theirs", p.Theirs); r != nil {
			return *r
		}
		preview, err := git.PreviewMerge(repoPath, p.Ours, p.Theirs)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, preview)

	case "conflicts":
		info, err := git.Conflicts(repoPath)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, info)

	case "conflict.keepCurrent", "conflict.keepIncoming", "conflict.resolve":
		var p struct {
			File string `json:"file"`
		}
		json.Unmarshal(req.Params, &p)
		var cerr error
		switch req.Cmd {
		case "conflict.keepCurrent":
			cerr = git.KeepCurrent(repoPath, p.File)
		case "conflict.keepIncoming":
			cerr = git.KeepIncoming(repoPath, p.File)
		default:
			cerr = git.MarkResolved(repoPath, p.File)
		}
		if cerr != nil {
			return fail(id, cerr)
		}
		return ok(id, nil)

	case "conflict.continue":
		var p struct {
			Operation string `json:"operation"`
		}
		json.Unmarshal(req.Params, &p)
		conflict, err := git.ContinueConflict(repoPath, p.Operation)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, map[string]bool{"conflict": conflict})

	case "conflict.abort":
		var p struct {
			Operation string `json:"operation"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.AbortConflict(repoPath, p.Operation); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "reset":
		var p struct {
			Commit string `json:"commit"`
			Mode   string `json:"mode"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "commit", p.Commit); r != nil {
			return *r
		}
		stashed, err := git.ResetWithAutostash(repoPath, p.Commit, p.Mode)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, map[string]bool{"stashed": stashed})

	case "undo.last":
		res, err := git.UndoLast(repoPath)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, res)

	case "reflog":
		entries, err := git.Reflog(repoPath)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, entries)

	case "rebase":
		var p struct {
			Onto string `json:"onto"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "onto", p.Onto); r != nil {
			return *r
		}
		if err := git.Rebase(repoPath, p.Onto); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "rebase.drop":
		var p struct {
			Commit string `json:"commit"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "commit", p.Commit); r != nil {
			return *r
		}
		conflict, err := git.DropCommit(repoPath, p.Commit)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, map[string]bool{"conflict": conflict})

	case "rebase.interactive":
		var p struct {
			Base  string               `json:"base"`
			Items []git.RebaseTodoItem `json:"items"`
		}
		json.Unmarshal(req.Params, &p)
		conflict, err := git.RunInteractiveRebase(repoPath, p.Base, p.Items)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, map[string]bool{"conflict": conflict})

	case "commit.squash":
		var p struct {
			Commit string `json:"commit"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "commit", p.Commit); r != nil {
			return *r
		}
		conflict, err := git.SquashWithParent(repoPath, p.Commit)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, map[string]bool{"conflict": conflict})

	case "rebase.reword":
		var p struct {
			Commit  string `json:"commit"`
			Message string `json:"message"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "commit", p.Commit, "message", p.Message); r != nil {
			return *r
		}
		conflict, err := git.RewordCommit(repoPath, p.Commit, p.Message)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, map[string]bool{"conflict": conflict})

	case "rebase.continue":
		conflict, err := git.RebaseContinue(repoPath)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, map[string]bool{"conflict": conflict})

	case "rebase.skip":
		conflict, err := git.RebaseSkip(repoPath)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, map[string]bool{"conflict": conflict})

	case "rebase.abort":
		if err := git.RebaseAbort(repoPath); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "rebase.status":
		return ok(id, map[string]bool{"inProgress": git.RebaseInProgress(repoPath)})

	case "fetch":
		if err := git.Fetch(repoPath); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "pull":
		if err := git.Pull(repoPath); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "pull.mode":
		var p struct {
			Mode string `json:"mode"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.PullMode(repoPath, p.Mode); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "push":
		var p struct {
			Branch string `json:"branch"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.Push(repoPath, p.Branch); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "push.force":
		var p struct {
			Branch string `json:"branch"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.PushForce(repoPath, p.Branch); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "push.upto":
		var p struct {
			Commit string `json:"commit"`
			Branch string `json:"branch"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.PushCommit(repoPath, p.Commit, p.Branch); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "cherrypick":
		var p struct {
			Commit string `json:"commit"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "commit", p.Commit); r != nil {
			return *r
		}
		if err := git.CherryPick(repoPath, p.Commit); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "discard":
		var p struct {
			Paths []string `json:"paths"`
		}
		json.Unmarshal(req.Params, &p)
		if len(p.Paths) == 0 {
			return fail(id, fmt.Errorf("missing required parameter: paths"))
		}
		if err := git.Discard(repoPath, p.Paths); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "stage", "unstage":
		var p struct {
			Paths []string `json:"paths"`
		}
		json.Unmarshal(req.Params, &p)
		if len(p.Paths) == 0 {
			return fail(id, fmt.Errorf("missing required parameter: paths"))
		}
		fn := git.Stage
		if req.Cmd == "unstage" {
			fn = git.Unstage
		}
		if err := fn(repoPath, p.Paths); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "commit":
		var p struct {
			Message string   `json:"message"`
			Paths   []string `json:"paths"`
		}
		json.Unmarshal(req.Params, &p)
		result, err := git.CreateCommit(repoPath, p.Message, p.Paths)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, result)

	case "commit.push":
		var p struct {
			Message string   `json:"message"`
			Paths   []string `json:"paths"`
		}
		json.Unmarshal(req.Params, &p)
		result, err := git.CommitAndPush(repoPath, p.Message, p.Paths)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, result)

	case "commit.amend":
		var p struct {
			Message string   `json:"message"`
			Paths   []string `json:"paths"`
		}
		json.Unmarshal(req.Params, &p)
		result, err := git.AmendCommit(repoPath, p.Message, p.Paths)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, result)

	case "commit.precheck":
		var p struct {
			Paths             []string `json:"paths"`
			Checks            []string `json:"checks"`            // enabled checks, injected by the host from settings; empty = all
			ProtectedBranches []string `json:"protectedBranches"` // custom protected list, injected by the host; empty = main/master
		}
		json.Unmarshal(req.Params, &p)
		enabled := map[string]bool{}
		for _, c := range p.Checks {
			enabled[c] = true
		}
		return ok(id, git.CommitSafety(repoPath, p.Paths, enabled, p.ProtectedBranches))

	case "commit.fixup":
		var p struct {
			Commit string   `json:"commit"`
			Paths  []string `json:"paths"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "commit", p.Commit); r != nil {
			return *r
		}
		result, err := git.FixupCommit(repoPath, p.Commit, p.Paths)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, result)

	case "rebase.autosquash":
		var p struct {
			Base string `json:"base"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "base", p.Base); r != nil {
			return *r
		}
		conflict, err := git.RebaseAutosquash(repoPath, p.Base)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, map[string]bool{"conflict": conflict})

	case "rerere.enable":
		if err := git.EnableRerere(repoPath); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "snapshot.list":
		snaps, err := git.SnapshotList(repoPath)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, snaps)

	case "snapshot.save":
		var p struct {
			Label string `json:"label"`
		}
		json.Unmarshal(req.Params, &p)
		if p.Label == "" {
			p.Label = "manual snapshot"
		}
		snap, err := git.SnapshotCreate(repoPath, p.Label)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, snap) // null when the tree was clean

	case "snapshot.restore":
		var p struct {
			Hash string `json:"hash"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "hash", p.Hash); r != nil {
			return *r
		}
		if err := git.SnapshotRestore(repoPath, p.Hash); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "snapshot.drop":
		var p struct {
			Ref string `json:"ref"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "ref", p.Ref); r != nil {
			return *r
		}
		if err := git.SnapshotDrop(repoPath, p.Ref); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "commit.lastMessage":
		msg, err := git.LastCommitMessage(repoPath)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, msg)

	case "revert":
		var p struct {
			Commit string `json:"commit"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "commit", p.Commit); r != nil {
			return *r
		}
		if err := git.Revert(repoPath, p.Commit); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "tags":
		t, err := git.Tags(repoPath)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, t)

	case "tag.create":
		var p struct {
			Name    string `json:"name"`
			Commit  string `json:"commit"`
			Message string `json:"message"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "name", p.Name); r != nil {
			return *r
		}
		if err := git.CreateTag(repoPath, p.Name, p.Commit, p.Message); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "tag.delete":
		var p struct {
			Name string `json:"name"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "name", p.Name); r != nil {
			return *r
		}
		if err := git.DeleteTag(repoPath, p.Name); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "worktree.list":
		wts, err := git.Worktrees(repoPath)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, wts)

	case "worktree.add":
		var p struct {
			Path      string `json:"path"`
			Branch    string `json:"branch"`
			NewBranch string `json:"newBranch"`
			Start     string `json:"start"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "path", p.Path); r != nil {
			return *r
		}
		var werr error
		if p.NewBranch != "" {
			werr = git.WorktreeAddNew(repoPath, p.Path, p.NewBranch, p.Start)
		} else {
			werr = git.WorktreeAdd(repoPath, p.Path, p.Branch)
		}
		if werr != nil {
			return fail(id, werr)
		}
		return ok(id, nil)

	case "worktree.remove":
		var p struct {
			Path  string `json:"path"`
			Force bool   `json:"force"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "path", p.Path); r != nil {
			return *r
		}
		if err := git.WorktreeRemove(repoPath, p.Path, p.Force); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "worktree.lock":
		var p struct {
			Path   string `json:"path"`
			Reason string `json:"reason"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.WorktreeLock(repoPath, p.Path, p.Reason); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "worktree.unlock":
		var p struct {
			Path string `json:"path"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.WorktreeUnlock(repoPath, p.Path); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "worktree.move":
		var p struct {
			From string `json:"from"`
			To   string `json:"to"`
		}
		json.Unmarshal(req.Params, &p)
		if r := missingParam(id, "from", p.From, "to", p.To); r != nil {
			return *r
		}
		if err := git.WorktreeMove(repoPath, p.From, p.To); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "worktree.prune":
		if err := git.WorktreePrune(repoPath); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	default:
		return Response{ID: id, OK: false, Error: "unknown command: " + req.Cmd}
	}
}
