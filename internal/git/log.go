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

// commitSep is the field separator used in our --format strings. ASCII unit
// separator (0x1f) never appears in commit metadata, so it parses unambiguously.
const commitSep = "\x1f"

// commitFormat is the --format value matching parseCommitLines's field order:
// hash, parents, author name, author date (ISO), subject, ref names.
var commitFormat = strings.Join([]string{"%H", "%P", "%an", "%aI", "%s", "%D"}, commitSep)

// parseCommitLines parses the output of `git log --format=commitFormat`.
// Shared by Log, LogFile, and LogLines.
func parseCommitLines(out string) []Commit {
	if out == "" {
		return []Commit{}
	}
	lines := strings.Split(out, "\n")
	commits := make([]Commit, 0, len(lines))
	for _, line := range lines {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, commitSep, 6)
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
	return commits
}

// LogFile returns all commits that touched the given file path or pattern.
//
// Three cases:
//  1. Path with directory separator (e.g. "webview/src/App.svelte"):
//     uses --follow to track renames across history.
//  2. Plain filename or extension with dot (e.g. "README.md", "DetailPane.svelte"):
//     prepends "**/" so git matches the name anywhere in the tree.
//  3. Explicit glob (contains * or ?): e.g. "*.md" becomes "**/*.md".
func LogFile(repoPath, filePath string) ([]Commit, error) {
	hasGlob := strings.ContainsAny(filePath, "*?")
	hasSlash := strings.ContainsAny(filePath, "/\\")

	var args []string
	if hasSlash && !hasGlob {
		// Exact path — use --follow to track renames
		args = []string{
			"log", "--all", "--topo-order",
			"--format=" + commitFormat, "--date=iso-strict",
			"--follow", "--", filePath,
		}
	} else {
		// Filename or glob — match anywhere in the tree via **/ prefix
		pattern := filePath
		if !hasGlob {
			pattern = "**/" + filePath
		} else if !hasSlash {
			pattern = "**/" + filePath
		}
		args = []string{
			"log", "--all", "--topo-order",
			"--format=" + commitFormat, "--date=iso-strict",
			"--", pattern,
		}
	}

	out, err := run(repoPath, args...)
	if err != nil {
		return nil, err
	}
	return parseCommitLines(out), nil
}

// LogLines returns the commits that changed lines [start,end] of filePath,
// in HEAD's history. Backs the "History for Selection" feature.
//
// Uses `git log -L<start>,<end>:<file>` with -s to suppress the patch, so the
// output is the same field-separated commit format parseCommitLines expects.
// filePath must be repo-relative; -L does not accept --all or a pathspec.
func LogLines(repoPath, filePath string, start, end int) ([]Commit, error) {
	lineSpec := "-L" + strconv.Itoa(start) + "," + strconv.Itoa(end) + ":" + filePath
	out, err := run(repoPath,
		"log", lineSpec, "-s",
		"--format="+commitFormat, "--date=iso-strict",
	)
	if err != nil {
		return nil, err
	}
	return parseCommitLines(out), nil
}
func Log(repoPath, branch string, limit int) ([]Commit, error) {
	args := []string{
		"log",
		"--topo-order",
		"--format=" + commitFormat,
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
	return parseCommitLines(out), nil
}
