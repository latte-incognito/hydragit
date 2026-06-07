package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// parseWorktrees is a pure function — exercise the porcelain shapes git emits
// (main + linked + detached + bare + locked/prunable with reasons) without git.
func TestParseWorktrees(t *testing.T) {
	out := `worktree /repo/main
HEAD 1111111111111111111111111111111111111111
branch refs/heads/master

worktree /repo/feature
HEAD 2222222222222222222222222222222222222222
branch refs/heads/feature/x

worktree /repo/detached
HEAD 3333333333333333333333333333333333333333
detached

worktree /repo/locked
HEAD 4444444444444444444444444444444444444444
branch refs/heads/keep
locked needed for the demo

worktree /repo/stale
HEAD 5555555555555555555555555555555555555555
branch refs/heads/old
prunable gitdir file points to non-existent location
`
	wts := parseWorktrees(out)
	if len(wts) != 5 {
		t.Fatalf("expected 5 worktrees, got %d", len(wts))
	}

	if !wts[0].IsMain {
		t.Error("first entry should be the main worktree")
	}
	for i := 1; i < len(wts); i++ {
		if wts[i].IsMain {
			t.Errorf("entry %d should not be main", i)
		}
	}

	if wts[0].Branch != "master" {
		t.Errorf("main branch: want master, got %q", wts[0].Branch)
	}
	if wts[1].Branch != "feature/x" {
		t.Errorf("linked branch: want feature/x, got %q", wts[1].Branch)
	}

	if !wts[2].Detached || wts[2].Branch != "" {
		t.Errorf("detached entry parsed wrong: %+v", wts[2])
	}

	if !wts[3].Locked || wts[3].LockReason != "needed for the demo" {
		t.Errorf("locked entry parsed wrong: %+v", wts[3])
	}

	if !wts[4].Prunable || wts[4].PruneReason != "gitdir file points to non-existent location" {
		t.Errorf("prunable entry parsed wrong: %+v", wts[4])
	}
}

func TestParseWorktrees_empty(t *testing.T) {
	if got := parseWorktrees(""); len(got) != 0 {
		t.Fatalf("expected empty slice, got %d", len(got))
	}
}

// Full lifecycle against a real repo: list → add → lock/unlock → remove →
// prune. No mocking — temp repos only (project rule).
func TestWorktreeLifecycle(t *testing.T) {
	dir := initRepo(t)

	// A fresh repo has exactly one worktree: the main one.
	wts, err := Worktrees(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(wts) != 1 || !wts[0].IsMain {
		t.Fatalf("fresh repo should have 1 main worktree, got %+v", wts)
	}

	// Add a worktree on a brand-new branch.
	wtPath := filepath.Join(t.TempDir(), "feature-wt")
	if err := WorktreeAddNew(dir, wtPath, "feature/wt", ""); err != nil {
		t.Fatalf("WorktreeAddNew: %v", err)
	}

	wts, err = Worktrees(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(wts) != 2 {
		t.Fatalf("expected 2 worktrees after add, got %d (%+v)", len(wts), wts)
	}
	linked := findWorktree(wts, "feature/wt")
	if linked == nil {
		t.Fatalf("added worktree for feature/wt not found in %+v", wts)
	}
	if linked.IsMain {
		t.Error("linked worktree should not be flagged main")
	}

	// Lock with a reason, verify it round-trips through the list.
	if err := WorktreeLock(dir, wtPath, "hold for review"); err != nil {
		t.Fatalf("WorktreeLock: %v", err)
	}
	wts, _ = Worktrees(dir)
	if l := findWorktree(wts, "feature/wt"); l == nil || !l.Locked || l.LockReason != "hold for review" {
		t.Fatalf("lock not reflected: %+v", l)
	}

	// Unlock, then it must be removable.
	if err := WorktreeUnlock(dir, wtPath); err != nil {
		t.Fatalf("WorktreeUnlock: %v", err)
	}
	wts, _ = Worktrees(dir)
	if l := findWorktree(wts, "feature/wt"); l == nil || l.Locked {
		t.Fatalf("unlock not reflected: %+v", l)
	}

	if err := WorktreeRemove(dir, wtPath, false); err != nil {
		t.Fatalf("WorktreeRemove: %v", err)
	}
	wts, _ = Worktrees(dir)
	if len(wts) != 1 {
		t.Fatalf("expected 1 worktree after remove, got %d (%+v)", len(wts), wts)
	}
}

// WorktreeAdd checks out an EXISTING branch (the create flow's other branch).
func TestWorktreeAdd_existingBranch(t *testing.T) {
	dir := initRepo(t)
	if out, err := exec.Command("git", "-C", dir, "branch", "topic").CombinedOutput(); err != nil {
		t.Fatalf("create branch: %s", out)
	}

	wtPath := filepath.Join(t.TempDir(), "topic-wt")
	if err := WorktreeAdd(dir, wtPath, "topic"); err != nil {
		t.Fatalf("WorktreeAdd: %v", err)
	}
	wts, _ := Worktrees(dir)
	if findWorktree(wts, "topic") == nil {
		t.Fatalf("topic worktree not listed: %+v", wts)
	}
}

// Deleting the directory out from under a worktree leaves a prunable entry;
// WorktreePrune must clear it.
func TestWorktreePrune(t *testing.T) {
	dir := initRepo(t)
	wtPath := filepath.Join(t.TempDir(), "doomed")
	if err := WorktreeAddNew(dir, wtPath, "doomed", ""); err != nil {
		t.Fatalf("add: %v", err)
	}
	if err := os.RemoveAll(wtPath); err != nil {
		t.Fatalf("rm worktree dir: %v", err)
	}

	if err := WorktreePrune(dir); err != nil {
		t.Fatalf("WorktreePrune: %v", err)
	}
	wts, _ := Worktrees(dir)
	if len(wts) != 1 {
		t.Fatalf("expected only main worktree after prune, got %+v", wts)
	}
}

func TestWorktreeMove(t *testing.T) {
	dir := initRepo(t)
	from := filepath.Join(t.TempDir(), "from")
	if err := WorktreeAddNew(dir, from, "mover", ""); err != nil {
		t.Fatalf("add: %v", err)
	}
	to := filepath.Join(t.TempDir(), "to")
	if err := WorktreeMove(dir, from, to); err != nil {
		t.Fatalf("WorktreeMove: %v", err)
	}
	wts, _ := Worktrees(dir)
	moved := findWorktree(wts, "mover")
	if moved == nil {
		t.Fatalf("moved worktree not listed: %+v", wts)
	}
	// EvalSymlinks because macOS temp dirs resolve through /private.
	wantReal, _ := filepath.EvalSymlinks(to)
	gotReal, _ := filepath.EvalSymlinks(moved.Path)
	if gotReal != wantReal {
		t.Errorf("moved path: want %q, got %q", wantReal, gotReal)
	}
}

func findWorktree(wts []Worktree, branch string) *Worktree {
	for i := range wts {
		if wts[i].Branch == branch {
			return &wts[i]
		}
	}
	return nil
}
