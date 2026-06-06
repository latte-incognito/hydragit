package git

import (
	"os/exec"
	"strings"
	"testing"
)

// SetUser with global=false writes the identity at repo scope and User reads it
// back — the inline "git identity setup" fix (ideas.md). Uses --local so the
// test never touches the developer's real global config.
func TestSetUser_localScope(t *testing.T) {
	dir := initRepo(t)

	if err := SetUser(dir, "Ada Lovelace", "ada@example.com", false); err != nil {
		t.Fatalf("SetUser failed: %v", err)
	}

	u, err := User(dir)
	if err != nil {
		t.Fatal(err)
	}
	if u.Name != "Ada Lovelace" || u.Email != "ada@example.com" {
		t.Fatalf("identity not set: got %+v", u)
	}

	// And it must be written at --local scope, not leaked to global.
	out, _ := exec.Command("git", "-C", dir, "config", "--local", "user.email").Output()
	if strings.TrimSpace(string(out)) != "ada@example.com" {
		t.Fatalf("expected local user.email, got %q", out)
	}
}
