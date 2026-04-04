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
	for _, c := range result {
		for _, p := range c.Paths {
			assert(t, p.Type == "straight", "expected straight path for single branch")
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

	// merge commit on lane 0
	assert(t, result[0].Lane == 0, "merge commit should be on lane 0")

	// feat commit on a different lane than merge
	assert(t, result[1].Lane != result[0].Lane, "feat should be on a different lane")

	// merge commit should have one curve path
	curveCount := 0
	for _, p := range result[0].Paths {
		if p.Type == "curve" {
			curveCount++
		}
	}
	assert(t, curveCount == 1, "expected one curve path on merge commit")
}

// ── lane colors cycle ─────────────────────────────────────────────────────────

func TestLaneColorCycles(t *testing.T) {
	// more lanes than colors — should cycle without panic
	n := len(LaneColors) + 3
	for i := 0; i < n; i++ {
		color := laneColor(i)
		if color == "" {
			t.Fatalf("laneColor(%d) returned empty string", i)
		}
	}
	// lane 0 and lane len(LaneColors) should have the same color
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
	assert(t, len(result[0].Paths) == 0, "root should have no paths")
}

// ── two parallel branches, no merge ──────────────────────────────────────────

func TestTwoParallelBranches(t *testing.T) {
	// a1 → a2 on one branch, b1 → b2 on another, share a common base
	commits := []git.Commit{
		{Hash: "a2", Parents: []string{"a1"}},
		{Hash: "b2", Parents: []string{"b1"}},
		{Hash: "a1", Parents: []string{"base"}},
		{Hash: "b1", Parents: []string{"base"}},
		{Hash: "base", Parents: []string{}},
	}
	result := AssignLanes(commits)

	// a2 and b2 should be on different lanes
	assert(t, result[0].Lane != result[1].Lane, "parallel branch tips should be on different lanes")

	// all commits should have non-negative lanes
	for _, c := range result {
		assert(t, c.Lane >= 0, "lane should be non-negative")
	}
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
