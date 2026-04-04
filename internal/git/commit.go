package git

import (
	"errors"
	"strings"
)

// CommitResult holds the short hash and summary of the newly created commit.
type CommitResult struct {
	Hash    string `json:"hash"`
	Message string `json:"message"`
}

// CreateCommit stages the given paths and creates a new commit with the
// provided message. Returns the hash and subject of the new commit.
//
// If paths is empty the function returns an error rather than accidentally
// committing everything.
func CreateCommit(repoPath, message string, paths []string) (*CommitResult, error) {
	if strings.TrimSpace(message) == "" {
		return nil, errors.New("commit message cannot be empty")
	}
	if len(paths) == 0 {
		return nil, errors.New("no files staged for commit")
	}

	// Stage exactly the requested paths — nothing more.
	addArgs := append([]string{"add", "--"}, paths...)
	if _, err := run(repoPath, addArgs...); err != nil {
		return nil, err
	}

	// Create the commit.
	if _, err := run(repoPath, "commit", "-m", message); err != nil {
		return nil, err
	}

	// Read back the new commit hash + subject for the response.
	out, err := run(repoPath, "log", "-1", "--format=%H %s")
	if err != nil {
		return &CommitResult{Message: message}, nil
	}
	out = strings.TrimSpace(out)
	if idx := strings.Index(out, " "); idx > 0 {
		return &CommitResult{
			Hash:    out[:idx],
			Message: out[idx+1:],
		}, nil
	}
	return &CommitResult{Hash: out, Message: message}, nil
}

// CommitAndPush creates a commit then pushes the current branch.
func CommitAndPush(repoPath, message string, paths []string) (*CommitResult, error) {
	result, err := CreateCommit(repoPath, message, paths)
	if err != nil {
		return nil, err
	}
	if err := Push(repoPath, ""); err != nil {
		return nil, err
	}
	return result, nil
}
