package git

import (
	"strconv"
	"strings"
	"time"
)

type StatusResult struct {
	Branch   string `json:"branch"`
	Ahead    int    `json:"ahead"`
	Behind   int    `json:"behind"`
	Modified int    `json:"modified"`
}

type Commit struct {
	Hash    string   `json:"hash"`
	Parents []string `json:"parents"`
	Author  string   `json:"author"`
	Date    string   `json:"date"`
	Message string   `json:"message"`
	Refs    []string `json:"refs"`
}

func Status(repoPath string) (StatusResult, error) {
	var res StatusResult

	branch, err := run(repoPath, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return res, err
	}
	res.Branch = branch

	// ahead/behind vs upstream
	ab, err := run(repoPath, "rev-list", "--left-right", "--count", "@{u}...HEAD")
	if err == nil {
		parts := strings.Fields(ab)
		if len(parts) == 2 {
			res.Behind, _ = strconv.Atoi(parts[0])
			res.Ahead, _ = strconv.Atoi(parts[1])
		}
	}

	// modified count (working tree + index, exclude untracked)
	out, err := run(repoPath, "status", "--porcelain")
	if err != nil {
		return res, err
	}
	if out != "" {
		res.Modified = len(strings.Split(strings.TrimRight(out, "\n"), "\n"))
	}

	return res, nil
}

// Log returns up to limit commits on the given branch (all branches if branch=="").
func Log(repoPath, branch string, limit int) ([]Commit, error) {
	sep := "\x1f"
	format := strings.Join([]string{"%H", "%P", "%an", "%aI", "%s", "%D"}, sep)

	args := []string{
		"log",
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
