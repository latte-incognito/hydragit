package ipc

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// makeRepo creates a real git repo with two real file commits.
// Real files are needed for cherry-pick and revert to work correctly.
func makeRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	for _, c := range [][]string{
		{"git", "-C", dir, "init"},
		{"git", "-C", dir, "config", "user.email", "test@test.com"},
		{"git", "-C", dir, "config", "user.name", "Test"},
	} {
		if err := exec.Command(c[0], c[1:]...).Run(); err != nil {
			t.Fatalf("setup cmd %v failed: %v", c, err)
		}
	}

	// first commit — real file
	if err := os.WriteFile(filepath.Join(dir, "file-a.txt"), []byte("content a\n"), 0644); err != nil {
		t.Fatal(err)
	}
	exec.Command("git", "-C", dir, "add", ".").Run()
	exec.Command("git", "-C", dir, "commit", "-m", "first commit").Run()

	// second commit — different file
	if err := os.WriteFile(filepath.Join(dir, "file-b.txt"), []byte("content b\n"), 0644); err != nil {
		t.Fatal(err)
	}
	exec.Command("git", "-C", dir, "add", ".").Run()
	exec.Command("git", "-C", dir, "commit", "-m", "second commit").Run()

	return dir
}

func params(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

func req(cmd string, p json.RawMessage) Request {
	return Request{ID: "test-id", Cmd: cmd, Params: p}
}

// ── ping ────────────────────────────────────────────────────────────────────

func TestHandlePing(t *testing.T) {
	resp := Handle("", req("ping", params(nil)))
	if !resp.OK {
		t.Fatalf("ping failed: %s", resp.Error)
	}
	if resp.Data != "pong" {
		t.Fatalf("expected pong, got %v", resp.Data)
	}
}

// ── unknown command ──────────────────────────────────────────────────────────

func TestHandleUnknownCmd(t *testing.T) {
	resp := Handle("", req("does.not.exist", params(nil)))
	if resp.OK {
		t.Fatal("expected failure for unknown command")
	}
}

// ── status ───────────────────────────────────────────────────────────────────

func TestHandleStatus(t *testing.T) {
	dir := makeRepo(t)
	resp := Handle(dir, req("status", params(nil)))
	if !resp.OK {
		t.Fatalf("status failed: %s", resp.Error)
	}

	b, _ := json.Marshal(resp.Data)
	var s struct {
		Branch string `json:"branch"`
	}
	if err := json.Unmarshal(b, &s); err != nil {
		t.Fatalf("bad status shape: %v", err)
	}
	if s.Branch == "" {
		t.Fatal("expected branch name in status")
	}
}

// ── branches ─────────────────────────────────────────────────────────────────

func TestHandleBranches(t *testing.T) {
	dir := makeRepo(t)
	resp := Handle(dir, req("branches", params(nil)))
	if !resp.OK {
		t.Fatalf("branches failed: %s", resp.Error)
	}

	b, _ := json.Marshal(resp.Data)
	var branches []struct {
		Name      string `json:"name"`
		IsCurrent bool   `json:"isCurrent"`
	}
	if err := json.Unmarshal(b, &branches); err != nil {
		t.Fatalf("bad branches shape: %v", err)
	}
	if len(branches) == 0 {
		t.Fatal("expected at least one branch")
	}

	hasCurrent := false
	for _, br := range branches {
		if br.IsCurrent {
			hasCurrent = true
		}
	}
	if !hasCurrent {
		t.Fatal("expected one branch marked as current")
	}
}

// ── log ───────────────────────────────────────────────────────────────────────

func TestHandleLog(t *testing.T) {
	dir := makeRepo(t)
	resp := Handle(dir, req("log", params(map[string]any{"limit": 10})))
	if !resp.OK {
		t.Fatalf("log failed: %s", resp.Error)
	}

	b, _ := json.Marshal(resp.Data)
	var commits []struct {
		Hash    string `json:"hash"`
		Message string `json:"message"`
		Lane    int    `json:"lane"`
	}
	if err := json.Unmarshal(b, &commits); err != nil {
		t.Fatalf("bad log shape: %v", err)
	}
	if len(commits) == 0 {
		t.Fatal("expected commits in log")
	}
	if commits[0].Hash == "" {
		t.Fatal("expected hash on first commit")
	}
}

// ── diff ──────────────────────────────────────────────────────────────────────

func TestHandleDiffCommit(t *testing.T) {
	dir := makeRepo(t)

	// get the first commit hash via log
	logResp := Handle(dir, req("log", params(map[string]any{"limit": 10})))
	if !logResp.OK {
		t.Fatalf("log failed: %s", logResp.Error)
	}
	b, _ := json.Marshal(logResp.Data)
	var commits []struct {
		Hash string `json:"hash"`
	}
	json.Unmarshal(b, &commits)
	if len(commits) == 0 {
		t.Fatal("no commits")
	}

	resp := Handle(dir, req("diff", params(map[string]any{"commit": commits[0].Hash})))
	if !resp.OK {
		t.Fatalf("diff failed: %s", resp.Error)
	}
	// empty commits have no files — just verify shape is a slice
	b2, _ := json.Marshal(resp.Data)
	var files []any
	if err := json.Unmarshal(b2, &files); err != nil {
		t.Fatalf("bad diff shape: %v", err)
	}
}

// ── branch.create / checkout / branch.rename / branch.delete ─────────────────

func TestHandleBranchLifecycle(t *testing.T) {
	dir := makeRepo(t)

	// create
	resp := Handle(dir, req("branch.create", params(map[string]any{"name": "feature-x"})))
	if !resp.OK {
		t.Fatalf("branch.create failed: %s", resp.Error)
	}

	// checkout
	resp = Handle(dir, req("checkout", params(map[string]any{"branch": "feature-x"})))
	if !resp.OK {
		t.Fatalf("checkout failed: %s", resp.Error)
	}

	// rename
	resp = Handle(dir, req("branch.rename", params(map[string]any{"from": "feature-x", "to": "feature-y"})))
	if !resp.OK {
		t.Fatalf("branch.rename failed: %s", resp.Error)
	}

	// checkout back to main before deleting
	// figure out default branch name (main or master)
	brResp := Handle(dir, req("branches", params(nil)))
	b, _ := json.Marshal(brResp.Data)
	var branches []struct {
		Name      string `json:"name"`
		IsCurrent bool   `json:"isCurrent"`
	}
	json.Unmarshal(b, &branches)
	var defaultBranch string
	for _, br := range branches {
		if br.Name == "main" || br.Name == "master" {
			defaultBranch = br.Name
			break
		}
	}
	Handle(dir, req("checkout", params(map[string]any{"branch": defaultBranch})))

	// delete
	resp = Handle(dir, req("branch.delete", params(map[string]any{"name": "feature-y", "force": false})))
	if !resp.OK {
		t.Fatalf("branch.delete failed: %s", resp.Error)
	}
}

// ── stash lifecycle ───────────────────────────────────────────────────────────

func TestHandleStashLifecycle(t *testing.T) {
	dir := makeRepo(t)

	// create a file so there's something to stash
	exec.Command("bash", "-c", "echo hello > "+dir+"/file.txt").Run()
	exec.Command("git", "-C", dir, "add", ".").Run()

	// stash.save
	resp := Handle(dir, req("stash.save", params(map[string]any{"message": "test stash"})))
	if !resp.OK {
		t.Fatalf("stash.save failed: %s", resp.Error)
	}

	// stash list
	resp = Handle(dir, req("stash", params(nil)))
	if !resp.OK {
		t.Fatalf("stash list failed: %s", resp.Error)
	}
	b, _ := json.Marshal(resp.Data)
	var entries []struct {
		Index   int    `json:"index"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(b, &entries); err != nil {
		t.Fatalf("bad stash shape: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("expected at least one stash entry")
	}

	// stash.show
	resp = Handle(dir, req("stash.show", params(map[string]any{"index": 0})))
	if !resp.OK {
		t.Fatalf("stash.show failed: %s", resp.Error)
	}

	// stash.apply
	resp = Handle(dir, req("stash.apply", params(map[string]any{"index": 0})))
	if !resp.OK {
		t.Fatalf("stash.apply failed: %s", resp.Error)
	}

	// re-stash so we can drop it
	exec.Command("git", "-C", dir, "add", ".").Run()
	Handle(dir, req("stash.save", params(map[string]any{"message": "drop me"})))

	// stash.drop
	resp = Handle(dir, req("stash.drop", params(map[string]any{"index": 0})))
	if !resp.OK {
		t.Fatalf("stash.drop failed: %s", resp.Error)
	}
}

// ── cherrypick / revert ───────────────────────────────────────────────────────

func TestHandleCherrypickRevert(t *testing.T) {
	dir := makeRepo(t)

	// log returns newest first: commits[0]=second, commits[1]=first
	logResp := Handle(dir, req("log", params(map[string]any{"limit": 10})))
	b, _ := json.Marshal(logResp.Data)
	var commits []struct {
		Hash string `json:"hash"`
	}
	json.Unmarshal(b, &commits)
	if len(commits) < 2 {
		t.Skip("need at least 2 commits")
	}

	newestHash := commits[0].Hash // second commit (file-b.txt)
	oldestHash := commits[1].Hash // first commit (file-a.txt)

	// create a branch from the oldest commit — newest commit not present here
	Handle(dir, req("branch.create", params(map[string]any{"name": "cp-test", "from": oldestHash})))
	Handle(dir, req("checkout", params(map[string]any{"branch": "cp-test"})))

	// cherry-pick the newest commit (file-b.txt) — unique content, won't be empty
	resp := Handle(dir, req("cherrypick", params(map[string]any{"commit": newestHash})))
	if !resp.OK {
		t.Fatalf("cherrypick failed: %s", resp.Error)
	}

	// revert the cherry-picked commit (now HEAD)
	logResp2 := Handle(dir, req("log", params(map[string]any{"limit": 1})))
	b2, _ := json.Marshal(logResp2.Data)
	var newCommits []struct {
		Hash string `json:"hash"`
	}
	json.Unmarshal(b2, &newCommits)

	resp = Handle(dir, req("revert", params(map[string]any{"commit": newCommits[0].Hash})))
	if !resp.OK {
		t.Fatalf("revert failed: %s", resp.Error)
	}
}
