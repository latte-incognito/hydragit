package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"hydragit/internal/ipc"
	"hydragit/internal/logger"
)

var (
	version   = "dev"
	commit    = "none"
	buildTime = "unknown"
)

func main() {
	repoPath := os.Getenv("HYDRAGIT_REPO")
	if repoPath == "" {
		repoPath = "."
	}

	showVersion := flag.Bool("version", false, "show version")
	flag.Parse()

	if *showVersion {
		fmt.Printf("version=%s commit=%s built=%s\n", version, commit, buildTime)
		return
	}

	// Initialise logger.
	// HYDRAGIT_LOG_DIR is set by the TypeScript extension host from context.logUri.
	// Falls back to os.TempDir()/hydragit-logs if not set.
	logDir := os.Getenv("HYDRAGIT_LOG_DIR")
	if err := logger.Init(logDir, 7); err != nil {
		// Non-fatal — continue without logging rather than refusing to start.
		fmt.Fprintf(os.Stderr, "hydragit: logger init failed: %v\n", err)
	}
	defer logger.Close()

	logger.Info("process", fmt.Sprintf("start version=%s commit=%s built=%s repo=%s", version, commit, buildTime, repoPath))

	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		line := scanner.Bytes()

		var req ipc.Request
		if err := json.Unmarshal(line, &req); err != nil {
			resp := ipc.Response{ID: "", OK: false, Error: "invalid JSON: " + err.Error()}
			logger.Error("ipc", "invalid JSON on stdin: "+err.Error())
			out, _ := json.Marshal(resp)
			fmt.Println(string(out))
			continue
		}

		resp := ipc.Handle(repoPath, req)
		out, _ := json.Marshal(resp)
		fmt.Println(string(out))
	}

	if err := scanner.Err(); err != nil {
		logger.Error("process", "stdin error: "+err.Error())
		fmt.Fprintf(os.Stderr, "stdin error: %v\n", err)
		os.Exit(1)
	}

	logger.Info("process", "shutdown clean")
}
