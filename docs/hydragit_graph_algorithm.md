# HydraGit — Graph Lane Algorithm
## internal/graph/lanes.go

---

## What this does

Takes a flat list of commits (ordered newest-first, as git log outputs them) and computes:
- Which **lane** (column) each commit belongs to
- Which **color** to draw it in
- What **paths** (SVG lines/curves) to draw connecting commits to their parents

The Webview receives this pre-computed data and renders it directly. No graph logic in JS.

---

## Input

```go
type RawCommit struct {
    Hash    string
    Parents []string  // 0 = root, 1 = normal, 2 = merge
    Message string
    Author  string
    Date    string
    Refs    []Ref     // branches/tags pointing at this commit
    IsMerge bool
}
```

Comes from `git log` with `--format="%H|%P|%s|%an|%ar|%D"` where `%P` = space-separated parent hashes.

---

## Output

```go
type LaidOutCommit struct {
    RawCommit                    // all original fields
    Lane    int                  // 0-based column index
    Color   string               // hex color for this lane
    Paths   []Path               // lines/curves to draw below this commit
}

type Path struct {
    FromLane int
    ToLane   int
    FromRow  int    // row index of this commit
    ToRow    int    // row index of the parent commit
    Color    string
    Type     string // "straight" or "curve"
}
```

---

## Algorithm — step by step

### Core idea

We maintain a `lanes []string` slice where:
- Index = lane number
- Value = hash of the commit we're "waiting for" (i.e. we've drawn a line down to this commit but haven't reached it yet)
- Empty string = lane is free

We scan commits top-to-bottom (newest to oldest). For each commit:
1. Find which lane is already waiting for it (or claim a free one)
2. Record that lane as this commit's lane
3. Set up the lanes for this commit's parents

### Lane colors

```go
var LaneColors = []string{
    "#56c8e8", // teal   — lane 0, always main/master
    "#4ec94e", // green
    "#9a7ae8", // purple
    "#e3b341", // amber
    "#e87856", // orange
    "#56e8c8", // mint
    "#e85680", // pink
    "#7898e8", // blue
}

func laneColor(lane int) string {
    return LaneColors[lane % len(LaneColors)]
}
```

### The main loop

```go
func AssignLanes(commits []RawCommit) []LaidOutCommit {
    // index: hash → row position
    rowOf := make(map[string]int, len(commits))
    for i, c := range commits {
        rowOf[c.Hash] = i
    }

    lanes := []string{} // lanes[i] = hash waiting for lane i, "" = free

    result := make([]LaidOutCommit, len(commits))

    freeLane := func() int {
        for i, h := range lanes {
            if h == "" { return i }
        }
        lanes = append(lanes, "")
        return len(lanes) - 1
    }

    for i, c := range commits {
        // ── Step 1: find or claim a lane ──
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
            RawCommit: c,
            Lane:      myLane,
            Color:     laneColor(myLane),
        }

        // ── Step 2: set up lanes for parents ──
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
                    FromRow:  i,      ToRow:  parentRow,
                    Color:    laneColor(myLane),
                    Type:     "straight",
                })
            }

        case 2:
            // Merge commit — first parent keeps lane, second spawns new lane
            lanes[myLane] = c.Parents[0]

            // straight line to first parent
            if parentRow, ok := rowOf[c.Parents[0]]; ok {
                result[i].Paths = append(result[i].Paths, Path{
                    FromLane: myLane, ToLane: myLane,
                    FromRow:  i,      ToRow:  parentRow,
                    Color:    laneColor(myLane),
                    Type:     "straight",
                })
            }

            // curved line to second parent (the merged branch)
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
                    FromLane: myLane,      ToLane: branchLane,
                    FromRow:  i,           ToRow:  parentRow,
                    Color:    laneColor(branchLane),
                    Type:     "curve",
                })
            }
        }
    }

    return result
}
```

---

## Webview rendering (what JS does with the output)

The Webview receives `[]LaidOutCommit` as the `data` field of a `log` response.

**Constants:**
```js
const ROW_H  = 32;   // px height per row
const LANE_W = 18;   // px width per lane
const DOT_R  = 4.5;  // commit dot radius
const PAD    = 10;   // left padding

function laneX(lane) { return PAD + lane * LANE_W + LANE_W / 2; }
function rowY(row)   { return row * ROW_H + ROW_H / 2; }
```

