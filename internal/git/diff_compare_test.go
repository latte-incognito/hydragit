package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// Covers the "Compare diffs" feature (CHANGELOG feature index): DiffRefFiles /
// DiffRangeFiles (file lists) + their per-file hunk variants, plus the
// format-patch export (`patch.format`). Status-letter + rename detection and the
// add/del hunk lines are the parts that actually break, so they're asserted
// directly, with negatives for bad refs and missing files.

// makeCompareRepo builds a repo with a base commit and a head commit that
// modifies, adds, deletes and renames files, then returns the two SHAs.
func makeCompareRepo(t *testing.T) (dir, base, head string) {
	t.Helper()
	dir = initRepo(t)

	write := func(name, content string) {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	write("mod.txt", "line1\n")
	write("del.txt", "doomed\n")
	write("old.txt", "rename me unchanged so similarity stays 100%\n")
	mustGit(t, dir, "add", "-A")
	mustGit(t, dir, "commit", "-m", "base")
	base = headHash(t, dir)

	write("mod.txt", "line1\nline2\n")          // modify
	write("add.txt", "fresh\n")                 // add
	mustGit(t, dir, "rm", "del.txt")            // delete
	mustGit(t, dir, "mv", "old.txt", "new.txt") // rename
	mustGit(t, dir, "add", "-A")
	mustGit(t, dir, "commit", "-m", "head: modify/add/delete/rename")
	head = headHash(t, dir)
	return
}

func fileStatByPath(files []FileStat) map[string]FileStat {
	m := make(map[string]FileStat, len(files))
	for _, f := range files {
		m[f.Path] = f
	}
	return m
}

func TestDiffRangeFiles_statusLettersAndRename(t *testing.T) {
	dir, base, head := makeCompareRepo(t)

	files, err := DiffRangeFiles(dir, base, head)
	if err != nil {
		t.Fatalf("DiffRangeFiles failed: %v", err)
	}
	by := fileStatByPath(files)

	if f, ok := by["mod.txt"]; !ok || f.Status != "M" {
		t.Fatalf("mod.txt should be M, got %+v (ok=%v)", f, ok)
	}
	if f, ok := by["add.txt"]; !ok || f.Status != "A" {
		t.Fatalf("add.txt should be A, got %+v (ok=%v)", f, ok)
	}
	if f, ok := by["del.txt"]; !ok || f.Status != "D" {
		t.Fatalf("del.txt should be D, got %+v (ok=%v)", f, ok)
	}
	if f, ok := by["new.txt"]; !ok || f.Status != "R" || f.OldPath != "old.txt" {
		t.Fatalf("new.txt should be a rename R from old.txt, got %+v (ok=%v)", f, ok)
	}
}

func TestDiffRangeFile_hunksForOneFile(t *testing.T) {
	dir, base, head := makeCompareRepo(t)

	hunks, err := DiffRangeFile(dir, base, head, "mod.txt")
	if err != nil {
		t.Fatalf("DiffRangeFile failed: %v", err)
	}
	if !hunksContainAdded(hunks, "line2") {
		t.Fatalf("expected an added 'line2' line in mod.txt hunks, got %+v", hunks)
	}
}

func TestDiffRefFiles_againstWorkingTree(t *testing.T) {
	dir, _, head := makeCompareRepo(t)

	// Make an uncommitted working-tree edit; DiffRefFiles(HEAD) must surface it.
	if err := os.WriteFile(filepath.Join(dir, "mod.txt"), []byte("line1\nline2\nworking\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := DiffRefFiles(dir, head)
	if err != nil {
		t.Fatalf("DiffRefFiles failed: %v", err)
	}
	by := fileStatByPath(files)
	if f, ok := by["mod.txt"]; !ok || f.Status != "M" {
		t.Fatalf("working-tree edit to mod.txt should show as M, got %+v (ok=%v)", f, ok)
	}
}

func TestDiffRefFile_hunksAgainstWorkingTree(t *testing.T) {
	dir, _, head := makeCompareRepo(t)
	if err := os.WriteFile(filepath.Join(dir, "mod.txt"), []byte("line1\nline2\nworking\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	hunks, err := DiffRefFile(dir, head, "mod.txt")
	if err != nil {
		t.Fatalf("DiffRefFile failed: %v", err)
	}
	if !hunksContainAdded(hunks, "working") {
		t.Fatalf("expected an added 'working' line, got %+v", hunks)
	}
}

// Edge: a clean tree compared against HEAD yields no files (not an error).
func TestDiffRefFiles_cleanTreeIsEmpty(t *testing.T) {
	dir, _, head := makeCompareRepo(t)
	files, err := DiffRefFiles(dir, head)
	if err != nil {
		t.Fatalf("DiffRefFiles on a clean tree errored: %v", err)
	}
	if len(files) != 0 {
		t.Fatalf("clean tree vs HEAD should be empty, got %+v", files)
	}
}

// Edge: hunks for a path with no changes / that doesn't exist is empty, not an error.
func TestDiffRangeFile_unchangedPathIsEmpty(t *testing.T) {
	dir, base, head := makeCompareRepo(t)
	hunks, err := DiffRangeFile(dir, base, head, "no-such-file.txt")
	if err != nil {
		t.Fatalf("DiffRangeFile on a missing path errored: %v", err)
	}
	if len(hunks) != 0 {
		t.Fatalf("missing path should yield no hunks, got %+v", hunks)
	}
}

// Negative: a nonexistent ref is git's own failure, surfaced as an error.
func TestDiffRangeFiles_badRefErrors(t *testing.T) {
	dir, base, _ := makeCompareRepo(t)
	if _, err := DiffRangeFiles(dir, base, "no-such-ref"); err == nil {
		t.Fatal("expected an error comparing against a nonexistent ref")
	}
}

func TestDiffRefFiles_badRefErrors(t *testing.T) {
	dir, _, _ := makeCompareRepo(t)
	if _, err := DiffRefFiles(dir, "no-such-ref"); err == nil {
		t.Fatal("expected an error diffing a nonexistent ref")
	}
}

func TestFormatPatch_roundTripsViaGitAm(t *testing.T) {
	dir, base, head := makeCompareRepo(t)

	patch, err := FormatPatch(dir, head)
	if err != nil {
		t.Fatalf("FormatPatch failed: %v", err)
	}
	// Mailbox format: must carry the subject and a diff body.
	if !strings.Contains(patch, "Subject:") || !strings.Contains(patch, "head: modify/add/delete/rename") {
		t.Fatalf("patch missing mailbox subject header:\n%s", patch)
	}
	if !strings.Contains(patch, "@@") {
		t.Fatalf("patch missing a diff hunk:\n%s", patch)
	}

	// Re-apply it onto the base on a fresh branch — the real proof it's valid.
	mustGit(t, dir, "checkout", "-b", "replay", base)
	cmd := exec.Command("git", "-C", dir, "am")
	cmd.Stdin = strings.NewReader(patch)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git am of the produced patch failed: %s", out)
	}
	// The replayed tip matches the original head's tree (same subject + file).
	if got := subjectAt(t, dir, "HEAD"); got != "head: modify/add/delete/rename" {
		t.Fatalf("replayed tip subject = %q", got)
	}
	if b, err := os.ReadFile(filepath.Join(dir, "add.txt")); err != nil || string(b) != "fresh\n" {
		t.Fatalf("replayed tree missing add.txt content, got %q err=%v", b, err)
	}
}

// Negative: format-patch of a nonexistent commit errors.
func TestFormatPatch_badCommitErrors(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "f.txt", "x\n", "x")
	if _, err := FormatPatch(dir, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"); err == nil {
		t.Fatal("expected an error format-patching a nonexistent commit")
	}
}

func hunksContainAdded(hunks []Hunk, content string) bool {
	for _, h := range hunks {
		for _, l := range h.Lines {
			if l.Type == "add" && l.Content == content {
				return true
			}
		}
	}
	return false
}
