package git

import (
	"sort"
	"strings"
)

type Branch struct {
	Name       string `json:"name"`
	IsCurrent  bool   `json:"isCurrent"`
	IsRemote   bool   `json:"isRemote"`
	Upstream   string `json:"upstream,omitempty"`
	TrackShort string `json:"trackShort,omitempty"` // "[ahead 2]", "[behind 1]", "[gone]"
	Gone       bool   `json:"gone,omitempty"`
}

func Branches(repoPath string) ([]Branch, error) {
	out, err := run(
		repoPath,
		"for-each-ref",
		"--format=%(refname)\t%(HEAD)\t%(upstream:short)\t%(upstream:trackshort)\t%(objecttype)",
		"refs/heads/",
		"refs/remotes/",
	)
	if err != nil {
		return nil, err
	}

	var branches []Branch

	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.SplitN(line, "\t", 5)
		if len(parts) < 5 {
			continue
		}

		ref := parts[0]
		isCurrent := parts[1] == "*"
		upstream := parts[2]
		trackShort := parts[3] // e.g. "[ahead 1]", "[behind 3]", ""
		gone := trackShort == "[gone]"
		objType := parts[4]

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

		branches = append(branches, Branch{
			Name:       name,
			IsCurrent:  isCurrent,
			IsRemote:   isRemote,
			Upstream:   upstream,
			TrackShort: trackShort,
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

// RenameRemoteBranch propagates a local rename to the remote: push the (already
// locally-renamed) branch under its new name with upstream tracking, then delete
// the old remote branch. Call AFTER RenameBranch. Use only when the branch had
// an upstream.
func RenameRemoteBranch(repoPath, remote, oldName, newName string) error {
	if _, err := run(repoPath, "push", remote, "-u", newName); err != nil {
		return err
	}
	_, err := run(repoPath, "push", remote, "--delete", oldName)
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

func Fetch(repoPath string) error {
	_, err := run(repoPath, "fetch", "--all")
	return err
}

func Pull(repoPath string) error {
	_, err := run(repoPath, "pull")
	return err
}

// PullMode runs `git pull` with an explicit integration strategy.
// mode: "rebase" → --rebase, "merge" → --no-rebase, anything else → plain pull.
func PullMode(repoPath, mode string) error {
	args := []string{"pull"}
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
