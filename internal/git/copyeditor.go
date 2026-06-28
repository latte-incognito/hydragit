package git

import (
	"fmt"
	"os"
	"path/filepath"
)

// copyEditorFlag is the sentinel that makes this binary re-exec as a tiny
// "editor". When git launches GIT_EDITOR / GIT_SEQUENCE_EDITOR for a scripted
// rebase it runs "<this-binary> --hydragit-copy-editor <src> <fileToEdit>", and
// we overwrite <fileToEdit> with the contents of <src> — a todo list or commit
// message we pre-built — driving the interactive rebase non-interactively.
const copyEditorFlag = "--hydragit-copy-editor"

// init answers the copy-editor self-exec. It lives in init() — not the flag
// package — so EVERY binary that imports this package handles it: the real
// hydragit-server in production, and the `go test` binary during the rebase
// tests, which spawn this very self-exec. Normal startup never matches (os.Args
// carries no such flag), so this is a no-op except when git invokes us as the
// editor, in which case we copy and exit before any other startup runs.
func init() {
	if len(os.Args) >= 4 && os.Args[1] == copyEditorFlag {
		os.Exit(runCopyEditor(os.Args[2], os.Args[3]))
	}
}

// runCopyEditor copies src over dst (the file git handed us to "edit") and
// returns a process exit code.
func runCopyEditor(src, dst string) int {
	data, err := os.ReadFile(src)
	if err != nil {
		fmt.Fprintf(os.Stderr, "hydragit copy-editor: read %q: %v\n", src, err)
		return 1
	}
	if err := os.WriteFile(dst, data, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "hydragit copy-editor: write %q: %v\n", dst, err)
		return 1
	}
	return 0
}

// copyEditor returns the GIT_EDITOR / GIT_SEQUENCE_EDITOR value that drives a
// scripted rebase: git runs "<editor> <fileToEdit>" through its shell, so we
// point it at this very binary in --hydragit-copy-editor mode (see init above).
//
// This is the SINGLE seam for the rebase-scripting mechanism — every scripted
// rebase routes through here. Self-exec instead of POSIX `cp` makes it fully
// cross-platform: it depends on no external command (the old `cp` form broke on
// Windows, where git's shell couldn't reliably resolve `cp`). Paths are
// normalised to forward slashes — accepted by git's shell on every platform,
// including the MSYS shell on Windows where native backslashes are eaten as
// escapes — and double-quoted in case the temp dir or install path contains
// spaces. filepath.ToSlash is a no-op on Unix.
func copyEditor(src string) string {
	exe, err := os.Executable()
	if err != nil {
		// Practically never happens; fall back to POSIX cp (Unix-only) so a
		// scripted rebase still works there rather than failing outright.
		return `cp "` + filepath.ToSlash(src) + `"`
	}
	return `"` + filepath.ToSlash(exe) + `" ` + copyEditorFlag + ` "` + filepath.ToSlash(src) + `"`
}
