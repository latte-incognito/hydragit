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
	// Each non-root commit should have exactly one edge (straight continuation)
	for i, c := range result {
		if i < len(result)-1 {
			assert(t, len(c.Edges) == 1, "expected one edge per non-root commit")
			assert(t, c.Edges[0].FromLane == 0 && c.Edges[0].ToLane == 0, "expected straight edge on lane 0")
		}
	}
}

// ── simple merge ──────────────────────────────────────────────────────────────

func TestSimpleMerge(t *testing.T) {
	commits := []git.Commit{
		{Hash: "merge", Parents: []string{"main", "feat"}},
		{Hash: "feat", Parents: []string{"base"}},
		{Hash: "main", Parents: []string{"base"}},
		{Hash: "base", Parents: []string{}},
	}
	result := AssignLanes(commits)

	assert(t, result[0].Lane == 0, "merge commit should be on lane 0")
	assert(t, result[1].Lane != result[0].Lane, "feat should be on a different lane")

	// merge commit should have a curve edge to the feat branch lane
	hasCurve := false
	for _, e := range result[0].Edges {
		if e.FromLane != e.ToLane {
			hasCurve = true
		}
	}
	assert(t, hasCurve, "expected a curve edge on merge commit")
}

// ── lane colors cycle ─────────────────────────────────────────────────────────

func TestLaneColorCycles(t *testing.T) {
	n := len(LaneColors) + 3
	for i := 0; i < n; i++ {
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
	// Merge allocates two lanes; at row 1, the non-commit lane should pass through.
	commits := []git.Commit{
		{Hash: "merge", Parents: []string{"a", "b"}},
		{Hash: "b", Parents: []string{"base"}},
		{Hash: "a", Parents: []string{"base"}},
		{Hash: "base", Parents: []string{}},
	}
	result := AssignLanes(commits)

	// Row 1 (b) is on lane 1; lane 0 is active (expects "a") and should pass through.
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
	// Two children point to the same parent — duplicate columns should collapse
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
