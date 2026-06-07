package git

import (
	"strings"
)

// Worktree is one entry from `git worktree list --porcelain`. The first entry
// returned by Worktrees is always the main working tree (IsMain).
type Worktree struct {
	Path        string `json:"path"`
	Head        string `json:"head"`   // commit hash, "" for a bare main worktree
	Branch      string `json:"branch"` // short branch name, "" if detached/bare
	IsMain      bool   `json:"isMain"`
	Detached    bool   `json:"detached"`
	Bare        bool   `json:"bare"`
	Locked      bool   `json:"locked"`
	LockReason  string `json:"lockReason,omitempty"`
	Prunable    bool   `json:"prunable"`
	PruneReason string `json:"pruneReason,omitempty"`
}

// Worktrees lists every working tree attached to the repo. The first entry is
// always the main working tree.
func Worktrees(repoPath string) ([]Worktree, error) {
	out, err := run(repoPath, "worktree", "list", "--porcelain")
	if err != nil {
		return nil, err
	}
	return parseWorktrees(out), nil
}

// parseWorktrees turns `git worktree list --porcelain` output into structs.
// Records are separated by blank lines; each line is "key value" or a bare
// "key" (bare/detached), with locked/prunable optionally carrying a reason.
func parseWorktrees(out string) []Worktree {
	trees := []Worktree{}
	var cur *Worktree
	flush := func() {
		if cur != nil {
			trees = append(trees, *cur)
			cur = nil
		}
	}
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimRight(line, "\r")
		if line == "" {
			flush()
			continue
		}
		key, val, _ := strings.Cut(line, " ")
		switch key {
		case "worktree":
			flush()
			cur = &Worktree{Path: val, IsMain: len(trees) == 0}
		case "HEAD":
			if cur != nil {
				cur.Head = val
			}
		case "branch":
			if cur != nil {
				cur.Branch = strings.TrimPrefix(val, "refs/heads/")
			}
		case "detached":
			if cur != nil {
				cur.Detached = true
			}
		case "bare":
			if cur != nil {
				cur.Bare = true
			}
		case "locked":
			if cur != nil {
				cur.Locked = true
				cur.LockReason = val
			}
		case "prunable":
			if cur != nil {
				cur.Prunable = true
				cur.PruneReason = val
			}
		}
	}
	flush()
	return trees
}

// WorktreeAdd checks out an existing branch into a new working tree at path.
func WorktreeAdd(repoPath, path, branch string) error {
	_, err := run(repoPath, "worktree", "add", path, branch)
	return err
}

// WorktreeAddNew creates a new branch (from start, or HEAD if start is empty)
// and checks it out into a new working tree at path.
func WorktreeAddNew(repoPath, path, newBranch, start string) error {
	args := []string{"worktree", "add", "-b", newBranch, path}
	if start != "" {
		args = append(args, start)
	}
	_, err := run(repoPath, args...)
	return err
}

// WorktreeRemove removes the working tree at path. force allows removal of a
// tree with uncommitted or untracked changes (git refuses otherwise).
func WorktreeRemove(repoPath, path string, force bool) error {
	args := []string{"worktree", "remove"}
	if force {
		args = append(args, "--force")
	}
	args = append(args, path)
	_, err := run(repoPath, args...)
	return err
}

// WorktreeLock marks a working tree as locked so prune/automated cleanup won't
// touch it. reason is optional, surfaced back in the list.
func WorktreeLock(repoPath, path, reason string) error {
	args := []string{"worktree", "lock"}
	if reason != "" {
		args = append(args, "--reason", reason)
	}
	args = append(args, path)
	_, err := run(repoPath, args...)
	return err
}

// WorktreeUnlock clears a lock set by WorktreeLock.
func WorktreeUnlock(repoPath, path string) error {
	_, err := run(repoPath, "worktree", "unlock", path)
	return err
}

// WorktreeMove relocates a working tree's directory from one path to another.
func WorktreeMove(repoPath, from, to string) error {
	_, err := run(repoPath, "worktree", "move", from, to)
	return err
}

// WorktreePrune removes administrative entries for working trees whose
// directories have been deleted from disk.
func WorktreePrune(repoPath string) error {
	_, err := run(repoPath, "worktree", "prune")
	return err
}
