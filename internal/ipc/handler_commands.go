package ipc

// Command handlers, one func per IPC cmd, dispatched via the handlers map
// below. Extracted from the former handle() switch so each command is an
// independently addressable, testable unit. Signature is uniform:
// (repoPath, id, req) -> Response. Shared helpers (ok/fail/decodeParams/
// missingParam) live in handler.go (same package).
import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"hydragit/internal/git"
	"hydragit/internal/graph"
	"hydragit/internal/logger"
)

// cmdFunc is the uniform shape of every command handler.
type cmdFunc func(repoPath, id string, req Request) Response

// handlers routes a cmd string to its handler. A missing key is an unknown
// command (handled in handle()).
var handlers = map[string]cmdFunc{
	"ping":                        handlePing,
	"status":                      handleStatus,
	"branches":                    handleBranches,
	"log":                         handleLog,
	"log.file":                    handleLogFile,
	"file.history":                handleFileHistory,
	"line.history":                handleLineHistory,
	"diff":                        handleDiff,
	"diff.ref":                    handleDiffRef,
	"diff.range":                  handleDiffRange,
	"patch.format":                handlePatchFormat,
	"user":                        handleUser,
	"user.set":                    handleUserSet,
	"blame":                       handleBlame,
	"stash":                       handleStash,
	"stash.pop":                   handleStashPop,
	"stash.apply":                 handleStashApply,
	"stash.drop":                  handleStashDrop,
	"stash.clear":                 handleStashClear,
	"stash.show":                  handleStashShow,
	"stash.files":                 handleStashFiles,
	"stash.save":                  handleStashSave,
	"checkout":                    handleCheckout,
	"branch.create":               handleBranchCreate,
	"branch.delete":               handleBranchDelete,
	"branch.delete.remote":        handleBranchDeleteRemote,
	"branch.rename":               handleBranchRename,
	"branch.rename.remote":        handleBranchRenameRemote,
	"branch.rename.folder":        handleBranchRenameFolder,
	"branch.rename.folder.remote": handleBranchRenameFolderRemote,
	"branch.containing":           handleBranchContaining,
	"branch.divergeRewrite":       handleBranchDivergeRewrite,
	"merge":                       handleMerge,
	"merge.preview":               handleMergePreview,
	"conflicts":                   handleConflicts,
	"conflict.keepCurrent":        handleConflictKeepCurrent,
	"conflict.keepIncoming":       handleConflictKeepCurrent,
	"conflict.resolve":            handleConflictKeepCurrent,
	"conflict.continue":           handleConflictContinue,
	"conflict.abort":              handleConflictAbort,
	"reset":                       handleReset,
	"undo.last":                   handleUndoLast,
	"reflog":                      handleReflog,
	"rebase":                      handleRebase,
	"rebase.drop":                 handleRebaseDrop,
	"rebase.interactive":          handleRebaseInteractive,
	"commit.squash":               handleCommitSquash,
	"rebase.reword":               handleRebaseReword,
	"rebase.continue":             handleRebaseContinue,
	"rebase.skip":                 handleRebaseSkip,
	"rebase.abort":                handleRebaseAbort,
	"rebase.status":               handleRebaseStatus,
	"fetch":                       handleFetch,
	"pull":                        handlePull,
	"pull.mode":                   handlePullMode,
	"push":                        handlePush,
	"push.force":                  handlePushForce,
	"push.upto":                   handlePushUpto,
	"cherrypick":                  handleCherrypick,
	"discard":                     handleDiscard,
	"stage":                       handleStage,
	"unstage":                     handleStage,
	"diff.working":                handleDiffWorking,
	"hunk.stage":                  handleHunkStage,
	"hunk.unstage":                handleHunkStage,
	"hunk.discard":                handleHunkStage,
	"commit":                      handleCommit,
	"commit.push":                 handleCommitPush,
	"commit.amend":                handleCommitAmend,
	"commit.precheck":             handleCommitPrecheck,
	"commit.fixup":                handleCommitFixup,
	"rebase.autosquash":           handleRebaseAutosquash,
	"rerere.enable":               handleRerereEnable,
	"snapshot.list":               handleSnapshotList,
	"snapshot.save":               handleSnapshotSave,
	"snapshot.restore":            handleSnapshotRestore,
	"snapshot.drop":               handleSnapshotDrop,
	"commit.lastMessage":          handleCommitLastMessage,
	"revert":                      handleRevert,
	"tags":                        handleTags,
	"tag.create":                  handleTagCreate,
	"tag.delete":                  handleTagDelete,
	"worktree.list":               handleWorktreeList,
	"worktree.add":                handleWorktreeAdd,
	"worktree.remove":             handleWorktreeRemove,
	"worktree.lock":               handleWorktreeLock,
	"worktree.unlock":             handleWorktreeUnlock,
	"worktree.move":               handleWorktreeMove,
	"worktree.prune":              handleWorktreePrune,
}

