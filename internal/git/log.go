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
	// Unpushed marks a commit not reachable from any remote-tracking ref —
	// it exists only locally. The webview hides "view on remote" for these.
	Unpushed bool `json:"unpushed,omitempty"`
}

// markUnpushed sets Unpushed on every commit not reachable from any
// remote-tracking ref. A single rev-list walks the local refs and stops at the
// remote frontier, so the cost scales with the number of unpushed commits,
// not history size. With no remotes every commit is (correctly) unpushed.
// Best-effort: on error commits stay marked as pushed.
func markUnpushed(repoPath string, commits []Commit) {
	out, err := run(repoPath, "rev-list", "--all", "--not", "--remotes")
	if err != nil || out == "" {
		return
	}
	unpushed := make(map[string]bool)
	for _, h := range strings.Fields(out) {
		unpushed[h] = true
	}
	for i := range commits {
		if unpushed[commits[i].Hash] {
			commits[i].Unpushed = true
		}
	}
}

// commitSep is the field separator used in our --format strings. ASCII unit
// separator (0x1f) never appears in commit metadata, so it parses unambiguously.
const commitSep = "\x1f"

// commitFormat is the --format value matching parseCommitLines's field order:
// hash, parents, author name, author date (ISO), subject, ref names.
var commitFormat = strings.Join([]string{"%H", "%P", "%an", "%aI", "%s", "%D"}, commitSep)

// parseCommitLines parses the output of `git log --format=commitFormat`.
// Shared by logCommits, LogFile, and LineHistory.
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
		// Filename or glob — match at ANY depth, INCLUDING the repo root. A plain
		// "**/" pathspec misses root-level files entirely (BUG #1: a bare "**/x"
		// requires at least one leading directory), so use a :(glob) magic
		// pathspec where ** spans directory separators and matches zero or more.
		pattern := filePath
		if !hasSlash {
			pattern = "**/" + filePath
		}
		args = []string{
			"log", "--all", "--topo-order",
			"--format=" + commitFormat, "--date=iso-strict",
			"--", ":(glob)" + pattern,
		}
	}

	out, err := run(repoPath, args...)
	if err != nil {
		return nil, err
	}
	commits := parseCommitLines(out)
	markUnpushed(repoPath, commits)
	return commits, nil
}

// FileHistory returns the commits reachable from ref that touched filePath,
// following the file across renames. Backs the "File History" feature.
//
// filePath must be repo-relative and is passed as an exact pathspec (no glob),
// so it matches root-level files correctly — unlike LogFile's "**/" search
// heuristic. ref defaults to HEAD ("the current branch's history").
func FileHistory(repoPath, ref, filePath string) ([]Commit, error) {
	if ref == "" {
		ref = "HEAD"
	}
	out, err := run(repoPath,
		"log", ref, "--topo-order", "--follow",
		"--format="+commitFormat, "--date=iso-strict",
		"--", filePath,
	)
	if err != nil {
		return nil, err
	}
	return parseCommitLines(out), nil
}

// LineCommit is a commit together with the diff hunks scoped to a tracked line
// range — i.e. how that commit changed exactly the selected lines.
type LineCommit struct {
	Commit
	Hunks []Hunk `json:"hunks"`
}

// LineHistory returns, for each commit that changed lines [start,end] of
// filePath, the commit metadata plus the diff of just those tracked lines.
// Backs the "History for Selection" diff so it shows changes scoped to the
// selection, not the whole file.
//
// `git log -L<s>,<e>:<file>` emits, per commit, the metadata line followed by a
// patch covering only the tracked range. A leading NUL (%x00) marks each
// commit boundary so we can split metadata from patch reliably (NUL never
// appears in git output otherwise).
func LineHistory(repoPath, filePath string, start, end int) ([]LineCommit, error) {
	lineSpec := "-L" + strconv.Itoa(start) + "," + strconv.Itoa(end) + ":" + filePath
	out, err := run(repoPath,
		"log", lineSpec,
		"--format=%x00"+commitFormat, "--date=iso-strict",
	)
	if err != nil {
		return nil, err
	}

	result := []LineCommit{}
	for _, chunk := range strings.Split(out, "\x00") {
		if chunk == "" {
			continue
		}
		nl := strings.IndexByte(chunk, '\n')
		if nl < 0 {
			continue
		}
		commits := parseCommitLines(chunk[:nl])
		if len(commits) == 0 {
			continue
		}
		result = append(result, LineCommit{
			Commit: commits[0],
			Hunks:  parseHunks(chunk[nl+1:]),
		})
	}
	return result, nil
}

// LogOptions controls which commits Log returns. Zero values mean "no filter".
type LogOptions struct {
	Branch  string // a branch/ref, or "" for --all
	Limit   int    // max commits, or 0 for no limit
	Grep    string // filter by commit message (case-insensitive)
	Author  string // filter by author (case-insensitive)
	Pickaxe string // filter by content change: commits that add/remove this string (git log -S)
}

// LogWith returns the commit log filtered by opt. Grep/Author combine with AND
// (commits matching both), matching git's default behaviour.
func LogWith(repoPath string, opt LogOptions) ([]Commit, error) {
	args := []string{
		"log",
		"--topo-order",
		"--format=" + commitFormat,
		"--date=iso-strict",
	}
	if opt.Grep != "" || opt.Author != "" {
		args = append(args, "--regexp-ignore-case")
	}
	if opt.Grep != "" {
		args = append(args, "--grep="+opt.Grep)
	}
	if opt.Author != "" {
		args = append(args, "--author="+opt.Author)
	}
	if opt.Pickaxe != "" {
		// Pickaxe: commits where the *number of occurrences* of the string
		// changed — i.e. where it was introduced or removed.
		args = append(args, "-S", opt.Pickaxe)
	}
	if opt.Limit > 0 {
		args = append(args, "--max-count="+strconv.Itoa(opt.Limit))
	}
	if opt.Branch != "" {
		args = append(args, opt.Branch)
	} else {
		args = append(args, "--all")
	}

	out, err := run(repoPath, args...)
	if err != nil {
		return nil, err
	}
	commits := parseCommitLines(out)
	markUnpushed(repoPath, commits)
	return commits, nil
}

// logCommits is the unfiltered convenience wrapper around LogWith (current
// branch, no filters). It is test-only: production routes the "log" IPC command
// through LogWith directly.
func logCommits(repoPath string, limit int) ([]Commit, error) {
	return LogWith(repoPath, LogOptions{Limit: limit})
}
