package graph

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"hydragit/internal/git"
)

// TestManyBranchesRenderCompact verifies the Task 4 behaviour: when 50 branches
// fork from a common base and each cross-merges its neighbour without squashing,
// the graph renders COMPACT — branches that share an ancestor have their lanes
// freed and reused (with long edges to the real ancestor), rather than holding
// 50 dedicated lanes. This is correct (no false connections — see
// TestTwoFeaturesFromSameBase) AND narrow, matching git's own `git log --graph`.
// End-to-end through git.Log + AssignLanes so it reflects real output.
func TestManyBranchesRenderCompact(t *testing.T) {
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

	// Branches sharing the base collapse into a handful of reused lanes. Assert a
	// generous ceiling: if width blows up again, lane reuse regressed.
	if max > 8 {
		t.Fatalf("expected a compact graph (<=8 lanes) for 50 branches, got maxLane=%d", max)
	}
}
