package git

import (
	"os"
	"path/filepath"
	"testing"
)

// makeConflictRepo (conflict_test.go) leaves a repo mid-merge with f.txt
// conflicted: HEAD ("current") has "main change", the incoming side has
// "other change".

func TestConflicts_detectsMergeAndFiles(t *testing.T) {
	dir := makeConflictRepo(t)

	info, err := Conflicts(dir)
	if err != nil {
		t.Fatalf("Conflicts failed: %v", err)
	}
	if info.Operation != "merge" {
		t.Fatalf("operation = %q; want merge", info.Operation)
	}
	if len(info.Files) != 1 || info.Files[0] != "f.txt" {
		t.Fatalf("expected [f.txt] conflicted, got %v", info.Files)
	}
}

func TestKeepCurrent_takesHeadAndStages(t *testing.T) {
	dir := makeConflictRepo(t)

	if err := KeepCurrent(dir, "f.txt"); err != nil {
		t.Fatalf("KeepCurrent failed: %v", err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "f.txt")); string(b) != "main change\n" {
		t.Fatalf("KeepCurrent gave %q; want HEAD's 'main change'", b)
	}
	// File is resolved (no longer unmerged).
	if info, _ := Conflicts(dir); len(info.Files) != 0 {
		t.Fatalf("expected no remaining conflicts, got %v", info.Files)
	}
}

func TestKeepIncoming_takesTheirsAndStages(t *testing.T) {
	dir := makeConflictRepo(t)

	if err := KeepIncoming(dir, "f.txt"); err != nil {
		t.Fatalf("KeepIncoming failed: %v", err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "f.txt")); string(b) != "other change\n" {
		t.Fatalf("KeepIncoming gave %q; want incoming 'other change'", b)
	}
	if info, _ := Conflicts(dir); len(info.Files) != 0 {
		t.Fatalf("expected no remaining conflicts, got %v", info.Files)
	}
}

func TestMergeContinue_completesAfterResolve(t *testing.T) {
	dir := makeConflictRepo(t)

	if err := KeepCurrent(dir, "f.txt"); err != nil {
		t.Fatal(err)
	}
	if err := mergeContinue(dir); err != nil {
		t.Fatalf("mergeContinue failed: %v", err)
	}
	// Merge is finished — no operation, no conflicts.
	info, _ := Conflicts(dir)
	if info.Operation != "" || len(info.Files) != 0 {
		t.Fatalf("merge should be complete; got operation=%q files=%v", info.Operation, info.Files)
	}
}

func TestMergeAbort_restores(t *testing.T) {
	dir := makeConflictRepo(t)

	if err := mergeAbort(dir); err != nil {
		t.Fatalf("mergeAbort failed: %v", err)
	}
	if info, _ := Conflicts(dir); info.Operation != "" {
		t.Fatalf("merge should be aborted; got operation=%q", info.Operation)
	}
}
