package git

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ── Pickaxe ──────────────────────────────────────────────────────────────────

func TestLogPickaxe_findsIntroductionAndRemoval(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "a.go", "func helper() {}\n", "introduce helper")
	commitFile(t, dir, "a.go", "func helper() {}\nfunc other() {}\n", "unrelated change")
	commitFile(t, dir, "a.go", "func other() {}\n", "remove helper")

	commits, err := LogWith(dir, LogOptions{Pickaxe: "helper"})
	if err != nil {
		t.Fatal(err)
	}
	// Pickaxe matches only where the occurrence count changed: intro + removal,
	// not the unrelated middle commit.
	if len(commits) != 2 {
		t.Fatalf("expected exactly the introduce+remove commits, got %d", len(commits))
	}
	got := commits[0].Message + " / " + commits[1].Message
	if !strings.Contains(got, "introduce helper") || !strings.Contains(got, "remove helper") {
		t.Fatalf("wrong commits matched: %s", got)
	}
}

func TestLogPickaxe_noMatchReturnsEmpty(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "a.txt", "hello\n", "c1")
	commits, err := LogWith(dir, LogOptions{Pickaxe: "string-that-never-existed"})
	if err != nil {
		t.Fatal(err)
	}
	if len(commits) != 0 {
		t.Fatalf("expected no commits, got %d", len(commits))
	}
}

// ── Merge preview ────────────────────────────────────────────────────────────

func TestPreviewMerge_detectsConflictWithoutTouchingTree(t *testing.T) {
	dir := initRepo(t)
	base := currentBranch(t, dir)
	commitFile(t, dir, "f.txt", "base\n", "base")
	run(dir, "checkout", "-b", "feat")
	commitFile(t, dir, "f.txt", "feat\n", "feat side")
	run(dir, "checkout", base)
	commitFile(t, dir, "f.txt", "base side\n", "base side")

	preview, err := PreviewMerge(dir, "HEAD", "feat")
	if err != nil {
		t.Fatal(err)
	}
	if preview.Clean {
		t.Fatal("expected a conflict prediction")
	}
	if len(preview.Files) != 1 || preview.Files[0] != "f.txt" {
		t.Fatalf("expected f.txt as the conflicted file, got %v", preview.Files)
	}

	// The dry run must leave no trace: no merge state, clean tree.
	if out, _ := run(dir, "status", "--porcelain"); out != "" {
		t.Fatalf("preview dirtied the tree: %q", out)
	}
}

func TestPreviewMerge_cleanMerge(t *testing.T) {
	dir := initRepo(t)
	base := currentBranch(t, dir)
	commitFile(t, dir, "f.txt", "base\n", "base")
	run(dir, "checkout", "-b", "feat")
	commitFile(t, dir, "other.txt", "no overlap\n", "feat side")
	run(dir, "checkout", base)

	preview, err := PreviewMerge(dir, "HEAD", "feat")
	if err != nil {
		t.Fatal(err)
	}
	if !preview.Clean || len(preview.Files) != 0 {
		t.Fatalf("expected a clean prediction, got %+v", preview)
	}
}

func TestPreviewMerge_badRefErrors(t *testing.T) {
	dir := initRepo(t)
	if _, err := PreviewMerge(dir, "HEAD", "no-such-branch"); err == nil {
		t.Fatal("expected an error for a nonexistent ref")
	}
}

// ── Fixup + autosquash ───────────────────────────────────────────────────────

