package git

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"hydragit/internal/logger"
)

// run is the single entry point for all git CLI calls.
// Every execution is logged via the logger package.
func run(repoPath string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = repoPath

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	runErr := cmd.Run()
	durationMs := time.Since(start).Milliseconds()

	// Build a readable command label: "status", "log --max-count=200 --all", etc.
	cmdLabel := strings.Join(args, " ")

	exitCode := 0
	if runErr != nil {
		if cmd.ProcessState != nil {
			exitCode = cmd.ProcessState.ExitCode()
		} else {
			exitCode = -1
		}
		errMsg := strings.TrimSpace(stderr.String())
		logger.GitCmd(cmdLabel, durationMs, exitCode, errMsg)
		return "", fmt.Errorf("%s", errMsg)
	}

	logger.GitCmd(cmdLabel, durationMs, exitCode, "")
	return strings.TrimRight(stdout.String(), "\n"), nil
}
