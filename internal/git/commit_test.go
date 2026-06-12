package git_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
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

func headSubject(t *testing.T, repo string) string {
	t.Helper()
	cmd := exec.Command("git", "log", "-1", "--format=%s")
	cmd.Dir = repo
	out, err := cmd.Output()
	if err != nil {
		t.Fatal(err)
	}
	return string(out[:len(out)-1])
}

func TestAmendCommit_messageOnly(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "x.txt", "x\n")
	first, _ := git.CreateCommit(repo, "original message", []string{"x.txt"})

	res, err := git.AmendCommit(repo, "reworded message", nil)
	if err != nil {
		t.Fatalf("AmendCommit failed: %v", err)
	}
	if headSubject(t, repo) != "reworded message" {
		t.Fatalf("HEAD subject = %q; want reworded", headSubject(t, repo))
	}
	// Amend rewrites history → the hash changes.
	if res.Hash == first.Hash {
		t.Error("amend should produce a new commit hash")
	}
}

func TestAmendCommit_foldsStagedChanges(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "a.txt", "a\n")
	git.CreateCommit(repo, "c1", []string{"a.txt"})

	// New file folded into the amended commit (empty message → keep "c1").
	writeFile(t, repo, "b.txt", "b\n")
	if _, err := git.AmendCommit(repo, "", []string{"b.txt"}); err != nil {
		t.Fatalf("AmendCommit fold failed: %v", err)
	}
	if headSubject(t, repo) != "c1" {
		t.Fatalf("message should be unchanged (c1), got %q", headSubject(t, repo))
	}
	// b.txt is now part of HEAD.
	cmd := exec.Command("git", "ls-tree", "--name-only", "HEAD")
	cmd.Dir = repo
	out, _ := cmd.Output()
	if !strings.Contains(string(out), "b.txt") {
		t.Fatalf("b.txt should be in HEAD after amend; tree:\n%s", out)
	}
}

func TestLastCommitMessage(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "x.txt", "x\n")
	git.CreateCommit(repo, "subject line", []string{"x.txt"})

	msg, err := git.LastCommitMessage(repo)
	if err != nil {
		t.Fatalf("LastCommitMessage failed: %v", err)
	}
	if msg != "subject line" {
		t.Fatalf("LastCommitMessage = %q; want 'subject line'", msg)
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

	// Empty paths now means "commit the index" (real staging) — on a clean
	// index that's git's own nothing-to-commit error, so this still refuses.
	_, err := git.CreateCommit(repo, "msg", []string{})
	if err == nil {
		t.Error("expected error committing an empty index")
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
