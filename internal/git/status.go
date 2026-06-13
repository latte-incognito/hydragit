package git

import (
	"strconv"
	"strings"
)

// FileStatus represents a single changed file from `git status --porcelain`.
// Status is the combined one-letter summary; IndexStatus/WorkStatus split it
// into the real index (staged) and working-tree sides, so a file edited after
// staging (porcelain "MM") can appear in both sidebar sections.
type FileStatus struct {
	Path        string `json:"path"`
	Status      string `json:"status"`                // M | A | D | U | R | C | T | ! (conflict)
	IndexStatus string `json:"indexStatus,omitempty"` // staged side (X column): M A D R C T
	WorkStatus  string `json:"workStatus,omitempty"`  // working-tree side (Y column): M D T; U untracked; ! conflict
	OldPath     string `json:"oldPath,omitempty"`     // rename/copy source for staged renames
}

// StatusResult is the full snapshot returned by Status().
type StatusResult struct {
	Branch      string       `json:"branch"`
	Ahead       int          `json:"ahead"`
	Behind      int          `json:"behind"`
	Modified    int          `json:"modified"`
	HasUpstream bool         `json:"hasUpstream"`
	Detached    bool         `json:"detached"` // true when HEAD is not on a branch
	Files       []FileStatus `json:"files"`
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
	// `rev-parse --abbrev-ref HEAD` yields the literal "HEAD" when detached.
	res.Detached = branch == "HEAD"

	// Ahead/behind relative to upstream — non-fatal if no upstream is set.
	if ab, err := run(repoPath, "rev-list", "--left-right", "--count", "@{u}...HEAD"); err == nil {
		res.HasUpstream = true
		if parts := strings.Fields(ab); len(parts) == 2 {
			res.Behind, _ = strconv.Atoi(parts[0])
			res.Ahead, _ = strconv.Atoi(parts[1])
		}
	}

	// Parse working tree + index state in a single pass.
	// Untracked files (??) are included in Files but not in Modified count.
	out, err := run(repoPath, "status", "--porcelain", "-u")
	if err != nil {
		return res, err
	}

	for line := range strings.SplitSeq(out, "\n") {
		// Trim only trailing whitespace per line — never leading,
		// since the leading space is part of the XY status code (e.g. " M").
		line = strings.TrimRight(line, "\r\n")
		if len(line) < 4 {
			continue
		}

		xy := line[:2] // two-character status code, e.g. "M ", " M", "??"

		// Porcelain v1 format is always: XY<SP>path
		// where XY is exactly 2 bytes and SP is exactly 1 space.
		// Guard: if char at index 2 is not a space, skip malformed line.
		if line[2] != ' ' {
			continue
		}
		raw := line[3:] // path (or "old -> new" for renames)

		// Renames are reported as "old -> new"; the new path is the file's
		// identity, the old one is kept for display.
		path, oldPath := raw, ""
		if old, renamed, ok := strings.Cut(raw, " -> "); ok {
			oldPath = old
			path = renamed
		}

		status := resolveStatus(xy)
		if status == "" {
			continue
		}

		if status != "U" {
			res.Modified++
		}

		fs := FileStatus{Path: path, Status: status, OldPath: oldPath}
		switch status {
		case "!":
			fs.WorkStatus = "!" // conflicts live with the working-tree changes
		case "U":
			fs.WorkStatus = "U"
		default:
			if x := xy[0]; x != ' ' {
				fs.IndexStatus = string(x)
			}
			if y := xy[1]; y != ' ' {
				fs.WorkStatus = string(y)
			}
		}
		res.Files = append(res.Files, fs)
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
	// Unmerged (conflict) codes must be checked first: git reports them as
	// UU/AA/DD/AU/UA/DU/UD. Without this, UU falls through to "" (file dropped)
	// and AA/DD get mislabeled as a plain add/delete. See BUG #19.
	case x == 'U' || y == 'U' || (x == 'A' && y == 'A') || (x == 'D' && y == 'D'):
		return "!" // unmerged / conflict
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
