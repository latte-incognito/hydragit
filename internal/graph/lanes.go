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

type Path struct {
	FromLane int    `json:"fromLane"`
	ToLane   int    `json:"toLane"`
	FromRow  int    `json:"fromRow"`
	ToRow    int    `json:"toRow"`
	Color    string `json:"color"`
	Type     string `json:"type"` // "straight" | "curve"
}

type LaidOutCommit struct {
	git.Commit
	Lane  int    `json:"lane"`
	Color string `json:"color"`
	Paths []Path `json:"paths"`
}

// laneTracker manages lane allocation and ownership.
type laneTracker struct {
	owners []string // owners[i] = hash claimed on lane i, "" = free
}

func (t *laneTracker) claim(hash string) int {
	for i, h := range t.owners {
		if h == hash {
			return i
		}
	}
	return t.alloc(hash)
}

func (t *laneTracker) alloc(hash string) int {
	for i, h := range t.owners {
		if h == "" {
			t.owners[i] = hash
			return i
		}
	}
	t.owners = append(t.owners, hash)
	return len(t.owners) - 1
}

func (t *laneTracker) free(lane int)           { t.owners[lane] = "" }
func (t *laneTracker) set(lane int, hash string) { t.owners[lane] = hash }

func AssignLanes(commits []git.Commit) []LaidOutCommit {
	rowOf := make(map[string]int, len(commits))
	for i, c := range commits {
		rowOf[c.Hash] = i
	}

	tracker := &laneTracker{}
	result := make([]LaidOutCommit, len(commits))

	for i, c := range commits {
		myLane := tracker.claim(c.Hash)

		result[i] = LaidOutCommit{
			Commit: c,
			Lane:   myLane,
			Color:  laneColor(myLane),
		}

		if len(c.Parents) == 0 {
			tracker.free(myLane)
			continue
		}

		// First parent always inherits the current lane (straight line down)
		tracker.set(myLane, c.Parents[0])
		result[i].Paths = append(result[i].Paths, pathTo(i, rowOf, myLane, myLane, c.Parents[0]))

		// Additional parents (merge commits) get their own lane with a curve
		for _, parent := range c.Parents[1:] {
			branchLane := tracker.claim(parent)
			result[i].Paths = append(result[i].Paths, pathTo(i, rowOf, myLane, branchLane, parent))
		}
	}

	return result
}

// pathTo builds a Path from row i to the row of parentHash.
// Returns a zero-value Path if the parent isn't in rowOf (cross-repo / shallow clone).
func pathTo(fromRow int, rowOf map[string]int, fromLane, toLane int, parentHash string) Path {
	toRow, ok := rowOf[parentHash]
	if !ok {
		return Path{}
	}
	pathType := "straight"
	if fromLane != toLane {
		pathType = "curve"
	}
	return Path{
		FromLane: fromLane, ToLane: toLane,
		FromRow: fromRow, ToRow: toRow,
		Color: laneColor(toLane),
		Type:  pathType,
	}
}