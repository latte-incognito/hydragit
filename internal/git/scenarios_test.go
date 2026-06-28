package git

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// gitIn runs a git command in dir and fails the test on error. Thin helper kept
// local to this file so the scenario setups read top-to-bottom.
func gitIn(t *testing.T, dir string, args ...string) {
	t.Helper()
	full := append([]string{"-C", dir}, args...)
	if out, err := exec.Command("git", full...).CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}

// writeAndAdd writes a file in dir and stages it, so there is something to stash.
func writeAndAdd(t *testing.T, dir, name, content string) error {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0644); err != nil {
		return err
	}
	gitIn(t, dir, "add", name)
	return nil
}

// ── repo with 1 branch, no remotes ────────────────────────────────────────────

func TestSingleBranchNoRemotes(t *testing.T) {
	dir := initRepo(t)

	branches, err := Branches(dir)
	if err != nil {
		t.Fatal(err)
	}

	var locals, currents int
	for _, b := range branches {
		if b.IsRemote {
			t.Fatalf("did not expect a remote branch: %q", b.Name)
		}
		locals++
		if b.IsCurrent {
			currents++
		}
	}
	if locals != 1 {
		t.Fatalf("expected exactly 1 local branch, got %d", locals)
	}
	if currents != 1 {
		t.Fatalf("expected exactly 1 current branch, got %d", currents)
	}

	st, err := Status(dir)
	if err != nil {
		t.Fatal(err)
	}
	if st.HasUpstream {
		t.Fatal("single-branch no-remote repo should have no upstream")
	}
}

// ── repo with 5+ branches and 2 remotes ───────────────────────────────────────

func TestManyBranchesTwoRemotes(t *testing.T) {
	dir := initRepo(t)

	// Five extra local branches (six total with the default branch).
	for i := range 5 {
		gitIn(t, dir, "branch", fmt.Sprintf("feature-%d", i))
	}

	// Two independent bare remotes, both fetched so remote-tracking refs exist.
	remoteA, remoteB := t.TempDir(), t.TempDir()
	exec.Command("git", "init", "--bare", remoteA).Run()
	exec.Command("git", "init", "--bare", remoteB).Run()
	gitIn(t, dir, "remote", "add", "alpha", remoteA)
	gitIn(t, dir, "remote", "add", "beta", remoteB)
	gitIn(t, dir, "push", "alpha", "--all")
	gitIn(t, dir, "push", "beta", "--all")
	gitIn(t, dir, "fetch", "alpha")
	gitIn(t, dir, "fetch", "beta")

	branches, err := Branches(dir)
	if err != nil {
		t.Fatal(err)
	}

	var locals int
	sawAlpha, sawBeta := false, false
	for _, b := range branches {
		if !b.IsRemote {
			locals++
			continue
		}
		if strings.HasPrefix(b.Name, "alpha/") {
			sawAlpha = true
		}
		if strings.HasPrefix(b.Name, "beta/") {
			sawBeta = true
		}
	}

	if locals < 6 {
		t.Fatalf("expected >= 6 local branches, got %d", locals)
	}
	if !sawAlpha || !sawBeta {
		t.Fatalf("expected remote-tracking branches for both remotes (alpha=%v beta=%v)", sawAlpha, sawBeta)
	}
}

// ── repo with several active stashes ──────────────────────────────────────────

