package ipc

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// Concurrent reads across two repos must all succeed and echo their ids — and,
// under `go test -race`, must not trip the detector on the shared
// lastStatusHash / repoLocks maps.
func TestHandleConcurrent_distinctRepos(t *testing.T) {
	repoA := makeRepo(t)
	repoB := makeRepo(t)

	cmds := []string{"status", "branches", "tags", "reflog"}
	var wg sync.WaitGroup
	errs := make(chan string, 200)

	for i := range 25 {
		for _, cmd := range cmds {
			repo := repoA
			if i%2 == 0 {
				repo = repoB
			}
			id := fmt.Sprintf("%s-%d", cmd, i)
			wg.Add(1)
			go func(cmd, repo, id string) {
				defer wg.Done()
				resp := Handle(repoA, Request{ID: id, Cmd: cmd, Repo: repo})
				if !resp.OK {
					errs <- fmt.Sprintf("%s on %s: %s", cmd, repo, resp.Error)
				}
				if resp.ID != id {
					errs <- fmt.Sprintf("id mismatch: sent %s got %s", id, resp.ID)
				}
			}(cmd, repo, id)
		}
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		t.Error(e)
	}
}

// Concurrent mutating commands on the same repo must serialize via the
// per-repo lock: every commit succeeds (no index.lock collisions) and all of
// them land in history.
func TestHandleConcurrent_mutationsSerialize(t *testing.T) {
	dir := makeRepo(t)

	const n = 8
	var wg sync.WaitGroup
	errs := make(chan string, n)

	for i := range n {
		name := fmt.Sprintf("concurrent-%d.txt", i)
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		p := params(map[string]any{
			"message": fmt.Sprintf("commit %d", i),
			"paths":   []string{name},
		})
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			resp := Handle(dir, Request{ID: fmt.Sprintf("c%d", i), Cmd: "commit", Params: p})
			if !resp.OK {
				errs <- resp.Error
			}
		}(i)
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		t.Errorf("concurrent commit failed (per-repo lock not serializing?): %s", e)
	}

	out, err := exec.Command("git", "-C", dir, "rev-list", "--count", "HEAD").Output()
	if err != nil {
		t.Fatal(err)
	}
	count := strings.TrimSpace(string(out))
	// n concurrent commits + the two from makeRepo
	if want := fmt.Sprintf("%d", n+2); count != want {
		t.Fatalf("expected %s commits, got %s — a commit was lost or duplicated", want, count)
	}
}

// A read on repo B must complete while repo A holds its exclusive lock — the
// locks are per-repo, not global. The mutation here is a real merge of a
// branch prepared in advance; while it runs, status on the other repo must
// stay responsive.
func TestHandleConcurrent_reposDoNotBlockEachOther(t *testing.T) {
	repoA := makeRepo(t)
	repoB := makeRepo(t)

	// Prepare a mergeable branch in repo A.
	for _, c := range [][]string{
		{"git", "-C", repoA, "checkout", "-b", "feat"},
		{"git", "-C", repoA, "commit", "--allow-empty", "-m", "feat work"},
		{"git", "-C", repoA, "checkout", "-"},
	} {
		if out, err := exec.Command(c[0], c[1:]...).CombinedOutput(); err != nil {
			t.Fatalf("setup %v: %v\n%s", c, err, out)
		}
	}

	var wg sync.WaitGroup
	wg.Add(2)
	var mergeResp, statusResp Response
	go func() {
		defer wg.Done()
		mergeResp = Handle(repoA, Request{ID: "m", Cmd: "merge", Params: params(map[string]string{"branch": "feat"})})
	}()
	go func() {
		defer wg.Done()
		statusResp = Handle(repoA, Request{ID: "s", Cmd: "status", Repo: repoB})
	}()
	wg.Wait()

	if !mergeResp.OK {
		t.Fatalf("merge failed: %s", mergeResp.Error)
	}
	if !statusResp.OK {
		t.Fatalf("status on the other repo failed: %s", statusResp.Error)
	}
}
