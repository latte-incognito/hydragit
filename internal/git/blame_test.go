package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// blameRepo builds a repo where two different authors each own one line of
// f.txt, so blame output must distinguish them by sha and author.
func blameRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	gitCfg := func(args ...string) {
		full := append([]string{"-C", dir}, args...)
		if err := exec.Command("git", full...).Run(); err != nil {
			t.Fatalf("git %v: %v", args, err)
		}
	}

	gitCfg("init")
	gitCfg("config", "user.email", "alice@example.com")
	gitCfg("config", "user.name", "Alice")

	file := filepath.Join(dir, "f.txt")
	if err := os.WriteFile(file, []byte("line one\nline two\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitCfg("add", "f.txt")
	gitCfg("commit", "-m", "first")

	// Second author rewrites line two only.
	gitCfg("config", "user.email", "bob@example.com")
	gitCfg("config", "user.name", "Bob")
	if err := os.WriteFile(file, []byte("line one\nline two edited\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitCfg("add", "f.txt")
	gitCfg("commit", "-m", "second")

	return dir
}

func TestBlame(t *testing.T) {
	dir := blameRepo(t)

	lines, err := Blame(dir, "f.txt", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) != 2 {
		t.Fatalf("expected 2 blame lines, got %d", len(lines))
	}

	if lines[0].Author != "Alice" || lines[0].Summary != "first" {
		t.Errorf("line 1: want Alice/first, got %s/%s", lines[0].Author, lines[0].Summary)
	}
	if lines[1].Author != "Bob" || lines[1].Summary != "second" {
		t.Errorf("line 2: want Bob/second, got %s/%s", lines[1].Author, lines[1].Summary)
	}
	if lines[0].Commit == lines[1].Commit {
		t.Errorf("expected distinct commits per line, both were %s", lines[0].Commit)
	}
	if lines[0].Line != 1 || lines[1].Line != 2 {
		t.Errorf("expected line numbers 1,2, got %d,%d", lines[0].Line, lines[1].Line)
	}
	if lines[0].AuthorEmail != "alice@example.com" {
		t.Errorf("expected alice email, got %q", lines[0].AuthorEmail)
	}
	if lines[0].AuthorTime == 0 {
		t.Error("expected non-zero author time")
	}
}

// TestBlameBufferAware verifies that piping unsaved buffer contents makes the
// inserted line show as uncommitted and shifts existing lines down.
func TestBlameBufferAware(t *testing.T) {
	dir := blameRepo(t)

	// Simulate an editor buffer with a brand-new first line not yet on disk.
	buf := []byte("brand new line\nline one\nline two edited\n")

	lines, err := Blame(dir, "f.txt", buf)
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) != 3 {
		t.Fatalf("expected 3 blame lines, got %d", len(lines))
	}
	if !lines[0].Uncommitted || lines[0].Commit != zeroSHA {
		t.Errorf("line 1 should be uncommitted, got commit=%s uncommitted=%v",
			lines[0].Commit, lines[0].Uncommitted)
	}
	if lines[1].Author != "Alice" {
		t.Errorf("line 2 should still be Alice's, got %s", lines[1].Author)
	}
	if lines[2].Author != "Bob" {
		t.Errorf("line 3 should still be Bob's, got %s", lines[2].Author)
	}
}
