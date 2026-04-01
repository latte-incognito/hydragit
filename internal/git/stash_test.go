package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// makeRepoWithStagedFile creates a repo with a staged file ready to stash.
func makeRepoWithStagedFile(t *testing.T) string {
	t.Helper()
	dir := initRepo(t)

	if err := os.WriteFile(filepath.Join(dir, "work.txt"), []byte("work in progress\n"), 0644); err != nil {
		t.Fatal(err)
	}
	exec.Command("git", "-C", dir, "add", ".").Run()
	return dir
}

func TestStashSaveAndList(t *testing.T) {
	dir := makeRepoWithStagedFile(t)

	if err := StashSave(dir, "my stash"); err != nil {
		t.Fatalf("StashSave failed: %v", err)
	}

	entries, err := StashList(dir)
	if err != nil {
		t.Fatalf("StashList failed: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("expected at least one stash entry")
	}
	if entries[0].Message == "" {
		t.Fatal("expected non-empty stash message")
	}
	if entries[0].Ref == "" {
		t.Fatal("expected non-empty stash ref")
	}
}

func TestStashListEmpty(t *testing.T) {
	dir := initRepo(t)

	entries, err := StashList(dir)
	if err != nil {
		t.Fatalf("StashList on clean repo failed: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected empty stash list, got %d entries", len(entries))
	}
}

func TestStashShow(t *testing.T) {
	dir := makeRepoWithStagedFile(t)
	StashSave(dir, "show test")

	hunks, err := StashShow(dir, 0)
	if err != nil {
		t.Fatalf("StashShow failed: %v", err)
	}
	if len(hunks) == 0 {
		t.Fatal("expected hunks in stash show")
	}
}

func TestStashApply(t *testing.T) {
	dir := makeRepoWithStagedFile(t)
	StashSave(dir, "apply test")

	if err := StashApply(dir, 0); err != nil {
		t.Fatalf("StashApply failed: %v", err)
	}

	// stash should still be in the list after apply
	entries, _ := StashList(dir)
	if len(entries) == 0 {
		t.Fatal("stash should remain after apply")
	}
}

func TestStashPop(t *testing.T) {
	dir := makeRepoWithStagedFile(t)
	StashSave(dir, "pop test")

	if err := StashPop(dir, 0); err != nil {
		t.Fatalf("StashPop failed: %v", err)
	}

	// stash should be gone after pop
	entries, _ := StashList(dir)
	if len(entries) != 0 {
		t.Fatal("stash should be removed after pop")
	}
}

func TestStashDrop(t *testing.T) {
	dir := makeRepoWithStagedFile(t)
	StashSave(dir, "drop test")

	if err := StashDrop(dir, 0); err != nil {
		t.Fatalf("StashDrop failed: %v", err)
	}

	entries, _ := StashList(dir)
	if len(entries) != 0 {
		t.Fatal("stash should be removed after drop")
	}
}
