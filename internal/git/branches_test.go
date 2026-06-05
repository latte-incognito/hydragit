package git

import (
	"os/exec"
	"strings"
	"testing"
)

func TestBranches(t *testing.T) {
	dir := t.TempDir()
	exec.Command("git", "-C", dir, "init").Run()
	exec.Command("git", "-C", dir, "config", "user.email", "test@test.com").Run()
	exec.Command("git", "-C", dir, "config", "user.name", "Test").Run()
	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "init").Run()
	exec.Command("git", "-C", dir, "branch", "feature-a").Run()
	exec.Command("git", "-C", dir, "branch", "feature-b").Run()

	branches, err := Branches(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(branches) < 3 {
		t.Fatalf("expected >= 3 branches, got %d", len(branches))
	}

	var foundCurrent bool
	for _, b := range branches {
		if b.IsCurrent {
			foundCurrent = true
		}
	}
	if !foundCurrent {
		t.Fatal("no current branch found")
	}
}

func TestCheckout(t *testing.T) {
	dir := initRepo(t)
	exec.Command("git", "-C", dir, "branch", "other").Run()

	if err := Checkout(dir, "other"); err != nil {
		t.Fatalf("Checkout failed: %v", err)
	}

	branches, _ := Branches(dir)
	for _, b := range branches {
		if b.IsCurrent && b.Name != "other" {
			t.Fatalf("expected current branch to be 'other', got %q", b.Name)
		}
	}
}

func TestCreateBranch(t *testing.T) {
	dir := initRepo(t)

	if err := CreateBranch(dir, "new-feature", ""); err != nil {
		t.Fatalf("CreateBranch failed: %v", err)
	}

	branches, _ := Branches(dir)
	found := false
	for _, b := range branches {
		if b.Name == "new-feature" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected new-feature branch to exist")
	}
}

func TestCreateBranchFrom(t *testing.T) {
	dir := initRepo(t)
	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "second").Run()

	// get parent hash
	out, _ := exec.Command("git", "-C", dir, "rev-parse", "HEAD~1").Output()
	parentHash := string(out[:len(out)-1])

	if err := CreateBranch(dir, "from-parent", parentHash); err != nil {
		t.Fatalf("CreateBranch from hash failed: %v", err)
	}

	branches, _ := Branches(dir)
	found := false
	for _, b := range branches {
		if b.Name == "from-parent" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected from-parent branch to exist")
	}
}

func TestDeleteBranch(t *testing.T) {
	dir := initRepo(t)
	exec.Command("git", "-C", dir, "branch", "to-delete").Run()

	if err := DeleteBranch(dir, "to-delete", false); err != nil {
		t.Fatalf("DeleteBranch failed: %v", err)
	}

	branches, _ := Branches(dir)
	for _, b := range branches {
		if b.Name == "to-delete" {
			t.Fatal("branch should have been deleted")
		}
	}
}

func TestRenameBranch(t *testing.T) {
	dir := initRepo(t)
	exec.Command("git", "-C", dir, "branch", "old-name").Run()

	if err := RenameBranch(dir, "old-name", "new-name"); err != nil {
		t.Fatalf("RenameBranch failed: %v", err)
	}

	branches, _ := Branches(dir)
	var foundOld, foundNew bool
	for _, b := range branches {
		if b.Name == "old-name" {
			foundOld = true
		}
		if b.Name == "new-name" {
			foundNew = true
		}
	}
	if foundOld {
		t.Fatal("old-name should not exist after rename")
	}
	if !foundNew {
		t.Fatal("new-name should exist after rename")
	}
}

func TestMerge(t *testing.T) {
	dir := initRepo(t)

	// create and switch to feature branch, add a commit
	exec.Command("git", "-C", dir, "checkout", "-b", "feature").Run()
	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "feature commit").Run()

	// switch back to default branch
	exec.Command("git", "-C", dir, "checkout", "-").Run()

	if err := Merge(dir, "feature"); err != nil {
		t.Fatalf("Merge failed: %v", err)
	}

	// verify the feature commit is now in log
	commits, err := Log(dir, "", 10)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, c := range commits {
		if c.Message == "feature commit" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected feature commit to appear in log after merge")
	}
}

