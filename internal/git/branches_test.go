package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestResetWithAutostash_hardStashesDirtyTree(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "f.txt", "v1\n", "c1")
	head := headHash(t, dir)

	// A tracked, uncommitted change that --hard would otherwise discard.
	if err := os.WriteFile(filepath.Join(dir, "f.txt"), []byte("dirty\n"), 0644); err != nil {
		t.Fatal(err)
	}

	stashed, err := ResetWithAutostash(dir, head, "hard")
	if err != nil {
		t.Fatalf("ResetWithAutostash failed: %v", err)
	}
	if !stashed {
		t.Fatal("expected dirty tracked changes to be auto-stashed before hard reset")
	}
	// Working tree restored to the committed content...
	if b, _ := os.ReadFile(filepath.Join(dir, "f.txt")); string(b) != "v1\n" {
		t.Fatalf("working tree = %q; want v1", b)
	}
	// ...and the change is recoverable in a stash (nothing lost).
	if stashes, _ := StashList(dir); len(stashes) == 0 {
		t.Fatal("expected an auto-stash entry holding the discarded change")
	}
}

func TestResetWithAutostash_cleanTreeDoesNotStash(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "f.txt", "v1\n", "c1")
	head := headHash(t, dir)

	stashed, err := ResetWithAutostash(dir, head, "hard")
	if err != nil {
		t.Fatal(err)
	}
	if stashed {
		t.Fatal("a clean tree must not auto-stash")
	}
}

func TestResetWithAutostash_softNeverStashes(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "f.txt", "v1\n", "c1")
	commitFile(t, dir, "f.txt", "v2\n", "c2")
	if err := os.WriteFile(filepath.Join(dir, "f.txt"), []byte("dirty\n"), 0644); err != nil {
		t.Fatal(err)
	}

	// soft/mixed keep working-tree changes, so they must never stash.
	stashed, err := ResetWithAutostash(dir, "HEAD~1", "soft")
	if err != nil {
		t.Fatal(err)
	}
	if stashed {
		t.Fatal("soft reset must not auto-stash")
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "f.txt")); string(b) != "dirty\n" {
		t.Fatalf("soft reset should preserve the working tree, got %q", b)
	}
}

func TestBranches(t *testing.T) {
	dir := t.TempDir()
	exec.Command("git", "-C", dir, "init").Run()
	exec.Command("git", "-C", dir, "config", "user.email", "test@test.com").Run()
	exec.Command("git", "-C", dir, "config", "user.name", "Test").Run()
	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "init").Run()
	exec.Command("git", "-C", dir, "branch", "feature-a").Run()
	exec.Command("git", "-C", dir, "branch", "feature-b").Run()

	branches, err := Branches(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(branches) < 3 {
		t.Fatalf("expected >= 3 branches, got %d", len(branches))
	}

	var foundCurrent bool
	for _, b := range branches {
		if b.IsCurrent {
			foundCurrent = true
		}
	}
	if !foundCurrent {
		t.Fatal("no current branch found")
	}
}

func TestCheckout(t *testing.T) {
	dir := initRepo(t)
	exec.Command("git", "-C", dir, "branch", "other").Run()

	if err := Checkout(dir, "other"); err != nil {
		t.Fatalf("Checkout failed: %v", err)
	}

	branches, _ := Branches(dir)
	for _, b := range branches {
		if b.IsCurrent && b.Name != "other" {
			t.Fatalf("expected current branch to be 'other', got %q", b.Name)
		}
	}
}

func TestCreateBranch(t *testing.T) {
	dir := initRepo(t)

	if err := CreateBranch(dir, "new-feature", ""); err != nil {
		t.Fatalf("CreateBranch failed: %v", err)
	}

	branches, _ := Branches(dir)
	found := false
	for _, b := range branches {
		if b.Name == "new-feature" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected new-feature branch to exist")
	}
}

func TestCreateBranchFrom(t *testing.T) {
	dir := initRepo(t)
	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "second").Run()

	// get parent hash
	out, _ := exec.Command("git", "-C", dir, "rev-parse", "HEAD~1").Output()
	parentHash := string(out[:len(out)-1])

	if err := CreateBranch(dir, "from-parent", parentHash); err != nil {
		t.Fatalf("CreateBranch from hash failed: %v", err)
	}

	branches, _ := Branches(dir)
	found := false
	for _, b := range branches {
		if b.Name == "from-parent" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected from-parent branch to exist")
	}
}

