package graph

import "hydragit/internal/git"

var LaneColors = []string{
	"#56c8e8", // teal
	"#4ec94e", // green
	"#9a7ae8", // purple
	"#e3b341", // amber
	"#e87856", // orange
	"#56e8c8", // mint
	"#e85680", // pink
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

type LaidOutCommit struct {
	git.Commit
	Lane  int    `json:"lane"`
	Color string `json:"color"`
	Edges []Edge `json:"edges"`
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

func AssignLanes(commits []git.Commit) []*LaidOutCommit {
	n := len(commits)
	if n == 0 {
		return nil
	}

	result := make([]*LaidOutCommit, n)
	var columns []string

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

		// Collapse: other columns expecting the same hash merge into myLane.
		// Retroactively change the previous row's pass-through edge for the
		// duplicate column into a merge curve toward myLane.
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

		// First parent inherits lane; root commits free it.
		if len(c.Parents) == 0 {
			columns[myLane] = ""
			continue
		}
		columns[myLane] = c.Parents[0]

		// Merge parents: find existing column or allocate a new one.
		for _, p := range c.Parents[1:] {
			if findInColumns(columns, p) == -1 {
				columns, _ = allocColumn(columns, p)
			}
		}

		// Emit edges from this row to the next row.
		var edges []Edge

		// First-parent continuation
		edges = append(edges, Edge{
			FromLane: myLane,
			ToLane:   myLane,
			Color:    laneColor(myLane),
		})

		// Merge-parent edges (curve from myLane to the parent's column)
		for _, p := range c.Parents[1:] {
			pLane := findInColumns(columns, p)
			edges = append(edges, Edge{
				FromLane: myLane,
				ToLane:   pLane,
				Color:    laneColor(pLane),
			})
		}

		// Pass-through edges for all other active columns
		for j, h := range columns {
			if h != "" && j != myLane {
				alreadyCovered := false
				for _, e := range edges {
					if e.ToLane == j {
						alreadyCovered = true
						break
					}
				}
				if !alreadyCovered {
					edges = append(edges, Edge{
						FromLane: j,
						ToLane:   j,
						Color:    laneColor(j),
					})
				}
			}
		}

		result[i].Edges = edges
	}

	return result
}
