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

func TestLogFilters(t *testing.T) {
	dir := initRepo(t)
	commitAs := func(name, msg string) {
		t.Helper()
		cmd := exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", msg)
		cmd.Env = append(cmd.Environ(),
			"GIT_AUTHOR_NAME="+name, "GIT_AUTHOR_EMAIL="+name+"@x.com",
			"GIT_COMMITTER_NAME="+name, "GIT_COMMITTER_EMAIL="+name+"@x.com")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("commit %q: %s", msg, out)
		}
	}
	commitAs("Alice", "feat: add login")
	commitAs("Bob", "fix: logout bug")
	commitAs("Alice", "docs: readme")

	// Filter by message.
	byMsg, err := LogWith(dir, LogOptions{Grep: "logout"})
	if err != nil {
		t.Fatal(err)
	}
	if len(byMsg) != 1 || byMsg[0].Message != "fix: logout bug" {
		t.Fatalf("grep 'logout': expected 1 commit, got %d", len(byMsg))
	}

	// Filter by author.
	byAuthor, err := LogWith(dir, LogOptions{Author: "Alice"})
	if err != nil {
		t.Fatal(err)
	}
	if len(byAuthor) != 2 {
		t.Fatalf("author Alice: expected 2 commits, got %d", len(byAuthor))
	}

	// Message + author combine with AND.
	both, err := LogWith(dir, LogOptions{Author: "Alice", Grep: "readme"})
	if err != nil {
		t.Fatal(err)
	}
	if len(both) != 1 || both[0].Message != "docs: readme" {
		t.Fatalf("Alice+readme: expected 1 commit, got %d", len(both))
	}

	// Grep is case-insensitive.
	ci, err := LogWith(dir, LogOptions{Grep: "LOGOUT"})
	if err != nil {
		t.Fatal(err)
	}
	if len(ci) != 1 {
		t.Fatalf("case-insensitive grep: expected 1 commit, got %d", len(ci))
	}
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

// BUG #1: filename search must find ROOT-level files, not just nested ones.
func TestLogFile_findsRootAndNestedByName(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "root.txt", "r\n", "add root.txt")
	commitFile(t, dir, "sub/deep/leaf.txt", "l\n", "add leaf.txt")

	// Bare filename at the repo root — the original "**/" pathspec dropped these.
	root, err := LogFile(dir, "root.txt")
	if err != nil {
		t.Fatalf("LogFile(root.txt) failed: %v", err)
	}
	if len(root) == 0 {
		t.Fatal("BUG #1: root-level file search returned no commits")
	}

	// Nested filename, matched anywhere in the tree.
	leaf, err := LogFile(dir, "leaf.txt")
	if err != nil {
		t.Fatalf("LogFile(leaf.txt) failed: %v", err)
	}
	if len(leaf) == 0 {
		t.Fatal("nested file search returned no commits")
	}

	// A name that doesn't exist returns nothing (not an error).
	none, err := LogFile(dir, "nope.txt")
	if err != nil {
		t.Fatalf("LogFile(nope.txt) errored: %v", err)
	}
	if len(none) != 0 {
		t.Fatalf("expected no commits for a missing file, got %d", len(none))
	}
}

func TestLineHistory(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "f.txt", "alpha\nbravo\n", "c1")
	commitFile(t, dir, "f.txt", "ALPHA\nbravo\n", "c2") // line 1 only

	// Line 1 changed at creation and in c2 → 2 commits, each with a hunk.
	lc, err := LineHistory(dir, "f.txt", 1, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(lc) != 2 {
		t.Fatalf("expected 2 commits, got %d", len(lc))
	}
	for _, c := range lc {
		if len(c.Hunks) == 0 {
			t.Fatalf("commit %s: expected line-range hunks", c.Hash[:7])
		}
	}

	// Newest commit's hunk is scoped to line 1: shows ALPHA, never line-2 bravo.
	var sawAlphaAdd, sawBravo bool
	for _, h := range lc[0].Hunks {
		for _, l := range h.Lines {
			if l.Type == "add" && l.Content == "ALPHA" {
				sawAlphaAdd = true
			}
			if strings.Contains(l.Content, "bravo") {
				sawBravo = true
			}
		}
	}
	if !sawAlphaAdd {
		t.Fatal("expected ALPHA addition in line-1 hunk")
	}
	if sawBravo {
		t.Fatal("line-2 content leaked into a line-1-scoped hunk")
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
