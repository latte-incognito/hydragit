package git

import (
	"strconv"
	"strings"
)

type FileStat struct {
	Path      string `json:"path"`
	Status    string `json:"status"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
}

type Hunk struct {
	Header  string     `json:"header"`
	Lines   []HunkLine `json:"lines"`
}

type HunkLine struct {
	Type    string `json:"type"` // "add", "del", "ctx"
	Content string `json:"content"`
}

type DiffResult struct {
	Files []FileStat `json:"files"`
	Hunks []Hunk     `json:"hunks"`
}

// DiffCommit returns file stats for a commit.
func DiffCommit(repoPath, commit string) ([]FileStat, error) {
	out, err := run(repoPath, "diff-tree", "--no-commit-id", "-r", "--numstat", commit)
	if err != nil {
		return nil, err
	}
	if out == "" {
		return []FileStat{}, nil
	}

	var files []FileStat
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 3 {
			continue
		}
		add, _ := strconv.Atoi(parts[0])
		del, _ := strconv.Atoi(parts[1])
		files = append(files, FileStat{
			Path:      parts[2],
			Status:    "M",
			Additions: add,
			Deletions: del,
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