func TestMultipleStashes(t *testing.T) {
	dir := initRepo(t)

	for i := range 3 {
		// Each stash needs a distinct change to save.
		if err := writeAndAdd(t, dir, fmt.Sprintf("file-%d.txt", i), "content\n"); err != nil {
			t.Fatal(err)
		}
		if err := StashSave(dir, fmt.Sprintf("stash %d", i)); err != nil {
			t.Fatalf("StashSave: %v", err)
		}
	}

	entries, err := StashList(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 3 {
		t.Fatalf("expected 3 stashes, got %d", len(entries))
	}
	// git lists stashes newest-first: stash@{0} is the last one saved.
	if !strings.Contains(entries[0].Message, "stash 2") {
		t.Fatalf("expected newest stash first, got %q", entries[0].Message)
	}
}

// ── commit reachable only by a tag (no branch points at it) ───────────────────

func TestTagsOnlyCommitVisible(t *testing.T) {
	dir := initRepo(t)

	gitIn(t, dir, "commit", "--allow-empty", "-m", "tagged-orphan")
	gitIn(t, dir, "tag", "v9.9.9")
	// Move the branch back so the tagged commit is reachable only via the tag.
	gitIn(t, dir, "reset", "--hard", "HEAD~1")

	commits, err := logCommits(dir, 50)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, c := range commits {
		if c.Message == "tagged-orphan" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected tag-only commit to appear in --all log")
	}
}

// ── detached HEAD ─────────────────────────────────────────────────────────────

func TestDetachedHead(t *testing.T) {
	dir := initRepo(t)
	gitIn(t, dir, "commit", "--allow-empty", "-m", "second")
	gitIn(t, dir, "checkout", "--detach", "HEAD~1")

	// Branch listing must not error and no branch should be marked current.
	branches, err := Branches(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, b := range branches {
		if b.IsCurrent {
			t.Fatalf("no branch should be current while HEAD is detached, got %q", b.Name)
		}
	}

	// Status must still succeed on a detached HEAD.
	if _, err := Status(dir); err != nil {
		t.Fatalf("Status on detached HEAD: %v", err)
	}
}

// ── 1000 branches (scale / parse perf) ────────────────────────────────────────

func TestManyBranchesScale(t *testing.T) {
	dir := initRepo(t)

	head, err := run(dir, "rev-parse", "HEAD")
	if err != nil {
		t.Fatal(err)
	}
	head = strings.TrimSpace(head)

	// Create 1000 refs in one git invocation rather than 1000 exec calls.
	var sb strings.Builder
	const n = 1000
	for i := range n {
		fmt.Fprintf(&sb, "create refs/heads/scale-%04d %s\n", i, head)
	}
	cmd := exec.Command("git", "-C", dir, "update-ref", "--stdin")
	cmd.Stdin = strings.NewReader(sb.String())
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("bulk branch create: %v\n%s", err, out)
	}

	branches, err := Branches(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(branches) < n {
		t.Fatalf("expected >= %d branches, got %d", n, len(branches))
	}
}

// ── same-timestamp commits keep topological order ─────────────────────────────

func TestLogTopoOrderSameTimestamp(t *testing.T) {
	dir := initRepo(t)

	// Three commits sharing one fixed timestamp. Without --topo-order a pure
	// date sort could shuffle them; Log must still return child-before-parent.
	const ts = "2020-01-01T00:00:00"
	commitAt := func(msg string) {
		t.Helper()
		cmd := exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", msg)
		cmd.Env = append(cmd.Environ(),
			"GIT_AUTHOR_DATE="+ts,
			"GIT_COMMITTER_DATE="+ts,
		)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("commit %q: %v\n%s", msg, err, out)
		}
	}
	commitAt("ts-a")
	commitAt("ts-b")
	commitAt("ts-c")

	commits, err := logCommits(dir, 50)
	if err != nil {
		t.Fatal(err)
	}

	// Build position index by message and assert each commit precedes its parent.
	pos := map[string]int{}
	hashByMsg := map[string]string{}
	for i, c := range commits {
		pos[c.Hash] = i
		hashByMsg[c.Message] = c.Hash
	}
	for _, c := range commits {
		for _, p := range c.Parents {
			if pi, ok := pos[p]; ok && pos[c.Hash] > pi {
				t.Fatalf("topo-order violated: %q appears after its parent", c.Message)
			}
		}
	}
	// Sanity: the three same-timestamp commits are all present and ordered c→b→a.
	if pos[hashByMsg["ts-c"]] > pos[hashByMsg["ts-b"]] ||
		pos[hashByMsg["ts-b"]] > pos[hashByMsg["ts-a"]] {
		t.Fatal("expected newest same-timestamp commit first (ts-c, ts-b, ts-a)")
	}
}
