package graph

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"hydragit/internal/git"
)

// TestManyBranchesRenderWide verifies the post-fix behaviour (FIRST_TO_RESOLVE.MD
// Task 2): when 50 branches fork from a common base and each cross-merges its
// neighbour without squashing, the graph renders WIDE — one lane per concurrent
// branch — rather than collapsing branches together. Wide-but-correct beats
// narrow-but-misleading. End-to-end through git.Log + AssignLanes so it reflects
// real `git log --topo-order` output, not synthetic structs.
func TestManyBranchesRenderWide(t *testing.T) {
	dir := t.TempDir()

	run := func(args ...string) {
		t.Helper()
		c := exec.Command("git", append([]string{"-C", dir}, args...)...)
		c.Env = append(c.Environ(),
			"GIT_AUTHOR_NAME=T", "GIT_AUTHOR_EMAIL=t@t.com",
			"GIT_COMMITTER_NAME=T", "GIT_COMMITTER_EMAIL=t@t.com",
		)
		if out, err := c.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %s", args, out)
		}
	}
	write := func(name, content string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}

	run("init", "-b", "main")
	write("base.txt", "base\n")
	run("add", ".")
	run("commit", "-m", "base")

	const n = 50
	// Each branch owns a distinct file so all merges stay conflict-free.
	for i := range n {
		run("checkout", "-b", fmt.Sprintf("w%02d", i), "main")
		write(fmt.Sprintf("f%02d.txt", i), "a\n")
		run("add", ".")
		run("commit", "-m", fmt.Sprintf("w%d a", i))
		write(fmt.Sprintf("f%02d.txt", i), "b\n")
		run("add", ".")
		run("commit", "-m", fmt.Sprintf("w%d b", i))
	}
	// Cross-merge: every branch merges its neighbour (wrapping around). Distinct
	// files → no conflicts; branches stay independent heads → the graph is wide.
	for i := range n {
		run("checkout", fmt.Sprintf("w%02d", i))
		run("merge", "--no-ff", "-m",
			fmt.Sprintf("merge w%d into w%d", (i+1)%n, i),
			fmt.Sprintf("w%02d", (i+1)%n))
	}

	commits, err := git.Log(dir, "", 500)
	if err != nil {
		t.Fatal(err)
	}
	laid := AssignLanes(commits)

	max := maxLane(laid)
	t.Logf("commits=%d maxLane=%d laneCount=%d", len(commits), max, max+1)

	// 50 concurrent branches should produce many lanes. Assert a generous floor
	// (not the exact 49) so the test isn't brittle to ordering details, while
	// still proving the graph no longer collapses everything into a few lanes.
	if max < 20 {
		t.Fatalf("expected a wide graph (>=20 lanes) for 50 branches, got maxLane=%d", max)
	}
}
