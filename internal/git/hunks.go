package git

import (
	"fmt"
	"strconv"
	"strings"
)

// Hunk staging: each working-tree hunk is returned with its raw patch text
// (file header + hunk, verbatim from git — never reconstructed), and staging
// one is `git apply --cached` of that patch. The UI treats Patch as opaque and
// feeds it straight back, so we can't corrupt what git produced. If the index
// moved since the diff was rendered, git refuses the patch ("does not apply")
// and the UI refreshes — stale hunks can never half-apply.

// WorkingHunkLine is one display line of a hunk. (diff.go owns the plain
// HunkLine used by commit diffs — that one has no line numbers.)
type WorkingHunkLine struct {
	Kind string `json:"kind"`          // ctx | add | del
	Old  int    `json:"old,omitempty"` // 1-based line number on the old side (0 for adds)
	New  int    `json:"new,omitempty"` // 1-based line number on the new side (0 for dels)
	Text string `json:"text"`          // line content without the +/-/space marker
}

// WorkingHunk is one hunk of a working-tree diff.
type WorkingHunk struct {
	Header string            `json:"header"` // "@@ -3,6 +3,8 @@ <section>"
	Lines  []WorkingHunkLine `json:"lines"`
	Patch  string            `json:"patch"` // file header + this hunk, ready for hunk.stage/unstage/discard
}

// WorkingDiff returns the hunks of one file's uncommitted diff. cached=false is
// the Changes section (index ↔ worktree, `git diff`); cached=true the Staged
// Changes section (HEAD ↔ index, `git diff --cached`). Binary files and
// untracked files yield no hunks (whole-file staging covers those).
func WorkingDiff(repoPath, file string, cached bool) ([]WorkingHunk, error) {
	args := []string{"diff", "--no-color", "--no-ext-diff"}
	if cached {
		args = append(args, "--cached")
	}
	args = append(args, "--", file)
	out, err := run(repoPath, args...)
	if err != nil {
		return nil, err
	}
	return parseWorkingDiff(out), nil
}

// parseWorkingDiff splits one file's unified diff into hunks, keeping the
// file-header block to prefix every hunk's standalone patch.
func parseWorkingDiff(out string) []WorkingHunk {
	hunks := []WorkingHunk{}
	if strings.TrimSpace(out) == "" {
		return hunks
	}

	lines := strings.Split(out, "\n")

	// Everything before the first @@ is the file header (diff --git, index,
	// ---/+++, mode lines). "Binary files … differ" diffs never reach a @@.
	headerEnd := -1
	for i, l := range lines {
		if strings.HasPrefix(l, "@@ ") {
			headerEnd = i
			break
		}
	}
	if headerEnd == -1 {
		return hunks // binary or empty — nothing hunk-stageable
	}
	fileHeader := strings.Join(lines[:headerEnd], "\n")

	var cur *WorkingHunk
	var patchLines []string
	oldNo, newNo := 0, 0

	flush := func() {
		if cur == nil {
			return
		}
		// A patch must end with a newline or git rejects it as truncated.
		cur.Patch = fileHeader + "\n" + strings.Join(patchLines, "\n") + "\n"
		hunks = append(hunks, *cur)
		cur = nil
	}

	for _, l := range lines[headerEnd:] {
		if strings.HasPrefix(l, "@@ ") {
			flush()
			cur = &WorkingHunk{Header: l, Lines: []WorkingHunkLine{}}
			patchLines = []string{l}
			oldNo, newNo = parseHunkStart(l)
			continue
		}
		if cur == nil || l == "" {
			continue
		}
		patchLines = append(patchLines, l)
		switch l[0] {
		case '+':
			cur.Lines = append(cur.Lines, WorkingHunkLine{Kind: "add", New: newNo, Text: l[1:]})
			newNo++
		case '-':
			cur.Lines = append(cur.Lines, WorkingHunkLine{Kind: "del", Old: oldNo, Text: l[1:]})
			oldNo++
		case ' ':
			cur.Lines = append(cur.Lines, WorkingHunkLine{Kind: "ctx", Old: oldNo, New: newNo, Text: l[1:]})
			oldNo++
			newNo++
			// "\ No newline at end of file" stays in the patch (git needs it)
			// but isn't a display line.
		}
	}
	flush()
	return hunks
}

// parseHunkStart extracts the starting old/new line numbers from
// "@@ -<old>[,n] +<new>[,m] @@ …".
func parseHunkStart(header string) (oldStart, newStart int) {
	fields := strings.Fields(header)
	for _, f := range fields {
		if len(f) < 2 {
			continue
		}
		numPart, _, _ := strings.Cut(f[1:], ",")
		n, err := strconv.Atoi(numPart)
		if err != nil {
			continue
		}
		switch f[0] {
		case '-':
			oldStart = n
		case '+':
			newStart = n
			return
		}
	}
	return
}

// StageHunk applies one hunk's patch to the index only.
func StageHunk(repoPath, patch string) error {
	return applyHunk(repoPath, patch, "--cached")
}

// UnstageHunk reverses one hunk out of the index, leaving the worktree alone.
func UnstageHunk(repoPath, patch string) error {
	return applyHunk(repoPath, patch, "--cached", "-R")
}

// DiscardHunk reverses one hunk out of the working tree. The IPC layer
// auto-snapshots before this runs, like every discard.
func DiscardHunk(repoPath, patch string) error {
	return applyHunk(repoPath, patch, "-R")
}

func applyHunk(repoPath, patch string, flags ...string) error {
	if strings.TrimSpace(patch) == "" {
		return fmt.Errorf("empty patch")
	}
	args := append([]string{"apply", "--whitespace=nowarn"}, flags...)
	args = append(args, "-")
	_, err := runStdin(repoPath, []byte(patch), args...)
	return err
}
