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
