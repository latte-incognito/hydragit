package ipc

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"

	"hydragit/internal/git"
	"hydragit/internal/graph"
	"hydragit/internal/logger"
)

type Request struct {
	ID     string          `json:"id"`
	Cmd    string          `json:"cmd"`
	Params json.RawMessage `json:"params"`
}

type Response struct {
	ID    string      `json:"id"`
	OK    bool        `json:"ok"`
	Data  interface{} `json:"data,omitempty"`
	Error string      `json:"error,omitempty"`
}

func ok(id string, data interface{}) Response {
	return Response{ID: id, OK: true, Data: data}
}

func fail(id string, err error) Response {
	return Response{ID: id, OK: false, Error: err.Error()}
}

// logSilentCmds suppresses IPC request/response logging for high-frequency
// commands. Errors are always logged regardless of this map.
var logSilentCmds = map[string]bool{
	"status": true,
}

// lastStatusHash tracks the last seen status payload to log only on change.
var lastStatusHash string

func Handle(repoPath string, req Request) Response {
	id := req.ID
	start := time.Now()
	silent := logSilentCmds[req.Cmd]

	if !silent {
		logger.IPCRequest(id, req.Cmd)
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
// wrap it cleanly with timing and logging.
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
		// Only log when status actually changes
		b, _ := json.Marshal(s)
		sum := sha256.Sum256(b)
		h := hex.EncodeToString(sum[:8])
		if h != lastStatusHash {
			lastStatusHash = h
			logger.Info("status", "status changed")
		}

		return ok(id, s)

	case "branches":
		b, err := git.Branches(repoPath)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, b)

	case "log":
		var p struct {
			Branch string `json:"branch"`
			Limit  int    `json:"limit"`
		}
		json.Unmarshal(req.Params, &p)
		if p.Limit == 0 {
			p.Limit = 200
		}
		commits, err := git.Log(repoPath, p.Branch, p.Limit)
		if err != nil {
			return fail(id, err)
		}
		laid := graph.AssignLanes(commits)
		return ok(id, laid)

	case "diff":
		var p struct {
			Commit string `json:"commit"`
			File   string `json:"file"`
		}
		json.Unmarshal(req.Params, &p)
		if p.File != "" {
			hunks, err := git.DiffFile(repoPath, p.Commit, p.File)
			if err != nil {
				return fail(id, err)
			}
			return ok(id, hunks)
		}
		files, err := git.DiffCommit(repoPath, p.Commit)
		if err != nil {
			return fail(id, err)
		}
		return ok(id, files)

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
		if err := git.StashPop(repoPath, p.Index); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "stash.apply":
		var p struct {
			Index int `json:"index"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.StashApply(repoPath, p.Index); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "stash.drop":
		var p struct {
			Index int `json:"index"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.StashDrop(repoPath, p.Index); err != nil {
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
		if err := git.DeleteBranch(repoPath, p.Name, p.Force); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "branch.rename":
		var p struct {
			From string `json:"from"`
			To   string `json:"to"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.RenameBranch(repoPath, p.From, p.To); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "merge":
		var p struct {
			Branch string `json:"branch"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.Merge(repoPath, p.Branch); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "rebase":
		var p struct {
			Onto string `json:"onto"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.Rebase(repoPath, p.Onto); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

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

	case "push":
		var p struct {
			Branch string `json:"branch"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.Push(repoPath, p.Branch); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "cherrypick":
		var p struct {
			Commit string `json:"commit"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.CherryPick(repoPath, p.Commit); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "revert":
		var p struct {
			Commit string `json:"commit"`
		}
		json.Unmarshal(req.Params, &p)
		if err := git.Revert(repoPath, p.Commit); err != nil {
			return fail(id, err)
		}
		return ok(id, nil)

	case "log.file":
		var p struct {
			Path string `json:"path"`
		}
		json.Unmarshal(req.Params, &p)
		if p.Path == "" {
			return Response{ID: id, OK: false, Error: "log.file: missing path param"}
		}
		commits, err := git.LogFile(repoPath, p.Path)
		if err != nil {
			return fail(id, err)
		}
		laid := graph.AssignLanes(commits)
		return ok(id, laid)

	default:
		return Response{ID: id, OK: false, Error: "unknown command: " + req.Cmd}
	}
}