func handlePing(repoPath, id string, req Request) Response {
	return ok(id, "pong")
}

func handleStatus(repoPath, id string, req Request) Response {
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
}

func handleBranches(repoPath, id string, req Request) Response {
	b, err := git.Branches(repoPath)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, b)
}

func handleLog(repoPath, id string, req Request) Response {
	var p struct {
		Branch  string `json:"branch"`
		Limit   int    `json:"limit"`
		Grep    string `json:"grep"`
		Author  string `json:"author"`
		Pickaxe string `json:"pickaxe"`
	}
	decodeParams(req.Params, &p)
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
}

func handleLogFile(repoPath, id string, req Request) Response {
	var p struct {
		Path string `json:"path"`
	}
	decodeParams(req.Params, &p)
	commits, err := git.LogFile(repoPath, p.Path)
	if err != nil {
		return fail(id, err)
	}
	laid := graph.AssignLanes(commits)
	return ok(id, laid)
}

func handleFileHistory(repoPath, id string, req Request) Response {
	var p struct {
		Path string `json:"path"`
		Ref  string `json:"ref"`
	}
	decodeParams(req.Params, &p)
	commits, err := git.FileHistory(repoPath, p.Ref, p.Path)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, commits)
}

func handleLineHistory(repoPath, id string, req Request) Response {
	var p struct {
		Path  string `json:"path"`
		Start int    `json:"start"`
		End   int    `json:"end"`
	}
	decodeParams(req.Params, &p)
	commits, err := git.LineHistory(repoPath, p.Path, p.Start, p.End)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, commits)
}

func handleDiff(repoPath, id string, req Request) Response {
	var p struct {
		Commit  string `json:"commit"`
		File    string `json:"file"`
		Pickaxe string `json:"pickaxe"` // restrict file list to pickaxe matches
	}
	decodeParams(req.Params, &p)
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
}

func handleDiffRef(repoPath, id string, req Request) Response {
	var p struct {
		Ref  string `json:"ref"`
		File string `json:"file"`
	}
	decodeParams(req.Params, &p)
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
}

func handleDiffRange(repoPath, id string, req Request) Response {
	var p struct {
		Base string `json:"base"`
		Head string `json:"head"`
		File string `json:"file"`
	}
	decodeParams(req.Params, &p)
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
}

func handlePatchFormat(repoPath, id string, req Request) Response {
	var p struct {
		Commit string `json:"commit"`
	}
	decodeParams(req.Params, &p)
	patch, err := git.FormatPatch(repoPath, p.Commit)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, patch)
}

func handleUser(repoPath, id string, req Request) Response {
	u, err := git.User(repoPath)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, u)
}

func handleUserSet(repoPath, id string, req Request) Response {
	var p struct {
		Name   string `json:"name"`
		Email  string `json:"email"`
		Global bool   `json:"global"`
	}
	decodeParams(req.Params, &p)
	if err := git.SetUser(repoPath, p.Name, p.Email, p.Global); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleBlame(repoPath, id string, req Request) Response {
	var p struct {
		Path     string `json:"path"`
		Ref      string `json:"ref"`      // "" = working tree, else a commit-ish
		Contents string `json:"contents"` // editor buffer for unsaved files
		Dirty    bool   `json:"dirty"`    // true → blame Contents, not disk
	}
	decodeParams(req.Params, &p)
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
}

func handleStash(repoPath, id string, req Request) Response {
	entries, err := git.StashList(repoPath)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, entries)
}

