package git

import (
	"fmt"
	"strings"
)

type StashEntry struct {
	Index   int    `json:"index"`
	Message string `json:"message"`
	Ref     string `json:"ref"`
}

func StashList(repoPath string) ([]StashEntry, error) {
	out, err := run(repoPath, "stash", "list", "--format=%gd\t%s")
	if err != nil {
		return nil, err
	}
	if out == "" {
		return []StashEntry{}, nil
	}

	var entries []StashEntry
	for i, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 2)
		ref := parts[0]
		msg := ""
		if len(parts) == 2 {
			msg = parts[1]
		}
		entries = append(entries, StashEntry{Index: i, Ref: ref, Message: msg})
	}
	return entries, nil
}

func StashPop(repoPath string, index int) error {
	_, err := run(repoPath, "stash", "pop", fmt.Sprintf("stash@{%d}", index))
	return err
}

func StashApply(repoPath string, index int) error {
	_, err := run(repoPath, "stash", "apply", fmt.Sprintf("stash@{%d}", index))
	return err
}

func StashDrop(repoPath string, index int) error {
	_, err := run(repoPath, "stash", "drop", fmt.Sprintf("stash@{%d}", index))
	return err
}

func StashShow(repoPath string, index int) ([]Hunk, error) {
	out, err := run(repoPath, "stash", "show", "-p", fmt.Sprintf("stash@{%d}", index))
	if err != nil {
		return nil, err
	}
	return parseHunks(out), nil
}

func StashSave(repoPath, message string) error {
	if message == "" {
		_, err := run(repoPath, "stash", "push")
		return err
	}
	_, err := run(repoPath, "stash", "push", "-m", message)
	return err
}
