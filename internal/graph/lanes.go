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

		// Collapse: other columns expecting the same hash merge into myLane.
		for j := range columns {
			if j != myLane && columns[j] == c.Hash {
				if i > 0 {
					for k, e := range result[i-1].Edges {
						if e.FromLane == j && e.ToLane == j {
							result[i-1].Edges[k].ToLane = myLane
							break
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

		// First parent inherits this lane.
		//
		// We deliberately do NOT collapse other columns that merely await the
		// same parent hash here. Folding them together at this row would draw an
		// unrelated branch as if it joined this commit — e.g. two features that
		// forked from the same base would appear to connect through whichever
		// merge commit comes first, instead of at their real fork point. Each
		// lane instead passes straight through and converges only when its real
		// parent commit is actually reached (the "Resolve pending"/collapse
		// logic at the top of the loop). The graph may get wide; that is
		// correct. See FIRST_TO_RESOLVE.MD, Task 2.
		columns[myLane] = c.Parents[0]

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

		// Edges: straight continuation of this lane + a pass-through for every
		// other still-active lane.
		var edges []Edge
		edges = append(edges, Edge{myLane, myLane, laneColor(myLane)})
		for j, h := range columns {
			if h != "" && j != myLane {
				edges = append(edges, Edge{j, j, laneColor(j)})
			}
		}
		result[i].Edges = edges
	}

	return result
}
