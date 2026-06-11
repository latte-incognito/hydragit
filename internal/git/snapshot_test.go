package git

import (
	"os"
	"path/filepath"
	"testing"
)

func dirtyRepo(t *testing.T) string {
	t.Helper()
	dir := initRepo(t)
	if err := os.WriteFile(filepath.Join(dir, "work.txt"), []byte("uncommitted\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestSnapshotCreate_capturesWithoutTouchingTree(t *testing.T) {
	dir := dirtyRepo(t)

	snap, err := SnapshotCreate(dir, "test snapshot")
	if err != nil {
		t.Fatal(err)
	}
	if snap == nil || snap.Hash == "" {
		t.Fatal("expected a snapshot for a dirty tree")
	}

	// The working tree must be untouched — the file is still there, unstaged.
	if _, err := os.Stat(filepath.Join(dir, "work.txt")); err != nil {
		t.Fatal("snapshot must not modify the working tree")
	}
	out, _ := run(dir, "status", "--porcelain")
	if out == "" {
		t.Fatal("tree should still be dirty after a snapshot")
	}

	snaps, err := SnapshotList(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(snaps) != 1 || snaps[0].Hash != snap.Hash {
		t.Fatalf("expected the snapshot in the list, got %+v", snaps)
	}

	// The capture branch must be recorded and round-trip through the list.
	branch := currentBranch(t, dir)
	if snap.Branch != branch {
		t.Fatalf("expected branch %q on create, got %q", branch, snap.Branch)
	}
	if snaps[0].Branch != branch {
		t.Fatalf("expected branch %q from list, got %q", branch, snaps[0].Branch)
	}
}

func TestSnapshotCreate_detachedHeadRecordsPlaceholder(t *testing.T) {
	dir := dirtyRepo(t)
	if _, err := run(dir, "checkout", "--detach"); err != nil {
		t.Fatal(err)
	}

	snap, err := SnapshotCreate(dir, "detached snap")
	if err != nil || snap == nil {
		t.Fatalf("snapshot failed: %v", err)
	}
	if snap.Branch != "(detached)" {
		t.Fatalf("expected \"(detached)\" branch, got %q", snap.Branch)
	}
}

func TestSnapshotCreate_cleanTreeIsNoop(t *testing.T) {
	dir := initRepo(t)
	snap, err := SnapshotCreate(dir, "nothing to save")
	if err != nil {
		t.Fatal(err)
	}
	if snap != nil {
		t.Fatalf("clean tree must not create a snapshot, got %+v", snap)
	}
	if snaps, _ := SnapshotList(dir); len(snaps) != 0 {
		t.Fatalf("expected no snapshot refs, got %d", len(snaps))
	}
}

func TestSnapshotRestore_recoversDiscardedWork(t *testing.T) {
	dir := dirtyRepo(t)
	snap, err := SnapshotCreate(dir, "before disaster")
	if err != nil || snap == nil {
		t.Fatalf("snapshot failed: %v", err)
	}

	// Disaster: hard-discard the uncommitted work. work.txt is untracked, so
	// `clean -fd` is the whole disaster (`checkout -- .` would error here —
	// the repo's only commit is empty, so '.' matches no tracked files).
	if _, err := run(dir, "clean", "-fd"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "work.txt")); !os.IsNotExist(err) {
		t.Fatal("setup: work.txt should be gone")
	}

	if err := SnapshotRestore(dir, snap.Hash); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(dir, "work.txt"))
	if err != nil || string(b) != "uncommitted\n" {
		t.Fatalf("restore must bring the work back, got %q err=%v", b, err)
	}
}

func TestSnapshotDrop_removesRefAndRejectsForeignRefs(t *testing.T) {
	dir := dirtyRepo(t)
	snap, _ := SnapshotCreate(dir, "to drop")

	if err := SnapshotDrop(dir, snap.Ref); err != nil {
		t.Fatal(err)
	}
	if snaps, _ := SnapshotList(dir); len(snaps) != 0 {
		t.Fatal("expected the snapshot ref gone after drop")
	}

	// Refusing non-snapshot refs keeps the cmd from deleting arbitrary refs.
	branch := "refs/heads/" + currentBranch(t, dir)
	if err := SnapshotDrop(dir, branch); err == nil {
		t.Fatal("dropping a non-snapshot ref must be refused")
	}
	if _, err := run(dir, "rev-parse", "--verify", branch); err != nil {
		t.Fatal("the branch must survive the refused drop")
	}
}

func TestSnapshotRestore_missingHashFails(t *testing.T) {
	dir := initRepo(t)
	if err := SnapshotRestore(dir, ""); err == nil {
		t.Fatal("expected error for empty hash")
	}
	if err := SnapshotRestore(dir, "deadbeef"); err == nil {
		t.Fatal("expected error for a nonexistent hash")
	}
}

func TestSnapshotPrune_capsAtKeepLimit(t *testing.T) {
	dir := initRepo(t)
	for i := range snapshotKeep + 3 {
		if err := os.WriteFile(filepath.Join(dir, "work.txt"), []byte{byte('a' + i%26), '\n'}, 0o644); err != nil {
			t.Fatal(err)
		}
		if _, err := SnapshotCreate(dir, "snap"); err != nil {
			t.Fatal(err)
		}
	}
	snaps, err := SnapshotList(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(snaps) > snapshotKeep {
		t.Fatalf("prune should cap snapshots at %d, got %d", snapshotKeep, len(snaps))
	}
}