func TestFixupAndAutosquash_foldsIntoTarget(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "f.txt", "v1\n", "feat: the target")
	target, _ := run(dir, "rev-parse", "HEAD")
	commitFile(t, dir, "g.txt", "other\n", "unrelated on top")

	// Fixup: new content destined for the target commit.
	if err := os.WriteFile(filepath.Join(dir, "f.txt"), []byte("v1 fixed\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	res, err := FixupCommit(dir, target, []string{"f.txt"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(res.Message, "fixup! feat: the target") {
		t.Fatalf("expected a fixup! commit, got %q", res.Message)
	}

	conflict, err := RebaseAutosquash(dir, target+"^")
	if err != nil {
		t.Fatal(err)
	}
	if conflict {
		t.Fatal("autosquash of a trivial fixup must not conflict")
	}

	// The fixup commit is gone, folded into the target; content survived.
	log, _ := run(dir, "log", "--format=%s")
	if strings.Contains(log, "fixup!") {
		t.Fatalf("fixup commit should be folded away, log:\n%s", log)
	}
	b, _ := os.ReadFile(filepath.Join(dir, "f.txt"))
	if string(b) != "v1 fixed\n" {
		t.Fatalf("fixup content lost after autosquash: %q", b)
	}
}

func TestFixupCommit_requiresTargetAndPaths(t *testing.T) {
	dir := initRepo(t)
	if _, err := FixupCommit(dir, "", []string{"x"}); err == nil {
		t.Fatal("expected error for empty target")
	}
	if _, err := FixupCommit(dir, "HEAD", nil); err == nil {
		t.Fatal("expected error for no paths")
	}
}

// ── rerere ───────────────────────────────────────────────────────────────────

func TestEnableRerere_setsRepoLocalConfig(t *testing.T) {
	dir := initRepo(t)
	if err := EnableRerere(dir); err != nil {
		t.Fatal(err)
	}
	v, err := run(dir, "config", "--local", "rerere.enabled")
	if err != nil || v != "true" {
		t.Fatalf("rerere.enabled = %q (err %v), want true", v, err)
	}
	// Idempotent.
	if err := EnableRerere(dir); err != nil {
		t.Fatal(err)
	}
}

// ── Pre-commit safety ────────────────────────────────────────────────────────

func TestCommitSafety_flagsTheFourFootguns(t *testing.T) {
	dir := initRepo(t)

	// Secret-shaped filename + AWS-key-shaped content.
	os.WriteFile(filepath.Join(dir, ".env"), []byte("AWS_KEY=AKIAIOSFODNN7EXAMPLE\n"), 0o644)
	// Leftover conflict markers.
	os.WriteFile(filepath.Join(dir, "merged.txt"), []byte("ok\n<<<<<<< HEAD\nours\n>>>>>>> feat\n"), 0o644)
	// Large file (just over the limit).
	big := make([]byte, largeFileLimit+1)
	os.WriteFile(filepath.Join(dir, "huge.bin"), big, 0o644)

	warnings := CommitSafety(dir, []string{".env", "merged.txt", "huge.bin"}, nil)

	types := map[string]bool{}
	for _, w := range warnings {
		types[w.Type] = true
	}
	for _, want := range []string{"secretFile", "secretContent", "conflictMarker", "largeFile", "protectedBranch"} {
		if !types[want] {
			t.Errorf("missing %s warning; got %+v", want, warnings)
		}
	}
}

func TestCommitSafety_cleanFileOnFeatureBranchIsQuiet(t *testing.T) {
	dir := initRepo(t)
	run(dir, "checkout", "-b", "feat/quiet")
	os.WriteFile(filepath.Join(dir, "normal.go"), []byte("package x\n"), 0o644)

	warnings := CommitSafety(dir, []string{"normal.go"}, nil)
	if len(warnings) != 0 {
		t.Fatalf("expected no warnings, got %+v", warnings)
	}
}

func TestCommitSafety_respectsEnabledSet(t *testing.T) {
	dir := initRepo(t)
	os.WriteFile(filepath.Join(dir, ".env"), []byte("x\n"), 0o644)

	// Only largeFile enabled — the .env must not be flagged.
	warnings := CommitSafety(dir, []string{".env"}, map[string]bool{"largeFile": true})
	if len(warnings) != 0 {
		t.Fatalf("disabled checks must not fire, got %+v", warnings)
	}
}
