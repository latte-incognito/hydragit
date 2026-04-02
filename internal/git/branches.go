package git

import (
	"strings"
)

type Branch struct {
	Name      string `json:"name"`
	IsCurrent bool   `json:"isCurrent"`
	IsRemote  bool   `json:"isRemote"`
	Upstream  string `json:"upstream,omitempty"`
}

func Branches(repoPath string) ([]Branch, error) {
	out, err := run(
		repoPath,
		"branch", "--all", "--format=%(refname)\t%(HEAD)\t%(upstream:short)",
	)
	if err != nil {
		return nil, err
	}

	var branches []Branch
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}

		parts := strings.SplitN(line, "\t", 3)
		if len(parts) < 3 {
			continue
		}

		ref := strings.TrimSpace(parts[0])
		isCurrent := strings.TrimSpace(parts[1]) == "*"
		upstream := strings.TrimSpace(parts[2])

		var name string
		var isRemote bool

		switch {
		case strings.HasPrefix(ref, "refs/heads/"):
			name = strings.TrimPrefix(ref, "refs/heads/")
			isRemote = false

		case strings.HasPrefix(ref, "refs/remotes/"):
			name = strings.TrimPrefix(ref, "refs/remotes/")
			isRemote = true

			// skip symbolic remote HEAD entry
			if strings.HasSuffix(name, "/HEAD") {
				continue
			}

		default:
			continue
		}

		branches = append(branches, Branch{
			Name:      name,
			IsCurrent: isCurrent,
			IsRemote:  isRemote,
			Upstream:  upstream,
		})
	}

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

func Merge(repoPath, branch string) error {
	_, err := run(repoPath, "merge", branch)
	return err
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

func Fetch(repoPath string) error {
	_, err := run(repoPath, "fetch", "--all")
	return err
}

func Pull(repoPath string) error {
	_, err := run(repoPath, "pull")
	return err
}
