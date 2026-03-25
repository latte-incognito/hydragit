package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"

	"hydragit/internal/ipc"
)

func main() {
	repoPath := os.Getenv("HYDRAGIT_REPO")
	if repoPath == "" {
		repoPath = "."
	}

	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		line := scanner.Bytes()

		var req ipc.Request
		if err := json.Unmarshal(line, &req); err != nil {
			resp := ipc.Response{ID: "", OK: false, Error: "invalid JSON: " + err.Error()}
			out, _ := json.Marshal(resp)
			fmt.Println(string(out))
			continue
		}

		resp := ipc.Handle(repoPath, req)
		out, _ := json.Marshal(resp)
		fmt.Println(string(out))
	}

	if err := scanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "stdin error: %v\n", err)
		os.Exit(1)
	}
}
