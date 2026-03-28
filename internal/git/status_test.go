package git

import (
	"testing"
)

func TestStatus(t *testing.T) {
	dir := initRepo(t)

	s, err := Status(dir)
	if err != nil {
		t.Fatal(err)
	}
	if s.Branch == "" {
		t.Fatal("expected non-empty branch")
	}
}
