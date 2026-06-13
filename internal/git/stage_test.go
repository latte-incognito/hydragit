package git_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"hydragit/internal/git"
)

func TestStage_modifiedFileLandsInIndex(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "init.txt", "changed\n")

	if err := git.Stage(repo, []string{"init.txt"}); err != nil {
		t.Fatal(err)
	}
	if s := porcelain(t, repo); s != "M  init.txt" {
		t.Fatalf("expected staged modification, got %q", s)
	}
}

func TestStage_untrackedAndDeleted(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "new.txt", "new\n")
	if err := os.Remove(filepath.Join(repo, "init.txt")); err != nil {
		t.Fatal(err)
	}

	if err := git.Stage(repo, []string{"new.txt", "init.txt"}); err != nil {
		t.Fatal(err)
	}
	s := porcelain(t, repo)
	if !strings.Contains(s, "A  new.txt") || !strings.Contains(s, "D  init.txt") {
		t.Fatalf("expected staged add + staged deletion, got %q", s)
	}
}

func TestStage_nonexistentPathErrors(t *testing.T) {
	repo := initRepo(t)
	if err := git.Stage(repo, []string{"nope.txt"}); err == nil {
		t.Fatal("expected error staging a nonexistent path")
	}
	if err := git.Stage(repo, nil); err == nil {
		t.Fatal("expected error for empty path list")
	}
}

func TestUnstage_leavesWorktreeUntouched(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "init.txt", "changed\n")
	gitIn(t, repo, "add", "init.txt")

	if err := git.Unstage(repo, []string{"init.txt"}); err != nil {
		t.Fatal(err)
	}
	if s := porcelain(t, repo); s != " M init.txt" {
		t.Fatalf("expected unstaged modification to survive, got %q", s)
	}
	data, _ := os.ReadFile(filepath.Join(repo, "init.txt"))
	if string(data) != "changed\n" {
		t.Fatal("unstage must never touch working-tree content")
	}
}

func TestUnstage_frozenSnapshotSplitsInTwo(t *testing.T) {
	// The MM case real staging exists for: stage, edit again, and the file has
	// both an index side and a worktree side.
	repo := initRepo(t)
	writeFile(t, repo, "init.txt", "staged version\n")
	gitIn(t, repo, "add", "init.txt")
	writeFile(t, repo, "init.txt", "newer edits\n")

	if s := porcelain(t, repo); s != "MM init.txt" {
		t.Fatalf("expected MM state, got %q", s)
	}

	st, err := git.Status(repo)
	if err != nil {
		t.Fatal(err)
	}
	if len(st.Files) != 1 {
		t.Fatalf("expected one file entry, got %+v", st.Files)
	}
	f := st.Files[0]
	if f.IndexStatus != "M" || f.WorkStatus != "M" {
		t.Fatalf("MM must split into index+work sides, got %+v", f)
	}
}

func TestUnstage_unbornBranchFallsBackToRmCached(t *testing.T) {
	dir := t.TempDir()
	gitIn(t, dir, "init", "-b", "main")
	gitIn(t, dir, "config", "user.email", "test@test.com")
	gitIn(t, dir, "config", "user.name", "Test")
	writeFile(t, dir, "first.txt", "x\n")
	gitIn(t, dir, "add", "first.txt")

	if err := git.Unstage(dir, []string{"first.txt"}); err != nil {
		t.Fatal(err)
	}
	if s := porcelain(t, dir); s != "?? first.txt" {
		t.Fatalf("expected the file back to untracked, got %q", s)
	}
}

func TestStatus_splitFieldsForStagedRename(t *testing.T) {
	repo := initRepo(t)
	gitIn(t, repo, "mv", "init.txt", "renamed.txt")

	st, err := git.Status(repo)
	if err != nil {
		t.Fatal(err)
	}
	if len(st.Files) != 1 {
		t.Fatalf("expected one entry, got %+v", st.Files)
	}
	f := st.Files[0]
	if f.IndexStatus != "R" || f.OldPath != "init.txt" || f.Path != "renamed.txt" {
		t.Fatalf("expected staged rename with oldPath, got %+v", f)
	}
}

func TestStatus_untrackedHasOnlyWorkSide(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "new.txt", "x\n")

	st, err := git.Status(repo)
	if err != nil {
		t.Fatal(err)
	}
	f := st.Files[0]
	if f.IndexStatus != "" || f.WorkStatus != "U" {
		t.Fatalf("untracked must be work-side only, got %+v", f)
	}
}

func TestCreateCommit_emptyPathsCommitsTheIndex(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "init.txt", "staged version\n")
	gitIn(t, repo, "add", "init.txt")
	writeFile(t, repo, "init.txt", "newer edits\n") // must NOT be committed

	res, err := git.CreateCommit(repo, "feat: frozen snapshot", nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.Message != "feat: frozen snapshot" {
		t.Fatalf("unexpected result %+v", res)
	}
	// The commit took the index's frozen content, not the newer worktree edits…
	committed := gitIn(t, repo, "show", "HEAD:init.txt")
	if strings.TrimSpace(committed) != "staged version" {
		t.Fatalf("commit must take the staged snapshot, got %q", committed)
	}
	// …and the newer edits survive as an unstaged change.
	if s := porcelain(t, repo); s != " M init.txt" {
		t.Fatalf("expected the newer edits to remain unstaged, got %q", s)
	}
}

func TestCreateCommit_emptyIndexErrors(t *testing.T) {
	repo := initRepo(t)
	if _, err := git.CreateCommit(repo, "msg", nil); err == nil {
		t.Fatal("expected git's nothing-to-commit error on an empty index")
	}
}
