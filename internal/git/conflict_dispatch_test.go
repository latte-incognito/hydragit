package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// These cover the conflict-resolution *dispatch* layer that the IPC handler
// actually calls — ContinueConflict / AbortConflict (conflict.go) and the
// RebaseContinue / RebaseSkip primitives (rebase.go) behind them. The CHANGELOG
// feature index promises "continue/abort" routed by the in-progress operation
// (`conflict.continue`, `conflict.abort`); these assert that routing works for
// merge AND rebase, and — per the negative-test policy — that a refused continue
// leaves the repo intact rather than crashing.

// makeRebaseConflict leaves the repo paused mid-rebase with f.txt conflicted.
// It drops a middle commit, which replays the tip onto an older base and
// collides on the shared file (the same mechanism TestDropCommit_conflict uses).
func makeRebaseConflict(t *testing.T) (dir string) {
	t.Helper()
	dir = initRepo(t)
	commitFile(t, dir, "f.txt", "base\n", "A")
	commitFile(t, dir, "f.txt", "B change\n", "B")
	bHash := headHash(t, dir)
	commitFile(t, dir, "f.txt", "C change\n", "C")

	conflict, err := DropCommit(dir, bHash)
	if err != nil {
		t.Fatalf("setup DropCommit returned a hard error: %v", err)
	}
	if !conflict || !RebaseInProgress(dir) {
		t.Fatalf("setup expected a paused rebase, got conflict=%v inProgress=%v", conflict, RebaseInProgress(dir))
	}
	return dir
}

// resolveAndStage writes content to a conflicted file and stages it.
func resolveAndStage(t *testing.T, dir, file, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, file), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	if out, err := exec.Command("git", "-C", dir, "add", "--", file).CombinedOutput(); err != nil {
		t.Fatalf("git add %s: %s", file, out)
	}
}

func TestContinueConflict_mergeFinishesAfterResolve(t *testing.T) {
	dir := makeConflictRepo(t) // paused mid-merge on f.txt
	resolveAndStage(t, dir, "f.txt", "resolved\n")

	conflict, err := ContinueConflict(dir, "merge")
	if err != nil {
		t.Fatalf("ContinueConflict(merge) failed: %v", err)
	}
	if conflict {
		t.Fatal("a resolved merge should complete, not report a fresh conflict")
	}
	info, _ := Conflicts(dir)
	if info.Operation != "" || len(info.Files) != 0 {
		t.Fatalf("merge should be complete; got operation=%q files=%v", info.Operation, info.Files)
	}
}

func TestContinueConflict_rebaseFinishesAfterResolve(t *testing.T) {
	dir := makeRebaseConflict(t)
	resolveAndStage(t, dir, "f.txt", "resolved\n")

	conflict, err := ContinueConflict(dir, "rebase")
	if err != nil {
		t.Fatalf("ContinueConflict(rebase) failed: %v", err)
	}
	if conflict {
		t.Fatal("the single remaining patch was resolved; rebase should finish clean")
	}
	if RebaseInProgress(dir) {
		t.Fatal("rebase should be cleared after a successful continue")
	}
}

// Negative: continuing a rebase whose conflicts are NOT resolved must not crash
// and must not error out of the paused state — git refuses and the rebase stays
// in progress, which the dispatch layer reports as conflict=true so the UI keeps
// showing the banner.
func TestContinueConflict_rebaseUnresolvedStaysPaused(t *testing.T) {
	dir := makeRebaseConflict(t)

	conflict, err := ContinueConflict(dir, "rebase")
	if err != nil {
		t.Fatalf("unresolved continue should surface as conflict=true, not a hard error: %v", err)
	}
	if !conflict {
		t.Fatal("expected conflict=true (still paused) when continuing with unresolved files")
	}
	if !RebaseInProgress(dir) {
		t.Fatal("a refused continue must leave the rebase in progress, not silently drop it")
	}
}

// Negative: committing the merge with unmerged paths is git's own failure;
// ContinueConflict surfaces it as an error and the merge stays mid-flight.
func TestContinueConflict_mergeUnresolvedErrors(t *testing.T) {
	dir := makeConflictRepo(t)

	if _, err := ContinueConflict(dir, "merge"); err == nil {
		t.Fatal("expected an error continuing a merge with unresolved conflicts")
	}
	if info, _ := Conflicts(dir); info.Operation != "merge" {
		t.Fatalf("the merge must remain in progress after a refused continue, got %q", info.Operation)
	}
}

func TestAbortConflict_mergeRestores(t *testing.T) {
	dir := makeConflictRepo(t)
	before := headHash(t, dir)

	if err := AbortConflict(dir, "merge"); err != nil {
		t.Fatalf("AbortConflict(merge) failed: %v", err)
	}
	if info, _ := Conflicts(dir); info.Operation != "" {
		t.Fatalf("merge should be aborted; got operation=%q", info.Operation)
	}
	if got := headHash(t, dir); got != before {
		t.Fatalf("abort should restore HEAD to %s, got %s", before, got)
	}
}

