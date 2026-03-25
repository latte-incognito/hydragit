package git

import (
	"os/exec"
	"testing"
)

func initRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	exec.Command("git", "-C", dir, "init").Run()
	exec.Command("git", "-C", dir, "config", "user.email", "test@test.com").Run()
	exec.Command("git", "-C", dir, "config", "user.name", "Test").Run()
	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "init").Run()
	return dir
}

func TestLog(t *testing.T) {
	dir := initRepo(t)
	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "second").Run()

	commits, err := Log(dir, "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(commits) < 2 {
		t.Fatalf("expected >= 2 commits, got %d", len(commits))
	}
}

func TestStatus(t *testing.T) {
	dir := initRepo(t)

	s, err := Status(dir)
	if err != nil {
		t.Fatal(err)
	}
	if s.Branch == "" {
		t.Fatal("expected non-empty branch")
	}
}
