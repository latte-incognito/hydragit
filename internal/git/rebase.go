package git

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// noEditorEnv stops git from opening an interactive editor mid-rebase (which
// would hang the Go process waiting on stdin that never comes).
var noEditorEnv = []string{"GIT_EDITOR=true", "GIT_SEQUENCE_EDITOR=true"}

// copyEditor (the SINGLE seam for scripting an interactive rebase
// non-interactively) lives in copyeditor.go.

// RebaseInProgress reports whether the repo is paused mid-rebase — e.g. stopped
// on a conflict. Detected via git's rebase state directory, resolved through
// `rev-parse --git-path` so it works with worktrees and custom git dirs.
func RebaseInProgress(repoPath string) bool {
	for _, name := range []string{"rebase-merge", "rebase-apply"} {
		p, err := run(repoPath, "rev-parse", "--git-path", name)
		if err != nil || p == "" {
			continue
		}
		if !filepath.IsAbs(p) {
			p = filepath.Join(repoPath, p)
		}
		if fi, err := os.Stat(p); err == nil && fi.IsDir() {
			return true
		}
	}
	return false
}

// DropCommit removes a single commit from the current branch by rebasing the
// commits after it onto its parent. Returns conflict=true if the rebase paused
// on a conflict — the repo is left mid-rebase for the user to resolve and then
// Continue/Skip/Abort (the GitLens/IntelliJ flow), not auto-aborted.
func DropCommit(repoPath, commit string) (conflict bool, err error) {
	_, err = runEnv(repoPath, noEditorEnv, "rebase", "--onto", commit+"^", commit)
	if err != nil {
		if RebaseInProgress(repoPath) {
			return true, nil
		}
		return false, err
	}
	return false, nil
}

// RebaseContinue resumes a paused rebase after the user resolved conflicts.
// Returns conflict=true if it stopped again on a later conflict.
func RebaseContinue(repoPath string) (conflict bool, err error) {
	_, err = runEnv(repoPath, noEditorEnv, "rebase", "--continue")
	if err != nil {
		if RebaseInProgress(repoPath) {
			return true, nil
		}
		return false, err
	}
	return false, nil
}

// RebaseSkip skips the current patch of a paused rebase.
func RebaseSkip(repoPath string) (conflict bool, err error) {
	_, err = runEnv(repoPath, noEditorEnv, "rebase", "--skip")
	if err != nil {
		if RebaseInProgress(repoPath) {
			return true, nil
		}
		return false, err
	}
	return false, nil
}

// RebaseAbort restores the branch to its pre-rebase state.
func RebaseAbort(repoPath string) error {
	_, err := run(repoPath, "rebase", "--abort")
	return err
}

// RewordCommit changes a commit's message. If the commit is HEAD it amends
// directly; otherwise it runs a scripted interactive rebase that rewords just
// that commit. Returns conflict=true if the rebase paused (rare for reword,
// since trees are unchanged, but possible).
//
// The scripted rebase drives git non-interactively via copyEditor (see its
// doc): GIT_SEQUENCE_EDITOR overwrites the todo list with one we generate (the
// target marked `reword`, the rest `pick`), and GIT_EDITOR overwrites the
// commit-message buffer with the new message.
func RewordCommit(repoPath, commit, message string) (conflict bool, err error) {
	head, _ := run(repoPath, "rev-parse", "HEAD")
	target, err := run(repoPath, "rev-parse", commit)
	if err != nil {
		return false, err
	}
	if head == target {
		_, err := run(repoPath, "commit", "--amend", "-m", message)
		return false, err
	}

	// Build the todo: pick every commit in <commit>^..HEAD (oldest first), but
	// reword the target.
	shaList, err := run(repoPath, "rev-list", "--reverse", commit+"^..HEAD")
	if err != nil {
		return false, err
	}
	var todo strings.Builder
	for _, sha := range strings.Split(shaList, "\n") {
		if sha == "" {
			continue
		}
		action := "pick"
		if sha == target {
			action = "reword"
		}
		todo.WriteString(action + " " + sha + "\n")
	}

	todoPath, cleanTodo, err := writeTempFile("hydragit-todo-", todo.String())
	if err != nil {
		return false, err
	}
	defer cleanTodo()
	msgPath, cleanMsg, err := writeTempFile("hydragit-msg-", message+"\n")
	if err != nil {
		return false, err
	}
	defer cleanMsg()

	env := []string{
		"GIT_SEQUENCE_EDITOR=" + copyEditor(todoPath),
		"GIT_EDITOR=" + copyEditor(msgPath),
	}
	_, err = runEnv(repoPath, env, "rebase", "-i", commit+"^")
	if err != nil {
		if RebaseInProgress(repoPath) {
			return true, nil
		}
		return false, err
	}
	return false, nil
}

