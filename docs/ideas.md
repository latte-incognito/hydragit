# HydraGit — Ideas

Backlog, framed against the PyCharm git panel ("IntelliJ panel, no paywall").
Everything here is doable under the `os/exec + git CLI only` constraint.

- Shipped features → `IMPLEMENTED_FEATURES.md`

**Legend.** `Rating` = build priority (value × fit), ★1–5, 5 = build next.
`GitLens` / `IntelliJ` = does the reference tool have it? ✓ yes · ~ partial ·
✗ no · (Pro) = gated behind GitLens Pro (on-brand to build free).

---

## Not yet built

The safety-net trio (Sync, conflict-resolution guidance, safe force-push) has
shipped — see "Recently shipped" below. The thesis still guides new work: the
same feature should read as a friendly safety net to a newcomer and as raw git
to an expert.

### Beginner safety / simplicity — next wave

The pattern: catch the exact moment a beginner hits a scary git error or footgun,
and make it one plain-language action — without removing the git underneath.
Always **warn + proceed**, never hard-block by default.

**Pre-commit safety checks** — ★★★★★ · GitLens: ✗ · IntelliJ: ~
Before a commit, *warn* (with "commit anyway") on: a likely secret (`.env`,
API-key-shaped strings, `id_rsa`), an unusually large file, leftover conflict
markers (`<<<<<<<`), or committing straight to a protected branch (main/master).
The headline/viral one — "it stopped me committing my API key." Tunable + disablable.

**Auto-set upstream on first push** — ★★★★★ · GitLens: ✓ · IntelliJ: ✓
Kill the `fatal: no upstream branch` wall: on a no-upstream push, do
`push -u origin <branch>` instead of erroring. Tiny effort, removes a whole class
of beginner confusion; pros never notice.

**Detached-HEAD banner** — ★★★★☆ · GitLens: ✗ · IntelliJ: ~
When HEAD is detached, show a calm banner — "You're not on a branch; create one
here to keep your work" — with one-click create. Classic vibecoder panic.

**Git identity setup** — ★★★★☆ · GitLens: ✗ · IntelliJ: ~
Detect missing `user.name`/`user.email` and offer a friendly inline setup instead
of the cryptic `Please tell me who you are`. Fresh-install blocker.

**Discard with a safety net** — ★★★☆☆ · GitLens: ✗ · IntelliJ: ~
"Discard changes" that stashes a recoverable backup first, instead of nuking work.

**Plain-language git state** — ★★★☆☆ · GitLens: ✗ · IntelliJ: ✗
Translate jargon: `↑2 ↓1` → "2 to push, 1 to pull"; a one-line repo summary
("On `feature` · clean · 2 to push"). Pros read the symbols; beginners get oriented.

### Power features

**Squash adjacent commits (one-click)** — ★★★★☆ · GitLens: ✓ (rebase editor) · IntelliJ: ✓
Select 2+ contiguous commits in the log → squash into one (`reset --soft` for
the HEAD case). Reordering for non-adjacent squash already lives in the
interactive-rebase editor.

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

**Undo last operation (one-click)** — ★★☆☆☆ · GitLens: ✗ · IntelliJ: ~
A dedicated button: `--abort` if mid-op, else `reset --hard ORIG_HEAD`. The full
reflog timeline already ships; this is just the express lane.

---

## Recently shipped (was on this list)

Moved to `IMPLEMENTED_FEATURES.md`:

- **Sync** — one-click fetch + integrate (accented rail button).
- **Conflict-resolution guidance** — sidebar banner with per-file
  Current/Incoming/merge-editor quick actions + Continue/Abort.
- **Safe force-push** — `--force-with-lease` offered automatically when a push is
  rejected (won't clobber unfetched commits).
- **Rename branch — local + remote** — local rename + optional remote
  propagation (push new with tracking, delete old remote ref).
- **Branch-folder rename** — rename every local branch under a prefix at once.
- **Amend last commit** — edit HEAD's message and/or fold staged changes, from
  the sidebar commit area.
- **Undo / reflog timeline** — the "HEAD" view: `git reflog` as a list with
  soft/mixed/hard reset to any point, auto-stash before a hard reset, live
  refresh on git activity.
- Interactive rebase editor (drag-reorder + squash/fixup/drop, pause-on-conflict).
- Branch / ref compare + ref↔working-tree diffs.
- Inline blame (`git blame --porcelain`, buffer-aware via `runStdin`).

---

## Deferred — Windows testing

Needs a real `windows-latest` CI runner (`.exe` naming, `\` vs `/` paths,
`os/exec` lookup) — Docker can't substitute. Note: the rebase orchestration
uses a POSIX `cp` as `GIT_SEQUENCE_EDITOR`/`GIT_EDITOR`, which won't work on
Windows as-is. Plan: `go test ./...` + a spawn-and-`status` smoke on a Windows
runner.