func TestDeleteBranch(t *testing.T) {
	dir := initRepo(t)
	exec.Command("git", "-C", dir, "branch", "to-delete").Run()

	if err := DeleteBranch(dir, "to-delete", false); err != nil {
		t.Fatalf("DeleteBranch failed: %v", err)
	}

	branches, _ := Branches(dir)
	for _, b := range branches {
		if b.Name == "to-delete" {
			t.Fatal("branch should have been deleted")
		}
	}
}

func TestRenameBranch(t *testing.T) {
	dir := initRepo(t)
	exec.Command("git", "-C", dir, "branch", "old-name").Run()

	if err := RenameBranch(dir, "old-name", "new-name"); err != nil {
		t.Fatalf("RenameBranch failed: %v", err)
	}

	branches, _ := Branches(dir)
	var foundOld, foundNew bool
	for _, b := range branches {
		if b.Name == "old-name" {
			foundOld = true
		}
		if b.Name == "new-name" {
			foundNew = true
		}
	}
	if foundOld {
		t.Fatal("old-name should not exist after rename")
	}
	if !foundNew {
		t.Fatal("new-name should exist after rename")
	}
}

func TestMerge(t *testing.T) {
	dir := initRepo(t)

	// create and switch to feature branch, add a commit
	exec.Command("git", "-C", dir, "checkout", "-b", "feature").Run()
	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "feature commit").Run()

	// switch back to default branch
	exec.Command("git", "-C", dir, "checkout", "-").Run()

	if err := Merge(dir, "feature"); err != nil {
		t.Fatalf("Merge failed: %v", err)
	}

	// verify the feature commit is now in log
	commits, err := Log(dir, "", 10)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, c := range commits {
		if c.Message == "feature commit" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected feature commit to appear in log after merge")
	}
}

func TestRebase(t *testing.T) {
	dir := initRepo(t)

	// create feature branch from current HEAD
	exec.Command("git", "-C", dir, "checkout", "-b", "feature").Run()
	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "feature commit").Run()

	// add a commit to default branch
	exec.Command("git", "-C", dir, "checkout", "-").Run()
	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "main advance").Run()

	// switch back to feature and rebase onto default
	exec.Command("git", "-C", dir, "checkout", "feature").Run()

	defaultBranch := "main"
	out, _ := exec.Command("git", "-C", dir, "rev-parse", "--verify", "main").Output()
	if len(out) == 0 {
		defaultBranch = "master"
	}

	if err := Rebase(dir, defaultBranch); err != nil {
		t.Fatalf("Rebase failed: %v", err)
	}

	// after rebase, feature commit should still exist
	commits, err := Log(dir, "", 10)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, c := range commits {
		if c.Message == "feature commit" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected feature commit to exist after rebase")
	}
}

// makeRepoWithRemote creates a bare local remote and a cloned local repo.
// No network — fully self-contained, safe to run in CI.
func makeRepoWithRemote(t *testing.T) (local string) {
	t.Helper()
	remote := t.TempDir()
	local = t.TempDir()

	// bare repo acts as the remote
	exec.Command("git", "init", "--bare", remote).Run()

	// clone it locally
	exec.Command("git", "clone", remote, local).Run()
	exec.Command("git", "-C", local, "config", "user.email", "test@test.com").Run()
	exec.Command("git", "-C", local, "config", "user.name", "Test").Run()

	// initial commit so the branch exists on remote
	exec.Command("git", "-C", local, "commit", "--allow-empty", "-m", "init").Run()
	exec.Command("git", "-C", local, "push", "-u", "origin", "HEAD").Run()

	return local
}

