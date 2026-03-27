package graph

import "hydragit/internal/git"

var LaneColors = []string{
	"#56c8e8", // teal   — lane 0
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
	Type     string `json:"type"` // "straight" or "curve"
}

type LaidOutCommit struct {
	git.Commit
	Lane  int    `json:"lane"`
	Color string `json:"color"`
	Paths []Path `json:"paths"`
}

func AssignLanes(commits []git.Commit) []LaidOutCommit {
	rowOf := make(map[string]int, len(commits))
	for i, c := range commits {
		rowOf[c.Hash] = i
	}

	lanes := []string{} // lanes[i] = hash waiting for lane i, "" = free

	result := make([]LaidOutCommit, len(commits))

	freeLane := func() int {
		for i, h := range lanes {
			if h == "" {
				return i
			}
		}
		lanes = append(lanes, "")
		return len(lanes) - 1
	}

	for i, c := range commits {
		// Step 1: find or claim a lane
		myLane := -1
		for li, h := range lanes {
			if h == c.Hash {
				myLane = li
				break
			}
		}
		if myLane == -1 {
			myLane = freeLane()
		}

		result[i] = LaidOutCommit{
			Commit: c,
			Lane:   myLane,
			Color:  laneColor(myLane),
		}

		// Step 2: set up lanes for parents
		switch len(c.Parents) {

		case 0:
			// Root commit — free the lane
			lanes[myLane] = ""

		case 1:
			// Normal commit — pass lane straight down to parent
			lanes[myLane] = c.Parents[0]

			if parentRow, ok := rowOf[c.Parents[0]]; ok {
				result[i].Paths = append(result[i].Paths, Path{
					FromLane: myLane, ToLane: myLane,
					FromRow: i, ToRow: parentRow,
					Color: laneColor(myLane),
					Type:  "straight",
				})
			}

		default:
			// Merge commit — first parent keeps lane, second spawns new lane
			lanes[myLane] = c.Parents[0]

			// straight line to first parent
			if parentRow, ok := rowOf[c.Parents[0]]; ok {
				result[i].Paths = append(result[i].Paths, Path{
					FromLane: myLane, ToLane: myLane,
					FromRow: i, ToRow: parentRow,
					Color: laneColor(myLane),
					Type:  "straight",
				})
			}

			// curved line to second parent
			branchLane := -1
			for li, h := range lanes {
				if h == c.Parents[1] {
					branchLane = li
					break
				}
			}
			if branchLane == -1 {
				branchLane = freeLane()
				lanes[branchLane] = c.Parents[1]
			}

			if parentRow, ok := rowOf[c.Parents[1]]; ok {
				result[i].Paths = append(result[i].Paths, Path{
					FromLane: myLane, ToLane: branchLane,
					FromRow: i, ToRow: parentRow,
					Color: laneColor(branchLane),
					Type:  "curve",
				})
			}
		}
	}

	return result
}
