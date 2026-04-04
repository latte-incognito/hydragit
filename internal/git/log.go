package git

import (
	"strconv"
	"strings"
	"time"
)

type Commit struct {
	Hash    string   `json:"hash"`
	Parents []string `json:"parents"`
	Author  string   `json:"author"`
	Date    string   `json:"date"`
	Message string   `json:"message"`
	Refs    []string `json:"refs"`
}

// LogFile returns all commits that touched the given file path or pattern.
//
// Exact paths (no wildcards, has extension dot): uses --follow to track renames.
// Partial names / globs (e.g. "DetailPane", "*.md", "*.go"): uses --all with
// git's built-in glob matching via the pathspec magic prefix :(glob).
func LogFile(repoPath, filePath string) ([]Commit, error) {
	sep := "\x1f"
	format := strings.Join([]string{"%H", "%P", "%an", "%aI", "%s", "%D"}, sep)

	// Detect whether this looks like a glob/partial pattern.
	// Treat it as a glob if it contains * or ? or has no path separator and no dot
	// (e.g. "DetailPane" → partial name match across all extensions).
	isGlob := strings.ContainsAny(filePath, "*?") ||
		(!strings.Contains(filePath, "/") && !strings.Contains(filePath, "."))

	var args []string
	if isGlob {
		// Glob / partial: no --follow (incompatible), search all history,
		// wrap in :(glob)*pattern* so git matches anywhere in the path.
		pattern := filePath
		if !strings.ContainsAny(filePath, "*?") {
			// Plain partial name like "DetailPane" → match anywhere in path
			pattern = "*" + filePath + "*"
		}
		args = []string{
			"log",
			"--all",
			"--topo-order",
			"--format=" + format,
			"--date=iso-strict",
			"--",
			":(glob)" + pattern,
		}
	} else {
		// Exact path: use --follow to track renames across history.
		args = []string{
			"log",
			"--topo-order",
			"--follow",
			"--format=" + format,
			"--date=iso-strict",
			"--",
			filePath,
		}
	}

	out, err := run(repoPath, args...)
	if err != nil {
		return nil, err
	}
	if out == "" {
		return []Commit{}, nil
	}

	lines := strings.Split(out, "\n")
	commits := make([]Commit, 0, len(lines))
	for _, line := range lines {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, sep, 6)
		if len(parts) < 6 {
			continue
		}
		c := Commit{
			Hash:    parts[0],
			Author:  parts[2],
			Message: parts[4],
		}
		if t, err := time.Parse(time.RFC3339, parts[3]); err == nil {
			c.Date = t.UTC().Format(time.RFC3339)
		} else {
			c.Date = parts[3]
		}
		if parts[1] != "" {
			c.Parents = strings.Fields(parts[1])
		}
		if parts[5] != "" {
			for _, ref := range strings.Split(parts[5], ",") {
				if r := strings.TrimSpace(ref); r != "" {
					c.Refs = append(c.Refs, r)
				}
			}
		}
		commits = append(commits, c)
	}
	return commits, nil
}
func Log(repoPath, branch string, limit int) ([]Commit, error) {
	sep := "\x1f"
	format := strings.Join([]string{"%H", "%P", "%an", "%aI", "%s", "%D"}, sep)

	args := []string{
		"log",
		"--topo-order", // ← add this
		"--format=" + format,
		"--date=iso-strict",
	}
	if limit > 0 {
		args = append(args, "--max-count="+strconv.Itoa(limit))
	}
	if branch != "" {
		args = append(args, branch)
	} else {
		args = append(args, "--all")
	}

	out, err := run(repoPath, args...)
	if err != nil {
		return nil, err
	}
	if out == "" {
		return []Commit{}, nil
	}

	lines := strings.Split(out, "\n")
	commits := make([]Commit, 0, len(lines))
	for _, line := range lines {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, sep, 6)
		if len(parts) < 6 {
			continue
		}
		c := Commit{
			Hash:    parts[0],
			Author:  parts[2],
			Message: parts[4],
		}
		// parse date
		if t, err := time.Parse(time.RFC3339, parts[3]); err == nil {
			c.Date = t.UTC().Format(time.RFC3339)
		} else {
			c.Date = parts[3]
		}
		// parents
		if parts[1] != "" {
			c.Parents = strings.Fields(parts[1])
		}
		// refs
		if parts[5] != "" {
			for _, ref := range strings.Split(parts[5], ",") {
				r := strings.TrimSpace(ref)
				if r != "" {
					c.Refs = append(c.Refs, r)
				}
			}
		}
		commits = append(commits, c)
	}
	return commits, nil
}
