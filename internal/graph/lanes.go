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

type Edge struct {
	FromLane int    `json:"fromLane"`
	ToLane   int    `json:"toLane"`
	Color    string `json:"color"`
}

type MergePath struct {
	FromLane int    `json:"fromLane"`
	ToLane   int    `json:"toLane"`
	FromRow  int    `json:"fromRow"`
	ToRow    int    `json:"toRow"`
	Color    string `json:"color"`
}

type LaidOutCommit struct {
	git.Commit
	Lane       int         `json:"lane"`
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

func allocColumn(columns []string, hash string) ([]string, int) {
	for i, h := range columns {
		if h == "" {
			columns[i] = hash
			return columns, i
		}
	}
	columns = append(columns, hash)
	return columns, len(columns) - 1
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
	var columns []string
	pending := map[string][]pendingMergeEntry{}

	for i, c := range commits {
		myLane := findInColumns(columns, c.Hash)
		if myLane == -1 {
			columns, myLane = allocColumn(columns, c.Hash)
		}

		result[i] = &LaidOutCommit{
			Commit: c,
			Lane:   myLane,
			Color:  laneColor(myLane),
		}

		// Resolve pending merges: a merge commit recorded this hash as
		// a second parent; now that it appeared, draw the connector.
		if entries, ok := pending[c.Hash]; ok {
			for _, pm := range entries {
				result[pm.mergeRow].MergePaths = append(
					result[pm.mergeRow].MergePaths,
					MergePath{
						FromLane: pm.mergeLane,
						ToLane:   myLane,
						FromRow:  pm.mergeRow,
						ToRow:    i,
						Color:    laneColor(myLane),
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
					Color:    laneColor(pLane),
				})
			} else {
				pending[p] = append(pending[p], pendingMergeEntry{i, myLane})
			}
		}

		// Edges from this row to the next: either a straight continuation of this
		// lane (if held) or a short diagonal merging back into the bundle lane
		// (if freed), plus a pass-through for every other still-active lane.
		var edges []Edge
		switch {
		case columns[myLane] != "":
			edges = append(edges, Edge{myLane, myLane, laneColor(myLane)})
		case mergeBack != -1:
			edges = append(edges, Edge{myLane, mergeBack, laneColor(mergeBack)})
		}
		for j, h := range columns {
			if h != "" && j != myLane {
				edges = append(edges, Edge{j, j, laneColor(j)})
			}
		}
		result[i].Edges = edges
	}

	return result
}
