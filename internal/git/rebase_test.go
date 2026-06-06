package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func headHash(t *testing.T, dir string) string {
	t.Helper()
	out, err := exec.Command("git", "-C", dir, "rev-parse", "HEAD").Output()
	if err != nil {
		t.Fatal(err)
	}
	return strings.TrimSpace(string(out))
}

func TestDropCommit_clean(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "a.txt", "a\n", "A")
	commitFile(t, dir, "b.txt", "b\n", "B")
	bHash := headHash(t, dir)
	commitFile(t, dir, "c.txt", "c\n", "C")

	conflict, err := DropCommit(dir, bHash)
	if err != nil {
		t.Fatalf("DropCommit failed: %v", err)
	}
	if conflict {
		t.Fatal("did not expect a conflict dropping an independent commit")
	}
	if RebaseInProgress(dir) {
		t.Fatal("rebase should have finished")
	}

	// b.txt is gone; a.txt and c.txt survive.
	if _, err := os.Stat(filepath.Join(dir, "b.txt")); !os.IsNotExist(err) {
		t.Fatal("b.txt should be removed after dropping commit B")
	}
	for _, f := range []string{"a.txt", "c.txt"} {
		if _, err := os.Stat(filepath.Join(dir, f)); err != nil {
			t.Fatalf("%s should still exist", f)
		}
	}
}

func subjectAt(t *testing.T, dir, ref string) string {
	t.Helper()
	out, err := exec.Command("git", "-C", dir, "log", "-1", "--format=%s", ref).Output()
	if err != nil {
		t.Fatal(err)
	}
	return strings.TrimSpace(string(out))
}

func TestRewordCommit_head(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "a.txt", "a\n", "original subject")

	conflict, err := RewordCommit(dir, "HEAD", "reworded subject")
	if err != nil {
		t.Fatalf("RewordCommit (HEAD) failed: %v", err)
	}
	if conflict {
		t.Fatal("reword should not conflict")
	}
	if got := subjectAt(t, dir, "HEAD"); got != "reworded subject" {
		t.Fatalf("HEAD subject = %q; want %q", got, "reworded subject")
	}
}

func TestRewordCommit_nonHead(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "a.txt", "a\n", "A original")
	aHash := headHash(t, dir)
	commitFile(t, dir, "b.txt", "b\n", "B subject")

	conflict, err := RewordCommit(dir, aHash, "A reworded")
	if err != nil {
		t.Fatalf("RewordCommit (non-HEAD) failed: %v", err)
	}
	if conflict {
		t.Fatal("reword should not conflict")
	}
	if RebaseInProgress(dir) {
		t.Fatal("rebase should have completed")
	}
	// A's subject changed; B (the tip) is preserved.
	if got := subjectAt(t, dir, "HEAD~1"); got != "A reworded" {
		t.Fatalf("HEAD~1 subject = %q; want %q", got, "A reworded")
	}
	if got := subjectAt(t, dir, "HEAD"); got != "B subject" {
		t.Fatalf("HEAD subject = %q; want %q (should be untouched)", got, "B subject")
	}
}

func TestRunInteractiveRebase_dropAndReorder(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "base.txt", "base\n", "base")
	base := headHash(t, dir)
	commitFile(t, dir, "a.txt", "a\n", "A")
	aHash := headHash(t, dir)
	commitFile(t, dir, "b.txt", "b\n", "B")
	bHash := headHash(t, dir)
	commitFile(t, dir, "c.txt", "c\n", "C")
	cHash := headHash(t, dir)

	// Plan (oldest-first): keep C first, drop B, then A. Independent files, so no
	// conflicts. Result top-to-bottom should be: A (tip), C, base — with B gone.
	conflict, err := RunInteractiveRebase(dir, base, []RebaseTodoItem{
		{Sha: cHash, Action: "pick"},
		{Sha: bHash, Action: "drop"},
		{Sha: aHash, Action: "pick"},
	})
	if err != nil {
		t.Fatalf("RunInteractiveRebase failed: %v", err)
	}
	if conflict {
		t.Fatal("did not expect a conflict")
	}

	// b.txt dropped; the rest present.
	if _, err := os.Stat(filepath.Join(dir, "b.txt")); !os.IsNotExist(err) {
		t.Fatal("b.txt should be dropped")
	}
	if subjectAt(t, dir, "HEAD") != "A" {
		t.Fatalf("tip should be A after reorder, got %q", subjectAt(t, dir, "HEAD"))
	}
	if subjectAt(t, dir, "HEAD~1") != "C" {
		t.Fatalf("HEAD~1 should be C after reorder, got %q", subjectAt(t, dir, "HEAD~1"))
	}
}

