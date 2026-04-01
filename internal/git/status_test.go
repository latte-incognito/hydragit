package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestStatus(t *testing.T) {
	dir := initRepo(t)

	s, err := Status(dir)
	if err != nil {
		t.Fatal(err)
	}
	if s.Branch == "" {
		t.Fatal("expected non-empty branch")
	}
}

func TestStatusModifiedFile(t *testing.T) {
	dir := initRepo(t)

	// write and stage a file — staged files count as Modified, untracked don't
	if err := os.WriteFile(filepath.Join(dir, "file.txt"), []byte("hello\n"), 0644); err != nil {
		t.Fatal(err)
	}
	exec.Command("git", "-C", dir, "add", ".").Run()

	s, err := Status(dir)
	if err != nil {
		t.Fatal(err)
	}
	if s.Modified == 0 {
		t.Fatal("expected Modified > 0 with staged file")
	}
	if len(s.Files) == 0 {
		t.Fatal("expected files in status")
	}
}

func TestStatusCleanRepo(t *testing.T) {
	dir := initRepo(t)

	s, err := Status(dir)
	if err != nil {
		t.Fatal(err)
	}
	if s.Modified != 0 {
		t.Fatalf("expected 0 modified on clean repo, got %d", s.Modified)
	}
	if len(s.Files) != 0 {
		t.Fatalf("expected no files on clean repo, got %d", len(s.Files))
	}
}

// ── resolveStatus ─────────────────────────────────────────────────────────────

func TestResolveStatus(t *testing.T) {
	cases := []struct {
		xy   string
		want string
	}{
		{"??", "U"}, // untracked
		{"M ", "M"}, // staged modification
		{" M", "M"}, // unstaged modification
		{"MM", "M"}, // staged + unstaged modification
		{"A ", "A"}, // new file staged
		{"D ", "D"}, // deleted staged
		{" D", "D"}, // deleted unstaged
		{"R ", "R"}, // renamed staged
		{" R", "R"}, // renamed unstaged
		{"C ", "C"}, // copied staged
		{" C", "C"}, // copied unstaged
		{"T ", "T"}, // type change staged
		{" T", "T"}, // type change unstaged
		{"  ", ""},  // untouched — empty
		{"!!", ""},  // ignored — empty
	}

	for _, tc := range cases {
		got := resolveStatus(tc.xy)
		if got != tc.want {
			t.Errorf("resolveStatus(%q) = %q, want %q", tc.xy, got, tc.want)
		}
	}
}
