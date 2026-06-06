package ipc

import (
	"encoding/json"
	"testing"
)

// Negative-flow dispatch coverage. Reuses makeRepo / params / req from
// handler_test.go (same package). These assert the router fails cleanly
// (ok:false, no panic) for empty params, out-of-range indexes, malformed param
// JSON, and a non-repo working directory.

func TestHandle_malformedParamsJSON(t *testing.T) {
	dir := makeRepo(t)
	// Params is not valid JSON for the log struct — handler ignores the unmarshal
	// error and proceeds with zero-value options. Must not panic; should succeed
	// with the full log.
	resp := Handle(dir, Request{ID: "x", Cmd: "log", Params: json.RawMessage(`"not-an-object"`)})
	if !resp.OK {
		t.Fatalf("log with malformed params should degrade gracefully, got error: %s", resp.Error)
	}
}

func TestHandle_checkoutEmptyBranch(t *testing.T) {
	dir := makeRepo(t)
	resp := Handle(dir, req("checkout", params(map[string]any{"branch": ""})))
	if resp.OK {
		t.Fatal("expected failure checking out an empty branch name")
	}
}

func TestHandle_branchDeleteEmptyName(t *testing.T) {
	dir := makeRepo(t)
	resp := Handle(dir, req("branch.delete", params(map[string]any{"name": "", "force": false})))
	if resp.OK {
		t.Fatal("expected failure deleting an empty branch name")
	}
}

func TestHandle_mergeEmptyBranch(t *testing.T) {
	dir := makeRepo(t)
	resp := Handle(dir, req("merge", params(map[string]any{"branch": ""})))
	if resp.OK {
		t.Fatal("expected failure merging an empty branch name")
	}
}

func TestHandle_rebaseEmptyOnto(t *testing.T) {
	dir := makeRepo(t)
	resp := Handle(dir, req("rebase", params(map[string]any{"onto": ""})))
	if resp.OK {
		t.Fatal("expected failure rebasing onto an empty ref")
	}
}

func TestHandle_cherrypickMissingCommit(t *testing.T) {
	dir := makeRepo(t)
	resp := Handle(dir, req("cherrypick", params(map[string]any{"commit": "deadbeefdeadbeef"})))
	if resp.OK {
		t.Fatal("expected failure cherry-picking a non-existent commit")
	}
}

func TestHandle_revertMissingCommit(t *testing.T) {
	dir := makeRepo(t)
	resp := Handle(dir, req("revert", params(map[string]any{"commit": "deadbeefdeadbeef"})))
	if resp.OK {
		t.Fatal("expected failure reverting a non-existent commit")
	}
}

func TestHandle_resetMissingCommit(t *testing.T) {
	dir := makeRepo(t)
	resp := Handle(dir, req("reset", params(map[string]any{"commit": "deadbeefdeadbeef", "mode": "mixed"})))
	if resp.OK {
		t.Fatal("expected failure resetting to a non-existent commit")
	}
}

func TestHandle_tagCreateMissingCommit(t *testing.T) {
	dir := makeRepo(t)
	resp := Handle(dir, req("tag.create", params(map[string]any{"name": "v1", "commit": "deadbeefdeadbeef", "message": ""})))
	if resp.OK {
		t.Fatal("expected failure tagging a non-existent commit")
	}
}

func TestHandle_stashPopOutOfRange(t *testing.T) {
	dir := makeRepo(t)
	resp := Handle(dir, req("stash.pop", params(map[string]any{"index": 99})))
	if resp.OK {
		t.Fatal("expected failure popping a non-existent stash index")
	}
}

func TestHandle_statusOnNonRepo(t *testing.T) {
	dir := t.TempDir() // not a git repo
	resp := Handle(dir, req("status", params(nil)))
	if resp.OK {
		t.Fatal("expected failure getting status of a non-repo directory")
	}
	if resp.Error == "" {
		t.Fatal("expected a non-empty error message")
	}
}
