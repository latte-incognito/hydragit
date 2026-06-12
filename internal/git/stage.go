package git

import "fmt"

// Real-index staging: the sidebar checkboxes drive `git add` / `git restore
// --staged` directly (VS Code SCM semantics), so checking a file freezes its
// content in the index — later edits show up as a second, unstaged change and
// the commit takes the frozen snapshot.

// Stage adds the given paths to the index. Works for modifications, deletions
// (git add stages the removal) and untracked files alike.
func Stage(repoPath string, paths []string) error {
	if len(paths) == 0 {
		return fmt.Errorf("no paths to stage")
	}
	_, err := run(repoPath, append([]string{"add", "--"}, paths...)...)
	return err
}

// Unstage removes the given paths from the index, leaving the working tree
// untouched. On an unborn branch (no HEAD) `restore --staged` has no source to
// restore from, so the unstage is `rm --cached` instead.
func Unstage(repoPath string, paths []string) error {
	if len(paths) == 0 {
		return fmt.Errorf("no paths to unstage")
	}
	if _, err := run(repoPath, "rev-parse", "HEAD"); err != nil {
		_, err := run(repoPath, append([]string{"rm", "-r", "--cached", "--ignore-unmatch", "--"}, paths...)...)
		return err
	}
	_, err := run(repoPath, append([]string{"restore", "--staged", "--"}, paths...)...)
	return err
}