func handleStashPop(repoPath, id string, req Request) Response {
	var p struct {
		Index int `json:"index"`
	}
	decodeParams(req.Params, &p)
	if p.Index < 0 {
		return fail(id, fmt.Errorf("invalid stash index: %d", p.Index))
	}
	if err := git.StashPop(repoPath, p.Index); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleStashApply(repoPath, id string, req Request) Response {
	var p struct {
		Index int `json:"index"`
	}
	decodeParams(req.Params, &p)
	if p.Index < 0 {
		return fail(id, fmt.Errorf("invalid stash index: %d", p.Index))
	}
	if err := git.StashApply(repoPath, p.Index); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleStashDrop(repoPath, id string, req Request) Response {
	var p struct {
		Index int `json:"index"`
	}
	decodeParams(req.Params, &p)
	if p.Index < 0 {
		return fail(id, fmt.Errorf("invalid stash index: %d", p.Index))
	}
	if err := git.StashDrop(repoPath, p.Index); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleStashClear(repoPath, id string, req Request) Response {
	if err := git.StashClear(repoPath); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleStashShow(repoPath, id string, req Request) Response {
	var p struct {
		Index int `json:"index"`
	}
	decodeParams(req.Params, &p)
	hunks, err := git.StashShow(repoPath, p.Index)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, hunks)
}

func handleStashFiles(repoPath, id string, req Request) Response {
	var p struct {
		Index int `json:"index"`
	}
	decodeParams(req.Params, &p)
	files, err := git.StashFiles(repoPath, p.Index)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, files)
}

func handleStashSave(repoPath, id string, req Request) Response {
	var p struct {
		Message string `json:"message"`
	}
	decodeParams(req.Params, &p)
	if err := git.StashSave(repoPath, p.Message); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleCheckout(repoPath, id string, req Request) Response {
	var p struct {
		Branch string `json:"branch"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "branch", p.Branch); r != nil {
		return *r
	}
	if err := git.Checkout(repoPath, p.Branch); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleBranchCreate(repoPath, id string, req Request) Response {
	var p struct {
		Name string `json:"name"`
		From string `json:"from"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "name", p.Name); r != nil {
		return *r
	}
	if err := git.CreateBranch(repoPath, p.Name, p.From); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleBranchDelete(repoPath, id string, req Request) Response {
	var p struct {
		Name  string `json:"name"`
		Force bool   `json:"force"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "name", p.Name); r != nil {
		return *r
	}
	if err := git.DeleteBranch(repoPath, p.Name, p.Force); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleBranchDeleteRemote(repoPath, id string, req Request) Response {
	var p struct {
		Remote string `json:"remote"`
		Branch string `json:"branch"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "remote", p.Remote, "branch", p.Branch); r != nil {
		return *r
	}
	if err := git.DeleteRemoteBranch(repoPath, p.Remote, p.Branch); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleBranchRename(repoPath, id string, req Request) Response {
	var p struct {
		From string `json:"from"`
		To   string `json:"to"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "from", p.From, "to", p.To); r != nil {
		return *r
	}
	if err := git.RenameBranch(repoPath, p.From, p.To); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleBranchRenameRemote(repoPath, id string, req Request) Response {
	var p struct {
		Remote string `json:"remote"`
		Old    string `json:"old"`
		New    string `json:"new"`
	}
	decodeParams(req.Params, &p)
	if err := git.RenameRemoteBranch(repoPath, p.Remote, p.Old, p.New); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleBranchRenameFolder(repoPath, id string, req Request) Response {
	var p struct {
		OldPrefix string `json:"oldPrefix"`
		NewPrefix string `json:"newPrefix"`
	}
	decodeParams(req.Params, &p)
	renamed, err := git.RenameBranchFolder(repoPath, p.OldPrefix, p.NewPrefix)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, renamed)
}

func handleBranchRenameFolderRemote(repoPath, id string, req Request) Response {
	var p struct {
		NewPrefix string `json:"newPrefix"`
	}
	decodeParams(req.Params, &p)
	propagated, err := git.RenameBranchFolderRemote(repoPath, p.NewPrefix)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, propagated)
}

func handleBranchContaining(repoPath, id string, req Request) Response {
	var p struct {
		Commit string `json:"commit"`
	}
	decodeParams(req.Params, &p)
	branch, err := git.BranchContaining(repoPath, p.Commit)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, branch)
}

func handleBranchDivergeRewrite(repoPath, id string, req Request) Response {
	rewrite, err := git.DivergenceIsRewrite(repoPath)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, map[string]bool{"rewrite": rewrite})
}

func handleMerge(repoPath, id string, req Request) Response {
	var p struct {
		Branch string `json:"branch"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "branch", p.Branch); r != nil {
		return *r
	}
	if err := git.Merge(repoPath, p.Branch); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleMergePreview(repoPath, id string, req Request) Response {
	var p struct {
		Ours   string `json:"ours"`
		Theirs string `json:"theirs"`
	}
	decodeParams(req.Params, &p)
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
}

func handleConflicts(repoPath, id string, req Request) Response {
	info, err := git.Conflicts(repoPath)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, info)
}

func handleConflictKeepCurrent(repoPath, id string, req Request) Response {
	var p struct {
		File string `json:"file"`
	}
	decodeParams(req.Params, &p)
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
}

func handleConflictContinue(repoPath, id string, req Request) Response {
	var p struct {
		Operation string `json:"operation"`
	}
	decodeParams(req.Params, &p)
	conflict, err := git.ContinueConflict(repoPath, p.Operation)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, map[string]bool{"conflict": conflict})
}

func handleConflictAbort(repoPath, id string, req Request) Response {
	var p struct {
		Operation string `json:"operation"`
	}
	decodeParams(req.Params, &p)
	if err := git.AbortConflict(repoPath, p.Operation); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleReset(repoPath, id string, req Request) Response {
	var p struct {
		Commit string `json:"commit"`
		Mode   string `json:"mode"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "commit", p.Commit); r != nil {
		return *r
	}
	stashed, err := git.ResetWithAutostash(repoPath, p.Commit, p.Mode)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, map[string]bool{"stashed": stashed})
}

func handleUndoLast(repoPath, id string, req Request) Response {
	res, err := git.UndoLast(repoPath)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, res)
}

func handleReflog(repoPath, id string, req Request) Response {
	entries, err := git.Reflog(repoPath)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, entries)
}

func handleRebase(repoPath, id string, req Request) Response {
	var p struct {
		Onto string `json:"onto"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "onto", p.Onto); r != nil {
		return *r
	}
	if err := git.Rebase(repoPath, p.Onto); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleRebaseDrop(repoPath, id string, req Request) Response {
	var p struct {
		Commit string `json:"commit"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "commit", p.Commit); r != nil {
		return *r
	}
	conflict, err := git.DropCommit(repoPath, p.Commit)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, map[string]bool{"conflict": conflict})
}

func handleRebaseInteractive(repoPath, id string, req Request) Response {
	var p struct {
		Base  string               `json:"base"`
		Items []git.RebaseTodoItem `json:"items"`
	}
	decodeParams(req.Params, &p)
	conflict, err := git.RunInteractiveRebase(repoPath, p.Base, p.Items)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, map[string]bool{"conflict": conflict})
}

func handleCommitSquash(repoPath, id string, req Request) Response {
	var p struct {
		Commit string `json:"commit"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "commit", p.Commit); r != nil {
		return *r
	}
	conflict, err := git.SquashWithParent(repoPath, p.Commit)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, map[string]bool{"conflict": conflict})
}

func handleRebaseReword(repoPath, id string, req Request) Response {
	var p struct {
		Commit  string `json:"commit"`
		Message string `json:"message"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "commit", p.Commit, "message", p.Message); r != nil {
		return *r
	}
	conflict, err := git.RewordCommit(repoPath, p.Commit, p.Message)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, map[string]bool{"conflict": conflict})
}

func handleRebaseContinue(repoPath, id string, req Request) Response {
	conflict, err := git.RebaseContinue(repoPath)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, map[string]bool{"conflict": conflict})
}

func handleRebaseSkip(repoPath, id string, req Request) Response {
	conflict, err := git.RebaseSkip(repoPath)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, map[string]bool{"conflict": conflict})
}

func handleRebaseAbort(repoPath, id string, req Request) Response {
	if err := git.RebaseAbort(repoPath); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleRebaseStatus(repoPath, id string, req Request) Response {
	return ok(id, map[string]bool{"inProgress": git.RebaseInProgress(repoPath)})
}

func handleFetch(repoPath, id string, req Request) Response {
	if err := git.Fetch(repoPath); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handlePull(repoPath, id string, req Request) Response {
	if err := git.Pull(repoPath); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handlePullMode(repoPath, id string, req Request) Response {
	var p struct {
		Mode string `json:"mode"`
	}
	decodeParams(req.Params, &p)
	if err := git.PullMode(repoPath, p.Mode); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handlePush(repoPath, id string, req Request) Response {
	var p struct {
		Branch string `json:"branch"`
	}
	decodeParams(req.Params, &p)
	if err := git.Push(repoPath, p.Branch); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handlePushForce(repoPath, id string, req Request) Response {
	var p struct {
		Branch string `json:"branch"`
	}
	decodeParams(req.Params, &p)
	if err := git.PushForce(repoPath, p.Branch); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handlePushUpto(repoPath, id string, req Request) Response {
	var p struct {
		Commit string `json:"commit"`
		Branch string `json:"branch"`
	}
	decodeParams(req.Params, &p)
	if err := git.PushCommit(repoPath, p.Commit, p.Branch); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleCherrypick(repoPath, id string, req Request) Response {
	var p struct {
		Commit string `json:"commit"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "commit", p.Commit); r != nil {
		return *r
	}
	if err := git.CherryPick(repoPath, p.Commit); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleDiscard(repoPath, id string, req Request) Response {
	var p struct {
		Paths []string `json:"paths"`
	}
	decodeParams(req.Params, &p)
	if len(p.Paths) == 0 {
		return fail(id, fmt.Errorf("missing required parameter: paths"))
	}
	if err := git.Discard(repoPath, p.Paths); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleStage(repoPath, id string, req Request) Response {
	var p struct {
		Paths []string `json:"paths"`
	}
	decodeParams(req.Params, &p)
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
}

func handleDiffWorking(repoPath, id string, req Request) Response {
	var p struct {
		File   string `json:"file"`
		Cached bool   `json:"cached"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "file", p.File); r != nil {
		return *r
	}
	hunks, err := git.WorkingDiff(repoPath, p.File, p.Cached)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, hunks)
}

func handleHunkStage(repoPath, id string, req Request) Response {
	var p struct {
		Patch string `json:"patch"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "patch", p.Patch); r != nil {
		return *r
	}
	var err error
	switch req.Cmd {
	case "hunk.stage":
		err = git.StageHunk(repoPath, p.Patch)
	case "hunk.unstage":
		err = git.UnstageHunk(repoPath, p.Patch)
	default:
		err = git.DiscardHunk(repoPath, p.Patch)
	}
	if err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleCommit(repoPath, id string, req Request) Response {
	var p struct {
		Message string   `json:"message"`
		Paths   []string `json:"paths"`
	}
	decodeParams(req.Params, &p)
	result, err := git.CreateCommit(repoPath, p.Message, p.Paths)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, result)
}

func handleCommitPush(repoPath, id string, req Request) Response {
	var p struct {
		Message string   `json:"message"`
		Paths   []string `json:"paths"`
	}
	decodeParams(req.Params, &p)
	result, err := git.CommitAndPush(repoPath, p.Message, p.Paths)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, result)
}

func handleCommitAmend(repoPath, id string, req Request) Response {
	var p struct {
		Message string   `json:"message"`
		Paths   []string `json:"paths"`
	}
	decodeParams(req.Params, &p)
	result, err := git.AmendCommit(repoPath, p.Message, p.Paths)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, result)
}

func handleCommitPrecheck(repoPath, id string, req Request) Response {
	var p struct {
		Paths             []string `json:"paths"`
		Checks            []string `json:"checks"`            // enabled checks, injected by the host from settings; empty = all
		ProtectedBranches []string `json:"protectedBranches"` // custom protected list, injected by the host; empty = main/master
	}
	decodeParams(req.Params, &p)
	enabled := map[string]bool{}
	for _, c := range p.Checks {
		enabled[c] = true
	}
	return ok(id, git.CommitSafety(repoPath, p.Paths, enabled, p.ProtectedBranches))
}

func handleCommitFixup(repoPath, id string, req Request) Response {
	var p struct {
		Commit string   `json:"commit"`
		Paths  []string `json:"paths"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "commit", p.Commit); r != nil {
		return *r
	}
	result, err := git.FixupCommit(repoPath, p.Commit, p.Paths)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, result)
}

func handleRebaseAutosquash(repoPath, id string, req Request) Response {
	var p struct {
		Base string `json:"base"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "base", p.Base); r != nil {
		return *r
	}
	conflict, err := git.RebaseAutosquash(repoPath, p.Base)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, map[string]bool{"conflict": conflict})
}

func handleRerereEnable(repoPath, id string, req Request) Response {
	if err := git.EnableRerere(repoPath); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleSnapshotList(repoPath, id string, req Request) Response {
	snaps, err := git.SnapshotList(repoPath)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, snaps)
}

func handleSnapshotSave(repoPath, id string, req Request) Response {
	var p struct {
		Label string `json:"label"`
	}
	decodeParams(req.Params, &p)
	if p.Label == "" {
		p.Label = "manual snapshot"
	}
	snap, err := git.SnapshotCreate(repoPath, p.Label)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, snap) // null when the tree was clean
}

func handleSnapshotRestore(repoPath, id string, req Request) Response {
	var p struct {
		Hash string `json:"hash"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "hash", p.Hash); r != nil {
		return *r
	}
	if err := git.SnapshotRestore(repoPath, p.Hash); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleSnapshotDrop(repoPath, id string, req Request) Response {
	var p struct {
		Ref string `json:"ref"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "ref", p.Ref); r != nil {
		return *r
	}
	if err := git.SnapshotDrop(repoPath, p.Ref); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleCommitLastMessage(repoPath, id string, req Request) Response {
	msg, err := git.LastCommitMessage(repoPath)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, msg)
}

func handleRevert(repoPath, id string, req Request) Response {
	var p struct {
		Commit string `json:"commit"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "commit", p.Commit); r != nil {
		return *r
	}
	if err := git.Revert(repoPath, p.Commit); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleTags(repoPath, id string, req Request) Response {
	t, err := git.Tags(repoPath)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, t)
}

func handleTagCreate(repoPath, id string, req Request) Response {
	var p struct {
		Name    string `json:"name"`
		Commit  string `json:"commit"`
		Message string `json:"message"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "name", p.Name); r != nil {
		return *r
	}
	if err := git.CreateTag(repoPath, p.Name, p.Commit, p.Message); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleTagDelete(repoPath, id string, req Request) Response {
	var p struct {
		Name string `json:"name"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "name", p.Name); r != nil {
		return *r
	}
	if err := git.DeleteTag(repoPath, p.Name); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleWorktreeList(repoPath, id string, req Request) Response {
	wts, err := git.Worktrees(repoPath)
	if err != nil {
		return fail(id, err)
	}
	return ok(id, wts)
}

func handleWorktreeAdd(repoPath, id string, req Request) Response {
	var p struct {
		Path      string `json:"path"`
		Branch    string `json:"branch"`
		NewBranch string `json:"newBranch"`
		Start     string `json:"start"`
	}
	decodeParams(req.Params, &p)
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
}

func handleWorktreeRemove(repoPath, id string, req Request) Response {
	var p struct {
		Path  string `json:"path"`
		Force bool   `json:"force"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "path", p.Path); r != nil {
		return *r
	}
	if err := git.WorktreeRemove(repoPath, p.Path, p.Force); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleWorktreeLock(repoPath, id string, req Request) Response {
	var p struct {
		Path   string `json:"path"`
		Reason string `json:"reason"`
	}
	decodeParams(req.Params, &p)
	if err := git.WorktreeLock(repoPath, p.Path, p.Reason); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleWorktreeUnlock(repoPath, id string, req Request) Response {
	var p struct {
		Path string `json:"path"`
	}
	decodeParams(req.Params, &p)
	if err := git.WorktreeUnlock(repoPath, p.Path); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleWorktreeMove(repoPath, id string, req Request) Response {
	var p struct {
		From string `json:"from"`
		To   string `json:"to"`
	}
	decodeParams(req.Params, &p)
	if r := missingParam(id, "from", p.From, "to", p.To); r != nil {
		return *r
	}
	if err := git.WorktreeMove(repoPath, p.From, p.To); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}

func handleWorktreePrune(repoPath, id string, req Request) Response {
	if err := git.WorktreePrune(repoPath); err != nil {
		return fail(id, err)
	}
	return ok(id, nil)
}