// SquashWithParent folds a commit into its parent: two commits become one, the
// tree content is preserved, and history shrinks by one.
func TestSquashWithParent_foldsIntoParent(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "base.txt", "base\n", "base")
	commitFile(t, dir, "a.txt", "a\n", "A")        // parent
	commitFile(t, dir, "b.txt", "b\n", "B")        // target → squash into A
	target := headHash(t, dir)
	commitFile(t, dir, "c.txt", "c\n", "C")         // a descendant, must survive

	before := commitCount(t, dir)

	conflict, err := SquashWithParent(dir, target)
	if err != nil {
		t.Fatalf("SquashWithParent failed: %v", err)
	}
	if conflict {
		t.Fatal("independent files — did not expect a conflict")
	}

	if after := commitCount(t, dir); after != before-1 {
		t.Fatalf("expected history to shrink by one (%d → %d), got %d", before, before-1, after)
	}
	// All file content must still be present (squash preserves the tree).
	for _, f := range []string{"base.txt", "a.txt", "b.txt", "c.txt"} {
		if _, err := os.Stat(filepath.Join(dir, f)); err != nil {
			t.Fatalf("%s should still exist after squash: %v", f, err)
		}
	}
	if subjectAt(t, dir, "HEAD") != "C" {
		t.Fatalf("tip should still be C, got %q", subjectAt(t, dir, "HEAD"))
	}
}

func TestSquashWithParent_rejectsWhenParentIsRoot(t *testing.T) {
	dir := initRepo(t) // initRepo's "init" commit is the root
	commitFile(t, dir, "a.txt", "a\n", "A")
	target := headHash(t, dir) // A's parent is the root → no grandparent to fold into

	if _, err := SquashWithParent(dir, target); err == nil {
		t.Fatal("expected an error squashing into a root commit (no grandparent)")
	}
}

// commitCount returns the number of commits reachable from HEAD.
func commitCount(t *testing.T, dir string) int {
	t.Helper()
	out, err := exec.Command("git", "-C", dir, "rev-list", "--count", "HEAD").Output()
	if err != nil {
		t.Fatalf("rev-list --count: %v", err)
	}
	n, err := strconv.Atoi(strings.TrimSpace(string(out)))
	if err != nil {
		t.Fatalf("parse count %q: %v", out, err)
	}
	return n
}

func TestRunInteractiveRebase_rejectsLeadingSquash(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "base.txt", "base\n", "base")
	base := headHash(t, dir)
	commitFile(t, dir, "a.txt", "a\n", "A")
	aHash := headHash(t, dir)

	_, err := RunInteractiveRebase(dir, base, []RebaseTodoItem{
		{Sha: aHash, Action: "squash"},
	})
	if err == nil {
		t.Fatal("expected an error when the first kept commit is a squash")
	}
}

func TestDropCommit_conflictPausesAndAborts(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "f.txt", "base\n", "A")
	commitFile(t, dir, "f.txt", "B change\n", "B")
	bHash := headHash(t, dir)
	commitFile(t, dir, "f.txt", "C change\n", "C")
	before := headHash(t, dir)

	// Dropping B forces C's diff (B→C) onto A, which conflicts on f.txt.
	conflict, err := DropCommit(dir, bHash)
	if err != nil {
		t.Fatalf("DropCommit returned a hard error instead of pausing: %v", err)
	}
	if !conflict {
		t.Fatal("expected a conflict (paused rebase), got clean drop")
	}
	if !RebaseInProgress(dir) {
		t.Fatal("repo should be left mid-rebase after a conflict")
	}

	// The GitLens/IntelliJ flow: the user can abort to restore the branch.
	if err := RebaseAbort(dir); err != nil {
		t.Fatalf("RebaseAbort failed: %v", err)
	}
	if RebaseInProgress(dir) {
		t.Fatal("rebase should be cleared after abort")
	}
	if got := headHash(t, dir); got != before {
		t.Fatalf("abort should restore HEAD to %s, got %s", before, got)
	}
}