// Reproduces the Smart Sync footgun: a diverged branch whose `pull --rebase`
// hits a CONFLICT. PullMode must surface that as an error AND leave the repo
// paused mid-rebase. That's exactly why the webview's sequence (pull → push)
// stops at the pull and the push never fires — resolving the conflict later via
// rebase-continue doesn't resume Sync, so the user is left still "ahead".
func TestPullMode_rebaseConflict_pausesAndErrors(t *testing.T) {
	local := makeRepoWithRemote(t)

	// Seed a tracked file on the remote that both sides will edit.
	if err := os.WriteFile(filepath.Join(local, "f.txt"), []byte("base\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	exec.Command("git", "-C", local, "add", "f.txt").Run()
	exec.Command("git", "-C", local, "commit", "-m", "add f").Run()
	exec.Command("git", "-C", local, "push").Run()

	// A second clone advances the remote with a CONFLICTING change to f.txt.
	out, err := exec.Command("git", "-C", local, "remote", "get-url", "origin").Output()
	if err != nil {
		t.Fatal(err)
	}
	remote := strings.TrimSpace(string(out))
	other := t.TempDir()
	exec.Command("git", "clone", remote, other).Run()
	exec.Command("git", "-C", other, "config", "user.email", "test@test.com").Run()
	exec.Command("git", "-C", other, "config", "user.name", "Test").Run()
	os.WriteFile(filepath.Join(other, "f.txt"), []byte("remote change\n"), 0o644)
	exec.Command("git", "-C", other, "add", "f.txt").Run()
	exec.Command("git", "-C", other, "commit", "-m", "remote edit").Run()
	exec.Command("git", "-C", other, "push").Run()

	// Local makes its own conflicting commit → now diverged (1 ahead, 1 behind)
	// with a textual conflict on f.txt.
	os.WriteFile(filepath.Join(local, "f.txt"), []byte("local change\n"), 0o644)
	exec.Command("git", "-C", local, "add", "f.txt").Run()
	exec.Command("git", "-C", local, "commit", "-m", "local edit").Run()

	// The rebase pull must fail (conflict) — this is the error the webview catches.
	if err := PullMode(local, "rebase"); err == nil {
		t.Fatal("expected pull --rebase to fail on a conflict, got nil")
	}
	// ...and it must leave the repo paused mid-rebase, so any follow-up push the
	// caller intended is unsafe/won't run until the rebase is resolved.
	if !RebaseInProgress(local) {
		t.Fatal("expected the rebase to be paused (in progress) after the conflict")
	}
}

// pushOtherCommit clones the remote of `local`, pushes one new commit from the
// clone, and returns — advancing the remote behind `local`'s back.
func pushOtherCommit(t *testing.T, local, file, content string) {
	t.Helper()
	out, err := exec.Command("git", "-C", local, "remote", "get-url", "origin").Output()
	if err != nil {
		t.Fatal(err)
	}
	other := t.TempDir()
	exec.Command("git", "clone", strings.TrimSpace(string(out)), other).Run()
	exec.Command("git", "-C", other, "config", "user.email", "o@o.com").Run()
	exec.Command("git", "-C", other, "config", "user.name", "Other").Run()
	os.WriteFile(filepath.Join(other, file), []byte(content), 0o644)
	exec.Command("git", "-C", other, "add", file).Run()
	exec.Command("git", "-C", other, "commit", "-m", "other commit").Run()
	exec.Command("git", "-C", other, "push").Run()
}

func TestDivergenceIsRewrite_amend(t *testing.T) {
	local := makeRepoWithRemote(t)
	os.WriteFile(filepath.Join(local, "f.txt"), []byte("v1\n"), 0o644)
	exec.Command("git", "-C", local, "add", "f.txt").Run()
	exec.Command("git", "-C", local, "commit", "-m", "A").Run()
	exec.Command("git", "-C", local, "push").Run()

	// Amend the pushed commit → diverged (ahead 1, behind 1), but the "behind"
	// commit is the pre-amend version of our own work.
	os.WriteFile(filepath.Join(local, "f.txt"), []byte("v1-fixed\n"), 0o644)
	exec.Command("git", "-C", local, "commit", "-a", "--amend", "-m", "A amended").Run()
	exec.Command("git", "-C", local, "fetch").Run()

	rewrite, err := DivergenceIsRewrite(local)
	if err != nil {
		t.Fatal(err)
	}
	if !rewrite {
		t.Fatal("amended pushed commit must be classified as a rewrite (force-with-lease)")
	}
}

func TestDivergenceIsRewrite_genuineDivergence(t *testing.T) {
	local := makeRepoWithRemote(t)
	os.WriteFile(filepath.Join(local, "f.txt"), []byte("base\n"), 0o644)
	exec.Command("git", "-C", local, "add", "f.txt").Run()
	exec.Command("git", "-C", local, "commit", "-m", "A").Run()
	exec.Command("git", "-C", local, "push").Run()

	// Someone else pushes; meanwhile we make our own local commit → diverged
	// with a commit on the remote we never had.
	pushOtherCommit(t, local, "g.txt", "theirs\n")
	os.WriteFile(filepath.Join(local, "h.txt"), []byte("mine\n"), 0o644)
	exec.Command("git", "-C", local, "add", "h.txt").Run()
	exec.Command("git", "-C", local, "commit", "-m", "B mine").Run()
	exec.Command("git", "-C", local, "fetch").Run()

	rewrite, err := DivergenceIsRewrite(local)
	if err != nil {
		t.Fatal(err)
	}
	if rewrite {
		t.Fatal("a real remote push must NOT be classified as a rewrite (should rebase)")
	}
}

func TestDivergenceIsRewrite_inSyncOrAhead(t *testing.T) {
	local := makeRepoWithRemote(t)
	// In sync right after the seeded push.
	exec.Command("git", "-C", local, "fetch").Run()
	if r, err := DivergenceIsRewrite(local); err != nil || r {
		t.Fatalf("in-sync branch is not a rewrite-divergence, got %v (err %v)", r, err)
	}
	// Purely ahead (a local unpushed commit) is a normal push, not a rewrite.
	exec.Command("git", "-C", local, "commit", "--allow-empty", "-m", "ahead").Run()
	if r, err := DivergenceIsRewrite(local); err != nil || r {
		t.Fatalf("purely-ahead branch is not a rewrite-divergence, got %v (err %v)", r, err)
	}
}

func TestPush(t *testing.T) {
	local := makeRepoWithRemote(t)

	// add a new commit to push
	exec.Command("git", "-C", local, "commit", "--allow-empty", "-m", "new commit").Run()

	// get current branch name
	out, _ := exec.Command("git", "-C", local, "rev-parse", "--abbrev-ref", "HEAD").Output()
	branch := string(out[:len(out)-1])

	if err := Push(local, branch); err != nil {
		t.Fatalf("Push failed: %v", err)
	}
}

// Auto-set upstream on first push (ideas.md): pushing a brand-new branch with no
// upstream must succeed (setting tracking) instead of erroring with the
// "no upstream branch" wall.
func TestPush_autoSetsUpstreamOnFirstPush(t *testing.T) {
	local := makeRepoWithRemote(t)
	exec.Command("git", "-C", local, "checkout", "-b", "brand-new").Run()

	// Bare push (no branch arg) on a branch that has no upstream yet.
	if err := Push(local, ""); err != nil {
		t.Fatalf("first push should auto-set upstream, got: %v", err)
	}

	// Tracking must now be configured.
	out, _ := exec.Command("git", "-C", local, "rev-parse", "--abbrev-ref", "brand-new@{upstream}").Output()
	if up := strings.TrimSpace(string(out)); up != "origin/brand-new" {
		t.Fatalf("expected upstream origin/brand-new, got %q", up)
	}
}

func TestFetch(t *testing.T) {
	local := makeRepoWithRemote(t)

	if err := Fetch(local); err != nil {
		t.Fatalf("Fetch failed: %v", err)
	}
}

func TestFetch_prunesDeletedRemoteBranch(t *testing.T) {
	local := makeRepoWithRemote(t)

	// publish a second branch, fetch so the tracking ref exists locally
	exec.Command("git", "-C", local, "branch", "doomed").Run()
	exec.Command("git", "-C", local, "push", "origin", "doomed").Run()
	if err := Fetch(local); err != nil {
		t.Fatalf("Fetch failed: %v", err)
	}
	if err := exec.Command("git", "-C", local, "rev-parse", "--verify", "refs/remotes/origin/doomed").Run(); err != nil {
		t.Fatal("expected tracking ref origin/doomed after push+fetch")
	}

	// delete it on the remote; a Fetch must prune the stale tracking ref
	exec.Command("git", "-C", local, "push", "origin", "--delete", "doomed").Run()
	if err := Fetch(local); err != nil {
		t.Fatalf("Fetch after remote delete failed: %v", err)
	}
	if err := exec.Command("git", "-C", local, "rev-parse", "--verify", "refs/remotes/origin/doomed").Run(); err == nil {
		t.Fatal("stale tracking ref origin/doomed must be pruned by Fetch")
	}

	// the local branch of the same name must survive pruning
	if err := exec.Command("git", "-C", local, "rev-parse", "--verify", "refs/heads/doomed").Run(); err != nil {
		t.Fatal("pruning must not touch the local branch")
	}
}

func TestPushForce_afterHistoryRewrite(t *testing.T) {
	local := makeRepoWithRemote(t)
	branchOut, _ := exec.Command("git", "-C", local, "rev-parse", "--abbrev-ref", "HEAD").Output()
	branch := strings.TrimSpace(string(branchOut))

	// A real (non-empty) commit — an empty commit can't be amended.
	if err := os.WriteFile(filepath.Join(local, "f.txt"), []byte("v1\n"), 0644); err != nil {
		t.Fatal(err)
	}
	exec.Command("git", "-C", local, "add", ".").Run()
	exec.Command("git", "-C", local, "commit", "-m", "c1").Run()
	if err := Push(local, branch); err != nil {
		t.Fatalf("initial Push failed: %v", err)
	}

	// Rewrite history → local diverges from the remote.
	exec.Command("git", "-C", local, "commit", "--amend", "-m", "c1 amended").Run()

	// A normal push must now be rejected (non-fast-forward)...
	if err := Push(local, branch); err == nil {
		t.Fatal("expected a normal push to be rejected after amend")
	}
	// ...but force-with-lease succeeds (we hold the latest remote ref).
	if err := PushForce(local, branch); err != nil {
		t.Fatalf("PushForce failed: %v", err)
	}
}

func TestRenameRemoteBranch(t *testing.T) {
	local := makeRepoWithRemote(t)
	exec.Command("git", "-C", local, "checkout", "-b", "feature").Run()
	exec.Command("git", "-C", local, "push", "-u", "origin", "feature").Run()

	// Local rename, then propagate to the remote.
	if err := RenameBranch(local, "feature", "feat"); err != nil {
		t.Fatal(err)
	}
	if err := RenameRemoteBranch(local, "origin", "feature", "feat"); err != nil {
		t.Fatalf("RenameRemoteBranch failed: %v", err)
	}

	remoteURLOut, _ := exec.Command("git", "-C", local, "remote", "get-url", "origin").Output()
	remote := strings.TrimSpace(string(remoteURLOut))
	headsOut, _ := exec.Command("git", "-C", remote, "for-each-ref", "--format=%(refname:short)", "refs/heads/").Output()
	heads := string(headsOut)
	if !strings.Contains(heads, "feat") {
		t.Fatalf("remote should have 'feat'; heads:\n%s", heads)
	}
	if strings.Contains(heads, "feature") {
		t.Fatalf("remote should NOT still have 'feature'; heads:\n%s", heads)
	}
}

func TestRenameBranchFolder(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "a.txt", "a\n", "base")
	for _, b := range []string{"feature/alpha", "feature/beta", "feature/sub/gamma", "other/x"} {
		exec.Command("git", "-C", dir, "branch", b).Run()
	}

	renamed, err := RenameBranchFolder(dir, "feature", "feat")
	if err != nil {
		t.Fatalf("RenameBranchFolder failed: %v", err)
	}
	if len(renamed) != 3 {
		t.Fatalf("expected 3 renamed branches, got %d: %v", len(renamed), renamed)
	}

	out, _ := exec.Command("git", "-C", dir, "for-each-ref", "--format=%(refname:short)", "refs/heads/").Output()
	all := string(out)
	for _, want := range []string{"feat/alpha", "feat/beta", "feat/sub/gamma", "other/x"} {
		if !strings.Contains(all, want) {
			t.Errorf("expected %q to exist; refs:\n%s", want, all)
		}
	}
	if strings.Contains(all, "feature/") {
		t.Errorf("no feature/* branch should remain; refs:\n%s", all)
	}
}

// Switch-to-branch stash flow: a conflicting uncommitted change blocks Checkout
// with git's "would be overwritten" error; stashing it first unblocks the
// switch. The webview offers exactly this (stash or cancel) on a blocked switch.
func TestCheckout_blockedByLocalChanges_stashUnblocks(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "f.txt", "base\n", "c1")
	exec.Command("git", "-C", dir, "checkout", "-b", "other").Run()
	commitFile(t, dir, "f.txt", "on-other\n", "c2")
	exec.Command("git", "-C", dir, "checkout", "main").Run()

	// Uncommitted change to f.txt conflicts with switching to 'other'.
	if err := os.WriteFile(filepath.Join(dir, "f.txt"), []byte("dirty\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := Checkout(dir, "other"); err == nil {
		t.Fatal("expected checkout to be blocked by conflicting local changes")
	}

	// Stash, then the switch must succeed.
	if err := StashSave(dir, "hydragit: auto-stash before switch"); err != nil {
		t.Fatalf("StashSave failed: %v", err)
	}
	if err := Checkout(dir, "other"); err != nil {
		t.Fatalf("checkout should succeed after stashing: %v", err)
	}
}

// ── BUGS.md #6 — propagating a folder rename to the remote ────────────────────
//
// RenameBranchFolderRemote propagates the new names of a just-renamed folder to
// the remote (push new + delete old) for every branch that tracks one, while
// leaving untracked branches alone.
func TestRenameBranchFolderRemote(t *testing.T) {
	local := makeRepoWithRemote(t)
	// Two tracked branches under feature/, plus one local-only (untracked).
	exec.Command("git", "-C", local, "checkout", "-b", "feature/alpha").Run()
	exec.Command("git", "-C", local, "push", "-u", "origin", "feature/alpha").Run()
	exec.Command("git", "-C", local, "checkout", "-b", "feature/beta").Run()
	exec.Command("git", "-C", local, "push", "-u", "origin", "feature/beta").Run()
	exec.Command("git", "-C", local, "checkout", "-b", "feature/local-only").Run()
	exec.Command("git", "-C", local, "checkout", "main").Run()

	if _, err := RenameBranchFolder(local, "feature", "feat"); err != nil {
		t.Fatalf("RenameBranchFolder failed: %v", err)
	}
	propagated, err := RenameBranchFolderRemote(local, "feat")
	if err != nil {
		t.Fatalf("RenameBranchFolderRemote failed: %v", err)
	}
	if len(propagated) != 2 {
		t.Fatalf("expected 2 tracked branches propagated, got %d: %v", len(propagated), propagated)
	}

	remoteURL, _ := exec.Command("git", "-C", local, "remote", "get-url", "origin").Output()
	remote := strings.TrimSpace(string(remoteURL))
	heads, _ := exec.Command("git", "-C", remote, "for-each-ref", "--format=%(refname:short)", "refs/heads/").Output()
	all := string(heads)
	for _, want := range []string{"feat/alpha", "feat/beta"} {
		if !strings.Contains(all, want) {
			t.Errorf("remote should have %q; remote heads:\n%s", want, all)
		}
	}
	if strings.Contains(all, "feature/") {
		t.Errorf("remote should have no feature/* branch left; heads:\n%s", all)
	}
	// The local-only branch was never pushed, so it must not appear on the remote.
	if strings.Contains(all, "local-only") {
		t.Errorf("untracked branch should not be pushed; heads:\n%s", all)
	}
}

func TestPushCommit(t *testing.T) {
	local := makeRepoWithRemote(t)

	branchOut, _ := exec.Command("git", "-C", local, "rev-parse", "--abbrev-ref", "HEAD").Output()
	branch := strings.TrimSpace(string(branchOut))

	// Two new local commits; we push only up to the FIRST one.
	exec.Command("git", "-C", local, "commit", "--allow-empty", "-m", "c1").Run()
	c1Out, _ := exec.Command("git", "-C", local, "rev-parse", "HEAD").Output()
	c1 := strings.TrimSpace(string(c1Out))
	exec.Command("git", "-C", local, "commit", "--allow-empty", "-m", "c2").Run()

	if err := PushCommit(local, c1, branch); err != nil {
		t.Fatalf("PushCommit failed: %v", err)
	}

	// The remote branch tip must be exactly c1 — not c2.
	remoteURLOut, _ := exec.Command("git", "-C", local, "remote", "get-url", "origin").Output()
	remoteTipOut, _ := exec.Command("git", "-C", strings.TrimSpace(string(remoteURLOut)),
		"rev-parse", branch).Output()
	if got := strings.TrimSpace(string(remoteTipOut)); got != c1 {
		t.Fatalf("remote tip = %s; want c1 %s (only commits up to here should push)", got, c1)
	}
}

func TestPull(t *testing.T) {
	local := makeRepoWithRemote(t)

	// make the remote ahead by pushing directly to the bare repo via a second clone
	local2 := t.TempDir()
	exec.Command("git", "clone", func() string {
		// get the remote URL from local
		out, _ := exec.Command("git", "-C", local, "remote", "get-url", "origin").Output()
		return string(out[:len(out)-1])
	}(), local2).Run()
	exec.Command("git", "-C", local2, "config", "user.email", "test@test.com").Run()
	exec.Command("git", "-C", local2, "config", "user.name", "Test").Run()
	exec.Command("git", "-C", local2, "commit", "--allow-empty", "-m", "remote commit").Run()
	exec.Command("git", "-C", local2, "push").Run()

	// now pull in the original local
	if err := Pull(local); err != nil {
		t.Fatalf("Pull failed: %v", err)
	}

	// verify the remote commit is now local
	commits, err := Log(local, "", 10)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, c := range commits {
		if c.Message == "remote commit" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected remote commit to appear after pull")
	}
}

// ── BUGS.md #1 & #2 — deleting a REMOTE branch ────────────────────────────────
//
// In the UI a remote-branch row carries a name like "origin/feature". The old
// path sent that name through `branch.delete` → DeleteBranch →
// `git branch -d origin/feature`, which only operates on local heads: git
// errored "branch 'origin/feature' not found", the remote branch was never
// removed, and the stale row stayed on screen. DeleteRemoteBranch fixes this by
// running `git push <remote> --delete <branch>`, which removes the branch on the
// server AND prunes the local tracking ref.
func TestDeleteRemoteBranch_isRemovedFromRemote(t *testing.T) {
	local := makeRepoWithRemote(t)
	exec.Command("git", "-C", local, "checkout", "-b", "feature").Run()
	exec.Command("git", "-C", local, "push", "-u", "origin", "feature").Run()
	exec.Command("git", "-C", local, "checkout", "main").Run()

	if err := DeleteRemoteBranch(local, "origin", "feature"); err != nil {
		t.Fatalf("DeleteRemoteBranch failed: %v", err)
	}

	remoteURL, _ := exec.Command("git", "-C", local, "remote", "get-url", "origin").Output()
	remote := strings.TrimSpace(string(remoteURL))
	heads, _ := exec.Command("git", "-C", remote, "for-each-ref", "--format=%(refname:short)", "refs/heads/").Output()
	if strings.Contains(string(heads), "feature") {
		t.Fatalf("remote branch 'feature' should be deleted; remote still has heads:\n%s", heads)
	}
}

// Companion: the local remote-tracking ref must also be gone so Branches() stops
// listing the deleted branch — the "still shown" half of #1.
func TestDeleteRemoteBranch_prunesTrackingRef(t *testing.T) {
	local := makeRepoWithRemote(t)
	exec.Command("git", "-C", local, "checkout", "-b", "feature").Run()
	exec.Command("git", "-C", local, "push", "-u", "origin", "feature").Run()
	exec.Command("git", "-C", local, "checkout", "main").Run()

	if err := DeleteRemoteBranch(local, "origin", "feature"); err != nil {
		t.Fatalf("DeleteRemoteBranch failed: %v", err)
	}

	branches, err := Branches(local)
	if err != nil {
		t.Fatal(err)
	}
	for _, b := range branches {
		if b.IsRemote && b.Name == "origin/feature" {
			t.Fatalf("origin/feature still listed after remote delete (stale row — BUGS.md #1)")
		}
	}
}

// ── BUGS.md #5 — renaming a branch that tracks a remote ───────────────────────
//
// Characterization test (documents a known, intentional limitation): after a
// LOCAL-only rename the renamed branch keeps tracking the OLD remote ref until
// the rename is propagated. RenameRemoteBranch is the path that corrects it. We
// chose to leave this tracking behaviour as-is (matches git) and instead fix the
// "hangs ui" half of #5 with a network timeout (see runTimeout / networkTimeout
// and TestRenameRemoteBranch). If this assertion ever changes, revisit #5.
func TestRenameBranch_localOnlyKeepsOldUpstream(t *testing.T) {
	local := makeRepoWithRemote(t)
	exec.Command("git", "-C", local, "checkout", "-b", "feature").Run()
	exec.Command("git", "-C", local, "push", "-u", "origin", "feature").Run()

	if err := RenameBranch(local, "feature", "feat"); err != nil {
		t.Fatal(err)
	}

	out, _ := exec.Command("git", "-C", local, "for-each-ref",
		"--format=%(upstream:short)", "refs/heads/feat").Output()
	if up := strings.TrimSpace(string(out)); up != "origin/feature" {
		t.Fatalf("expected local-only rename to still track origin/feature, got %q", up)
	}
}

func TestParseTrack(t *testing.T) {
	cases := []struct {
		in     string
		ahead  int
		behind int
		gone   bool
	}{
		{"", 0, 0, false},
		{"[ahead 2]", 2, 0, false},
		{"[behind 3]", 0, 3, false},
		{"[ahead 2, behind 3]", 2, 3, false},
		{"[gone]", 0, 0, true},
	}
	for _, c := range cases {
		ahead, behind, gone := parseTrack(c.in)
		if ahead != c.ahead || behind != c.behind || gone != c.gone {
			t.Errorf("parseTrack(%q) = (%d,%d,%v), want (%d,%d,%v)",
				c.in, ahead, behind, gone, c.ahead, c.behind, c.gone)
		}
	}
}

// A real clone: origin/HEAD is set by git itself, and a local commit makes the
// clone ahead — covers IsDefault and Ahead/Behind end to end.
func TestBranchesDefaultAndAhead(t *testing.T) {
	origin := t.TempDir()
	for _, c := range [][]string{
		{"git", "-C", origin, "init", "-b", "trunk"},
		{"git", "-C", origin, "config", "user.email", "test@test.com"},
		{"git", "-C", origin, "config", "user.name", "Test"},
		{"git", "-C", origin, "commit", "--allow-empty", "-m", "init"},
	} {
		exec.Command(c[0], c[1:]...).Run()
	}

	clone := filepath.Join(t.TempDir(), "clone")
	if out, err := exec.Command("git", "clone", origin, clone).CombinedOutput(); err != nil {
		t.Fatalf("clone failed: %v\n%s", err, out)
	}
	exec.Command("git", "-C", clone, "config", "user.email", "test@test.com").Run()
	exec.Command("git", "-C", clone, "config", "user.name", "Test").Run()
	exec.Command("git", "-C", clone, "commit", "--allow-empty", "-m", "local work").Run()

	branches, err := Branches(clone)
	if err != nil {
		t.Fatal(err)
	}

	var local *Branch
	for i := range branches {
		if !branches[i].IsRemote && branches[i].Name == "trunk" {
			local = &branches[i]
		}
	}
	if local == nil {
		t.Fatal("local trunk branch not found")
	}
	if !local.IsDefault {
		t.Error("the branch origin/HEAD points to must be flagged IsDefault")
	}
	if local.Ahead != 1 || local.Behind != 0 {
		t.Errorf("expected ahead=1 behind=0, got ahead=%d behind=%d", local.Ahead, local.Behind)
	}

	// A branch origin/HEAD does NOT point to must not be flagged.
	exec.Command("git", "-C", clone, "branch", "side").Run()
	branches, _ = Branches(clone)
	for _, b := range branches {
		if b.Name == "side" && b.IsDefault {
			t.Error("side branch wrongly flagged as default")
		}
	}
}

// No remote at all → no branch may claim to be the default (never guess by name).
func TestBranchesNoRemoteNoDefault(t *testing.T) {
	dir := t.TempDir()
	for _, c := range [][]string{
		{"git", "-C", dir, "init"},
		{"git", "-C", dir, "config", "user.email", "test@test.com"},
		{"git", "-C", dir, "config", "user.name", "Test"},
		{"git", "-C", dir, "commit", "--allow-empty", "-m", "init"},
		{"git", "-C", dir, "branch", "master"},
		{"git", "-C", dir, "branch", "main"},
	} {
		exec.Command(c[0], c[1:]...).Run()
	}

	branches, err := Branches(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, b := range branches {
		if b.IsDefault {
			t.Errorf("branch %q flagged default in a repo with no remote", b.Name)
		}
	}
}
