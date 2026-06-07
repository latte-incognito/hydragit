package ipc

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func headHash(t *testing.T, dir string) string {
	t.Helper()
	out, err := exec.Command("git", "-C", dir, "rev-parse", "HEAD").Output()
	if err != nil {
		t.Fatalf("rev-parse HEAD in %s: %v", dir, err)
	}
	return strings.TrimSpace(string(out))
}

func headMessage(t *testing.T, dir string) string {
	t.Helper()
	out, err := exec.Command("git", "-C", dir, "log", "-1", "--format=%s").Output()
	if err != nil {
		t.Fatalf("log -1 in %s: %v", dir, err)
	}
	return strings.TrimSpace(string(out))
}

// statusBranch runs `status` against the given request and returns the branch.
func statusBranch(t *testing.T, r Request) (Response, string) {
	t.Helper()
	resp := Handle("", r)
	if !resp.OK {
		return resp, ""
	}
	b, _ := json.Marshal(resp.Data)
	var s struct {
		Branch string `json:"branch"`
	}
	if err := json.Unmarshal(b, &s); err != nil {
		t.Fatalf("bad status shape: %v", err)
	}
	return resp, s.Branch
}

// The per-request Repo field routes a single handler to different repos. This
// is the backbone of multi-repo support: one Go process, N repos.
func TestHandleRepoOverride_routesToRequestedRepo(t *testing.T) {
	repoA := makeRepo(t)
	repoB := makeRepo(t)

	// Put repoA on a distinctive branch so we can tell the two apart.
	exec.Command("git", "-C", repoA, "checkout", "-b", "legion-a").Run()

	// Spawn default is repoB, but the request asks for repoA → must see repoA.
	_, branch := statusBranch(t, Request{ID: "1", Cmd: "status", Repo: repoA})
	if branch != "legion-a" {
		t.Fatalf("Repo override ignored: expected branch legion-a from repoA, got %q", branch)
	}

	// Same handler, request repoB → must NOT see repoA's branch.
	_, branchB := statusBranch(t, Request{ID: "2", Cmd: "status", Repo: repoB})
	if branchB == "legion-a" {
		t.Fatalf("repos bleeding into each other: repoB reported repoA's branch %q", branchB)
	}
}

// When Repo is empty, the handler falls back to the spawn-time default path —
// preserves single-repo behaviour for callers that don't send a repo.
func TestHandleRepoOverride_fallsBackToDefault(t *testing.T) {
	repo := makeRepo(t)
	exec.Command("git", "-C", repo, "checkout", "-b", "legion-a").Run()

	resp := Handle(repo, Request{ID: "1", Cmd: "status"}) // Repo unset
	if !resp.OK {
		t.Fatalf("status failed on fallback: %s", resp.Error)
	}
	b, _ := json.Marshal(resp.Data)
	var s struct {
		Branch string `json:"branch"`
	}
	json.Unmarshal(b, &s)
	if s.Branch != "legion-a" {
		t.Fatalf("expected fallback to default repo (branch legion-a), got %q", s.Branch)
	}
}

// Committing via the Repo override lands in the targeted repo only — the other
// repo's HEAD must not move. This is the core multi-repo safety guarantee: the
// grouped sidebar commits a specific repo without bleeding into the focused one.
func TestHandleRepoOverride_commitIsolation(t *testing.T) {
	repoA := makeRepo(t)
	repoB := makeRepo(t)
	beforeB := headHash(t, repoB)

	if err := os.WriteFile(filepath.Join(repoA, "only-a.txt"), []byte("a\n"), 0644); err != nil {
		t.Fatal(err)
	}
	resp := Handle("", Request{
		ID: "1", Cmd: "commit", Repo: repoA,
		Params: params(map[string]any{"message": "in A", "paths": []string{"only-a.txt"}}),
	})
	if !resp.OK {
		t.Fatalf("commit in repoA failed: %s", resp.Error)
	}

	if msg := headMessage(t, repoA); msg != "in A" {
		t.Fatalf("repoA HEAD = %q, want \"in A\"", msg)
	}
	if afterB := headHash(t, repoB); afterB != beforeB {
		t.Fatalf("repoB HEAD moved (%s → %s) — commit bled across repos", beforeB, afterB)
	}
}

// A bogus Repo must error like any other non-repo path, and must not poison the
// handler — a following valid request still succeeds.
func TestHandleRepoOverride_badPathErrorsButHandlerSurvives(t *testing.T) {
	resp := Handle("", Request{ID: "1", Cmd: "status", Repo: "/no/such/repo/here"})
	if resp.OK {
		t.Fatal("expected failure for a non-existent repo path")
	}

	good := makeRepo(t)
	resp2 := Handle("", Request{ID: "2", Cmd: "status", Repo: good})
	if !resp2.OK {
		t.Fatalf("handler poisoned by bad path: valid request now fails: %s", resp2.Error)
	}
}
