package graph

import (
	"testing"

	"hydragit/internal/git"
)

func assert(t *testing.T, cond bool, msg string) {
	t.Helper()
	if !cond {
		t.Fatal(msg)
	}
}

// ── single branch ─────────────────────────────────────────────────────────────

func TestSingleBranch(t *testing.T) {
	commits := []git.Commit{
		{Hash: "c", Parents: []string{"b"}},
		{Hash: "b", Parents: []string{"a"}},
		{Hash: "a", Parents: []string{}},
	}
	result := AssignLanes(commits)

	for _, c := range result {
		assert(t, c.Lane == 0, "expected lane 0 for single branch")
	}
	for i, c := range result {
		if i < len(result)-1 {
			assert(t, len(c.Edges) == 1, "expected one edge per non-root commit")
			assert(t, c.Edges[0].FromLane == 0 && c.Edges[0].ToLane == 0, "expected straight edge on lane 0")
		}
	}
}

// ── simple merge ──────────────────────────────────────────────────────────────

func TestSimpleMerge(t *testing.T) {
	// merge → main → base
	//       ↘ feat → base
	commits := []git.Commit{
		{Hash: "merge", Parents: []string{"main", "feat"}},
		{Hash: "feat", Parents: []string{"base"}},
		{Hash: "main", Parents: []string{"base"}},
		{Hash: "base", Parents: []string{}},
	}
	result := AssignLanes(commits)

	assert(t, result[0].Lane == 0, "merge commit should be on lane 0")

	// Merge should produce a MergePath from lane 0 to feat's lane
	assert(t, len(result[0].MergePaths) == 1, "merge commit should have one MergePath")
	mp := result[0].MergePaths[0]
	assert(t, mp.FromLane == 0, "MergePath should start at lane 0")
	assert(t, mp.FromRow == 0, "MergePath should start at row 0")
	assert(t, mp.ToRow == 1, "MergePath should end at row 1 (feat)")
}

// ── lane colors cycle ─────────────────────────────────────────────────────────

func TestLaneColorCycles(t *testing.T) {
	n := len(LaneColors) + 3
	for i := range n {
		color := laneColor(i)
		if color == "" {
			t.Fatalf("laneColor(%d) returned empty string", i)
		}
	}
	assert(t, laneColor(0) == laneColor(len(LaneColors)), "expected colors to cycle")
}

// ── root commit (no parents) ──────────────────────────────────────────────────

func TestRootCommitOnly(t *testing.T) {
	commits := []git.Commit{
		{Hash: "root", Parents: []string{}},
	}
	result := AssignLanes(commits)

	assert(t, len(result) == 1, "expected one result")
	assert(t, result[0].Lane == 0, "root should be on lane 0")
	assert(t, len(result[0].Edges) == 0, "root should have no edges")
}

// ── two parallel branches, no merge ──────────────────────────────────────────

func TestTwoParallelBranches(t *testing.T) {
	commits := []git.Commit{
		{Hash: "a2", Parents: []string{"a1"}},
		{Hash: "b2", Parents: []string{"b1"}},
		{Hash: "a1", Parents: []string{"base"}},
		{Hash: "b1", Parents: []string{"base"}},
		{Hash: "base", Parents: []string{}},
	}
	result := AssignLanes(commits)

	assert(t, result[0].Lane != result[1].Lane, "parallel branch tips should be on different lanes")
	for _, c := range result {
		assert(t, c.Lane >= 0, "lane should be non-negative")
	}
}

// ── pass-through edges ───────────────────────────────────────────────────────

func TestPassThroughEdges(t *testing.T) {
	// Three commits: a and b both point to base. At row 1 (b), lane 0
	// is active (expects "base") and should emit a pass-through edge.
	commits := []git.Commit{
		{Hash: "a", Parents: []string{"base"}},
		{Hash: "b", Parents: []string{"base"}},
		{Hash: "base", Parents: []string{}},
	}
	result := AssignLanes(commits)

	assert(t, result[0].Lane == 0, "a on lane 0")
	assert(t, result[1].Lane == 1, "b on lane 1")

	// Row 1 (b) should have a pass-through for lane 0
	hasPassThrough := false
	for _, e := range result[1].Edges {
		if e.FromLane == 0 && e.ToLane == 0 {
			hasPassThrough = true
		}
	}
	assert(t, hasPassThrough, "expected pass-through edge for lane 0 at row 1")
}

// ── collapse edges ───────────────────────────────────────────────────────────

