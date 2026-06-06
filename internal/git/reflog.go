package git

import "strings"

// ReflogEntry is one HEAD movement from `git reflog` — the data behind the
// "HEAD" undo timeline. Newest first.
type ReflogEntry struct {
	Hash     string `json:"hash"`     // commit HEAD pointed at
	Selector string `json:"selector"` // HEAD@{0}, HEAD@{1}, …
	Subject  string `json:"subject"`  // "commit: …", "reset: moving to …", "rebase (finish): …"
	Date     string `json:"date"`     // ISO-8601
}

// Reflog returns the HEAD reflog. NUL (%x00) separates fields so subjects can
// contain anything; %gd stays index-based (HEAD@{n}) because no --date flag is
// passed, and %cI is always strict ISO.
func Reflog(repoPath string) ([]ReflogEntry, error) {
	out, err := run(repoPath, "reflog", "--format=%H%x00%gd%x00%gs%x00%cI")
	if err != nil {
		return nil, err
	}
	entries := []ReflogEntry{}
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}
		parts := strings.Split(line, "\x00")
		if len(parts) < 4 {
			continue
		}
		entries = append(entries, ReflogEntry{
			Hash:     parts[0],
			Selector: parts[1],
			Subject:  parts[2],
			Date:     parts[3],
		})
	}
	return entries, nil
}
