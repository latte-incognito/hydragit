# HydraGit — Ideas

Backlog, framed against the PyCharm git panel ("IntelliJ panel, no paywall").
Everything here is doable under the `os/exec + git CLI only` constraint.

- Shipped features → `IMPLEMENTED_FEATURES.md`

**Legend.** `Rating` = build priority (value × fit), ★1–5, 5 = build next.
`GitLens` / `IntelliJ` = does the reference tool have it? ✓ yes · ~ partial ·
✗ no · (Pro) = gated behind GitLens Pro (on-brand to build free).

---

## Not yet built

**Undo / reflog timeline** — ★★★★★ · GitLens: ✗ · IntelliJ: ~ (undo commit only)
Surface `git reflog` as a timeline to reset back to any point, plus one-click
`reset --hard ORIG_HEAD` after a merge/rebase/pull. Guard: stash/warn about
uncommitted work first. Biggest safety win, and nobody does the full timeline.
(The in-progress `--abort`/continue/skip part already ships.)

**Rename branch — local + remote** — ★★★★☆ · GitLens: ~ (local) · IntelliJ: ~ (local)
Extend the existing local `branch.rename`: also push the new name with upstream
and delete the old remote ref, in one action. Guard: block on the
default/protected branch; confirm before deleting the old remote ref.

**Squash adjacent commits (one-click)** — ★★★★☆ · GitLens: ✓ (rebase editor) · IntelliJ: ✓
Select 2+ contiguous commits in the log → squash into one (`reset --soft` for
the HEAD case). Reordering for non-adjacent squash already lives in the
interactive-rebase editor.

**Sync + safe force-push** — ★★★★☆ · GitLens: ✓ · IntelliJ: ✓
One-click fetch + integrate; force-push uses `--force-with-lease` so it won't
clobber a teammate's pushes. Table stakes, pure safety.

**Worktree management UI** — ★★★★☆ · GitLens: ✓ (Pro) · IntelliJ: ✓
Create / switch / remove worktrees visually. GitLens paywalls this — directly
on-brand for "no paywall".

**Revision navigation** — ★★★☆☆ · GitLens: ✓ · IntelliJ: ✓
Step back/forward through a file's history in the editor (diff arrows).
File/line history already exists; this is the in-editor stepping.

**Move changes to another branch** — ★★★☆☆ · GitLens: ✗ · IntelliJ: ✗
"Oops, wrong branch" — move uncommitted work (or the last commit) onto another
branch safely, instead of stash → checkout → pop. Neither reference tool has a
clean one-click; original differentiator.

**Search & Compare view** — ★★★☆☆ · GitLens: ✓ (named view) · IntelliJ: ✓
Cross-repo commit search + jump-between-matches. Message/author/hash filters
already cover the common cases.

**Interactive branch-folder rename** — ★★☆☆☆ · GitLens: ✗ · IntelliJ: ✗
Rename a whole `folder/` of branches at once. Original, but niche.

---

## Recently shipped (was on this list)

Moved to `IMPLEMENTED_FEATURES.md`:

- Interactive rebase editor (drag-reorder + squash/fixup/drop, pause-on-conflict)
- Branch / ref compare + ref↔working-tree diffs
- Amend / reword commit message
- Inline blame (`git blame --porcelain`, buffer-aware via `runStdin`)

---

## Deferred — Windows testing

Needs a real `windows-latest` CI runner (`.exe` naming, `\` vs `/` paths,
`os/exec` lookup) — Docker can't substitute. Note: the rebase orchestration
uses a POSIX `cp` as `GIT_SEQUENCE_EDITOR`/`GIT_EDITOR`, which won't work on
Windows as-is. Plan: `go test ./...` + a spawn-and-`status` smoke on a Windows
runner.
