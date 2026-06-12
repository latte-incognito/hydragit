package git

import (
	"sort"
	"strconv"
	"strings"
)

type Branch struct {
	Name       string `json:"name"`
	IsCurrent  bool   `json:"isCurrent"`
	IsRemote   bool   `json:"isRemote"`
	IsDefault  bool   `json:"isDefault,omitempty"` // the branch origin/HEAD points to
	Upstream   string `json:"upstream,omitempty"`
	TrackShort string `json:"trackShort,omitempty"` // "=", ">", "<", "<>" (upstream:trackshort)
	Ahead      int    `json:"ahead,omitempty"`
	Behind     int    `json:"behind,omitempty"`
	Gone       bool   `json:"gone,omitempty"`
}

// parseTrack parses %(upstream:track) — "", "[ahead 2]", "[behind 1]",
// "[ahead 2, behind 1]" or "[gone]" — into counts.
func parseTrack(track string) (ahead, behind int, gone bool) {
	track = strings.Trim(strings.TrimSpace(track), "[]")
	if track == "gone" {
		return 0, 0, true
	}
	for _, part := range strings.Split(track, ",") {
		part = strings.TrimSpace(part)
		if n, ok := strings.CutPrefix(part, "ahead "); ok {
			ahead, _ = strconv.Atoi(n)
		}
		if n, ok := strings.CutPrefix(part, "behind "); ok {
			behind, _ = strconv.Atoi(n)
		}
	}
	return ahead, behind, false
}

// defaultBranch resolves what origin/HEAD points to ("develop" for
// refs/remotes/origin/develop). Empty when there is no remote HEAD — callers
// must treat that as "unknown", never guess by name.
func defaultBranch(repoPath string) string {
	out, err := run(repoPath, "symbolic-ref", "--short", "refs/remotes/origin/HEAD")
	if err != nil {
		return ""
	}
	return strings.TrimPrefix(strings.TrimSpace(out), "origin/")
}

func Branches(repoPath string) ([]Branch, error) {
	out, err := run(
		repoPath,
		"for-each-ref",
		"--format=%(refname)\t%(HEAD)\t%(upstream:short)\t%(upstream:trackshort)\t%(objecttype)\t%(upstream:track)",
		"refs/heads/",
		"refs/remotes/",
	)
	if err != nil {
		return nil, err
	}

	defName := defaultBranch(repoPath)

	var branches []Branch

	for _, line := range strings.Split(out, "\n") {
		// TrimRight only — the last field (%(upstream:track)) is empty for any
		// branch without an upstream, so the line ends in a tab that TrimSpace
		// would eat, collapsing the field count.
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			continue
		}

		parts := strings.SplitN(line, "\t", 6)
		if len(parts) < 6 {
			continue
		}

		ref := parts[0]
		isCurrent := parts[1] == "*"
		upstream := parts[2]
		trackShort := parts[3] // "=", ">", "<", "<>"
		objType := parts[4]
		ahead, behind, gone := parseTrack(parts[5])

		// skip tag objects that sneak into the range, and symbolic refs (HEAD pointers)
		if objType == "tag" {
			continue
		}

		var name string
		var isRemote bool

		switch {
		case strings.HasPrefix(ref, "refs/heads/"):
			name = strings.TrimPrefix(ref, "refs/heads/")
			isRemote = false

		case strings.HasPrefix(ref, "refs/remotes/"):
			name = strings.TrimPrefix(ref, "refs/remotes/")
			isRemote = true

			// skip symbolic remote HEAD pointers (refs/remotes/origin/HEAD)
			// for-each-ref with objecttype=commit won't catch these, check by name
			if strings.HasSuffix(name, "/HEAD") {
				continue
			}

		default:
			continue
		}

		isDefault := defName != "" &&
			((!isRemote && name == defName) || (isRemote && name == "origin/"+defName))

		branches = append(branches, Branch{
			Name:       name,
			IsCurrent:  isCurrent,
			IsRemote:   isRemote,
			IsDefault:  isDefault,
			Upstream:   upstream,
			TrackShort: trackShort,
			Ahead:      ahead,
			Behind:     behind,
			Gone:       gone,
		})
	}

	// stable sort: local branches first, then remotes; alphabetical within each group
	sort.SliceStable(branches, func(i, j int) bool {
		bi, bj := branches[i], branches[j]
		if bi.IsRemote != bj.IsRemote {
			return !bi.IsRemote // locals first
		}
		return bi.Name < bj.Name
	})

	return branches, nil
}

