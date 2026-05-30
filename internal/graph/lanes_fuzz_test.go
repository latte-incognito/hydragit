package graph

import (
	"fmt"
	"testing"

	"hydragit/internal/git"
)

// FuzzAssignLanes is the high-value fuzz target: it generates random commit DAGs
// (linear chains, merges, dangling/forward parent refs, multiple roots) and
// asserts the lane engine never panics and always returns structurally sane
// output. Run: go test -run x -fuzz FuzzAssignLanes ./internal/graph
//
// Invariants for ANY input:
//   - len(output) == len(input), order preserved
//   - every Lane and Seg is >= 0
//   - every Color is from the LaneColors palette
//   - every Edge/MergePath lane is >= 0 and every MergePath row is in range
func FuzzAssignLanes(f *testing.F) {
	f.Add([]byte{0})
	f.Add([]byte{1, 2, 3, 4, 5})
	f.Add([]byte{7, 7, 7, 7, 7, 7, 7, 7})
	f.Add([]byte{255, 1, 128, 64, 2, 9})

	palette := map[string]bool{}
	for _, c := range LaneColors {
		palette[c] = true
	}

	f.Fuzz(func(t *testing.T, data []byte) {
		n := len(data)
		if n == 0 {
			if out := AssignLanes(nil); len(out) != 0 {
				t.Fatalf("AssignLanes(nil) should be empty, got %d", len(out))
			}
			return
		}
		if n > 256 { // cap so the corpus stays fast
			n = 256
			data = data[:n]
		}

		commits := make([]git.Commit, n)
		for i := range commits {
			commits[i].Hash = fmt.Sprintf("c%d", i)
		}
		// Derive parents from the fuzz bytes. Parents reference earlier commits
		// (to form a realistic DAG), with occasional dangling refs.
		for i := range commits {
			b := int(data[i])
			if i > 0 && b&1 == 1 {
				commits[i].Parents = append(commits[i].Parents, fmt.Sprintf("c%d", b%i))
			}
			if i > 1 && b&2 == 2 {
				commits[i].Parents = append(commits[i].Parents, fmt.Sprintf("c%d", (b>>2)%i))
			}
			if b&4 == 4 {
				commits[i].Parents = append(commits[i].Parents, "deadbeef") // dangling ref
			}
		}

		out := AssignLanes(commits) // must not panic
		if len(out) != len(commits) {
			t.Fatalf("length mismatch: got %d, want %d", len(out), len(commits))
		}
		for i, lc := range out {
			if lc == nil {
				t.Fatalf("nil LaidOutCommit at row %d", i)
			}
			if lc.Lane < 0 {
				t.Fatalf("row %d: negative lane %d", i, lc.Lane)
			}
			if lc.Seg < 0 {
				t.Fatalf("row %d: negative seg %d", i, lc.Seg)
			}
			if !palette[lc.Color] {
				t.Fatalf("row %d: color %q not in palette", i, lc.Color)
			}
			if lc.Commit.Hash != commits[i].Hash {
				t.Fatalf("row %d: order changed, got %q want %q", i, lc.Commit.Hash, commits[i].Hash)
			}
			for _, e := range lc.Edges {
				if e.FromLane < 0 || e.ToLane < 0 {
					t.Fatalf("row %d: negative edge lane %+v", i, e)
				}
			}
			for _, mp := range lc.MergePaths {
				if mp.FromLane < 0 || mp.ToLane < 0 {
					t.Fatalf("row %d: negative mergepath lane %+v", i, mp)
				}
				if mp.FromRow < 0 || mp.FromRow >= len(out) || mp.ToRow < 0 || mp.ToRow >= len(out) {
					t.Fatalf("row %d: mergepath row out of range %+v (n=%d)", i, mp, len(out))
				}
			}
		}
	})
}
