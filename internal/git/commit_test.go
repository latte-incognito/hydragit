package git_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"hydragit/internal/git"
)

// initRepo creates a temp git repo with an initial commit and returns its path.
func initRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	must := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Test",
			"GIT_AUTHOR_EMAIL=test@test.com",
			"GIT_COMMITTER_NAME=Test",
			"GIT_COMMITTER_EMAIL=test@test.com",
		)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %s", args, out)
		}
	}

	must("init", "-b", "main")
	must("config", "user.email", "test@test.com")
	must("config", "user.name", "Test")

	// Write and commit an initial file so HEAD exists
	p := filepath.Join(dir, "init.txt")
	os.WriteFile(p, []byte("init\n"), 0644)
	must("add", "init.txt")
	must("commit", "-m", "init")

	return dir
}

// writeFile creates or overwrites a file inside the repo.
func writeFile(t *testing.T, repoPath, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(repoPath, name), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

// ── Commit ────────────────────────────────────────────────────────────────────

func TestCommit_basic(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "hello.txt", "hello\n")

	result, err := git.CreateCommit(repo, "feat: add hello", []string{"hello.txt"})
	if err != nil {
		t.Fatalf("CreateCommit failed: %v", err)
	}
	if result.Hash == "" {
		t.Error("expected non-empty hash")
	}
	if result.Message == "" {
		t.Error("expected non-empty message")
	}
}

func TestCommit_onlyStagedPaths(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "a.txt", "a\n")
	writeFile(t, repo, "b.txt", "b\n")

	result, err := git.CreateCommit(repo, "add a only", []string{"a.txt"})
	if err != nil {
		t.Fatalf("CreateCommit failed: %v", err)
	}
	if result.Hash == "" {
		t.Error("expected hash")
	}

	cmd := exec.Command("git", "status", "--porcelain")
	cmd.Dir = repo
	out, _ := cmd.Output()
	if string(out) == "" {
		t.Error("expected b.txt to still be untracked")
	}
}

func TestCommit_emptyMessage(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "a.txt", "a\n")

	_, err := git.CreateCommit(repo, "", []string{"a.txt"})
	if err == nil {
		t.Error("expected error for empty message")
	}
}

func TestCommit_emptyPaths(t *testing.T) {
	repo := initRepo(t)

	_, err := git.CreateCommit(repo, "msg", []string{})
	if err == nil {
		t.Error("expected error for empty paths")
	}
}

func TestCommit_nonExistentFile(t *testing.T) {
	repo := initRepo(t)

	_, err := git.CreateCommit(repo, "msg", []string{"does_not_exist.txt"})
	if err == nil {
		t.Error("expected error for non-existent file")
	}
}

func TestCommit_multipleFiles(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "x.txt", "x\n")
	writeFile(t, repo, "y.txt", "y\n")

	result, err := git.CreateCommit(repo, "add x and y", []string{"x.txt", "y.txt"})
	if err != nil {
		t.Fatalf("CreateCommit failed: %v", err)
	}
	if result.Hash == "" {
		t.Error("expected hash")
	}

	cmd := exec.Command("git", "show", "--name-only", "--format=", "HEAD")
	cmd.Dir = repo
	out, _ := cmd.Output()
	s := string(out)
	if !containsLine(s, "x.txt") {
		t.Errorf("expected x.txt in commit, got:\n%s", s)
	}
	if !containsLine(s, "y.txt") {
		t.Errorf("expected y.txt in commit, got:\n%s", s)
	}
}

func TestCommit_returnsCorrectHash(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "c.txt", "c\n")

	result, err := git.CreateCommit(repo, "add c", []string{"c.txt"})
	if err != nil {
		t.Fatal(err)
	}

	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = repo
	out, _ := cmd.Output()
	head := string(out)
	if len(head) > 0 && head[len(head)-1] == '\n' {
		head = head[:len(head)-1]
	}
	if result.Hash != head {
		t.Errorf("hash mismatch: got %q, want %q", result.Hash, head)
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func containsLine(s, line string) bool {
	for _, l := range splitLines(s) {
		if l == line {
			return true
		}
	}
	return false
}

func splitLines(s string) []string {
	var lines []string
	cur := ""
	for _, c := range s {
		if c == '\n' {
			if cur != "" {
				lines = append(lines, cur)
			}
			cur = ""
		} else {
			cur += string(c)
		}
	}
	if cur != "" {
		lines = append(lines, cur)
	}
	return lines
}
