package git

import (
	"os/exec"
	"testing"
)

// UndoLast with no in-progress op rewinds the branch to ORIG_HEAD — the state
// before the last HEAD-moving operation (here, a merge).
func TestUndoLast_rewindsToOrigHead(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "a.txt", "a\n", "base")
	main := currentBranch(t, dir)

	exec.Command("git", "-C", dir, "checkout", "-b", "feat").Run()
	commitFile(t, dir, "b.txt", "b\n", "feat commit")
	exec.Command("git", "-C", dir, "checkout", main).Run()
	commitFile(t, dir, "a.txt", "a2\n", "main commit") // diverge → real merge
	preMerge := headHash(t, dir)

	if err := Merge(dir, "feat"); err != nil {
		t.Fatalf("merge failed: %v", err)
	}
	if headHash(t, dir) == preMerge {
		t.Fatal("merge should have advanced HEAD")
	}

	res, err := UndoLast(dir)
	if err != nil {
		t.Fatalf("UndoLast failed: %v", err)
	}
	if got := headHash(t, dir); got != preMerge {
		t.Fatalf("expected HEAD back at %s after undo, got %s", preMerge, got)
	}
	if res.Action == "" {
		t.Fatal("expected a description of what was undone")
	}
}

// UndoLast aborts an in-progress operation (a conflicted merge) instead of
// touching ORIG_HEAD.
func TestUndoLast_abortsInProgressMerge(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "f.txt", "base\n", "base")
	main := currentBranch(t, dir)

	exec.Command("git", "-C", dir, "checkout", "-b", "feat").Run()
	commitFile(t, dir, "f.txt", "feat\n", "feat change")
	exec.Command("git", "-C", dir, "checkout", main).Run()
	commitFile(t, dir, "f.txt", "main\n", "main change")

	// Conflicting merge — leaves the repo paused mid-merge.
	_ = Merge(dir, "feat")
	if conflictOperation(dir) != "merge" {
		t.Fatal("expected a paused merge before undo")
	}

	res, err := UndoLast(dir)
	if err != nil {
		t.Fatalf("UndoLast failed: %v", err)
	}
	if conflictOperation(dir) != "" {
		t.Fatal("expected the merge to be aborted after undo")
	}
	if res.Action != "aborted merge" {
		t.Fatalf("expected 'aborted merge', got %q", res.Action)
	}
}
