package git

import (
	"os/exec"
	"strings"
	"testing"
)

func TestReflog(t *testing.T) {
	dir := initRepo(t)
	commitFile(t, dir, "a.txt", "a\n", "A")
	commitFile(t, dir, "b.txt", "b\n", "B")
	// A soft reset gives a distinctive, recoverable reflog entry to assert on.
	exec.Command("git", "-C", dir, "reset", "--soft", "HEAD~1").Run()

	entries, err := Reflog(dir)
	if err != nil {
		t.Fatalf("Reflog failed: %v", err)
	}
	if len(entries) < 3 {
		t.Fatalf("expected several reflog entries, got %d", len(entries))
	}

	// Newest first, index-based selector, fully populated.
	if entries[0].Selector != "HEAD@{0}" {
		t.Fatalf("first selector = %q; want HEAD@{0}", entries[0].Selector)
	}
	for _, e := range entries {
		if e.Hash == "" || e.Subject == "" || e.Date == "" {
			t.Fatalf("incomplete reflog entry: %+v", e)
		}
	}

	// The reset we just performed must appear (this is the recovery point).
	sawReset := false
	for _, e := range entries {
		if strings.Contains(e.Subject, "reset") {
			sawReset = true
		}
	}
	if !sawReset {
		t.Error("expected a 'reset' entry in the reflog")
	}
}
