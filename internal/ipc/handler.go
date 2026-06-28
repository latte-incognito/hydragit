package ipc

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"hydragit/internal/git"
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

// decodeParams unmarshals a command's params into v. A decode error is
// swallowed by design — this is the single, documented place that does so,
// replacing 62 scattered bare json.Unmarshal calls:
//
//   - Read commands (log, diff, …) degrade gracefully: malformed or absent
//     params fall back to zero-value options (e.g. an unfiltered full log)
//     rather than failing the request.
//   - Mutating commands are still safe: a failed decode leaves required fields
//     empty, and missingParam rejects those downstream before any git runs.
//
// See TestHandle_malformedParamsJSON for the contract.
func decodeParams(raw json.RawMessage, v any) {
	if len(raw) == 0 {
		return
	}
	_ = json.Unmarshal(raw, v)
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
	"hunk.stage":            true,
	"hunk.unstage":          true,
	"hunk.discard":          true,
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
	"hunk.discard":       true,
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

// handle dispatches a request to its registered command handler. Kept separate
// from Handle() so that wrapper can layer timing, logging and per-repo locking
// around it. repoPath arrives already resolved (the per-request repo override is
// applied in Handle). An unregistered cmd is an unknown command.
func handle(repoPath string, req Request) Response {
	id := req.ID
	if h, ok := handlers[req.Cmd]; ok {
		return h(repoPath, id, req)
	}
	return Response{ID: id, OK: false, Error: "unknown command: " + req.Cmd}
}
