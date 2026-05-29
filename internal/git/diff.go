package git

import (
	"strconv"
	"strings"
)

type FileStat struct {
	Path      string `json:"path"`
	OldPath   string `json:"oldPath,omitempty"` // set for renames: the previous path
	Status    string `json:"status"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
}

type Hunk struct {
	Header string     `json:"header"`
	Lines  []HunkLine `json:"lines"`
}

type HunkLine struct {
	Type    string `json:"type"` // "add", "del", "ctx"
	Content string `json:"content"`
}

type DiffResult struct {
	Files []FileStat `json:"files"`
	Hunks []Hunk     `json:"hunks"`
}

// DiffCommit returns file stats for a commit with correct status letters.
//
// Strategy: run diff-tree twice in one shot using NUL-delimited output isn't
// straightforward, so we run two passes and zip by index — both flags produce
// output in the same order for the same commit.
//
//  1. --name-status  → status letter (M/A/D/R/C/T) + path(s)
//  2. --numstat      → additions + deletions + path(s)
func DiffCommit(repoPath, commit string) ([]FileStat, error) {
	// Pass 1: name-status gives us the status letter and paths.
	// Renamed/copied files produce two tab-separated paths.
	nsOut, err := run(repoPath, "diff-tree", "--no-commit-id", "-r",
		"-M", // detect renames
		"-C", // detect copies
		"--name-status", commit)
	if err != nil {
		return nil, err
	}

	// Pass 2: numstat gives us addition/deletion counts.
	// Renamed files appear as "N\tM\told\tnew" (two path columns).
	numOut, err := run(repoPath, "diff-tree", "--no-commit-id", "-r",
		"-M",
		"-C",
		"--numstat", commit)
	if err != nil {
		return nil, err
	}

	// Parse name-status lines into ordered entries.
	type nsEntry struct {
		status  string
		path    string // new path (or only path)
		oldPath string // only for R/C
	}

	var nsEntries []nsEntry
	for _, line := range strings.Split(nsOut, "\n") {
		if line == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) < 2 {
			continue
		}
		// Status may have a similarity score suffix: "R95" → "R"
		status := string(parts[0][0])
		entry := nsEntry{status: status}
		if (status == "R" || status == "C") && len(parts) >= 3 {
			entry.oldPath = parts[1]
			entry.path = parts[2]
		} else {
			entry.path = parts[1]
		}
		nsEntries = append(nsEntries, entry)
	}

	// Parse numstat lines — order matches name-status exactly.
	type numEntry struct {
		add int
		del int
	}
	var numEntries []numEntry
	for _, line := range strings.Split(numOut, "\n") {
		if line == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) < 3 {
			continue
		}
		// Binary files show "-" for counts.
		add, _ := strconv.Atoi(parts[0])
		del, _ := strconv.Atoi(parts[1])
		numEntries = append(numEntries, numEntry{add: add, del: del})
	}

	// Zip the two slices. They must have the same length for a given commit;
	// guard defensively in case of unexpected output.
	count := len(nsEntries)
	if len(numEntries) < count {
		count = len(numEntries)
	}

	files := make([]FileStat, 0, count)
	for i := 0; i < count; i++ {
		ns := nsEntries[i]
		num := numEntries[i]
		files = append(files, FileStat{
			Path:      ns.path,
			OldPath:   ns.oldPath,
			Status:    ns.status,
			Additions: num.add,
			Deletions: num.del,
		})
	}
	return files, nil
}

// DiffFile returns hunks for a specific file in a commit.
func DiffFile(repoPath, commit, file string) ([]Hunk, error) {
	out, err := run(repoPath, "diff-tree", "--no-commit-id", "-r", "-p", commit, "--", file)
	if err != nil {
		return nil, err
	}
	return parseHunks(out), nil
}

// emptyTree is git's canonical empty-tree object. Used as the "before" side
// when a file has no prior revision (e.g. the oldest commit in a list).
const emptyTree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"

// fullContext is a deliberately huge -U value so the diff carries the whole
// file as context — the side-by-side viewer renders the full file, not just
// changed hunks (matching JetBrains' "History for Selection" diff).
const fullContext = "100000"

// DiffRefs returns hunks for filePath between two refs: a = before (older),
// b = after (newer). When a is empty the empty tree is used, so a file with no
// predecessor renders as fully added. Backs the selection-history diff.
func DiffRefs(repoPath, a, b, filePath string) ([]Hunk, error) {
	if a == "" {
		a = emptyTree
	}
	out, err := run(repoPath, "diff", "--unified="+fullContext, a, b, "--", filePath)
	if err != nil {
		return nil, err
	}
	return parseHunks(out), nil
}

func parseHunks(diff string) []Hunk {
	var hunks []Hunk
	var current *Hunk

	for _, line := range strings.Split(diff, "\n") {
		if strings.HasPrefix(line, "@@") {
			if current != nil {
				hunks = append(hunks, *current)
			}
			current = &Hunk{Header: line}
			continue
		}
		if current == nil {
			continue
		}
		if strings.HasPrefix(line, "+") {
			current.Lines = append(current.Lines, HunkLine{Type: "add", Content: line[1:]})
		} else if strings.HasPrefix(line, "-") {
			current.Lines = append(current.Lines, HunkLine{Type: "del", Content: line[1:]})
		} else if strings.HasPrefix(line, " ") {
			current.Lines = append(current.Lines, HunkLine{Type: "ctx", Content: line[1:]})
		}
	}
	if current != nil {
		hunks = append(hunks, *current)
	}
	return hunks
}