func TestAbortConflict_rebaseRestores(t *testing.T) {
	dir := makeRebaseConflict(t)

	if err := AbortConflict(dir, "rebase"); err != nil {
		t.Fatalf("AbortConflict(rebase) failed: %v", err)
	}
	if RebaseInProgress(dir) {
		t.Fatal("rebase should be cleared after abort")
	}
	// History is intact: A, B, C all still reachable from the restored branch.
	for _, subj := range []string{"A", "B", "C"} {
		if out, _ := exec.Command("git", "-C", dir, "log", "--format=%s").CombinedOutput(); !containsSubject(string(out), subj) {
			t.Fatalf("abort should restore the original history; %q missing from:\n%s", subj, out)
		}
	}
}

func TestAbortConflict_cherryPickRestores(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "f.txt", "base\n", "base")

	// Branch 'other' edits f.txt; back on the base branch a conflicting edit
	// makes cherry-picking other's commit conflict.
	base := currentBranch(t, dir)
	mustGit(t, dir, "checkout", "-b", "other")
	commitFile(t, dir, "f.txt", "other change\n", "other")
	otherHash := headHash(t, dir)
	mustGit(t, dir, "checkout", base)
	commitFile(t, dir, "f.txt", "main change\n", "main")
	before := headHash(t, dir)

	if err := CherryPick(dir, otherHash); err == nil {
		t.Fatal("setup expected the cherry-pick to conflict")
	}
	if info, _ := Conflicts(dir); info.Operation != "cherry-pick" {
		t.Fatalf("expected a paused cherry-pick, got operation=%q", info.Operation)
	}

	if err := AbortConflict(dir, "cherry-pick"); err != nil {
		t.Fatalf("AbortConflict(cherry-pick) failed: %v", err)
	}
	if info, _ := Conflicts(dir); info.Operation != "" {
		t.Fatalf("cherry-pick should be aborted; got operation=%q", info.Operation)
	}
	if got := headHash(t, dir); got != before {
		t.Fatalf("abort should restore HEAD to %s, got %s", before, got)
	}
}

// Edge: an empty / unknown operation is a no-op, not an error (the handler may
// call abort defensively when nothing is in progress).
func TestAbortConflict_unknownOpIsNoop(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "f.txt", "x\n", "x")

	if err := AbortConflict(dir, ""); err != nil {
		t.Fatalf("AbortConflict(\"\") should be a no-op, got %v", err)
	}
	if err := AbortConflict(dir, "bogus"); err != nil {
		t.Fatalf("AbortConflict(unknown) should be a no-op, got %v", err)
	}
}

func TestMarkResolved_stagesHandEditedFile(t *testing.T) {
	dir := makeConflictRepo(t)

	// Simulate the user fixing the file by hand in the merge editor.
	if err := os.WriteFile(filepath.Join(dir, "f.txt"), []byte("hand resolved\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := MarkResolved(dir, "f.txt"); err != nil {
		t.Fatalf("MarkResolved failed: %v", err)
	}
	if info, _ := Conflicts(dir); len(info.Files) != 0 {
		t.Fatalf("file should be marked resolved, still conflicted: %v", info.Files)
	}
	// And the merge can now be finalized.
	if err := MergeContinue(dir); err != nil {
		t.Fatalf("MergeContinue after MarkResolved failed: %v", err)
	}
}

// Negative: marking a path that does not exist is git's `add` failure.
func TestMarkResolved_missingFileErrors(t *testing.T) {
	dir := makeConflictRepo(t)
	if err := MarkResolved(dir, "does-not-exist.txt"); err == nil {
		t.Fatal("expected an error marking a nonexistent path resolved")
	}
}

func TestRebaseSkip_dropsThePausedPatch(t *testing.T) {
	dir := makeRebaseConflict(t)

	conflict, err := RebaseSkip(dir)
	if err != nil {
		t.Fatalf("RebaseSkip failed: %v", err)
	}
	if conflict {
		t.Fatal("skipping the only remaining patch should finish the rebase")
	}
	if RebaseInProgress(dir) {
		t.Fatal("rebase should be cleared after skipping the last patch")
	}
	// The skipped commit (C) is gone; the base (A) survives.
	out, _ := exec.Command("git", "-C", dir, "log", "--format=%s").CombinedOutput()
	if containsSubject(string(out), "C change") {
		t.Fatalf("skipped patch C should not be present:\n%s", out)
	}
}

// Negative: there is no rebase to continue / skip on a clean repo.
func TestRebaseContinue_noRebaseErrors(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "f.txt", "x\n", "x")

	if _, err := RebaseContinue(dir); err == nil {
		t.Fatal("expected an error continuing with no rebase in progress")
	}
	if _, err := RebaseSkip(dir); err == nil {
		t.Fatal("expected an error skipping with no rebase in progress")
	}
}

// mustGit runs a git command and fails the test on a non-zero exit.
func mustGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	full := append([]string{"-C", dir}, args...)
	if out, err := exec.Command("git", full...).CombinedOutput(); err != nil {
		t.Fatalf("git %v: %s", args, out)
	}
}

// containsSubject reports whether any line of git log --format output equals subj.
func containsSubject(logOut, subj string) bool {
	for _, line := range strings.Split(logOut, "\n") {
		if strings.TrimSpace(line) == subj {
			return true
		}
	}
	return false
}
