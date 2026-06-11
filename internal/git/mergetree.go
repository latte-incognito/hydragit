package git

import "strings"

// MergePreview is the result of a dry-run merge — computed entirely in the
// object database via `git merge-tree --write-tree`, with the index and
// working tree untouched.
type MergePreview struct {
	Clean bool     `json:"clean"`
	Files []string `json:"files"` // conflicted paths; empty when Clean
}

// PreviewMerge answers "would merging `theirs` into `ours` conflict?" without
// performing the merge. Requires git >= 2.38 (merge-tree --write-tree); on
// older git the command fails with an unknown-option error, which callers
// surface as "preview unavailable" and degrade to a plain confirm.
//
// Output format (verified against git 2.39):
//
//	<OID of the merged tree>
//	<conflicted filename>           ← only with --name-only, only on conflict
//	...
//	<blank line + informational messages>
//
// Exit status: 0 = clean merge, 1 = conflicts. Both are answers, not errors.
func PreviewMerge(repoPath, ours, theirs string) (*MergePreview, error) {
	// merge-tree exits 1 both for "conflicts" and for "not something we can
	// merge" (verified against git 2.39) — validate the refs up front so a bad
	// ref is an error, not a bogus conflict prediction.
	for _, ref := range []string{ours, theirs} {
		if _, err := run(repoPath, "rev-parse", "--verify", ref+"^{commit}"); err != nil {
			return nil, err
		}
	}
	out, code, err := runExitCode(repoPath, "merge-tree", "--write-tree", "--name-only", ours, theirs)
	if err != nil {
		return nil, err
	}
	if code == 0 {
		return &MergePreview{Clean: true, Files: []string{}}, nil
	}

	// Conflict: skip the tree OID on line 1, collect filenames until the blank
	// line that starts the informational-message section.
	files := []string{}
	lines := strings.Split(out, "\n")
	for i := 1; i < len(lines); i++ {
		line := lines[i]
		if line == "" {
			break
		}
		files = append(files, line)
	}
	return &MergePreview{Clean: false, Files: files}, nil
}
