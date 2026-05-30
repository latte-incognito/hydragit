package graph

import "hydragit/internal/git"

var LaneColors = []string{
	"#e8873e", // orange
	"#56c8e8", // teal
	"#e85680", // pink
	"#4ec94e", // green
	"#9a7ae8", // purple
	"#e3b341", // amber
	"#56e8c8", // mint
	"#7898e8", // blue
}

func laneColor(lane int) string {
	return LaneColors[lane%len(LaneColors)]
}

// segColor colors a branch line ("segment"). Color follows the line, not the
// lane — lanes are reused by many lines (Task 4), so coloring by lane would be
// ambiguous. Each segment gets a stable color from the palette.
func segColor(seg int) string {
	return LaneColors[seg%len(LaneColors)]
}

// Seg fields below identify the branch line an element belongs to. The webview
// uses them to color each line consistently and to highlight one line on hover.

type Edge struct {
	FromLane int    `json:"fromLane"`
	ToLane   int    `json:"toLane"`
	Color    string `json:"color"`
	Seg      int    `json:"seg"`
}

type MergePath struct {
	FromLane int    `json:"fromLane"`
	ToLane   int    `json:"toLane"`
	FromRow  int    `json:"fromRow"`
	ToRow    int    `json:"toRow"`
	Color    string `json:"color"`
	Seg      int    `json:"seg"`
}

type LaidOutCommit struct {
	git.Commit
	Lane       int         `json:"lane"`
	Seg        int         `json:"seg"`
	Color      string      `json:"color"`
	Edges      []Edge      `json:"edges"`
	MergePaths []MergePath `json:"mergePaths,omitempty"`
}

func findInColumns(columns []string, hash string) int {
	for i, h := range columns {
		if h == hash {
			return i
		}
	}
	return -1
}

type pendingMergeEntry struct {
	mergeRow  int
	mergeLane int
}

func AssignLanes(commits []git.Commit) []*LaidOutCommit {
	n := len(commits)
	if n == 0 {
		// Non-nil so JSON marshals to [] not null (webview reads .length).
		return []*LaidOutCommit{}
	}

	result := make([]*LaidOutCommit, n)
	var columns []string // hash each lane currently expects next ("" = free)
	var colSeg []int     // segment (branch-line id) currently on each lane
	nextSeg := 0
	pending := map[string][]pendingMergeEntry{}

	for i, c := range commits {
		// Place the commit: continue an existing lane that expects it, or open a
		// new lane (reusing a freed slot). Opening a lane starts a new branch-line
		// segment; continuing a lane inherits that lane's segment.
		myLane := findInColumns(columns, c.Hash)
		var seg int
		if myLane == -1 {
			for j := range columns {
				if columns[j] == "" {
					myLane = j
					break
				}
			}
			if myLane == -1 {
				columns = append(columns, "")
				colSeg = append(colSeg, 0)
				myLane = len(columns) - 1
			}
			columns[myLane] = c.Hash
			seg = nextSeg
			nextSeg++
			colSeg[myLane] = seg
		} else {
			seg = colSeg[myLane]
		}

		result[i] = &LaidOutCommit{
			Commit: c,
			Lane:   myLane,
			Seg:    seg,
			Color:  segColor(seg),
		}

		// Resolve pending merges: a merge commit recorded this hash as a second
		// parent; now that it appeared, draw the connector in this line's color.
		if entries, ok := pending[c.Hash]; ok {
			for _, pm := range entries {
				result[pm.mergeRow].MergePaths = append(
					result[pm.mergeRow].MergePaths,
					MergePath{
						FromLane: pm.mergeLane,
						ToLane:   myLane,
						FromRow:  pm.mergeRow,
						ToRow:    i,
						Color:    segColor(seg),
						Seg:      seg,
					},
				)
			}
			delete(pending, c.Hash)
		}

		// Collapse: other columns expecting the same hash converge into myLane at
		// this commit. Redirect every previous-row edge that pointed at the
		// converging lane — both its pass-through and any branch that merged back
		// into it on that row — so nothing is left dangling at a lane that ends
		// here. (This is what keeps the last feature merging into a bundle lane
		// from dead-ending when the bundle itself terminates at the same row.)
		for j := range columns {
			if j != myLane && columns[j] == c.Hash {
				if i > 0 {
					for k := range result[i-1].Edges {
						if result[i-1].Edges[k].ToLane == j {
							result[i-1].Edges[k].ToLane = myLane
						}
					}
				}
				columns[j] = ""
			}
		}

		if len(c.Parents) == 0 {
			columns[myLane] = ""
			continue
		}

		// First parent: continue this lane toward it, UNLESS a lower lane is
		// already heading to the same parent — then this commit is a branch
		// merging back.
		//
		// We never fold a branch into an unrelated merge node (the Task 2 fix —
		// see TestTwoFeaturesFromSameBase). But holding a dedicated lane all the
		// way down to a distant shared ancestor makes the graph needlessly wide
		// (50 features off one base = 50 lanes). So when a lower "bundle" lane is
		// already heading to this first parent, merge into it with a short
		// one-row diagonal and free this lane for reuse. The bundle lane carries
		// the shared path to the real ancestor; the join happens mid-line (never
		// at an unrelated commit), so no false connection is implied. This is the
		// `| |/` pattern git/IntelliJ use to keep such histories compact — one
		// bundle line + short diagonals, not a fan of long overlapping edges.
		// See FIRST_TO_RESOLVE.MD, Task 4.
		p0 := c.Parents[0]
		mergeBack := -1
		for j := 0; j < myLane; j++ {
			if columns[j] == p0 {
				mergeBack = j // keep the LAST (nearest-left) match, not the first
			}
		}
		if mergeBack != -1 {
			columns[myLane] = "" // free this lane; short diagonal into the bundle
		} else {
			columns[myLane] = p0 // continue this lane straight down
		}

		// Additional parents (merges): connect to each. If the parent already
		// occupies a lane, draw the connector now; otherwise defer until it
		// appears (lazy allocation keeps merge connectors from reserving lanes
		// before they are needed).
		for _, p := range c.Parents[1:] {
			if pLane := findInColumns(columns, p); pLane != -1 {
				result[i].MergePaths = append(result[i].MergePaths, MergePath{
					FromLane: myLane,
					ToLane:   pLane,
					FromRow:  i,
					ToRow:    i,
					Color:    segColor(colSeg[pLane]),
					Seg:      colSeg[pLane],
				})
			} else {
				pending[p] = append(pending[p], pendingMergeEntry{i, myLane})
			}
		}

		// Edges from this row to the next: either a straight continuation of this
		// line (if held) or a short diagonal merging back into the bundle lane
		// (if freed), plus a pass-through for every other still-active line. Each
		// edge carries its line's segment + color so the webview can highlight one
		// branch line and color it consistently.
		var edges []Edge
		switch {
		case columns[myLane] != "":
			edges = append(edges, Edge{myLane, myLane, segColor(seg), seg})
		case mergeBack != -1:
			edges = append(edges, Edge{myLane, mergeBack, segColor(seg), seg})
		}
		for j, h := range columns {
			if h != "" && j != myLane {
				edges = append(edges, Edge{j, j, segColor(colSeg[j]), colSeg[j]})
			}
		}
		result[i].Edges = edges
	}

	return result
}
