package git

import (
	"os/exec"
	"testing"
)

// Negative-flow coverage for the git layer. Each test drives a function with bad
// input (missing ref, out-of-range index, non-repo path, …) and asserts it
// returns an error cleanly rather than succeeding or panicking. Reuses the
// package-git helpers initRepo / commitFile / currentBranch / makeRepoWithRemote
// / makeRepoWithStagedFile defined in the sibling _test.go files.

// ── run() / repo.go ───────────────────────────────────────────────────────────

func TestRun_nonRepoPath(t *testing.T) {
	dir := t.TempDir() // a real dir, but NOT a git repo
	if _, err := run(dir, "status", "--porcelain"); err == nil {
		t.Fatal("expected error running git in a non-repo directory")
	}
}

func TestRun_failingSubcommand(t *testing.T) {
	repo := initRepo(t)
	if _, err := run(repo, "this-is-not-a-git-command"); err == nil {
		t.Fatal("expected error for unknown git subcommand")
	}
}

// ── branches ────────────────────────────────────────────────────────────────

func TestCheckout_missingBranch(t *testing.T) {
	repo := initRepo(t)
	if err := Checkout(repo, "does-not-exist"); err == nil {
		t.Fatal("expected error checking out a non-existent branch")
	}
}

func TestCreateBranch_duplicate(t *testing.T) {
	repo := initRepo(t)
	if err := CreateBranch(repo, "dup", ""); err != nil {
		t.Fatalf("first create failed: %v", err)
	}
	if err := CreateBranch(repo, "dup", ""); err == nil {
		t.Fatal("expected error creating a duplicate branch")
	}
}

func TestDeleteBranch_current(t *testing.T) {
	repo := initRepo(t)
	cur := currentBranch(t, repo)
	if err := DeleteBranch(repo, cur, false); err == nil {
		t.Fatal("expected error deleting the current branch")
	}
}

func TestDeleteBranch_unmergedWithoutForce(t *testing.T) {
	repo := initRepo(t)
	base := currentBranch(t, repo)

	if err := CreateBranch(repo, "feature", ""); err != nil {
		t.Fatalf("create feature failed: %v", err)
	}
	// a commit that exists only on feature → unmerged relative to base
	commitFile(t, repo, "feature.txt", "work\n", "feat: work")
	if err := Checkout(repo, base); err != nil {
		t.Fatalf("checkout base failed: %v", err)
	}
	if err := DeleteBranch(repo, "feature", false); err == nil {
		t.Fatal("expected error deleting an unmerged branch without force")
	}
	// force delete should succeed
	if err := DeleteBranch(repo, "feature", true); err != nil {
		t.Fatalf("force delete should succeed: %v", err)
	}
}

func TestRenameBranch_collision(t *testing.T) {
	repo := initRepo(t)
	if err := CreateBranch(repo, "a", ""); err != nil {
		t.Fatal(err)
	}
	if err := CreateBranch(repo, "b", ""); err != nil {
		t.Fatal(err)
	}
	if err := RenameBranch(repo, "a", "b"); err == nil {
		t.Fatal("expected error renaming onto an existing branch name")
	}
}

func TestMerge_missingBranch(t *testing.T) {
	repo := initRepo(t)
	if err := Merge(repo, "nope"); err == nil {
		t.Fatal("expected error merging a non-existent branch")
	}
}

func TestRebase_missingOnto(t *testing.T) {
	repo := initRepo(t)
	if err := Rebase(repo, "nope"); err == nil {
		t.Fatal("expected error rebasing onto a non-existent ref")
	}
}

func TestReset_missingCommit(t *testing.T) {
	repo := initRepo(t)
	if err := reset(repo, "deadbeefdeadbeef", "mixed"); err == nil {
		t.Fatal("expected error resetting to a non-existent commit")
	}
}

func TestPush_noRemote(t *testing.T) {
	repo := initRepo(t) // no remote configured
	if err := Push(repo, ""); err == nil {
		t.Fatal("expected error pushing with no remote configured")
	}
}

func TestBranchContaining_missingCommit(t *testing.T) {
	repo := initRepo(t)
	if _, err := BranchContaining(repo, "deadbeefdeadbeef"); err == nil {
		t.Fatal("expected error for a non-existent commit")
	}
}

// ── log ───────────────────────────────────────────────────────────────────────

func TestLogWith_missingBranch(t *testing.T) {
	repo := initRepo(t)
	if _, err := LogWith(repo, LogOptions{Branch: "no-such-branch"}); err == nil {
		t.Fatal("expected error logging a non-existent branch")
	}
}

func TestLineHistory_missingFile(t *testing.T) {
	repo := initRepo(t)
	if _, err := LineHistory(repo, "no-such-file.txt", 1, 5); err == nil {
		t.Fatal("expected error for line history of a non-existent file")
	}
}

// ── diff ──────────────────────────────────────────────────────────────────────

