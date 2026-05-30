package git

import (
	"os"
	"path/filepath"
	"testing"
)

// Scenarios derived from docs/SECURITY.md and BUGS.MD #20. These assert the Go
// layer fails *cleanly* (a returned error, never a panic or shell escape) for
// hostile or degraded inputs. They pass today — they pin the safe behavior so a
// future change can't regress it.

// SECURITY.md "Path traversal in branch/file names": exec.Command with an args
// slice can't shell-inject, and git rejects bad ref names — so a traversal-style
// name must surface as an error, not escape the repo.
func TestRefName_pathTraversalRejected(t *testing.T) {
	repo := initRepo(t)
	if err := Checkout(repo, "../../../etc/passwd"); err == nil {
		t.Fatal("expected git to reject a path-traversal ref name")
	}
	if err := CreateBranch(repo, "..", ""); err == nil {
		t.Fatal("expected git to reject an invalid ref name")
	}
}

// SECURITY.md "HYDRAGIT_REPO not validated": pointing the layer at a directory
// that is not a git repo must error cleanly rather than hang or panic.
func TestStatus_emptyDirErrorsCleanly(t *testing.T) {
	dir := t.TempDir()
	if _, err := Status(dir); err == nil {
		t.Fatal("expected a clean error for a non-repo directory")
	}
}

// BUGS.MD #20: "If git state changed by another plugin or command HydraGit can
// stuck." At the Go layer a held index.lock must make a write operation FAIL
// promptly (git refuses to acquire the lock) rather than block. The "stuck"
// risk lives on the TS side (see goProcess.failure.test.ts), not here.
func TestCommit_indexLockHeld_failsCleanly(t *testing.T) {
	repo := initRepo(t)
	lock := filepath.Join(repo, ".git", "index.lock")
	if err := os.WriteFile(lock, []byte{}, 0o644); err != nil {
		t.Fatalf("could not create index.lock: %v", err)
	}
	defer os.Remove(lock)

	writeFileGit(t, repo, "x.txt", "x\n")
	if _, err := CreateCommit(repo, "blocked", []string{"x.txt"}); err == nil {
		t.Fatal("expected commit to fail while index.lock is held")
	}
}

// writeFileGit writes a file into the repo without committing (local helper to
// avoid colliding with writeFile in the git_test package).
func writeFileGit(t *testing.T, repoPath, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(repoPath, name), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
