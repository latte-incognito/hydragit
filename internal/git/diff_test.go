package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
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

func TestFormatPatch(t *testing.T) {
	dir, hash := makeCommitWithFile(t)

	patch, err := FormatPatch(dir, hash)
	if err != nil {
		t.Fatalf("FormatPatch failed: %v", err)
	}
	// A format-patch mailbox starts with "From <sha>" and carries the subject
	// and the file's diff.
	if !strings.HasPrefix(patch, "From ") {
		t.Fatalf("patch should start with a mailbox 'From ' line, got: %.40q", patch)
	}
	if !strings.Contains(patch, "add hello.go") {
		t.Error("patch should contain the commit subject")
	}
	if !strings.Contains(patch, "hello.go") {
		t.Error("patch should reference the changed file")
	}
}

func TestDiffRefFiles_vsWorkingTree(t *testing.T) {
	dir, _ := makeCommitWithFile(t)

	// Modify the working tree so HEAD differs from it.
	if err := os.WriteFile(filepath.Join(dir, "hello.go"),
		[]byte("package main\n\nfunc main() { println(\"hi\") }\n"), 0644); err != nil {
		t.Fatal(err)
	}

	files, err := DiffRefFiles(dir, "HEAD")
	if err != nil {
		t.Fatalf("DiffRefFiles failed: %v", err)
	}
	if len(files) != 1 || files[0].Path != "hello.go" {
		t.Fatalf("expected hello.go modified vs working tree, got %+v", files)
	}

	hunks, err := DiffRefFile(dir, "HEAD", "hello.go")
	if err != nil {
		t.Fatalf("DiffRefFile failed: %v", err)
	}
	if len(hunks) == 0 {
		t.Fatal("expected hunks for the modified file")
	}
}

func TestDiffRangeFiles_twoRefs(t *testing.T) {
	dir, base := makeCommitWithFile(t)

	// Branch off and add a new file, so base..head shows exactly that file.
	exec.Command("git", "-C", dir, "checkout", "-b", "feature").Run()
	if err := os.WriteFile(filepath.Join(dir, "new.txt"), []byte("hi\n"), 0644); err != nil {
		t.Fatal(err)
	}
	exec.Command("git", "-C", dir, "add", ".").Run()
	exec.Command("git", "-C", dir, "commit", "-m", "add new.txt").Run()

	files, err := DiffRangeFiles(dir, base, "feature")
	if err != nil {
		t.Fatalf("DiffRangeFiles failed: %v", err)
	}
	if len(files) != 1 || files[0].Path != "new.txt" || files[0].Status != "A" {
		t.Fatalf("expected new.txt added between base and feature, got %+v", files)
	}
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

// TestDiffCommit_rootCommit guards the initial commit: a parentless commit
// diffs against the empty tree only with --root, so without it DiffCommit
// returned no files for the very first commit. Build a repo whose first commit
// already contains a file and assert it shows up as an addition.
func TestDiffCommit_rootCommit(t *testing.T) {
	dir := t.TempDir()
	exec.Command("git", "-C", dir, "init").Run()
	exec.Command("git", "-C", dir, "config", "user.email", "test@test.com").Run()
	exec.Command("git", "-C", dir, "config", "user.name", "Test").Run()
	if err := os.WriteFile(filepath.Join(dir, "first.txt"), []byte("line one\nline two\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	exec.Command("git", "-C", dir, "add", ".").Run()
	exec.Command("git", "-C", dir, "commit", "-m", "first").Run()

	out, err := exec.Command("git", "-C", dir, "rev-parse", "HEAD").Output()
	if err != nil {
		t.Fatal(err)
	}
	hash := strings.TrimSpace(string(out))

	files, err := DiffCommit(dir, hash)
	if err != nil {
		t.Fatalf("DiffCommit on root commit failed: %v", err)
	}
	if len(files) != 1 || files[0].Path != "first.txt" {
		t.Fatalf("expected first.txt in the root commit diff, got %+v", files)
	}
	if files[0].Status != "A" || files[0].Additions == 0 {
		t.Fatalf("expected root commit file added with additions, got %+v", files[0])
	}

	hunks, err := DiffFile(dir, hash, "first.txt")
	if err != nil {
		t.Fatalf("DiffFile on root commit failed: %v", err)
	}
	if len(hunks) == 0 || len(hunks[0].Lines) == 0 {
		t.Fatal("expected hunks with lines for the root commit file")
	}
}

func TestDiffCommitPickaxe(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "a.go", "package main\n\nfunc magicToken() {}\n", "add a")
	commitFile(t, dir, "b.txt", "some text\n", "add b")

	// One commit touching both files; only a.go changes the snippet count.
	if err := os.WriteFile(filepath.Join(dir, "a.go"), []byte("package main\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "b.txt"), []byte("some text\nmore text\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	exec.Command("git", "-C", dir, "add", ".").Run()
	exec.Command("git", "-C", dir, "commit", "-m", "touch both").Run()
	out, err := exec.Command("git", "-C", dir, "rev-parse", "HEAD").Output()
	if err != nil {
		t.Fatal(err)
	}
	hash := strings.TrimSpace(string(out))

	all, err := DiffCommit(dir, hash)
	if err != nil {
		t.Fatalf("DiffCommit failed: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("unrestricted diff should list both files, got %d", len(all))
	}

	matched, err := DiffCommitPickaxe(dir, hash, "magicToken")
	if err != nil {
		t.Fatalf("DiffCommitPickaxe failed: %v", err)
	}
	if len(matched) != 1 || matched[0].Path != "a.go" {
		t.Fatalf("pickaxe should restrict to a.go, got %+v", matched)
	}
	if matched[0].Deletions == 0 {
		t.Error("a.go removed the snippet line — deletions should be counted")
	}
}

func TestDiffCommitPickaxe_noMatch(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "a.go", "package main\n", "add a")
	out, err := exec.Command("git", "-C", dir, "rev-parse", "HEAD").Output()
	if err != nil {
		t.Fatal(err)
	}
	hash := strings.TrimSpace(string(out))

	// Snippet never touched by this commit → empty list, not an error.
	files, err := DiffCommitPickaxe(dir, hash, "neverSeenAnywhere")
	if err != nil {
		t.Fatalf("no-match pickaxe must not error: %v", err)
	}
	if len(files) != 0 {
		t.Fatalf("expected no files, got %+v", files)
	}
}

func TestDiffCommitPickaxe_badCommit(t *testing.T) {
	dir := initRepo(t)
	if _, err := DiffCommitPickaxe(dir, "deadbeef", "x"); err == nil {
		t.Fatal("expected error for a nonexistent commit")
	}
}