func TestDiffCommit_missingCommit(t *testing.T) {
	repo := initRepo(t)
	if _, err := DiffCommit(repo, "deadbeefdeadbeef"); err == nil {
		t.Fatal("expected error diffing a non-existent commit")
	}
}

func TestDiffFile_missingCommit(t *testing.T) {
	repo := initRepo(t)
	if _, err := DiffFile(repo, "deadbeefdeadbeef", "init.txt"); err == nil {
		t.Fatal("expected error diffing a file at a non-existent commit")
	}
}

// ── stash (out-of-range index) ─────────────────────────────────────────────────

func TestStashPop_outOfRange(t *testing.T) {
	repo := makeRepoWithStagedFile(t) // no stash created
	if err := StashPop(repo, 99); err == nil {
		t.Fatal("expected error popping a non-existent stash index")
	}
}

func TestStashApply_outOfRange(t *testing.T) {
	repo := makeRepoWithStagedFile(t)
	if err := StashApply(repo, 99); err == nil {
		t.Fatal("expected error applying a non-existent stash index")
	}
}

func TestStashDrop_outOfRange(t *testing.T) {
	repo := makeRepoWithStagedFile(t)
	if err := StashDrop(repo, 99); err == nil {
		t.Fatal("expected error dropping a non-existent stash index")
	}
}

func TestStashShow_outOfRange(t *testing.T) {
	repo := makeRepoWithStagedFile(t)
	if _, err := StashShow(repo, 99); err == nil {
		t.Fatal("expected error showing a non-existent stash index")
	}
}

// ── tags ──────────────────────────────────────────────────────────────────────

func TestCreateTag_duplicate(t *testing.T) {
	repo := initRepo(t)
	if err := CreateTag(repo, "v1", "", ""); err != nil {
		t.Fatalf("first tag failed: %v", err)
	}
	if err := CreateTag(repo, "v1", "", ""); err == nil {
		t.Fatal("expected error creating a duplicate tag")
	}
}

func TestCreateTag_missingCommit(t *testing.T) {
	repo := initRepo(t)
	if err := CreateTag(repo, "v1", "deadbeefdeadbeef", ""); err == nil {
		t.Fatal("expected error tagging a non-existent commit")
	}
}

func TestDeleteTag_missing(t *testing.T) {
	repo := initRepo(t)
	if err := DeleteTag(repo, "no-such-tag"); err == nil {
		t.Fatal("expected error deleting a non-existent tag")
	}
}

// ── blame ─────────────────────────────────────────────────────────────────────

func TestBlame_missingFile(t *testing.T) {
	repo := initRepo(t)
	if _, err := Blame(repo, "no-such-file.txt", "", nil); err == nil {
		t.Fatal("expected error blaming a non-existent file")
	}
}

func TestBlame_missingRef(t *testing.T) {
	repo := initRepo(t)
	commitFile(t, repo, "f.txt", "a\n", "add f")
	if _, err := Blame(repo, "f.txt", "deadbeefdeadbeef", nil); err == nil {
		t.Fatal("expected error blaming at a non-existent ref")
	}
}

// ── cherry-pick / revert ────────────────────────────────────────────────────────

func TestCherryPick_missingCommit(t *testing.T) {
	repo := initRepo(t)
	if err := CherryPick(repo, "deadbeefdeadbeef"); err == nil {
		t.Fatal("expected error cherry-picking a non-existent commit")
	}
}

func TestRevert_missingCommit(t *testing.T) {
	repo := initRepo(t)
	if err := Revert(repo, "deadbeefdeadbeef"); err == nil {
		t.Fatal("expected error reverting a non-existent commit")
	}
}

// ── status ──────────────────────────────────────────────────────────────────────

func TestStatus_nonRepoPath(t *testing.T) {
	dir := t.TempDir() // not a git repo
	if _, err := Status(dir); err == nil {
		t.Fatal("expected error getting status of a non-repo directory")
	}
}

func TestStatus_detachedHEAD(t *testing.T) {
	repo := initRepo(t)
	commitFile(t, repo, "a.txt", "1\n", "c1")
	commitFile(t, repo, "a.txt", "2\n", "c2")
	head, _ := exec.Command("git", "-C", repo, "rev-parse", "HEAD").Output()
	prev, _ := exec.Command("git", "-C", repo, "rev-parse", "HEAD~1").Output()
	_ = head
	// detach onto the parent commit
	if err := exec.Command("git", "-C", repo, "checkout", string(prev[:len(prev)-1])).Run(); err != nil {
		t.Fatalf("detach failed: %v", err)
	}
	// Status must not error on a detached HEAD
	res, err := Status(repo)
	if err != nil {
		t.Fatalf("Status on detached HEAD should not error: %v", err)
	}
	if res.Branch == "" {
		t.Fatal("expected a non-empty branch field on detached HEAD (e.g. HEAD)")
	}
	if !res.Detached {
		t.Fatal("expected Detached=true on a detached HEAD")
	}
}
