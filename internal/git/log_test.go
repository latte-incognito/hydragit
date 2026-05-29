package git

import (
	"os"
	"os/exec"
	"path/filepath"
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

func TestLogLines(t *testing.T) {
	dir := initRepo(t)
	path := filepath.Join(dir, "file.txt")

	write := func(content, msg string) {
		t.Helper()
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
		exec.Command("git", "-C", dir, "add", "file.txt").Run()
		exec.Command("git", "-C", dir, "commit", "-m", msg).Run()
	}

	write("alpha\nbravo\n", "add file")     // both lines created here
	write("ALPHA\nbravo\n", "change line1") // only line 1 changes

	// Line 2 ("bravo") only ever changed at creation → 1 commit.
	line2, err := LogLines(dir, "file.txt", 2, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(line2) != 1 {
		t.Fatalf("line 2: expected 1 commit, got %d", len(line2))
	}

	// Line 1 changed at creation and again → 2 commits.
	line1, err := LogLines(dir, "file.txt", 1, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(line1) != 2 {
		t.Fatalf("line 1: expected 2 commits, got %d", len(line1))
	}
}
