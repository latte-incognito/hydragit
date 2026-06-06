package git

import "fmt"

// UndoResult describes what UndoLast did, so the UI can report it precisely.
type UndoResult struct {
	Action  string `json:"action"`  // human-readable description of what was undone
	Stashed bool   `json:"stashed"` // true if a dirty tree was auto-stashed first
}

// UndoLast is the "undo last operation" express lane (ideas.md). If an operation
// is paused mid-flight (rebase/merge/cherry-pick/revert), it aborts that.
// Otherwise it rewinds the branch to ORIG_HEAD — the ref git writes before a
// merge/rebase/reset/pull rewrites HEAD — auto-stashing a dirty tree first so no
// work is lost. Returns an error when there is nothing to undo.
func UndoLast(repoPath string) (UndoResult, error) {
	if op := conflictOperation(repoPath); op != "" {
		if err := AbortConflict(repoPath, op); err != nil {
			return UndoResult{}, err
		}
		return UndoResult{Action: "aborted " + op}, nil
	}

	// ORIG_HEAD only exists if the last command moved HEAD (merge/rebase/reset/
	// pull). No ORIG_HEAD → nothing this express lane can safely undo.
	if _, err := run(repoPath, "rev-parse", "--verify", "--quiet", "ORIG_HEAD"); err != nil {
		return UndoResult{}, fmt.Errorf("nothing to undo — the last action didn't move HEAD")
	}

	stashed, err := ResetWithAutostash(repoPath, "ORIG_HEAD", "hard")
	if err != nil {
		return UndoResult{}, err
	}
	return UndoResult{Action: "restored to the state before the last operation", Stashed: stashed}, nil
}
