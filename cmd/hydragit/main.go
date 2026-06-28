package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sync"

	"hydragit/internal/git"
	"hydragit/internal/ipc"
	"hydragit/internal/logger"
)

var (
	version   = "dev"
	commit    = "none"
	buildTime = "unknown"
)

func main() {
	// Run in a helper that returns the exit code so deferred cleanup (logger
	// flush) always runs — os.Exit skips defers, so it's never called from
	// inside run().
	os.Exit(run())
}

func run() int {
	repoPath := os.Getenv("HYDRAGIT_REPO")
	if repoPath == "" {
		repoPath = "."
	}

	showVersion := flag.Bool("version", false, "show version")
	flag.Parse()

	if *showVersion {
		fmt.Printf("version=%s commit=%s built=%s\n", version, commit, buildTime)
		return 0
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

	// Sanity-check the spawn-time default repo. Deliberately NOT fatal: in a
	// multi-repo workspace every request can carry its own valid repo override,
	// so a bad default only degrades the fallback path — exiting here would
	// take working repos down with it. Log loudly on both channels instead.
	if !git.IsRepo(repoPath) {
		msg := fmt.Sprintf("HYDRAGIT_REPO=%q is not a git repository — requests without a repo override will fail", repoPath)
		logger.Error("process", msg)
		fmt.Fprintln(os.Stderr, "hydragit: "+msg)
	}

	scanner := bufio.NewScanner(os.Stdin)
	// Blame requests carry whole editor buffers in params — the default 64KB
	// token limit would kill this loop on the first file bigger than that.
	scanner.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)

	// Each request runs in its own goroutine so one slow command (a fetch
	// against a dead remote) can't freeze every panel queued behind it. The TS
	// side matches responses by id, so out-of-order replies are fine. Per-repo
	// serialization of mutating commands lives in ipc.Handle; stdout stays
	// JSON-clean by funnelling all writes through outMu.
	var (
		outMu sync.Mutex
		wg    sync.WaitGroup
	)
	respond := func(resp ipc.Response) {
		out, _ := json.Marshal(resp)
		outMu.Lock()
		fmt.Println(string(out))
		outMu.Unlock()
	}

	for scanner.Scan() {
		// Unmarshal before the next Scan — the scanner reuses its buffer.
		// (json.RawMessage copies its bytes, so req doesn't alias the buffer.)
		var req ipc.Request
		if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
			logger.Error("ipc", "invalid JSON on stdin: "+err.Error())
			respond(ipc.Response{ID: "", OK: false, Error: "invalid JSON: " + err.Error()})
			continue
		}

		wg.Go(func() {
			respond(ipc.Handle(repoPath, req))
		})
	}
	// Drain in-flight handlers so their responses aren't lost on shutdown.
	wg.Wait()

	if err := scanner.Err(); err != nil {
		logger.Error("process", "stdin error: "+err.Error())
		fmt.Fprintf(os.Stderr, "stdin error: %v\n", err)
		return 1
	}

	logger.Info("process", "shutdown clean")
	return 0
}
