package git

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"hydragit/internal/logger"
)

// networkTimeout bounds git commands that talk to a remote (push/fetch/pull).
// Without it a remote that prompts for credentials with no terminal attached
// would block the process — and the webview awaiting it — indefinitely
// (BUGS.md #5 "hangs ui"). On expiry the command is killed and an error is
// returned so the UI can surface a toast instead of freezing.
const networkTimeout = 30 * time.Second

// logSilentGitCmds lists git subcommands whose successful executions are not
// logged — they are called on a tight poll loop and would flood the log.
// Errors are always logged regardless of this list.
var logSilentGitCmds = map[string]bool{
	"rev-parse": true,
	"rev-list":  true,
	"status":    true,
}

// IsRepo reports whether path is inside a git repository. Used by main to
// sanity-check the spawn-time default repo (SECURITY.md "HYDRAGIT_REPO not
// validated") — still routed through the single exec point.
func IsRepo(path string) bool {
	_, err := run(path, "rev-parse", "--git-dir")
	return err == nil
}

// run is the single entry point for all git CLI calls.
// Successful executions of commands in logSilentGitCmds are not logged.
// Errors are always logged.
func run(repoPath string, args ...string) (string, error) {
	return runStdin(repoPath, nil, args...)
}

// runStdin is run() with optional stdin. When stdin is non-nil it is fed to the
// git process — used by buffer-aware blame (`git blame --contents -`) to score
// unsaved editor contents. All git CLI calls still funnel through this one
// exec point. When stdin is nil it behaves exactly like run().
func runStdin(repoPath string, stdin []byte, args ...string) (string, error) {
	return runCore(repoPath, stdin, nil, 0, args...)
}

// runEnv is run() with extra environment variables appended to the inherited
// env — used by the rebase orchestration to set GIT_SEQUENCE_EDITOR / GIT_EDITOR
// so `git rebase -i` and reword run non-interactively instead of hanging on an
// editor. Still the single exec point.
func runEnv(repoPath string, env []string, args ...string) (string, error) {
	return runCore(repoPath, nil, env, 0, args...)
}

// runTimeout is run() bounded by a deadline — used for remote/network git
// commands so they can't hang the process forever (see networkTimeout). A zero
// or negative timeout means no deadline (same as run()).
func runTimeout(repoPath string, timeout time.Duration, args ...string) (string, error) {
	return runCore(repoPath, nil, nil, timeout, args...)
}

// runExitCode is run() for commands whose exit status is an answer rather than
// a failure — e.g. `merge-tree --write-tree` exits 1 to mean "conflicts" while
// still writing its result to stdout. Returns stdout, the exit code, and an
// error only for genuine failures (spawn problems, exit codes above 1).
func runExitCode(repoPath string, args ...string) (string, int, error) {
	out, err := runCore(repoPath, nil, nil, 0, args...)
	if err == nil {
		return out, 0, nil
	}
	if ec, ok := err.(*exitError); ok && ec.code == 1 {
		return ec.stdout, 1, nil
	}
	return "", -1, err
}

// exitError carries the exit code and captured stdout through runCore's error
// path for runExitCode. Its message stays git's stderr, so existing callers
// that just propagate the error are unchanged.
type exitError struct {
	code   int
	stdout string
	msg    string
}

func (e *exitError) Error() string { return e.msg }

// runCore is the one place os/exec is called. stdin, extraEnv and timeout are
// optional (nil / 0 disables each).
func runCore(repoPath string, stdin []byte, extraEnv []string, timeout time.Duration, args ...string) (string, error) {
	var cmd *exec.Cmd
	var ctx context.Context
	if timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(context.Background(), timeout)
		defer cancel()
		cmd = exec.CommandContext(ctx, "git", args...)
	} else {
		cmd = exec.Command("git", args...)
	}
	cmd.Dir = repoPath

	if extraEnv != nil {
		cmd.Env = append(os.Environ(), extraEnv...)
	}

	if stdin != nil {
		cmd.Stdin = bytes.NewReader(stdin)
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	runErr := cmd.Run()
	durationMs := time.Since(start).Milliseconds()

	cmdLabel := strings.Join(args, " ")

	exitCode := 0
	if runErr != nil {
		if cmd.ProcessState != nil {
			exitCode = cmd.ProcessState.ExitCode()
		} else {
			exitCode = -1
		}
		errMsg := strings.TrimSpace(stderr.String())
		// A killed-by-deadline command often leaves stderr empty — give the UI a
		// meaningful message instead of an opaque empty error (BUGS.md #5).
		if ctx != nil && ctx.Err() == context.DeadlineExceeded {
			errMsg = fmt.Sprintf("git %s timed out after %s (remote not responding — check credentials/network)", args[0], timeout)
		}
		// errors are always logged, never silent
		logger.GitCmd(cmdLabel, durationMs, exitCode, errMsg)
		return "", &exitError{
			code:   exitCode,
			stdout: strings.TrimRight(stdout.String(), "\n"),
			msg:    errMsg,
		}
	}

	if !logSilentGitCmds[args[0]] {
		logger.GitCmd(cmdLabel, durationMs, exitCode, "")
	}
	return strings.TrimRight(stdout.String(), "\n"), nil
}
