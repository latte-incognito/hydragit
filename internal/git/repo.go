package git

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"
)

// run is the single entry point for all git CLI calls.
func run(repoPath string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = repoPath

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%s", strings.TrimSpace(stderr.String()))
	}

	return strings.TrimRight(stdout.String(), "\n"), nil
}
