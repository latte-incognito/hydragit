package git_test

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"hydragit/internal/git"
)

// twoHunkRepo builds a repo whose one file has two well-separated edits —
// guaranteed two hunks in `git diff`.
func twoHunkRepo(t *testing.T) string {
	t.Helper()
	repo := initRepo(t)
	var b strings.Builder
	for i := 1; i <= 20; i++ {
		fmt.Fprintf(&b, "line%d\n", i)
	}
	writeFile(t, repo, "app.js", b.String())
	gitIn(t, repo, "add", "app.js")
	gitIn(t, repo, "commit", "-m", "base")

	edited := strings.Replace(b.String(), "line2\n", "line2-EDITED\n", 1)
	edited = strings.Replace(edited, "line18\n", "line18-EDITED\n", 1)
	writeFile(t, repo, "app.js", edited)
	return repo
}

func TestWorkingDiff_twoSeparatedEditsTwoHunks(t *testing.T) {
	repo := twoHunkRepo(t)

	hunks, err := git.WorkingDiff(repo, "app.js", false)
	if err != nil {
		t.Fatal(err)
	}
	if len(hunks) != 2 {
		t.Fatalf("expected 2 hunks, got %d", len(hunks))
	}
	if !strings.HasPrefix(hunks[0].Header, "@@ ") {
		t.Fatalf("bad header %q", hunks[0].Header)
	}
	// Display lines carry kinds and numbers; the del line is the old content.
	var del, add bool
	for _, l := range hunks[0].Lines {
		if l.Kind == "del" && l.Text == "line2" && l.Old == 2 {
			del = true
		}
		if l.Kind == "add" && l.Text == "line2-EDITED" && l.New == 2 {
			add = true
		}
	}
	if !del || !add {
		t.Fatalf("hunk lines missing edit pair: %+v", hunks[0].Lines)
	}
	// Every patch is standalone: file header + its own @@ only.
	if !strings.Contains(hunks[1].Patch, "diff --git") || strings.Count(hunks[1].Patch, "@@ -") != 1 {
		t.Fatalf("patch not standalone:\n%s", hunks[1].Patch)
	}
}

func TestStageHunk_partialStageRoundTrip(t *testing.T) {
	repo := twoHunkRepo(t)
	hunks, _ := git.WorkingDiff(repo, "app.js", false)

	if err := git.StageHunk(repo, hunks[0].Patch); err != nil {
		t.Fatal(err)
	}
	// MM: first edit frozen in the index, second still in the worktree.
	if s := porcelain(t, repo); s != "MM app.js" {
		t.Fatalf("expected MM after partial stage, got %q", s)
	}
	cached := gitIn(t, repo, "diff", "--cached", "--no-color")
	if !strings.Contains(cached, "line2-EDITED") || strings.Contains(cached, "line18-EDITED") {
		t.Fatalf("index must hold exactly the staged hunk, got:\n%s", cached)
	}

	// The staged side now exposes the hunk for unstaging.
	stagedHunks, err := git.WorkingDiff(repo, "app.js", true)
	if err != nil || len(stagedHunks) != 1 {
		t.Fatalf("expected 1 cached hunk, got %d (err %v)", len(stagedHunks), err)
	}
	if err := git.UnstageHunk(repo, stagedHunks[0].Patch); err != nil {
		t.Fatal(err)
	}
	if s := porcelain(t, repo); s != " M app.js" {
		t.Fatalf("expected everything back to unstaged, got %q", s)
	}
}

func TestStageHunk_staleHunkRefusedRepoIntact(t *testing.T) {
	repo := twoHunkRepo(t)
	hunks, _ := git.WorkingDiff(repo, "app.js", false)

	if err := git.StageHunk(repo, hunks[0].Patch); err != nil {
		t.Fatal(err)
	}
	// Same patch again: the index moved, git must refuse — and nothing changes.
	before := gitIn(t, repo, "diff", "--cached", "--no-color")
	if err := git.StageHunk(repo, hunks[0].Patch); err == nil {
		t.Fatal("expected stale hunk to be refused")
	}
	if after := gitIn(t, repo, "diff", "--cached", "--no-color"); after != before {
		t.Fatal("a refused hunk must not change the index")
	}
}

func TestDiscardHunk_removesOnlyThatHunk(t *testing.T) {
	repo := twoHunkRepo(t)
	hunks, _ := git.WorkingDiff(repo, "app.js", false)

	if err := git.DiscardHunk(repo, hunks[0].Patch); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(filepath.Join(repo, "app.js"))
	if strings.Contains(string(data), "line2-EDITED") {
		t.Fatal("discarded hunk must be gone from the worktree")
	}
	if !strings.Contains(string(data), "line18-EDITED") {
		t.Fatal("the other hunk must survive a hunk discard")
	}
}

func TestWorkingDiff_untrackedAndBinaryYieldNoHunks(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "un.txt", "new\n")
	if hunks, err := git.WorkingDiff(repo, "un.txt", false); err != nil || len(hunks) != 0 {
		t.Fatalf("untracked file must yield no hunks, got %d (err %v)", len(hunks), err)
	}

	if err := os.WriteFile(filepath.Join(repo, "bin.dat"), []byte("a\x00b"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitIn(t, repo, "add", "bin.dat")
	gitIn(t, repo, "commit", "-m", "bin")
	if err := os.WriteFile(filepath.Join(repo, "bin.dat"), []byte("c\x00d"), 0o644); err != nil {
		t.Fatal(err)
	}
	if hunks, err := git.WorkingDiff(repo, "bin.dat", false); err != nil || len(hunks) != 0 {
		t.Fatalf("binary file must yield no hunks, got %d (err %v)", len(hunks), err)
	}
}

func TestStageHunk_emptyPatchErrors(t *testing.T) {
	repo := initRepo(t)
	if err := git.StageHunk(repo, "  "); err == nil {
		t.Fatal("expected error for an empty patch")
	}
}

func TestWorkingDiff_noNewlineMarkerStaysInPatch(t *testing.T) {
	repo := initRepo(t)
	writeFile(t, repo, "x.txt", "one\n")
	gitIn(t, repo, "add", "x.txt")
	gitIn(t, repo, "commit", "-m", "x")
	// Replace with content lacking the trailing newline.
	if err := os.WriteFile(filepath.Join(repo, "x.txt"), []byte("two"), 0o644); err != nil {
		t.Fatal(err)
	}

	hunks, err := git.WorkingDiff(repo, "x.txt", false)
	if err != nil || len(hunks) != 1 {
		t.Fatalf("expected 1 hunk, got %d (err %v)", len(hunks), err)
	}
	if !strings.Contains(hunks[0].Patch, "\\ No newline at end of file") {
		t.Fatalf("no-newline marker must survive in the patch:\n%s", hunks[0].Patch)
	}
	// And the marker is patch plumbing, not a display line.
	for _, l := range hunks[0].Lines {
		if strings.Contains(l.Text, "No newline") {
			t.Fatal("marker leaked into display lines")
		}
	}
	// Round-trip: the patch with the marker still applies.
	if err := git.StageHunk(repo, hunks[0].Patch); err != nil {
		t.Fatal(err)
	}
}
