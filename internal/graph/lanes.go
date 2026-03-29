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

type laneTracker struct {
	owners []string
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

func (t *laneTracker) free(lane int)             { t.owners[lane] = "" }
func (t *laneTracker) set(lane int, hash string) { t.owners[lane] = hash }

// mainLaneSet builds the set of hashes reachable via first-parent from startHash.
func mainLaneSet(startHash string, rowOf map[string]int, commits []git.Commit) map[string]bool {
	seen := make(map[string]bool)
	hash := startHash
	for {
		seen[hash] = true
		row, ok := rowOf[hash]
		if !ok {
			break
		}
		c := commits[row]
		if len(c.Parents) == 0 {
			break
		}
		hash = c.Parents[0]
	}
	return seen
}

func AssignLanes(commits []git.Commit) []*LaidOutCommit {
	rowOf := make(map[string]int, len(commits))
	for i, c := range commits {
		rowOf[c.Hash] = i
	}

	tracker := &laneTracker{}
	result := make([]*LaidOutCommit, len(commits))

	for i, c := range commits {
		myLane := tracker.claim(c.Hash)

	if result[i] == nil {
    result[i] = &LaidOutCommit{}
}
result[i].Commit = c
result[i].Lane   = myLane
result[i].Color  = laneColor(myLane)

		if len(c.Parents) == 0 {
			tracker.free(myLane)
			continue
		}

		// first parent inherits current lane
		tracker.set(myLane, c.Parents[0])
		result[i].Paths = append(result[i].Paths, pathTo(i, rowOf, myLane, myLane, c.Parents[0]))

		// additional parents (merges) get their own lane
		for _, parent := range c.Parents[1:] {
			branchLane := tracker.claim(parent)

			// closing curve: merge commit → branch tip
			result[i].Paths = append(result[i].Paths, pathTo(i, rowOf, myLane, branchLane, parent))

			// opening curve: walk branch down to find divergence point
			mainLane := mainLaneSet(c.Parents[0], rowOf, commits)
			currentHash := parent
			for {
				row, ok := rowOf[currentHash]
				if !ok {
					break
				}
				commit := commits[row]
				if len(commit.Parents) == 0 {
					break
				}
				nextHash := commit.Parents[0]
				if _, ok := rowOf[nextHash]; !ok {
					break
				}
				if mainLane[nextHash] {
					nextRow := rowOf[nextHash]
					// initialize if not yet processed by main loop
					if result[nextRow] == nil {
						result[nextRow] = &LaidOutCommit{
							Commit: commits[nextRow],
							Lane:   myLane,
							Color:  laneColor(myLane),
						}
					}
					result[nextRow].Paths = append(result[nextRow].Paths, Path{
						FromLane: myLane,
						ToLane:   branchLane,
						FromRow:  nextRow,
						ToRow:    row,
						Color:    laneColor(branchLane),
						Type:     "curve",
					})
					break
				}
				currentHash = nextHash
			}
		}
	}

	return result
}

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
		FromRow:  fromRow, ToRow: toRow,
		Color:    laneColor(toLane),
		Type:     pathType,
	}
}