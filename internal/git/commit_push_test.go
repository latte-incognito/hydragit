package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// CommitAndPush backs the sidebar "commit & push" action (CHANGELOG feature
// index: CreateCommit, CommitAndPush / `commit.push`). It must land the commit
// on the remote in one step — and, since it's two git operations, fail loudly if
// either half can't complete.

func TestCommitAndPush_landsOnRemote(t *testing.T) {
	local := makeRepoWithRemote(t)
	if err := os.WriteFile(filepath.Join(local, "f.txt"), []byte("hello\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	res, err := CommitAndPush(local, "add f", []string{"f.txt"})
	if err != nil {
		t.Fatalf("CommitAndPush failed: %v", err)
	}
	if res == nil || res.Hash == "" {
		t.Fatalf("expected a commit result with a hash, got %+v", res)
	}

	// The remote now has our commit (no longer ahead).
	mustGit(t, local, "fetch", "origin")
	out, err := exec.Command("git", "-C", local, "rev-list", "--count", "@{u}..HEAD").Output()
	if err != nil {
		t.Fatalf("rev-list ahead count: %v", err)
	}
	if ahead := strings.TrimSpace(string(out)); ahead != "0" {
		t.Fatalf("local should not be ahead of upstream after push, got %s ahead", ahead)
	}
	// And the remote tip subject matches.
	rurl, _ := exec.Command("git", "-C", local, "remote", "get-url", "origin").Output()
	rsub, _ := exec.Command("git", "-C", strings.TrimSpace(string(rurl)), "log", "-1", "--format=%s").Output()
	if got := strings.TrimSpace(string(rsub)); got != "add f" {
		t.Fatalf("remote tip subject = %q; want %q", got, "add f")
	}
}

// Negative: an empty message is rejected before anything is committed.
func TestCommitAndPush_emptyMessageRejected(t *testing.T) {
	local := makeRepoWithRemote(t)
	os.WriteFile(filepath.Join(local, "f.txt"), []byte("hello\n"), 0o644)

	if _, err := CommitAndPush(local, "   ", []string{"f.txt"}); err == nil {
		t.Fatal("expected empty-message rejection")
	}
	// No commit was created (HEAD subject is still the seed "init").
	if got := subjectAt(t, local, "HEAD"); got != "init" {
		t.Fatalf("an empty message must not create a commit, HEAD = %q", got)
	}
}

// Negative: with no remote configured the push half fails. We still surface the
// error (the action did not fully succeed) — and document that the local commit
// is created first, so the caller/UI knows the working tree already moved.
func TestCommitAndPush_noRemoteErrorsButCommitsLocally(t *testing.T) {
	dir := initRepo(t)
	if err := os.WriteFile(filepath.Join(dir, "f.txt"), []byte("hello\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := CommitAndPush(dir, "add f", []string{"f.txt"}); err == nil {
		t.Fatal("expected a push error with no remote configured")
	}
	// The commit itself succeeded locally (push is the second, failing step).
	if got := subjectAt(t, dir, "HEAD"); got != "add f" {
		t.Fatalf("local commit should exist despite the push failure, HEAD = %q", got)
	}
}
