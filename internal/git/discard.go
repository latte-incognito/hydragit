package git

import (
	"fmt"
	"strings"
)

// Discard throws away local changes for the given paths, restoring tracked
// files from HEAD and deleting files that HEAD doesn't know about (untracked,
// newly added, rename targets). The IPC layer auto-snapshots before this runs,
// so every discard is recoverable from refs/hydragit/snapshots.
//
// Conflicted paths are refused — resolving or aborting the in-progress
// operation is the right tool there, and a blind checkout would silently
// destroy conflict markers the user may be mid-way through editing.
func Discard(repoPath string, paths []string) error {
	if len(paths) == 0 {
		return fmt.Errorf("no paths to discard")
	}

	out, err := run(repoPath, "status", "--porcelain", "-u")
	if err != nil {
		return err
	}

	// path → porcelain XY code; rename/copy targets also map back to their
	// source path ("old -> new" lines are keyed by the new path, like Status()).
	statusOf := map[string]string{}
	sourceOf := map[string]string{}
	for line := range strings.SplitSeq(out, "\n") {
		line = strings.TrimRight(line, "\r\n")
		if len(line) < 4 || line[2] != ' ' {
			continue
		}
		xy := line[:2]
		path := line[3:]
		if idx := strings.Index(path, " -> "); idx != -1 {
			sourceOf[path[idx+4:]] = path[:idx]
			path = path[idx+4:]
		}
		statusOf[path] = xy
	}

	// Split into paths HEAD can restore vs paths only the index/worktree know.
	var restore, remove []string
	for _, p := range paths {
		xy, ok := statusOf[p]
		if !ok {
			return fmt.Errorf("no local changes to discard for %s", p)
		}
		x, y := xy[0], xy[1]
		switch {
		case x == 'U' || y == 'U' || (x == 'A' && y == 'A') || (x == 'D' && y == 'D'):
			return fmt.Errorf("%s is in conflict — resolve or abort the operation instead of discarding", p)
		case xy == "??", x == 'A':
			remove = append(remove, p)
		case x == 'R' || y == 'R':
			// Staged rename: the new path isn't in HEAD (delete it), the old
			// path is (bring it back).
			remove = append(remove, p)
			if old := sourceOf[p]; old != "" {
				restore = append(restore, old)
			}
		case x == 'C' || y == 'C':
			// Staged copy: the source is untouched in HEAD; only drop the copy.
			remove = append(remove, p)
		default:
			restore = append(restore, p)
		}
	}

	// Order matters: dropping a rename's index entry first turns it into
	// "D old + ?? new", which the restore pass then repairs.
	if len(remove) > 0 {
		// --ignore-unmatch: untracked files have no index entry to drop.
		if _, err := run(repoPath, append([]string{"rm", "-f", "-r", "--cached", "--ignore-unmatch", "--"}, remove...)...); err != nil {
			return err
		}
		if _, err := run(repoPath, append([]string{"clean", "-f", "--"}, remove...)...); err != nil {
			return err
		}
	}
	if len(restore) > 0 {
		if _, err := run(repoPath, append([]string{"checkout", "HEAD", "--"}, restore...)...); err != nil {
			return err
		}
	}
	return nil
}
