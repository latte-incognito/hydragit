package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// makeCommitWithFile creates a repo with a real file change so diff has content.
func makeCommitWithFile(t *testing.T) (dir string, hash string) {
	t.Helper()
	dir = t.TempDir()

	cmds := [][]string{
		{"git", "-C", dir, "init"},
		{"git", "-C", dir, "config", "user.email", "test@test.com"},
		{"git", "-C", dir, "config", "user.name", "Test"},
		{"git", "-C", dir, "commit", "--allow-empty", "-m", "root"},
	}
	for _, c := range cmds {
		exec.Command(c[0], c[1:]...).Run()
	}

	// write a real file and commit it
	if err := os.WriteFile(filepath.Join(dir, "hello.go"), []byte("package main\n\nfunc main() {}\n"), 0644); err != nil {
		t.Fatal(err)
	}
	exec.Command("git", "-C", dir, "add", ".").Run()
	exec.Command("git", "-C", dir, "commit", "-m", "add hello.go").Run()

	// get the hash of that commit
	out, err := exec.Command("git", "-C", dir, "rev-parse", "HEAD").Output()
	if err != nil {
		t.Fatal(err)
	}
	hash = string(out[:len(out)-1]) // trim newline
	return
}

func TestDiffCommit(t *testing.T) {
	dir, hash := makeCommitWithFile(t)

	files, err := DiffCommit(dir, hash)
	if err != nil {
		t.Fatalf("DiffCommit failed: %v", err)
	}
	if len(files) == 0 {
		t.Fatal("expected at least one file in diff")
	}

	found := false
	for _, f := range files {
		if f.Path == "hello.go" {
			found = true
			if f.Additions == 0 {
				t.Error("expected additions > 0 for new file")
			}
		}
	}
	if !found {
		t.Fatal("expected hello.go in diff files")
	}
}

func TestDiffFile(t *testing.T) {
	dir, hash := makeCommitWithFile(t)

	hunks, err := DiffFile(dir, hash, "hello.go")
	if err != nil {
		t.Fatalf("DiffFile failed: %v", err)
	}
	if len(hunks) == 0 {
		t.Fatal("expected at least one hunk")
	}
	if len(hunks[0].Lines) == 0 {
		t.Fatal("expected lines in first hunk")
	}

	// every line in a new file should be an addition
	for _, line := range hunks[0].Lines {
		if line.Type != "add" && line.Type != "ctx" {
			t.Errorf("unexpected line type %q in new file diff", line.Type)
		}
	}
}

func TestDiffCommitEmpty(t *testing.T) {
	dir := initRepo(t)

	// get the empty commit hash
	out, _ := exec.Command("git", "-C", dir, "rev-parse", "HEAD").Output()
	hash := string(out[:len(out)-1])

	files, err := DiffCommit(dir, hash)
	if err != nil {
		t.Fatalf("DiffCommit on empty commit failed: %v", err)
	}
	// empty commit = no files, but should return empty slice not error
	if files == nil {
		t.Fatal("expected empty slice, not nil")
	}
}
