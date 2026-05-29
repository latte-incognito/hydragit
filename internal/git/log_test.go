package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// commitFile writes content to name (relative to dir) and commits it.
func commitFile(t *testing.T, dir, name, content, msg string) {
	t.Helper()
	full := filepath.Join(dir, name)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	exec.Command("git", "-C", dir, "add", name).Run()
	exec.Command("git", "-C", dir, "commit", "-m", msg).Run()
}

// currentBranch returns the repo's checked-out branch (master vs main differs
// across git versions / configs).
func currentBranch(t *testing.T, dir string) string {
	t.Helper()
	out, err := exec.Command("git", "-C", dir, "rev-parse", "--abbrev-ref", "HEAD").Output()
	if err != nil {
		t.Fatal(err)
	}
	return strings.TrimSpace(string(out))
}

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

// Regression: root-level files must be found. The old LogFile used a "**/"
// pathspec that never matched files at the repo root.
func TestFileHistoryRootFile(t *testing.T) {
	dir := initRepo(t)

	commitFile(t, dir, "README.md", "v1\n", "add readme")
	commitFile(t, dir, "README.md", "v2\n", "edit readme")
	commitFile(t, dir, "other.txt", "x\n", "unrelated file")
	commitFile(t, dir, "README.md", "v3\n", "edit readme again")

	commits, err := FileHistory(dir, "HEAD", "README.md")
	if err != nil {
		t.Fatal(err)
	}
	if len(commits) != 3 {
		t.Fatalf("README.md: expected 3 commits, got %d", len(commits))
	}

	// A file that never existed → non-nil empty slice (so JSON is [] not null).
	none, err := FileHistory(dir, "HEAD", "nope.md")
	if err != nil {
		t.Fatal(err)
	}
	if none == nil {
		t.Fatal("expected non-nil slice for missing file")
	}
	if len(none) != 0 {
		t.Fatalf("missing file: expected 0 commits, got %d", len(none))
	}
}

func TestFileHistoryNestedFile(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "internal/git/log.go", "package git\n", "add log")
	commitFile(t, dir, "internal/git/log.go", "package git\n// x\n", "edit log")

	commits, err := FileHistory(dir, "HEAD", "internal/git/log.go")
	if err != nil {
		t.Fatal(err)
	}
	if len(commits) != 2 {
		t.Fatalf("nested file: expected 2 commits, got %d", len(commits))
	}
}

// --follow should carry history across a rename.
func TestFileHistoryFollowsRenames(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "old.txt", "a\n", "add old")
	exec.Command("git", "-C", dir, "mv", "old.txt", "new.txt").Run()
	exec.Command("git", "-C", dir, "commit", "-m", "rename old to new").Run()

	commits, err := FileHistory(dir, "HEAD", "new.txt")
	if err != nil {
		t.Fatal(err)
	}
	if len(commits) != 2 {
		t.Fatalf("expected 2 commits across rename, got %d", len(commits))
	}
}

// History is scoped to the given ref: a commit only on another branch must not
// appear in HEAD's history, but does appear when that branch is the ref.
func TestFileHistoryScopedToRef(t *testing.T) {
	dir := initRepo(t)
	base := currentBranch(t, dir)

	commitFile(t, dir, "file.txt", "base\n", "base change")

	exec.Command("git", "-C", dir, "checkout", "-b", "feature").Run()
	commitFile(t, dir, "file.txt", "base\nfeature\n", "feature change")
	exec.Command("git", "-C", dir, "checkout", base).Run()

	head, err := FileHistory(dir, "HEAD", "file.txt")
	if err != nil {
		t.Fatal(err)
	}
	if len(head) != 1 {
		t.Fatalf("HEAD (%s): expected 1 commit, got %d", base, len(head))
	}

	feat, err := FileHistory(dir, "feature", "file.txt")
	if err != nil {
		t.Fatal(err)
	}
	if len(feat) != 2 {
		t.Fatalf("feature: expected 2 commits, got %d", len(feat))
	}
}
