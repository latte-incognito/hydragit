package git

import (
	"strings"
)

type Tag struct {
	Name string `json:"name"`
	Hash string `json:"hash"`
	Date string `json:"date,omitempty"`
}

// CreateTag creates a tag at the given commit (or HEAD if commit is empty).
// If message is non-empty an annotated tag is created; otherwise lightweight.
func CreateTag(repoPath, name, commit, message string) error {
	args := []string{"tag"}
	if message != "" {
		args = append(args, "-a", name, "-m", message)
	} else {
		args = append(args, name)
	}
	if commit != "" {
		args = append(args, commit)
	}
	_, err := run(repoPath, args...)
	return err
}

// Tags returns all tags sorted by descending creator date.
// Format: <refname:short>TAB<objectname:short>TAB<creatordate:short>
func Tags(repoPath string) ([]Tag, error) {
	out, err := run(repoPath, "tag", "--sort=-creatordate",
		"--format=%(refname:short)\t%(objectname:short)\t%(creatordate:short)")
	if err != nil {
		return nil, err
	}
	if out == "" {
		return []Tag{}, nil
	}

	var tags []Tag
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 3)
		if len(parts) < 2 {
			continue
		}
		t := Tag{Name: parts[0], Hash: parts[1]}
		if len(parts) == 3 {
			t.Date = parts[2]
		}
		tags = append(tags, t)
	}
	return tags, nil
}
