package git

import (
	"os/exec"
	"testing"
)

func TestTags(t *testing.T) {
	dir := t.TempDir()
	exec.Command("git", "-C", dir, "init").Run()
	exec.Command("git", "-C", dir, "config", "user.email", "test@test.com").Run()
	exec.Command("git", "-C", dir, "config", "user.name", "Test").Run()
	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "init").Run()

	// No tags yet — should return empty slice, not error.
	tags, err := Tags(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(tags) != 0 {
		t.Fatalf("expected 0 tags, got %d", len(tags))
	}

	// Create two tags and verify they come back.
	exec.Command("git", "-C", dir, "tag", "v0.1.0").Run()
	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "second").Run()
	exec.Command("git", "-C", dir, "tag", "v0.2.0").Run()

	tags, err = Tags(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(tags) != 2 {
		t.Fatalf("expected 2 tags, got %d", len(tags))
	}
	names := map[string]bool{}
	for _, tag := range tags {
		names[tag.Name] = true
		if tag.Hash == "" {
			t.Errorf("tag %s has empty hash", tag.Name)
		}
	}
	if !names["v0.1.0"] || !names["v0.2.0"] {
		t.Errorf("expected v0.1.0 and v0.2.0, got %v", names)
	}
}