func TestCollapseEdges(t *testing.T) {
	commits := []git.Commit{
		{Hash: "a", Parents: []string{"c"}},
		{Hash: "b", Parents: []string{"c"}},
		{Hash: "c", Parents: []string{}},
	}
	result := AssignLanes(commits)

	assert(t, result[0].Lane == 0, "a on lane 0")
	assert(t, result[1].Lane == 1, "b on lane 1")
	assert(t, result[2].Lane == 0, "c on lane 0 (first match)")

	// Row 1 edges should have a merge curve from lane 1 → lane 0
	hasMergeCurve := false
	for _, e := range result[1].Edges {
		if e.FromLane == 1 && e.ToLane == 0 {
			hasMergeCurve = true
		}
	}
	assert(t, hasMergeCurve, "expected collapse merge curve from lane 1 to lane 0")
}

// ── lazy allocation keeps lanes compact ──────────────────────────────────────

func TestLazyAllocationCompact(t *testing.T) {
	// Nested merges: without lazy alloc this would use 3 lanes.
	// merge_A → merge_B → inner_branch → main → outer_branch
	commits := []git.Commit{
		{Hash: "mA", Parents: []string{"mB", "ob"}},
		{Hash: "mB", Parents: []string{"main", "ib"}},
		{Hash: "ib", Parents: []string{"base"}},
		{Hash: "main", Parents: []string{"base"}},
		{Hash: "ob", Parents: []string{"base"}},
		{Hash: "base", Parents: []string{}},
	}
	result := AssignLanes(commits)

	maxLane := 0
	for _, c := range result {
		if c.Lane > maxLane {
			maxLane = c.Lane
		}
	}
	// With lazy allocation, the inner branch uses lane 1 and frees it;
	// the outer branch then reuses lane 1. Max should be 1, not 2.
	assert(t, maxLane <= 1, "lazy allocation should keep max lane ≤ 1")
}

// ── result length matches input ───────────────────────────────────────────────

func TestResultLengthMatchesInput(t *testing.T) {
	commits := []git.Commit{
		{Hash: "c", Parents: []string{"b"}},
		{Hash: "b", Parents: []string{"a"}},
		{Hash: "a", Parents: []string{}},
	}
	result := AssignLanes(commits)
	assert(t, len(result) == len(commits), "result length should match input length")
}

// ── empty input ───────────────────────────────────────────────────────────────

func TestEmptyInput(t *testing.T) {
	result := AssignLanes([]git.Commit{})
	assert(t, len(result) == 0, "expected empty result for empty input")
}

// ── topology edge cases ─────────────────────────────────────────────────────
//
// These exercise the lane-assignment algorithm against the nasty graph shapes
// that historically break lane code: 3+ parents, crossing merges, disjoint
// roots, repeated merge churn, and many concurrent lanes. Pure struct-in /
// struct-out — no git, no browser.

// maxLane returns the highest lane index used across the laid-out commits.
func maxLane(result []*LaidOutCommit) int {
	m := 0
	for _, c := range result {
		if c.Lane > m {
			m = c.Lane
		}
	}
	return m
}

// totalMergePaths counts merge connectors drawn across all rows.
func totalMergePaths(result []*LaidOutCommit) int {
	n := 0
	for _, c := range result {
		n += len(c.MergePaths)
	}
	return n
}

// ── octopus merge (3+ parents) ───────────────────────────────────────────────

func TestOctopusMerge(t *testing.T) {
	// One merge commit with three parents, each a one-commit branch off base.
	//   oct ─┬─ p1 ─┐
	//        ├─ p2 ─┤ base
	//        └─ p3 ─┘
	commits := []git.Commit{
		{Hash: "oct", Parents: []string{"p1", "p2", "p3"}},
		{Hash: "p1", Parents: []string{"base"}},
		{Hash: "p2", Parents: []string{"base"}},
		{Hash: "p3", Parents: []string{"base"}},
		{Hash: "base", Parents: []string{}},
	}
	result := AssignLanes(commits)

	assert(t, len(result) == 5, "expected 5 laid-out commits")
	assert(t, result[0].Lane == 0, "octopus merge should sit on lane 0")

	// First parent inherits the lane; the 2 extra parents each get a connector.
	assert(t, len(result[0].MergePaths) == 2,
		"octopus with 3 parents should draw 2 merge connectors")
	for _, mp := range result[0].MergePaths {
		assert(t, mp.FromLane == 0, "octopus connectors should start at lane 0")
		assert(t, mp.ToLane != 0, "each extra parent should land on its own lane")
	}
}

// ── criss-cross merge (two merges sharing the same two parents) ───────────────