// RebaseTodoItem is one line of an interactive-rebase plan, listed oldest-first.
type RebaseTodoItem struct {
	Sha    string `json:"sha"`
	Action string `json:"action"` // pick | drop | squash | fixup
}

var validRebaseActions = map[string]bool{
	"pick": true, "drop": true, "squash": true, "fixup": true,
}

// RunInteractiveRebase rewrites history from base (exclusive) using the given
// todo plan — the drag-and-drop editor's output. Reorder is expressed by the
// slice order. Messages are left untouched (squash keeps the combined message,
// fixup discards its own); reword is handled separately by RewordCommit.
// Returns conflict=true if the rebase paused.
func RunInteractiveRebase(repoPath, base string, items []RebaseTodoItem) (conflict bool, err error) {
	if len(items) == 0 {
		return false, fmt.Errorf("empty rebase plan")
	}
	// The first applied (non-drop) line must be a pick — squash/fixup need a
	// commit to fold into.
	for _, it := range items {
		if it.Action == "drop" {
			continue
		}
		if it.Action != "pick" {
			return false, fmt.Errorf("the first kept commit must be 'pick', not %q", it.Action)
		}
		break
	}

	var todo strings.Builder
	for _, it := range items {
		if !validRebaseActions[it.Action] {
			return false, fmt.Errorf("invalid rebase action %q", it.Action)
		}
		todo.WriteString(it.Action + " " + it.Sha + "\n")
	}

	todoPath, clean, err := writeTempFile("hydragit-itodo-", todo.String())
	if err != nil {
		return false, err
	}
	defer clean()

	// GIT_EDITOR=true keeps git's pre-filled message for squashes (and is unused
	// for pick/drop/fixup), so the rebase never blocks on an editor.
	env := []string{
		"GIT_SEQUENCE_EDITOR=" + copyEditor(todoPath),
		"GIT_EDITOR=true",
	}
	_, err = runEnv(repoPath, env, "rebase", "-i", base)
	if err != nil {
		if RebaseInProgress(repoPath) {
			return true, nil
		}
		return false, err
	}
	return false, nil
}

// RebaseAutosquash runs `git rebase -i --autosquash <base>` non-interactively:
// git reorders the todo so every `fixup!`/`squash!` commit folds into its
// target, and GIT_SEQUENCE_EDITOR=true accepts that auto-generated plan as-is.
// base is the commit *before* the oldest fixup target (callers usually pass
// `<target>^`). Returns conflict=true if the rebase paused.
func RebaseAutosquash(repoPath, base string) (conflict bool, err error) {
	_, err = runEnv(repoPath, noEditorEnv, "rebase", "-i", "--autosquash", base)
	if err != nil {
		if RebaseInProgress(repoPath) {
			return true, nil
		}
		return false, err
	}
	return false, nil
}

// SquashWithParent folds `commit` into its immediate parent, combining their
// messages into one commit in their place (one-click squash of two adjacent
// commits — ideas.md). Built on the interactive-rebase machinery, so it works
// for any commit whose parent itself has a parent (not a root commit). Returns
// conflict=true if the rebase paused on a conflict.
func SquashWithParent(repoPath, commit string) (conflict bool, err error) {
	// base = grandparent of `commit`. The parent is then the first replayed
	// commit and `commit` is squashed into it. Fails cleanly when the parent is a
	// root commit (no grandparent to rebase onto).
	base, err := run(repoPath, "rev-parse", "--verify", commit+"~2")
	if err != nil {
		return false, fmt.Errorf("can't squash: the parent is a root commit (nothing to fold it into)")
	}
	target, err := run(repoPath, "rev-parse", "--verify", commit)
	if err != nil {
		return false, err
	}

	shaList, err := run(repoPath, "rev-list", "--reverse", base+"..HEAD")
	if err != nil {
		return false, err
	}
	var items []RebaseTodoItem
	for _, sha := range strings.Split(shaList, "\n") {
		if sha == "" {
			continue
		}
		action := "pick"
		if sha == target {
			action = "squash" // fold into the preceding parent, combining messages
		}
		items = append(items, RebaseTodoItem{Sha: sha, Action: action})
	}
	return RunInteractiveRebase(repoPath, base, items)
}

// writeTempFile writes content to a new temp file and returns its path plus a
// cleanup func.
func writeTempFile(prefix, content string) (path string, cleanup func(), err error) {
	f, err := os.CreateTemp("", prefix)
	if err != nil {
		return "", func() {}, err
	}
	if _, err := f.WriteString(content); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", func() {}, err
	}
	f.Close()
	return f.Name(), func() { os.Remove(f.Name()) }, nil
}