func Checkout(repoPath, branch string) error {
	_, err := run(repoPath, "checkout", branch)
	return err
}

func CreateBranch(repoPath, name, from string) error {
	if from == "" {
		_, err := run(repoPath, "checkout", "-b", name)
		return err
	}
	_, err := run(repoPath, "checkout", "-b", name, from)
	return err
}

func DeleteBranch(repoPath, name string, force bool) error {
	flag := "-d"
	if force {
		flag = "-D"
	}
	_, err := run(repoPath, "branch", flag, name)
	return err
}

func RenameBranch(repoPath, from, to string) error {
	_, err := run(repoPath, "branch", "-m", from, to)
	return err
}

// DeleteRemoteBranch deletes a branch on the remote via
// `git push <remote> --delete <branch>`. This also prunes the corresponding
// local refs/remotes/<remote>/<branch> tracking ref, so the branch stops
// appearing in Branches(). `branch` is the short name on the remote
// (e.g. "feature"), NOT the "origin/feature" tracking name.
//
// Uses runTimeout: a remote push can otherwise block indefinitely waiting on
// credentials when no terminal is attached (BUGS.md #5 "hangs ui").
func DeleteRemoteBranch(repoPath, remote, branch string) error {
	_, err := runTimeout(repoPath, networkTimeout, "push", remote, "--delete", branch)
	return err
}

// RenameRemoteBranch propagates a local rename to the remote: push the (already
// locally-renamed) branch under its new name with upstream tracking, then delete
// the old remote branch. Call AFTER RenameBranch. Use only when the branch had
// an upstream.
func RenameRemoteBranch(repoPath, remote, oldName, newName string) error {
	if _, err := runTimeout(repoPath, networkTimeout, "push", remote, "-u", newName); err != nil {
		return err
	}
	_, err := runTimeout(repoPath, networkTimeout, "push", remote, "--delete", oldName)
	return err
}

// RenameBranchFolder renames every LOCAL branch under oldPrefix to newPrefix,
// preserving each suffix — e.g. "feature/" → "feat/" turns feature/x and
// feature/sub/y into feat/x and feat/sub/y. Returns the new names. Local-only;
// propagating a whole folder to the remote is out of scope.
func RenameBranchFolder(repoPath, oldPrefix, newPrefix string) ([]string, error) {
	oldP := strings.TrimSuffix(oldPrefix, "/") + "/"
	newP := strings.TrimSuffix(newPrefix, "/") + "/"

	out, err := run(repoPath, "for-each-ref", "--format=%(refname:short)", "refs/heads/"+oldP)
	if err != nil {
		return nil, err
	}

	renamed := []string{}
	for _, name := range strings.Split(out, "\n") {
		if name == "" {
			continue
		}
		newName := newP + strings.TrimPrefix(name, oldP)
		if _, err := run(repoPath, "branch", "-m", name, newName); err != nil {
			return renamed, err
		}
		renamed = append(renamed, newName)
	}
	return renamed, nil
}

// RenameBranchFolderRemote propagates a folder rename to the remote for every
// renamed local branch that still tracks one. Call AFTER RenameBranchFolder: the
// local `git branch -m` leaves each branch tracking its OLD remote ref, so for
// every branch now under newPrefix we read that stale upstream, push the branch
// under its new name with tracking, and delete the old remote branch. Branches
// without an upstream are skipped. Returns the new names that were propagated.
func RenameBranchFolderRemote(repoPath, newPrefix string) ([]string, error) {
	newP := strings.TrimSuffix(newPrefix, "/") + "/"

	out, err := run(repoPath, "for-each-ref",
		"--format=%(refname:short)\t%(upstream:short)", "refs/heads/"+newP)
	if err != nil {
		return nil, err
	}

	propagated := []string{}
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 2)
		name := parts[0]
		upstream := ""
		if len(parts) == 2 {
			upstream = parts[1]
		}
		if upstream == "" {
			continue // not tracked → nothing to propagate
		}
		slash := strings.Index(upstream, "/")
		if slash == -1 {
			continue
		}
		remote := upstream[:slash]
		oldRemoteName := upstream[slash+1:]
		if err := RenameRemoteBranch(repoPath, remote, oldRemoteName, name); err != nil {
			return propagated, err
		}
		propagated = append(propagated, name)
	}
	return propagated, nil
}

func Merge(repoPath, branch string) error {
	_, err := run(repoPath, "merge", branch)
	return err
}

