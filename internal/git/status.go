package git

import (
	"strconv"
	"strings"
)

// FileStatus represents a single changed file from `git status --porcelain`.
type FileStatus struct {
	Path   string `json:"path"`
	Status string `json:"status"` // M | A | D | U | R
}

// StatusResult is the full snapshot returned by Status().
type StatusResult struct {
	Branch   string       `json:"branch"`
	Ahead    int          `json:"ahead"`
	Behind   int          `json:"behind"`
	Modified int          `json:"modified"`
	Files    []FileStatus `json:"files"`
}

// Status returns the current branch, ahead/behind counts, and changed files
// for the repository at repoPath.
func Status(repoPath string) (StatusResult, error) {
	var res StatusResult

	branch, err := run(repoPath, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return res, err
	}
	res.Branch = branch

	// Ahead/behind relative to upstream — non-fatal if no upstream is set.
	if ab, err := run(repoPath, "rev-list", "--left-right", "--count", "@{u}...HEAD"); err == nil {
		if parts := strings.Fields(ab); len(parts) == 2 {
			res.Behind, _ = strconv.Atoi(parts[0])
			res.Ahead, _ = strconv.Atoi(parts[1])
		}
	}

	// Parse working tree + index state in a single pass.
	// Untracked files (??) are included in Files but not in Modified count.
	out, err := run(repoPath, "status", "--porcelain")
	if err != nil {
		return res, err
	}

	for _, line := range strings.Split(out, "\n") {
		// Trim only trailing whitespace per line — never leading,
		// since the leading space is part of the XY status code (e.g. " M").
		line = strings.TrimRight(line, "\r\n")
		if len(line) < 4 {
			continue
		}

		xy := line[:2]  // two-character status code, e.g. "M ", " M", "??"

		// Porcelain v1 format is always: XY<SP>path
		// where XY is exactly 2 bytes and SP is exactly 1 space.
		// Guard: if char at index 2 is not a space, skip malformed line.
		if line[2] != ' ' {
			continue
		}
		raw := line[3:] // path (or "old -> new" for renames)

		// Renames are reported as "old -> new"; we only care about the new path.
		path := raw
		if idx := strings.Index(raw, " -> "); idx != -1 {
			path = raw[idx+4:]
		}

		status := resolveStatus(xy)
		if status == "" {
			continue
		}

		if status != "U" {
			res.Modified++
		}

		res.Files = append(res.Files, FileStatus{
			Path:   path,
			Status: status,
		})
	}

	return res, nil
}

// resolveStatus maps a porcelain XY code to a single status letter.
//
// Porcelain XY layout:
//
//	X = index (staged)
//	Y = worktree (unstaged)
//
// Priority: index change first, then worktree, then untracked.
func resolveStatus(xy string) string {
	if len(xy) < 2 {
		return ""
	}

	x, y := xy[0], xy[1]

	switch {
	case x == '?' && y == '?':
		return "U" // untracked
	case x == 'R' || y == 'R':
		return "R" // renamed
	case x == 'A':
		return "A" // added to index
	case x == 'D' || y == 'D':
		return "D" // deleted
	case x == 'M' || y == 'M':
		return "M" // modified
	case x == 'C' || y == 'C':
		return "C" // copied
	case x == 'T' || y == 'T':
		return "T" // type change
	default:
		return ""
	}
}
