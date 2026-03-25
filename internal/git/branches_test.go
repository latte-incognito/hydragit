package git

import (
	"os/exec"
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
