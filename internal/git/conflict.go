package git

import (
	"os"
	"path/filepath"
	"strings"
)

// ConflictInfo describes an in-progress conflicted operation — the data behind
// the sidebar's conflict-resolution guidance.
type ConflictInfo struct {
	Operation string   `json:"operation"` // "merge" | "rebase" | "cherry-pick" | "revert" | ""
	Files     []string `json:"files"`     // unmerged (conflicted) paths
}

// Conflicts reports the current conflict state: which operation is mid-flight
// (if any) and the unmerged files that still need resolving.
func Conflicts(repoPath string) (ConflictInfo, error) {
	info := ConflictInfo{Files: []string{}}

	out, err := run(repoPath, "diff", "--name-only", "--diff-filter=U")
	if err != nil {
		return info, err
	}
	for _, f := range strings.Split(out, "\n") {
		if f != "" {
			info.Files = append(info.Files, f)
		}
	}

	info.Operation = conflictOperation(repoPath)
	return info, nil
}

// conflictOperation detects which (if any) history operation is paused, by
// looking for git's in-progress state files.
func conflictOperation(repoPath string) string {
	if RebaseInProgress(repoPath) {
		return "rebase"
	}
	for path, op := range map[string]string{
		"MERGE_HEAD":       "merge",
		"CHERRY_PICK_HEAD": "cherry-pick",
		"REVERT_HEAD":      "revert",
	} {
		if gitPathExists(repoPath, path) {
			return op
		}
	}
	return ""
}

func gitPathExists(repoPath, name string) bool {
	p, err := run(repoPath, "rev-parse", "--git-path", name)
	if err != nil || p == "" {
		return false
	}
	if !filepath.IsAbs(p) {
		p = filepath.Join(repoPath, p)
	}
	_, err = os.Stat(p)
	return err == nil
}

// KeepCurrent resolves a conflicted file by taking HEAD's version (git --ours)
// and staging it. "Current" is correct for both merge and rebase: during any
// conflict, HEAD is the side you're on.
func KeepCurrent(repoPath, file string) error {
	if _, err := run(repoPath, "checkout", "--ours", "--", file); err != nil {
		return err
	}
	_, err := run(repoPath, "add", "--", file)
	return err
}

// KeepIncoming resolves a conflicted file by taking the incoming version
// (git --theirs) and staging it.
func KeepIncoming(repoPath, file string) error {
	if _, err := run(repoPath, "checkout", "--theirs", "--", file); err != nil {
		return err
	}
	_, err := run(repoPath, "add", "--", file)
	return err
}

// MarkResolved stages a file the user resolved by hand (e.g. in the merge
// editor), clearing its unmerged state.
func MarkResolved(repoPath, file string) error {
	_, err := run(repoPath, "add", "--", file)
	return err
}

// mergeContinue finalizes a merge once conflicts are resolved (uses the prepared
// MERGE_MSG, no editor). Rebase/cherry-pick use their own continue.
func mergeContinue(repoPath string) error {
	_, err := runEnv(repoPath, noEditorEnv, "commit", "--no-edit")
	return err
}

// mergeAbort restores the pre-merge state.
func mergeAbort(repoPath string) error {
	_, err := run(repoPath, "merge", "--abort")
	return err
}

// ContinueConflict finishes the in-progress operation once conflicts are
// resolved. Rebase needs `rebase --continue`; merge/cherry-pick/revert are
// completed by committing the staged result. Returns conflict=true if a rebase
// stopped again on a later conflict.
func ContinueConflict(repoPath, op string) (conflict bool, err error) {
	if op == "rebase" {
		return RebaseContinue(repoPath)
	}
	return false, mergeContinue(repoPath)
}

// AbortConflict cancels the in-progress operation, restoring the prior state.
func AbortConflict(repoPath, op string) error {
	switch op {
	case "rebase":
		return RebaseAbort(repoPath)
	case "merge":
		return mergeAbort(repoPath)
	case "cherry-pick":
		_, err := run(repoPath, "cherry-pick", "--abort")
		return err
	case "revert":
		_, err := run(repoPath, "revert", "--abort")
		return err
	}
	return nil
}