// Reset moves the current branch tip to the given commit.
// mode: "soft", "mixed" (default), or "hard". Anything else is treated as mixed.
func Reset(repoPath, commit, mode string) error {
	flag := "--mixed"
	switch mode {
	case "soft":
		flag = "--soft"
	case "hard":
		flag = "--hard"
	}
	_, err := run(repoPath, "reset", flag, commit)
	return err
}

// hasTrackedChanges reports whether the working tree has uncommitted changes to
// TRACKED files (staged or unstaged). Untracked files are ignored because
// `reset --hard` never touches them, so they don't need protecting.
func hasTrackedChanges(repoPath string) (bool, error) {
	out, err := run(repoPath, "status", "--porcelain", "--untracked-files=no")
	if err != nil {
		return false, err
	}
	return strings.TrimSpace(out) != "", nil
}

// ResetWithAutostash is Reset with a safety net: before a `--hard` reset (the
// only mode that discards working-tree changes) it auto-stashes any tracked
// modifications so nothing is lost — they land in a recoverable stash. soft and
// mixed keep changes, so they never stash. Returns stashed=true when it did.
func ResetWithAutostash(repoPath, commit, mode string) (stashed bool, err error) {
	if mode == "hard" {
		dirty, derr := hasTrackedChanges(repoPath)
		if derr != nil {
			return false, derr
		}
		if dirty {
			if serr := StashSave(repoPath, "hydragit: auto-stash before hard reset"); serr != nil {
				return false, serr
			}
			stashed = true
		}
	}
	if rerr := Reset(repoPath, commit, mode); rerr != nil {
		return stashed, rerr
	}
	return stashed, nil
}

func Rebase(repoPath, onto string) error {
	_, err := run(repoPath, "rebase", onto)
	return err
}

func Push(repoPath, branch string) error {
	if branch == "" {
		_, err := run(repoPath, "push")
		// First push of a brand-new branch: instead of surfacing the
		// "fatal: The current branch X has no upstream branch" wall, set the
		// upstream automatically (ideas.md "Auto-set upstream on first push").
		// Pros never notice; beginners skip a whole class of confusion.
		if err != nil && strings.Contains(err.Error(), "has no upstream branch") {
			_, err = run(repoPath, "push", "-u", "origin", "HEAD")
		}
		return err
	}
	_, err := run(repoPath, "push", "origin", branch)
	return err
}

// PushCommit pushes history up to (and including) commit onto the remote branch
// — "Push All up to Here". Uses the <src>:<dst> refspec so only commits up to
// `commit` are published, leaving anything after it local.
func PushCommit(repoPath, commit, branch string) error {
	_, err := run(repoPath, "push", "origin", commit+":refs/heads/"+branch)
	return err
}

// PushForce force-pushes using --force-with-lease, which (unlike raw --force)
// refuses to overwrite remote commits the local repo hasn't seen — so it can't
// silently clobber a teammate's pushes.
func PushForce(repoPath, branch string) error {
	if branch == "" {
		_, err := run(repoPath, "push", "--force-with-lease")
		return err
	}
	_, err := run(repoPath, "push", "--force-with-lease", "origin", branch)
	return err
}

// Fetch updates all remotes and prunes remote-tracking refs whose branches
// were deleted on the remote — otherwise they linger in the branch pane forever.
func Fetch(repoPath string) error {
	if _, err := run(repoPath, "fetch", "--all", "--prune"); err != nil {
		return err
	}
	// origin/HEAD is a clone-time snapshot and goes stale when the remote's
	// default branch changes; it drives the default-branch marker in the
	// branch pane, so refresh it. Best-effort — a repo without origin is fine.
	_, _ = run(repoPath, "remote", "set-head", "origin", "--auto")
	return nil
}

func Pull(repoPath string) error {
	_, err := run(repoPath, "pull", "--prune")
	return err
}

// PullMode runs `git pull` with an explicit integration strategy.
// mode: "rebase" → --rebase, "merge" → --no-rebase, anything else → plain pull.
func PullMode(repoPath, mode string) error {
	args := []string{"pull", "--prune"}
	switch mode {
	case "rebase":
		args = append(args, "--rebase")
	case "merge":
		args = append(args, "--no-rebase")
	}
	_, err := run(repoPath, args...)
	return err
}

// BranchContaining returns the first local branch that contains the given commit.
func BranchContaining(repoPath, commit string) (string, error) {
	out, err := run(repoPath, "branch", "--contains", commit, "--format=%(refname:short)")
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			return line, nil
		}
	}
	return "", nil
}
