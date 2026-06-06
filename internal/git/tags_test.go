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

// BUG #2: the action-rail "Create tag" sends commit:"" (tag at HEAD) with an
// optional message. Exercise both the lightweight and annotated paths.
func TestCreateTag_atHead(t *testing.T) {
	dir := initRepo(t)

	// Lightweight tag at HEAD (empty commit + empty message).
	if err := CreateTag(dir, "v1-light", "", ""); err != nil {
		t.Fatalf("CreateTag lightweight failed: %v", err)
	}
	// Annotated tag at HEAD (empty commit + message).
	if err := CreateTag(dir, "v1-annotated", "", "the release"); err != nil {
		t.Fatalf("CreateTag annotated failed: %v", err)
	}

	tags, err := Tags(dir)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, tg := range tags {
		got[tg.Name] = true
	}
	if !got["v1-light"] || !got["v1-annotated"] {
		t.Fatalf("expected both tags created at HEAD, got %v", got)
	}
}

func TestDeleteTag(t *testing.T) {
	dir := t.TempDir()
	exec.Command("git", "-C", dir, "init").Run()
	exec.Command("git", "-C", dir, "config", "user.email", "test@test.com").Run()
	exec.Command("git", "-C", dir, "config", "user.name", "Test").Run()
	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "init").Run()
	exec.Command("git", "-C", dir, "tag", "v1.0.0").Run()

	tags, _ := Tags(dir)
	if len(tags) != 1 {
		t.Fatalf("expected 1 tag, got %d", len(tags))
	}

	if err := DeleteTag(dir, "v1.0.0"); err != nil {
		t.Fatal(err)
	}

	tags, _ = Tags(dir)
	if len(tags) != 0 {
		t.Fatalf("expected 0 tags after delete, got %d", len(tags))
	}
}

func TestDeleteTag_nonexistent(t *testing.T) {
	dir := t.TempDir()
	exec.Command("git", "-C", dir, "init").Run()
	exec.Command("git", "-C", dir, "config", "user.email", "test@test.com").Run()
	exec.Command("git", "-C", dir, "config", "user.name", "Test").Run()
	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "init").Run()

	err := DeleteTag(dir, "nonexistent")
	if err == nil {
		t.Fatal("expected error deleting nonexistent tag")
	}
}

func TestTags_annotatedTagResolvesToCommitHash(t *testing.T) {
	dir := t.TempDir()
	exec.Command("git", "-C", dir, "init").Run()
	exec.Command("git", "-C", dir, "config", "user.email", "test@test.com").Run()
	exec.Command("git", "-C", dir, "config", "user.name", "Test").Run()
	exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "init").Run()

	// Get the commit hash
	out, _ := exec.Command("git", "-C", dir, "rev-parse", "--short", "HEAD").Output()
	commitHash := string(out[:len(out)-1]) // trim newline

	// Create an annotated tag
	exec.Command("git", "-C", dir, "tag", "-a", "v1.0.0", "-m", "release").Run()

	tags, err := Tags(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(tags) != 1 {
		t.Fatalf("expected 1 tag, got %d", len(tags))
	}
	if tags[0].Hash != commitHash {
		t.Errorf("expected commit hash %s, got tag hash %s", commitHash, tags[0].Hash)
	}
}
