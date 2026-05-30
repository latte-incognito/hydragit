package git

import "strings"

// GitUser is the configured identity for a repo, used by the webview/editor to
// label commits authored by the current user as "You".
type GitUser struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

// User returns the effective user.name / user.email for repoPath. Missing
// values come back as empty strings rather than an error, since a repo with no
// configured identity is valid (blame just won't show a "You" label).
func User(repoPath string) (GitUser, error) {
	name, err := run(repoPath, "config", "user.name")
	if err != nil {
		name = ""
	}
	email, err := run(repoPath, "config", "user.email")
	if err != nil {
		email = ""
	}
	return GitUser{
		Name:  strings.TrimSpace(name),
		Email: strings.TrimSpace(email),
	}, nil
}
