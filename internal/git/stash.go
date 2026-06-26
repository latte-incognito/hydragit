package git

import (
	"fmt"
	"strconv"
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

// StashClear removes every stash entry (git stash clear). Irreversible — the
// caller is responsible for confirming with the user.
func StashClear(repoPath string) error {
	_, err := run(repoPath, "stash", "clear")
	return err
}

func StashShow(repoPath string, index int) ([]Hunk, error) {
	out, err := run(repoPath, "stash", "show", "-p", fmt.Sprintf("stash@{%d}", index))
	if err != nil {
		return nil, err
	}
	return parseHunks(out), nil
}

func StashFiles(repoPath string, index int) ([]FileStat, error) {
	ref := fmt.Sprintf("stash@{%d}", index)
	nsOut, err := run(repoPath, "diff", "--name-status", ref+"^", ref)
	if err != nil {
		return nil, err
	}
	numOut, err := run(repoPath, "diff", "--numstat", ref+"^", ref)
	if err != nil {
		return nil, err
	}

	type nsEntry struct {
		status string
		path   string
	}
	var entries []nsEntry
	for _, line := range strings.Split(nsOut, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		status := string(parts[0][0])
		path := parts[len(parts)-1]
		entries = append(entries, nsEntry{status: status, path: path})
	}

	numLines := strings.Split(numOut, "\n")
	var results []FileStat
	for i, ns := range entries {
		ds := FileStat{Path: ns.path, Status: ns.status}
		if i < len(numLines) {
			parts := strings.Fields(numLines[i])
			if len(parts) >= 2 {
				// Binary files show "-" in numstat → Atoi errors, leaving 0.
				ds.Additions, _ = strconv.Atoi(parts[0])
				ds.Deletions, _ = strconv.Atoi(parts[1])
			}
		}
		results = append(results, ds)
	}
	return results, nil
}

func StashSave(repoPath, message string) error {
	if message == "" {
		_, err := run(repoPath, "stash", "push")
		return err
	}
	_, err := run(repoPath, "stash", "push", "-m", message)
	return err
}
