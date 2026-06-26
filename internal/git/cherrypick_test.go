package git

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// makeRepoWithFileCommits creates a repo with two real file commits.
// Returns dir, hashA (older), hashB (newer, on default branch HEAD).
func makeRepoWithFileCommits(t *testing.T) (dir, hashA, hashB string) {
	t.Helper()
	dir = t.TempDir()

	for _, c := range [][]string{
		{"git", "-C", dir, "init"},
		{"git", "-C", dir, "config", "user.email", "test@test.com"},
		{"git", "-C", dir, "config", "user.name", "Test"},
	} {
		exec.Command(c[0], c[1:]...).Run()
	}

	// commit A
	if err := os.WriteFile(filepath.Join(dir, "file-a.txt"), []byte("content a\n"), 0644); err != nil {
		t.Fatal(err)
	}
	exec.Command("git", "-C", dir, "add", ".").Run()
	exec.Command("git", "-C", dir, "commit", "-m", "commit A").Run()
	out, _ := exec.Command("git", "-C", dir, "rev-parse", "HEAD").Output()
	hashA = string(out[:len(out)-1])

	// commit B
	if err := os.WriteFile(filepath.Join(dir, "file-b.txt"), []byte("content b\n"), 0644); err != nil {
		t.Fatal(err)
	}
	exec.Command("git", "-C", dir, "add", ".").Run()
	exec.Command("git", "-C", dir, "commit", "-m", "commit B").Run()
	out, _ = exec.Command("git", "-C", dir, "rev-parse", "HEAD").Output()
	hashB = string(out[:len(out)-1])

	return dir, hashA, hashB
}

func TestCherryPick(t *testing.T) {
	dir, hashA, hashB := makeRepoWithFileCommits(t)

	// new branch from commit A only — commit B not present here
	exec.Command("git", "-C", dir, "checkout", "-b", "cp-branch", hashA).Run()

	// cherry-pick commit B (has file-b.txt, unique content)
	if err := CherryPick(dir, hashB); err != nil {
		t.Fatalf("CherryPick failed: %v", err)
	}

	// file-b.txt should now exist on this branch
	if _, err := os.Stat(filepath.Join(dir, "file-b.txt")); err != nil {
		t.Fatal("expected file-b.txt to exist after cherry-pick")
	}
}

func TestRevert(t *testing.T) {
	dir, _, hashB := makeRepoWithFileCommits(t)

	if err := Revert(dir, hashB); err != nil {
		t.Fatalf("Revert failed: %v", err)
	}

	// a revert commit should appear in log
	commits, err := logCommits(dir, 10)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, c := range commits {
		if len(c.Message) >= 6 && c.Message[:6] == "Revert" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected revert commit in log, got: %v", fmt.Sprintf("%+v", commits))
	}
}
