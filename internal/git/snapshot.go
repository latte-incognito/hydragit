package git

import (
	"fmt"
	"os"
	"sort"
	"strings"
	"time"
)

// Snapshots are the working-tree time machine: commits of the full working
// tree (staged + unstaged + untracked, .gitignore respected) built through a
// temporary index — `read-tree HEAD` → `add -A` → `write-tree` → `commit-tree`
// — so the real index, the stash list and the working tree are never touched.
// Each snapshot is pinned under refs/hydragit/snapshots/<unix-nanos> so GC
// can't collect it. The IPC layer auto-snapshots before risky mutating
// commands; restore checks the snapshot's content back out over the tree.
//
// Deliberately NOT `git stash create`: that ignores untracked files, and brand
// new files are exactly what a `clean -fd` disaster eats. (Format verified
// against git 2.39: see snapshot_test.go.)

const snapshotRefPrefix = "refs/hydragit/snapshots/"

// snapshotKeep caps how many snapshots survive pruning (newest first).
const snapshotKeep = 20

// Snapshot is one saved working-tree state.
type Snapshot struct {
	Ref    string `json:"ref"`    // full ref name — the handle for drop
	Hash   string `json:"hash"`   // snapshot-commit sha — diffable via the existing `diff` cmd, handle for restore
	Date   string `json:"date"`   // RFC3339 creation time
	Label  string `json:"label"`  // commit subject, e.g. `before reset`
	Branch string `json:"branch"` // branch at capture time, "(detached)" off-branch; "" for pre-branch-recording snapshots
}

// SnapshotCreate captures the current working tree without modifying it.
// Returns nil (no error) when there is nothing to save: a clean tree, or an
// unborn branch (no HEAD yet — nothing at risk that git can express). Old
// snapshots beyond snapshotKeep are pruned. Staging state is not preserved —
// the snapshot records content, which is what "never lose work" needs.
func SnapshotCreate(repoPath, label string) (*Snapshot, error) {
	head, err := run(repoPath, "rev-parse", "HEAD")
	if err != nil {
		return nil, nil // unborn branch — skip silently
	}

	idx, err := os.CreateTemp("", "hydragit-snap-idx-")
	if err != nil {
		return nil, err
	}
	idx.Close()
	defer os.Remove(idx.Name())
	env := []string{"GIT_INDEX_FILE=" + idx.Name()}

	// Build the snapshot tree in the temp index: start from HEAD, layer the
	// full working tree on top. The real index never sees any of this.
	if _, err := runEnv(repoPath, env, "read-tree", "HEAD"); err != nil {
		return nil, err
	}
	if _, err := runEnv(repoPath, env, "add", "-A", "."); err != nil {
		return nil, err
	}
	tree, err := runEnv(repoPath, env, "write-tree")
	if err != nil {
		return nil, err
	}
	headTree, err := run(repoPath, "rev-parse", "HEAD^{tree}")
	if err != nil {
		return nil, err
	}
	if tree == headTree {
		return nil, nil // clean tree — nothing to lose, nothing to save
	}

	// Record where the snapshot was taken — rows named "before checkout" are
	// indistinguishable without the branch.
	branch, err := run(repoPath, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil || branch == "HEAD" {
		branch = "(detached)"
	}

	sha, err := run(repoPath, "commit-tree", tree, "-p", head, "-m", label, "-m", "branch: "+branch)
	if err != nil {
		return nil, err
	}
	ref := fmt.Sprintf("%s%d", snapshotRefPrefix, time.Now().UnixNano())
	if _, err := run(repoPath, "update-ref", ref, sha); err != nil {
		return nil, err
	}

	prune(repoPath)

	return &Snapshot{
		Ref:    ref,
		Hash:   sha,
		Date:   time.Now().UTC().Format(time.RFC3339),
		Label:  label,
		Branch: branch,
	}, nil
}

// SnapshotList returns all snapshots, newest first.
func SnapshotList(repoPath string) ([]Snapshot, error) {
	// %1E separates records (bodies are multi-line, so newline can't),
	// %1F separates fields within one record.
	out, err := run(repoPath,
		"for-each-ref", strings.TrimSuffix(snapshotRefPrefix, "/"),
		"--sort=-refname",
		"--format=%(refname)%1F%(objectname)%1F%(creatordate:iso-strict)%1F%(subject)%1F%(body)%1E")
	if err != nil {
		return nil, err
	}
	snaps := []Snapshot{}
	for rec := range strings.SplitSeq(out, "\x1e") {
		line := strings.TrimSpace(rec)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\x1f", 5)
		if len(parts) < 4 {
			continue
		}
		s := Snapshot{Ref: parts[0], Hash: parts[1], Date: parts[2], Label: parts[3]}
		if len(parts) == 5 {
			for bodyLine := range strings.SplitSeq(parts[4], "\n") {
				if b, ok := strings.CutPrefix(strings.TrimSpace(bodyLine), "branch: "); ok {
					s.Branch = b
					break
				}
			}
		}
		if t, err := time.Parse(time.RFC3339, parts[2]); err == nil {
			s.Date = t.UTC().Format(time.RFC3339)
		}
		snaps = append(snaps, s)
	}
	return snaps, nil
}

// SnapshotRestore checks the snapshot's content back out over the working
// tree. Files that exist only in the snapshot come back; files created after
// the snapshot are left alone; current modifications to snapshotted files are
// overwritten — which is why the IPC layer auto-snapshots before a restore,
// making restore itself undoable.
func SnapshotRestore(repoPath, hash string) error {
	if strings.TrimSpace(hash) == "" {
		return fmt.Errorf("missing snapshot hash")
	}
	if _, err := run(repoPath, "rev-parse", "--verify", hash+"^{commit}"); err != nil {
		return err
	}
	_, err := run(repoPath, "restore", "--worktree", "--source", hash, "--", ".")
	return err
}

// SnapshotDrop deletes one snapshot's ref; the objects become eligible for GC.
func SnapshotDrop(repoPath, ref string) error {
	if !strings.HasPrefix(ref, snapshotRefPrefix) {
		return fmt.Errorf("not a snapshot ref: %s", ref)
	}
	_, err := run(repoPath, "update-ref", "-d", ref)
	return err
}

// prune drops the oldest snapshots beyond snapshotKeep. Best-effort — pruning
// failures must never fail the operation that triggered the snapshot.
func prune(repoPath string) {
	snaps, err := SnapshotList(repoPath)
	if err != nil || len(snaps) <= snapshotKeep {
		return
	}
	// Refnames are unix-nano timestamps — lexicographic order is creation order.
	sort.Slice(snaps, func(i, j int) bool { return snaps[i].Ref > snaps[j].Ref })
	for _, s := range snaps[snapshotKeep:] {
		_ = SnapshotDrop(repoPath, s.Ref)
	}
}
