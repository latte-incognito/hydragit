package git

import (
	"os"
	"path/filepath"
	"testing"
)

// StashFiles backs the stash "show files" list (CHANGELOG feature index:
// `StashFiles` / `stash.files`). It must report each file the stash touches with
// the right status letter and add/delete counts, across modify + add + delete.

func TestStashFiles_listsStatusAndCounts(t *testing.T) {
	dir := initRepo(t)
	// Seed two tracked files so the stash can modify and delete them.
	commitFile(t, dir, "mod.txt", "a\n", "seed mod")
	commitFile(t, dir, "del.txt", "doomed\n", "seed del")

	// Changes to stash: modify mod.txt, delete del.txt, add a *staged* new.txt.
	// (A staged new file is part of the index, so it lands in the stash's tracked
	// diff — which is what StashFiles reads via `git diff stash^ stash`. A purely
	// untracked file would be stored in a separate parent and not show here.)
	if err := os.WriteFile(filepath.Join(dir, "mod.txt"), []byte("a\nb\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(dir, "del.txt")); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "new.txt"), []byte("fresh\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	mustGit(t, dir, "add", "new.txt")
	mustGit(t, dir, "stash", "push", "-m", "wip")

	files, err := StashFiles(dir, 0)
	if err != nil {
		t.Fatalf("StashFiles failed: %v", err)
	}
	by := make(map[string]FileStat, len(files))
	for _, f := range files {
		by[f.Path] = f
	}

	if f, ok := by["mod.txt"]; !ok || f.Status != "M" || f.Additions != 1 {
		t.Fatalf("mod.txt should be M with 1 addition, got %+v (ok=%v)", f, ok)
	}
	if f, ok := by["del.txt"]; !ok || f.Status != "D" || f.Deletions != 1 {
		t.Fatalf("del.txt should be D with 1 deletion, got %+v (ok=%v)", f, ok)
	}
	if f, ok := by["new.txt"]; !ok || f.Status != "A" {
		t.Fatalf("new.txt should be A, got %+v (ok=%v)", f, ok)
	}
}

// Edge: a single-file stash returns exactly that one file.
func TestStashFiles_singleFile(t *testing.T) {
	dir := makeRepoWithStagedFile(t) // work.txt staged
	if err := StashSave(dir, "single"); err != nil {
		t.Fatal(err)
	}
	files, err := StashFiles(dir, 0)
	if err != nil {
		t.Fatalf("StashFiles failed: %v", err)
	}
	if len(files) != 1 || files[0].Path != "work.txt" {
		t.Fatalf("expected exactly [work.txt], got %+v", files)
	}
}

// Negative: an out-of-range stash index is git's own failure.
func TestStashFiles_outOfRange(t *testing.T) {
	dir := initRepo(t) // no stashes
	if _, err := StashFiles(dir, 0); err == nil {
		t.Fatal("expected an error reading files of a nonexistent stash")
	}
}