func TestRebase(t *testing.T) {
	dir := initRepo(t)

	// create feature branch from current HEAD
	exec.Command("git", "-C", dir, "checkout", "-b", "feature").Run()
	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "feature commit").Run()

	// add a commit to default branch
	exec.Command("git", "-C", dir, "checkout", "-").Run()
	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "main advance").Run()

	// switch back to feature and rebase onto default
	exec.Command("git", "-C", dir, "checkout", "feature").Run()

	defaultBranch := "main"
	out, _ := exec.Command("git", "-C", dir, "rev-parse", "--verify", "main").Output()
	if len(out) == 0 {
		defaultBranch = "master"
	}

	if err := Rebase(dir, defaultBranch); err != nil {
		t.Fatalf("Rebase failed: %v", err)
	}

	// after rebase, feature commit should still exist
	commits, err := Log(dir, "", 10)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, c := range commits {
		if c.Message == "feature commit" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected feature commit to exist after rebase")
	}
}

// makeRepoWithRemote creates a bare local remote and a cloned local repo.
// No network — fully self-contained, safe to run in CI.
func makeRepoWithRemote(t *testing.T) (local string) {
	t.Helper()
	remote := t.TempDir()
	local = t.TempDir()

	// bare repo acts as the remote
	exec.Command("git", "init", "--bare", remote).Run()

	// clone it locally
	exec.Command("git", "clone", remote, local).Run()
	exec.Command("git", "-C", local, "config", "user.email", "test@test.com").Run()
	exec.Command("git", "-C", local, "config", "user.name", "Test").Run()

	// initial commit so the branch exists on remote
	exec.Command("git", "-C", local, "commit", "--allow-empty", "-m", "init").Run()
	exec.Command("git", "-C", local, "push", "-u", "origin", "HEAD").Run()

	return local
}

func TestPush(t *testing.T) {
	local := makeRepoWithRemote(t)

	// add a new commit to push
	exec.Command("git", "-C", local, "commit", "--allow-empty", "-m", "new commit").Run()

	// get current branch name
	out, _ := exec.Command("git", "-C", local, "rev-parse", "--abbrev-ref", "HEAD").Output()
	branch := string(out[:len(out)-1])

	if err := Push(local, branch); err != nil {
		t.Fatalf("Push failed: %v", err)
	}
}

func TestFetch(t *testing.T) {
	local := makeRepoWithRemote(t)

	if err := Fetch(local); err != nil {
		t.Fatalf("Fetch failed: %v", err)
	}
}

func TestPushCommit(t *testing.T) {
	local := makeRepoWithRemote(t)

	branchOut, _ := exec.Command("git", "-C", local, "rev-parse", "--abbrev-ref", "HEAD").Output()
	branch := strings.TrimSpace(string(branchOut))

	// Two new local commits; we push only up to the FIRST one.
	exec.Command("git", "-C", local, "commit", "--allow-empty", "-m", "c1").Run()
	c1Out, _ := exec.Command("git", "-C", local, "rev-parse", "HEAD").Output()
	c1 := strings.TrimSpace(string(c1Out))
	exec.Command("git", "-C", local, "commit", "--allow-empty", "-m", "c2").Run()

	if err := PushCommit(local, c1, branch); err != nil {
		t.Fatalf("PushCommit failed: %v", err)
	}

	// The remote branch tip must be exactly c1 — not c2.
	remoteURLOut, _ := exec.Command("git", "-C", local, "remote", "get-url", "origin").Output()
	remoteTipOut, _ := exec.Command("git", "-C", strings.TrimSpace(string(remoteURLOut)),
		"rev-parse", branch).Output()
	if got := strings.TrimSpace(string(remoteTipOut)); got != c1 {
		t.Fatalf("remote tip = %s; want c1 %s (only commits up to here should push)", got, c1)
	}
}

func TestPull(t *testing.T) {
	local := makeRepoWithRemote(t)

	// make the remote ahead by pushing directly to the bare repo via a second clone
	local2 := t.TempDir()
	exec.Command("git", "clone", func() string {
		// get the remote URL from local
		out, _ := exec.Command("git", "-C", local, "remote", "get-url", "origin").Output()
		return string(out[:len(out)-1])
	}(), local2).Run()
	exec.Command("git", "-C", local2, "config", "user.email", "test@test.com").Run()
	exec.Command("git", "-C", local2, "config", "user.name", "Test").Run()
	exec.Command("git", "-C", local2, "commit", "--allow-empty", "-m", "remote commit").Run()
	exec.Command("git", "-C", local2, "push").Run()

	// now pull in the original local
	if err := Pull(local); err != nil {
		t.Fatalf("Pull failed: %v", err)
	}

	// verify the remote commit is now local
	commits, err := Log(local, "", 10)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, c := range commits {
		if c.Message == "remote commit" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected remote commit to appear after pull")
	}
}
