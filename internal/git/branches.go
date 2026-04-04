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
