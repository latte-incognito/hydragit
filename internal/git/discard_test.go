package git_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"hydragit/internal/git"
)

// gitIn runs a git command in dir, failing the test on error.
func gitIn(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %s", args, out)
	}
	return string(out)
}

// porcelain returns `git status --porcelain -u` for assertions.
func porcelain(t *testing.T, dir string) string {
	t.Helper()
	return strings.TrimSpace(gitIn(t, dir, "status", "--porcelain", "-u"))
}

func TestDiscard_modifiedRestoresContent(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "init.txt", "changed\n")

	if err := git.Discard(repo, []string{"init.txt"}); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(filepath.Join(repo, "init.txt"))
	if string(data) != "init\n" {
		t.Fatalf("expected restored content, got %q", data)
	}
	if s := porcelain(t, repo); s != "" {
		t.Fatalf("expected clean tree, got %q", s)
	}
}

func TestDiscard_untrackedDeletesFile(t *testing.T) {
	repo := initRepo(t)
	if err := os.MkdirAll(filepath.Join(repo, "newdir"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, repo, "newdir/un.txt", "new\n")

	if err := git.Discard(repo, []string{"newdir/un.txt"}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(repo, "newdir/un.txt")); !os.IsNotExist(err) {
		t.Fatal("expected untracked file to be deleted")
	}
}

func TestDiscard_addedUnstagesAndDeletes(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "added.txt", "added\n")
	gitIn(t, repo, "add", "added.txt")

	if err := git.Discard(repo, []string{"added.txt"}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(repo, "added.txt")); !os.IsNotExist(err) {
		t.Fatal("expected added file to be deleted")
	}
	if s := porcelain(t, repo); s != "" {
		t.Fatalf("expected clean tree, got %q", s)
	}
}

func TestDiscard_deletedFileComesBack(t *testing.T) {
	repo := initRepo(t)
	if err := os.Remove(filepath.Join(repo, "init.txt")); err != nil {
		t.Fatal(err)
	}

	if err := git.Discard(repo, []string{"init.txt"}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(repo, "init.txt")); err != nil {
		t.Fatal("expected deleted file to be restored")
	}
}

func TestDiscard_stagedRenameRestoresOldRemovesNew(t *testing.T) {
	repo := initRepo(t)
	gitIn(t, repo, "mv", "init.txt", "renamed.txt")

	// Status() reports the new path — that's what the UI sends.
	if err := git.Discard(repo, []string{"renamed.txt"}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(repo, "init.txt")); err != nil {
		t.Fatal("expected rename source to be restored")
	}
	if _, err := os.Stat(filepath.Join(repo, "renamed.txt")); !os.IsNotExist(err) {
		t.Fatal("expected rename target to be deleted")
	}
	if s := porcelain(t, repo); s != "" {
		t.Fatalf("expected clean tree, got %q", s)
	}
}

func TestDiscard_mixedBatch(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "init.txt", "changed\n")
	writeFile(t, repo, "un.txt", "new\n")

	if err := git.Discard(repo, []string{"init.txt", "un.txt"}); err != nil {
		t.Fatal(err)
	}
	if s := porcelain(t, repo); s != "" {
		t.Fatalf("expected clean tree, got %q", s)
	}
}

func TestDiscard_cleanPathErrorsAndLeavesTreeIntact(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "init.txt", "changed\n") // a real change that must survive

	if err := git.Discard(repo, []string{"nope.txt"}); err == nil {
		t.Fatal("expected error for a path with no changes")
	}
	data, _ := os.ReadFile(filepath.Join(repo, "init.txt"))
	if string(data) != "changed\n" {
		t.Fatal("a refused discard must not touch other files")
	}
}

func TestDiscard_emptyPathsErrors(t *testing.T) {
	repo := initRepo(t)
	if err := git.Discard(repo, nil); err == nil {
		t.Fatal("expected error for empty path list")
	}
}

func TestDiscard_conflictedFileRefused(t *testing.T) {
	repo := initRepo(t)
	gitIn(t, repo, "checkout", "-b", "feat")
	writeFile(t, repo, "init.txt", "feat side\n")
	gitIn(t, repo, "commit", "-am", "feat change")
	gitIn(t, repo, "checkout", "main")
	writeFile(t, repo, "init.txt", "main side\n")
	gitIn(t, repo, "commit", "-am", "main change")

	// Merge must fail with a conflict — CombinedOutput error is expected here,
	// so run it raw instead of through gitIn.
	cmd := exec.Command("git", "merge", "feat")
	cmd.Dir = repo
	if err := cmd.Run(); err == nil {
		t.Fatal("expected merge conflict")
	}

	if err := git.Discard(repo, []string{"init.txt"}); err == nil {
		t.Fatal("expected refusal to discard a conflicted file")
	}
	// The conflict state must be intact: still unmerged in status.
	if s := porcelain(t, repo); !strings.Contains(s, "UU init.txt") {
		t.Fatalf("expected conflict to survive the refused discard, got %q", s)
	}
}
