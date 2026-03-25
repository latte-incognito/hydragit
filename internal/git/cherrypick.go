package git

func CherryPick(repoPath, commit string) error {
	_, err := run(repoPath, "cherry-pick", commit)
	return err
}

func Revert(repoPath, commit string) error {
	_, err := run(repoPath, "revert", "--no-edit", commit)
	return err
}
