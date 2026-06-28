package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// runCopyEditor is the body of the --hydragit-copy-editor self-exec: it must
// overwrite dst with src's bytes and report success.
func TestRunCopyEditor_copies(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "src")
	dst := filepath.Join(dir, "dst")
	if err := os.WriteFile(src, []byte("pick abc123\nreword def456\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	// dst pre-exists with git's placeholder content, as in a real rebase.
	if err := os.WriteFile(dst, []byte("# git todo placeholder\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if code := runCopyEditor(src, dst); code != 0 {
		t.Fatalf("runCopyEditor returned %d, want 0", code)
	}
	got, err := os.ReadFile(dst)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "pick abc123\nreword def456\n" {
		t.Fatalf("dst not overwritten with src content, got %q", got)
	}
}

// A missing source must fail with a non-zero exit and leave dst untouched —
// never silently succeed (it would feed git an empty/garbage todo).
func TestRunCopyEditor_missingSrc(t *testing.T) {
	dir := t.TempDir()
	dst := filepath.Join(dir, "dst")
	original := []byte("# original git todo\n")
	if err := os.WriteFile(dst, original, 0o644); err != nil {
		t.Fatal(err)
	}

	if code := runCopyEditor(filepath.Join(dir, "does-not-exist"), dst); code == 0 {
		t.Fatal("expected non-zero exit for a missing source file")
	}
	got, err := os.ReadFile(dst)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(original) {
		t.Fatalf("a failed copy must leave dst intact, got %q", got)
	}
}

// copyEditor must produce a shell-safe self-exec invocation: this binary's path,
// the sentinel flag, and the src — all forward-slashed and quoted so git's shell
// (incl. the MSYS shell on Windows) parses it on every platform.
func TestCopyEditor_format(t *testing.T) {
	src := filepath.Join(t.TempDir(), "todo")
	got := copyEditor(src)

	if !strings.Contains(got, copyEditorFlag) {
		t.Fatalf("missing %q sentinel in %q", copyEditorFlag, got)
	}
	if !strings.Contains(got, `"`+filepath.ToSlash(src)+`"`) {
		t.Fatalf("src not forward-slashed and quoted in %q", got)
	}
	if strings.ContainsRune(got, '\\') {
		t.Fatalf("backslashes survive into the editor command (git's shell eats them): %q", got)
	}
	exe, err := os.Executable()
	if err != nil {
		t.Skip("os.Executable unavailable on this platform")
	}
	if !strings.Contains(got, `"`+filepath.ToSlash(exe)+`"`) {
		t.Fatalf("editor command does not point at this binary: %q", got)
	}
}

// End-to-end of the self-exec itself: spawning *this binary* with the sentinel
// args (exactly as git launches the editor) must trigger init(), copy src over
// dst, and exit 0 — without running the test suite. This is the dispatch the
// Windows fix relies on, verified independently of git and of any shell.
func TestCopyEditor_selfExecDispatch(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Skip("os.Executable unavailable on this platform")
	}
	dir := t.TempDir()
	src := filepath.Join(dir, "src")
	dst := filepath.Join(dir, "dst")
	if err := os.WriteFile(src, []byte("pick deadbeef\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dst, []byte("placeholder\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// git invokes "<editor> <fileToEdit>"; our editor adds the sentinel + src.
	cmd := exec.Command(exe, copyEditorFlag, src, dst)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("self-exec editor failed: %v\n%s", err, out)
	}
	got, err := os.ReadFile(dst)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "pick deadbeef\n" {
		t.Fatalf("self-exec did not overwrite dst with src, got %q", got)
	}
}

// Negative: the self-exec must fail loudly (non-zero exit) when the source is
// missing, so a broken script can never be mistaken for a successful "edit".
func TestCopyEditor_selfExecMissingSrc(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Skip("os.Executable unavailable on this platform")
	}
	dir := t.TempDir()
	dst := filepath.Join(dir, "dst")
	if err := os.WriteFile(dst, []byte("untouched\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	cmd := exec.Command(exe, copyEditorFlag, filepath.Join(dir, "missing"), dst)
	if err := cmd.Run(); err == nil {
		t.Fatal("expected non-zero exit when the source file is missing")
	}
	got, _ := os.ReadFile(dst)
	if string(got) != "untouched\n" {
		t.Fatalf("a failed self-exec must leave dst intact, got %q", got)
	}
}
