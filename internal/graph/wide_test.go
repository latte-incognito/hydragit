package graph

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"hydragit/internal/git"
)

// TestManyBranchesStayCompact is a characterization test: it documents that
// even 50 branches, each cross-merged with its neighbour, render as a NARROW
// graph — not a 50-lane-wide one. Two mechanisms keep it compact:
//
//   - git.Log uses --topo-order, which serializes a branch's commits instead of
//     interleaving them, so few branches are "open" at any given row; and
//   - AssignLanes eagerly collapses any two lanes that await the same next
//     parent (e.g. both heading to the shared base).
//
// Measured width for this 50-branch setup is ~4 lanes. This test guards that
// property: if a future lane-algorithm change blows the graph wide, it fails
// here. (A synthetic struct ordering can force many lanes — see
// TestWideConcurrency — but real `git log` output does not.)
func TestManyBranchesStayCompact(t *testing.T) {
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

	// 50 cross-merged branches still pack into a handful of lanes. Assert a
	// generous ceiling: if width suddenly explodes, the lane packing regressed.
	if max > 8 {
		t.Fatalf("expected the graph to stay compact (<=8 lanes) for 50 branches, got maxLane=%d", max)
	}
}