**Drawing paths:**
```js
commit.paths.forEach(p => {
    const x1 = laneX(p.fromLane), y1 = rowY(p.fromRow) + DOT_R;
    const x2 = laneX(p.toLane),   y2 = rowY(p.toRow)   - DOT_R;

    if (p.type === 'straight') {
        // <line> element
        svg.append('line')
           .attr('x1',x1).attr('y1',y1)
           .attr('x2',x2).attr('y2',y2)
           .attr('stroke', p.color)
           .attr('stroke-width', 1.8);
    } else {
        // cubic bezier curve
        const cy1 = rowY(p.fromRow) + ROW_H * 0.6;
        const cy2 = rowY(p.toRow)   - ROW_H * 0.6;
        svg.append('path')
           .attr('d', `M${x1},${y1} C${x1},${cy1} ${x2},${cy2} ${x2},${y2}`)
           .attr('fill', 'none')
           .attr('stroke', p.color)
           .attr('stroke-width', 1.8);
    }
});
```

**Drawing dots:**
```js
// Normal commit
svg.append('circle')
   .attr('cx', laneX(commit.lane))
   .attr('cy', rowY(i))
   .attr('r', DOT_R)
   .attr('fill', commit.color);

// Merge commit — hollow circle with cross
svg.append('circle')
   .attr('cx', laneX(commit.lane)).attr('cy', rowY(i))
   .attr('r', DOT_R + 1)
   .attr('fill', '#1e1e1e')
   .attr('stroke', commit.color).attr('stroke-width', 2);
// + cross lines (horizontal + vertical through center)
```

---

## SVG width calculation

The SVG needs to be wide enough for all lanes:

```go
// In Go — compute max lane count and send with the response
maxLane := 0
for _, c := range result {
    if c.Lane > maxLane { maxLane = c.Lane }
    for _, p := range c.Paths {
        if p.ToLane > maxLane { maxLane = p.ToLane }
    }
}
svgWidth := (maxLane+1)*LANE_W + PAD*2
```

Send `svgWidth` in the response so the Webview sets the SVG element width correctly.

---

## Testing the algorithm

Write Go unit tests in `internal/graph/lanes_test.go`:

```go
func TestSingleBranch(t *testing.T) {
    commits := []RawCommit{
        {Hash:"c", Parents:[]string{"b"}},
        {Hash:"b", Parents:[]string{"a"}},
        {Hash:"a", Parents:[]string{}},
    }
    result := AssignLanes(commits)
    // all commits should be on lane 0
    for _, c := range result {
        assert(t, c.Lane == 0)
    }
    // all paths should be straight
    for _, c := range result {
        for _, p := range c.Paths {
            assert(t, p.Type == "straight")
        }
    }
}

func TestSimpleMerge(t *testing.T) {
    commits := []RawCommit{
        {Hash:"merge", Parents:[]string{"main","feat"}, IsMerge:true},
        {Hash:"feat",  Parents:[]string{"base"}},
        {Hash:"main",  Parents:[]string{"base"}},
        {Hash:"base",  Parents:[]string{}},
    }
    result := AssignLanes(commits)
    // merge commit on lane 0
    assert(t, result[0].Lane == 0)
    // feat commit on a different lane
    assert(t, result[1].Lane != result[0].Lane)
    // merge commit should have one curve path
    curveCount := 0
    for _, p := range result[0].Paths {
        if p.Type == "curve" { curveCount++ }
    }
    assert(t, curveCount == 1)
}
```

---

## Reference implementation

The working JavaScript version of this algorithm is in `hydragit_d3_graph.html` — the `assignLanes()` function. Port it to Go following the pseudocode above. The logic is identical, the types just become Go structs.

---

## What NOT to do

- Do not run this algorithm in the Webview — it belongs in Go
- Do not use go-git's graph APIs — they exist but are incomplete for visualization
- Do not hardcode SVG patterns per commit — the algorithm generates them dynamically
- Do not pre-assign colors to branches by name — assign by lane index, it's deterministic and conflict-free