func TestCrissCrossMerge(t *testing.T) {
	// Two heads, each merging x and y in opposite parent order. This is the
	// classic shape where lanes must cross without collapsing or cross-wiring.
	commits := []git.Commit{
		{Hash: "m1", Parents: []string{"x", "y"}},
		{Hash: "m2", Parents: []string{"y", "x"}},
		{Hash: "x", Parents: []string{"base"}},
		{Hash: "y", Parents: []string{"base"}},
		{Hash: "base", Parents: []string{}},
	}
	result := AssignLanes(commits)

	assert(t, len(result) == 5, "expected 5 laid-out commits")
	assert(t, result[0].Lane != result[1].Lane,
		"the two merge heads should occupy different lanes")
	for _, c := range result {
		assert(t, c.Lane >= 0, "every commit must have a valid lane")
	}
	// Each merge contributes at least one second-parent connector.
	assert(t, totalMergePaths(result) >= 2,
		"criss-cross should draw a connector for each crossing merge")
}

// ── multiple roots / disjoint history (orphan branch) ─────────────────────────

func TestMultipleRoots(t *testing.T) {
	// Two unrelated histories — e.g. main and an orphaned gh-pages branch.
	// There is no common ancestor, so the graph has two bottoms.
	commits := []git.Commit{
		{Hash: "a", Parents: []string{"r1"}},
		{Hash: "b", Parents: []string{"r2"}},
		{Hash: "r1", Parents: []string{}},
		{Hash: "r2", Parents: []string{}},
	}
	result := AssignLanes(commits)

	assert(t, len(result) == 4, "expected 4 laid-out commits")

	// Both roots terminate their lane and emit no outgoing edges.
	roots := 0
	for _, c := range result {
		if len(c.Parents) == 0 {
			roots++
			assert(t, len(c.Edges) == 0, "a root commit should have no edges")
		}
	}
	assert(t, roots == 2, "expected two independent roots")
}

// ── re-merge churn (one branch diverges & merges repeatedly) ──────────────────

func TestReMergeChurn(t *testing.T) {
	// main and feat join, both advance, then join again. The same pair of
	// lanes splits and re-joins — stresses lane continuity across rows.
	commits := []git.Commit{
		{Hash: "m2", Parents: []string{"main1", "feat2"}},
		{Hash: "feat2", Parents: []string{"feat1"}},
		{Hash: "main1", Parents: []string{"m1"}},
		{Hash: "m1", Parents: []string{"main0", "feat1"}},
		{Hash: "feat1", Parents: []string{"base"}},
		{Hash: "main0", Parents: []string{"base"}},
		{Hash: "base", Parents: []string{}},
	}
	result := AssignLanes(commits)

	assert(t, len(result) == 7, "expected 7 laid-out commits")
	// Both merge commits draw a connector to their second parent.
	assert(t, totalMergePaths(result) >= 2,
		"each re-merge should draw a connector")
	// Churn between two branches must not leak ever-growing lane width.
	assert(t, maxLane(result) <= 2,
		"re-merge churn between two branches should stay within a few lanes")
}

// ── wide concurrency (many branches alive at the same row) ────────────────────

func TestWideConcurrency(t *testing.T) {
	// Ten independent two-commit branches, all converging only at base.
	// Listing every tip before any mid keeps all ten lanes alive at once.
	const n = 10
	var commits []git.Commit
	for i := range n {
		commits = append(commits, git.Commit{
			Hash:    "tip" + string(rune('0'+i)),
			Parents: []string{"mid" + string(rune('0'+i))},
		})
	}
	for i := range n {
		commits = append(commits, git.Commit{
			Hash:    "mid" + string(rune('0'+i)),
			Parents: []string{"base"},
		})
	}
	commits = append(commits, git.Commit{Hash: "base", Parents: []string{}})

	result := AssignLanes(commits)

	assert(t, len(result) == 2*n+1, "expected 2n+1 laid-out commits")
	// Ten simultaneously-live branches must occupy ten distinct lanes (0..9).
	assert(t, maxLane(result) == n-1,
		"ten concurrent branches should use exactly ten lanes")
}

// ── lane recycling (a freed lane is reused, not leaked) ───────────────────────

func TestLaneRecycling(t *testing.T) {
	// A side branch lives briefly then collapses back into main at base; a
	// later side branch should reuse the freed lane rather than allocating a
	// third. Width must stay at 2 lanes total.
	commits := []git.Commit{
		{Hash: "main2", Parents: []string{"sideB", "main1"}},
		{Hash: "sideB", Parents: []string{"main1"}},
		{Hash: "main1", Parents: []string{"sideA", "main0"}},
		{Hash: "sideA", Parents: []string{"main0"}},
		{Hash: "main0", Parents: []string{}},
	}
	result := AssignLanes(commits)

	assert(t, len(result) == 5, "expected 5 laid-out commits")
	assert(t, maxLane(result) <= 1,
		"the second side branch should reuse the first's freed lane")
}
