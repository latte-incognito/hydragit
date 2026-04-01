package git

import (
	"os/exec"
	"testing"
)

// makeRepoWithTwoCommits returns a repo and the hash of the second (older) commit.
func makeRepoWithTwoCommits(t *testing.T) (dir string, olderHash string) {
	t.Helper()
	dir = initRepo(t) // first commit = "init"

	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "second commit").Run()

	// olderHash = the init commit (first parent of HEAD)
	out, err := exec.Command("git", "-C", dir, "rev-parse", "HEAD~1").Output()
	if err != nil {
		t.Fatal(err)
	}
	olderHash = string(out[:len(out)-1])
	return
}

func TestCherryPick(t *testing.T) {
	dir, olderHash := makeRepoWithTwoCommits(t)

	// create a new branch from the first commit only
	exec.Command("git", "-C", dir, "checkout", "-b", "cp-branch", olderHash).Run()

	// get HEAD on main to cherry-pick
	mainOut, _ := exec.Command("git", "-C", dir, "rev-parse", "main").Output()
	if len(mainOut) == 0 {
		mainOut, _ = exec.Command("git", "-C", dir, "rev-parse", "master").Output()
	}
	headHash := string(mainOut[:len(mainOut)-1])

	if err := CherryPick(dir, headHash); err != nil {
		t.Fatalf("CherryPick failed: %v", err)
	}

	// verify the commit landed
	commits, err := Log(dir, "", 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(commits) < 2 {
		t.Fatal("expected at least 2 commits after cherry-pick")
	}
}

func TestRevert(t *testing.T) {
	dir, _ := makeRepoWithTwoCommits(t)

	// revert HEAD
	out, err := exec.Command("git", "-C", dir, "rev-parse", "HEAD").Output()
	if err != nil {
		t.Fatal(err)
	}
	headHash := string(out[:len(out)-1])

	if err := Revert(dir, headHash); err != nil {
		t.Fatalf("Revert failed: %v", err)
	}

	// verify a new revert commit was created
	commits, err := Log(dir, "", 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(commits) < 3 {
		t.Fatal("expected revert commit to appear in log")
	}
}
