package git

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"hydragit/internal/logger"
)

// logSilentGitCmds lists git subcommands whose successful executions are not
// logged — they are called on a tight poll loop and would flood the log.
// Errors are always logged regardless of this list.
var logSilentGitCmds = map[string]bool{
	"rev-parse": true,
	"rev-list":  true,
	"status":    true,
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
	cmd := exec.Command("git", args...)
	cmd.Dir = repoPath

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
		// errors are always logged, never silent
		logger.GitCmd(cmdLabel, durationMs, exitCode, errMsg)
		return "", fmt.Errorf("%s", errMsg)
	}

	if !logSilentGitCmds[args[0]] {
		logger.GitCmd(cmdLabel, durationMs, exitCode, "")
	}
	return strings.TrimRight(stdout.String(), "\n"), nil
}
