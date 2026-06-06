package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// BUG #19 (BUGS.MD): "Merge conflicts on side bar not ready."
//
// Root cause is in this package: status.go:resolveStatus has no case for the
// porcelain unmerged codes (UU, AA, DD, AU, UA, DU, UD). "UU" falls through to
// the default "" and the conflicted file is dropped from Status().Files
// entirely; AA/DD are mislabeled as plain add/delete. So the sidebar never sees
// the conflict.
//
// These tests assert the CORRECT behavior and therefore FAIL today (red CI by
// design — see the agreed test policy). Un-skip / keep them green once
// resolveStatus learns a dedicated conflict status.

// makeConflictRepo builds a repo left in a conflicted merge state on f.txt.
func makeConflictRepo(t *testing.T) string {
	t.Helper()
	dir := initRepo(t)
	commitFile(t, dir, "f.txt", "base line\n", "base")

	base := currentBranch(t, dir)

	mustGit := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
		if out, err := cmd.CombinedOutput(); err != nil {
			// merge is expected to fail with a conflict — caller ignores that one
			_ = out
		}
	}

	mustGit("checkout", "-b", "other")
	if err := os.WriteFile(filepath.Join(dir, "f.txt"), []byte("other change\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	mustGit("commit", "-am", "other change")

	mustGit("checkout", base)
	if err := os.WriteFile(filepath.Join(dir, "f.txt"), []byte("main change\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	mustGit("commit", "-am", "main change")

	// This merge conflicts on f.txt and leaves the repo mid-merge.
	mustGit("merge", "other")
	return dir
}

func TestStatus_mergeConflict_fileSurfaced(t *testing.T) {
	dir := makeConflictRepo(t)

	// sanity: git itself reports the conflict
	out, _ := exec.Command("git", "-C", dir, "status", "--porcelain").CombinedOutput()
	t.Logf("git porcelain:\n%s", out)

	res, err := Status(dir)
	if err != nil {
		t.Fatalf("Status errored on a conflicted repo: %v", err)
	}

	var found *FileStatus
	for i := range res.Files {
		if res.Files[i].Path == "f.txt" {
			found = &res.Files[i]
			break
		}
	}
	if found == nil {
		t.Fatal("BUG #19: conflicted file f.txt is missing from Status().Files (resolveStatus drops UU)")
	}
	// "U" is currently overloaded to mean untracked; a conflict must be
	// distinguishable from an untracked file.
	if found.Status == "" {
		t.Fatalf("BUG #19: conflicted f.txt has empty status %q", found.Status)
	}
}

func TestResolveStatus_unmergedCodes(t *testing.T) {
	// Every unmerged/conflict porcelain code must map to a non-empty status so
	// the file is not silently dropped. Fails today for UU/DD/UA/DU/UD.
	for _, xy := range []string{"UU", "AA", "DD", "AU", "UA", "DU", "UD"} {
		if got := resolveStatus(xy); got == "" {
			t.Errorf("BUG #19: resolveStatus(%q) = \"\" (conflict dropped); want a non-empty conflict status", xy)
		}
	}
}

// TestResolveStatus_conflictDistinctFromUntracked locks in the exact conflict
// marker. The sidebar routes "!" files to the merge resolver, so a conflict must
// map to "!" and must NOT collide with untracked ("U") — the two are styled and
// clicked differently.
func TestResolveStatus_conflictDistinctFromUntracked(t *testing.T) {
	for _, xy := range []string{"UU", "AA", "DD", "AU", "UA", "DU", "UD"} {
		if got := resolveStatus(xy); got != "!" {
			t.Errorf("resolveStatus(%q) = %q; want %q (conflict marker)", xy, got, "!")
		}
	}
	if got := resolveStatus("??"); got != "U" {
		t.Errorf("resolveStatus(%q) = %q; want %q (untracked)", "??", got, "U")
	}
	// Non-conflict codes must keep their plain meaning (no false positives).
	if got := resolveStatus(" M"); got != "M" {
		t.Errorf("resolveStatus(%q) = %q; want %q", " M", got, "M")
	}
	if got := resolveStatus("A "); got != "A" {
		t.Errorf("resolveStatus(%q) = %q; want %q", "A ", got, "A")
	}
}
