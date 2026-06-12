# Changelog

All notable changes to HydraGit, grouped by version. Versions are the actual
`package.json` version bumps on `develop`; everything committed between one bump
and the next belongs to the newer version. Entries are derived from the code
diffs between bumps (new functions, IPC commands, files), not just commit
messages. Every version is tagged `vX.Y.Z` on the `release` branch — a clean
linear history with exactly one commit per version, created retroactively on
2026-06-11; each commit's diff is precisely that version's changes.

Feature entries link to the per-feature docs in [`documentation/`](documentation/index.html);
the [feature index](#feature-index) at the bottom lists everything that ships, by topic.

## [Unreleased]

### Added
- **Discard changes — at every level of the sidebar tree** (a long-missing core action): hover any file row for ↶ Discard and an Open-file pencil (VS Code SCM style), hover a folder row or the Staged Changes / Changes section headers for their scoped ↶, or use the new **right-click menu** on file rows (Show Diff · Open File · Copy Path · Discard Changes — IntelliJ style, matching the detail pane's menus). Safety: a **working-tree snapshot is auto-saved before every discard** (server-side, inside the repo lock), so even deleting an untracked file is recoverable from the branch pane's Snapshots section; confirms name the repo in multi-repo workspaces ("Discard 13 files in HydraGit?"); conflicted files are refused (the conflict banner owns those) and bulk discards skip them. New Go `Discard()` (`internal/git/discard.go`) restores tracked paths from HEAD and removes untracked/added/rename-target paths, handling staged renames (source restored, target removed) and copies; new `discard` IPC cmd (mutating + auto-snapshot).

### Fixed
- **The ⭐ default-branch marker was guessed by name** (first of `master`/`main` found locally) and could land on the wrong branch. It's now real data: the Go side resolves what **origin/HEAD** points to (`Branch.isDefault`; never guessed when there's no remote), and `fetch` refreshes origin/HEAD (`git remote set-head origin --auto`) so a default-branch change on the remote heals itself.

### Changed
- **Detail pane (commit card + file tree) redesigned**:
  - The synthetic repo-root tree node ("HydraGit · 13") is gone — it was always present, always expanded, and cost one indent level for every row (both commit and stash views).
  - File status letters use **VS Code's own SCM colors** (`gitDecoration.*` theme tokens: M amber, A green, D red, R/C teal) as bare letters — the boxy chips around identical Ms were noise.
  - **+/− totals moved up** into the tree toolbar next to the file count.
  - **Click the hash to copy it** (GitHub style, ✓ feedback); the Copy-hash button is deleted. Author/date became one line with a smart relative date (full date on hover). Refs render as **pills** (`HEAD -> develop` splits into HEAD + branch pills; tags amber) instead of raw text.
  - **Action row reworked** (ROADMAP item 5): visible chips are Cherry-pick · Branch here · Tag · ↗ View on remote, plus a **⋯ overflow** holding Checkout at commit (detached), Copy commit message, Save as patch, and Revert (red, separated — no longer adjacent to a harmless button). Every action routes through the *same* handler as the log's right-click menu (`commitMenuAction`, which gained `copy-message`); the old separate `commitAction` path was deleted.

- **Branch pane redesigned** (Discord/Linear style):
  - The ambiguous global `+` is gone — each section header (Local / Tags / Stashes / Worktrees / Snapshots) reveals its own `+` on hover: new branch, tag at HEAD, stash, worktree, or manual snapshot (the last two got first-class UI entry points for the first time).
  - The `HEAD · <branch>` row stopped masquerading as a branch — it's now labelled by function: **↺ Undo timeline** (amber, highlighted while reflog mode is active). Same position, same one-click access.
  - **One hydra head = one branch**: branch rows use a single-head hydra icon matching the logo, gradient on the checked-out branch; the ⭐ emoji is replaced by an SVG shield on the default branch (tooltip "Default branch (origin/HEAD)").
  - **Ahead/behind counts** (`↑2 ↓1`, amber/cyan) replace the cryptic `=` trackshort glyph — in-sync branches show nothing. Backed by new `Branch.ahead`/`behind` parsed from `%(upstream:track)`.
  - Section headers de-shouted (no more ALL-CAPS), and a **type-to-filter** (⌕ in the pane header) filters every section at once, auto-expanding matches.

## [0.2.7] — 2026-06-11

### Fixed
- Stale remote branches lingered in the branch pane forever — `fetch`/`pull` now run with `--prune`, so branches deleted on the remote disappear from the tree.
- Remote origin groups in the branch pane wouldn't collapse/expand on click — a Svelte 5 runes-migration regression (`remoteOriginOpen` missed `$state` in the 0.2.4 port).
- Clicking a [snapshot](documentation/features/snapshots.html) did nothing (it looked the commit up in the log, but snapshot commits are on no branch). It now shows **what the snapshot captured** — the dirty files at the moment it was taken, i.e. exactly what ↺ Restore writes back — in the detail pane, titled with the label, branch, and capture time.
- Snapshot rows were indistinguishable ("before checkout · 11h" ×9): they now show the **branch they were taken on** (recorded in the snapshot commit; older snapshots render without it) and a real date (`Today 3:00 pm` / `Jun 10`) instead of a bare relative age.

### Changed
- **Main-panel toolbar redesigned around token search** (Slack/Gmail style) — the five icon mode-tabs are gone. One search input: focusing it opens a scope dropdown (Author / File / Hash / Code with example syntax), typing a prefix (`author:`, `file:`, `hash:`, `code:`, or `@` for author) converts it into a removable colored chip inside the input; Backspace on an empty input removes the chip, ↑↓ + Enter pick a scope from the dropdown. Fixes the search-mode discoverability complaint — the dropdown teaches the syntax by showing it.
- **"This branch / All branches" toggle removed** — it set the same `branch:` log parameter as the branch pill, so the pill absorbed it: the branch dropdown now has a pinned **All branches** first entry, and the pill label reflects the active view. Picking a branch always returns to single-branch view.
- **Undo is now contextual** — the permanently visible toolbar Undo is gone; an amber "Undo merge / rebase / reset / pull" button slides in only when something is actually undoable (op paused mid-rebase, or after a completed merge / rebase (incl. reword / drop / squash / autosquash / interactive) / reset / pull / un-pushed sync) and disappears after undoing. Ops that don't set `ORIG_HEAD` (e.g. cherry-pick) deliberately never advertise it — undo rewinds to `ORIG_HEAD`, which would be a stale target. Reflog mode remains the deep-history recovery tool.
- **Code search (pickaxe) got its own expanded input** — selecting the Code mode opens a full-width monospace snippet box below the toolbar (auto-grows to 6 lines, paste-friendly, multi-line snippets supported since `git log -S` takes the literal string). Search now runs only on Enter / the Search button instead of debounced-per-keystroke — pickaxe scans every diff in history and was far too expensive to run live. Result count is flashed (`N commits add or remove this snippet`); Shift+Enter inserts a newline; clearing the box restores the full log. The Code mode also finally got its accent colour (rose) — active tab, border, and hint chip were unstyled.
- **Code search results now show *why* a commit matched** — selecting a commit from code-search results restricts the detail pane's file list to the files where the snippet count actually changed (`diff-tree -S`, new optional `pickaxe` param on the `diff` cmd; `DiffCommitPickaxe` in `internal/git/diff.go`), labelled "· snippet matches". Previously a search like `version` surfaced commits whose subjects looked unrelated (any `package.json` version bump) with no clue which file matched. Falls back to the full file list if the restricted set is empty (e.g. merge commits). Opening a file's diff during a code search additionally **highlights every occurrence of the snippet** in the native diff editor (find-match-style `TextEditorDecorationType`, theme tokens, both sides decorated; CRLF-tolerant for multi-line snippets) — the webview can't paint inside `vscode.diff`, so the extension host applies the decorations and clears them when a diff is reopened after the search ends.
- **In-panel status bar moved to the top and made collapsible** — it duplicated VS Code's own status bar (where HydraGit already shows repo · branch). Hidden by default; a teal/silver gradient hydra icon in the toolbar (before the branch pill) slides it in/out with an animation (glow on hover only — no idle motion), and it auto-peeks while a transient ⚡ message is showing.
- **Errors now raise native VS Code error toasts** in addition to the in-panel ⚡ flash — a collapsed status bar can no longer swallow a failure (`ui.notify` gained an `error` severity).
- `IMPLEMENTED_FEATURES.md` merged into this file as the [Feature index](#feature-index) (bottom) and dropped — one inventory, two views: by version above, by topic below.
- `docs/ROADMAP.md` bug queue now holds open items only; fixed bugs move here instead of being struck through.

## [0.2.6] — 2026-06-11

### Added
- `CHANGELOG.md` — this file: per-version history derived from the code diffs between `package.json` version bumps, cross-linked to the feature docs.

### Changed
- **Release flow reworked to snapshot releases** (see [`docs/GITFLOW.md`](docs/GITFLOW.md)) — `make release` publishes develop's tree as one tagged commit on master; no develop↔master merges or back-merges anymore.
- master rebuilt as a linear release line (one commit per version); all historical versions retro-tagged `v0.1.0`–`v0.2.5`; old squash-merge master archived as `old-master`.

## [0.2.5] — 2026-06-11

### Added
- **[Merge preview](documentation/features/merge-rebase-reset.html#preview)** (`internal/git/mergetree.go`) — dry-run merge via `git merge-tree --write-tree` (git ≥ 2.38); detects conflicts without touching the working tree. IPC: `merge.preview`.
- **[Pre-commit safety checks](documentation/features/commit.html#safety)** (`internal/git/safety.go`) — warns about secrets, conflict markers, large files, and commits to protected branches. IPC: `commit.precheck`.
- **[Working-tree snapshots](documentation/features/snapshots.html)** (`internal/git/snapshot.go`) — time machine under `refs/hydragit/snapshots`, taken before risky ops; create/list/restore/drop. IPC: `snapshot.*`.
- **[Fixup + autosquash](documentation/features/interactive-rebase.html#fixup)** — `FixupCommit` and `RebaseAutosquash`. IPC: `commit.fixup`, `rebase.autosquash`.
- **[rerere](documentation/features/conflicts.html#rerere)** — opt-in reuse of recorded conflict resolutions. IPC: `rerere.enable`.
- **[Pickaxe search](documentation/features/search-filter.html#pickaxe)** — log search by code change (`git log -S`), alongside message/author filters.

### Changed
- **Go concurrency model** — goroutine per request with a per-repo RWMutex: mutating commands exclusive, reads and remote-only ops shared.
- Large documentation pass: per-feature HTML docs (`documentation/`), `docs/ROADMAP.md`.

### Fixed
- Security fixes (webview CSP hardening).
- Scroll bar behaviour; Playwright/e2e stabilisation; shared date formatting (`webview/src/shared/dates.ts`); `SectionHeader` removed in favour of `RepoGroup`.

## [0.2.4] — 2026-06-09
### Changed
- **Svelte 5 migration** — every webview component (≈20 files, both panels + history) ported to runes. No Go-side changes; a pure frontend modernisation release.

## [0.2.3] — 2026-06-07
### Added
- **[Multi-repo support](documentation/features/multi-repo.html)** — repo discovery and active-repo tracking (`extension/src/RepoService.ts`), grouped sidebar with a `RepoGroup` per repository (`repoStore.ts`), focused main panel, status-bar switcher; every IPC request stamped with a `repo` root.
- **[Smart push / sync plan](documentation/features/remotes.html#sync)** (`webview/src/panels/index/syncPlan.ts`) — computes the right fetch/pull/push sequence from ahead/behind state.

### Fixed
- Pull-with-rebase conflict now pauses and surfaces the error instead of failing silently.

## [0.2.2] — 2026-06-06
### Added
- **[Worktrees](documentation/features/worktrees.html)** (`internal/git/worktree.go`) — list, add (existing or new branch), remove, lock/unlock, move, prune. IPC: `worktree.*`.
- **[Merge conflict resolution](documentation/features/conflicts.html)** (`internal/git/conflict.go`) — detect conflicts and the operation in progress, keep-current/keep-incoming per file, mark resolved, continue/abort; sidebar `ConflictBanner`. IPC: `conflicts`, `conflict.continue`, `conflict.abort`.
- **[Undo last operation](documentation/features/undo-squash.html#undo)** (`internal/git/undo.go`) — aborts an in-progress op, else resets to `ORIG_HEAD`. IPC: `undo.last`.
- **[Amend & squash commits](documentation/features/commit.html#amend)** — `AmendCommit`, `LastCommitMessage`, squash-with-parent. IPC: `commit.amend`, `commit.squash`.
- **[Identity management](documentation/features/health-banners.html#identity)** — `SetUser` (local/global committer name + email). IPC: `user.set`.
- [Remote branch deletion](documentation/features/remotes.html#remote-delete) and folder-wide remote branch rename. IPC: `branch.delete.remote`, `branch.rename.folder.remote`.

### Fixed
- First push now auto-sets upstream; checkout blocked by local changes can be unblocked via stash.

## [0.2.1] — 2026-06-06
### Added
- **[Interactive rebase](documentation/features/interactive-rebase.html#editor)** (`internal/git/rebase.go`, `InteractiveRebase.svelte`) — drop, reword, squash, with continue/skip/abort and in-progress detection. IPC: `rebase.*`.
- **[Reflog pane](documentation/features/reflog.html)** (`internal/git/reflog.go`, `ReflogPane.svelte`) — HEAD undo timeline. IPC: `reflog`.
- **[Compare diffs](documentation/features/compare.html)** — diff against a ref or between two refs (`DiffRefFiles`, `DiffRangeFiles`), plus [`format-patch` export](documentation/features/interactive-rebase.html#patch). IPC: `diff.ref`, `diff.range`, `patch.format`.
- **Advanced branch/push ops** — [rename remote branch / branch folder](documentation/features/branches.html#rename), [reset with autostash](documentation/features/reflog.html#autostash), [safe force push](documentation/features/remotes.html#force), [push up to a specific commit](documentation/features/interactive-rebase.html#pushupto). IPC: `push.force`, `push.upto`, `branch.rename.remote`, `branch.rename.folder`.
- **[Blame at ref](documentation/features/history.html#blame)** + `BlameCard` in the history panel; shared dialog helpers (`dialogs.ts`).

### Fixed
- Merge-conflict files now surfaced in `status` (unmerged codes parsed, distinct from untracked).
- Fuzz test for hunk parsing.

## [0.2.0] — 2026-05-30

### Added
- **[Git blame](documentation/features/history.html#blame)** (`internal/git/blame.go`) — porcelain parsing, buffer-aware via stdin so unsaved editor contents blame correctly; inline annotations + hover (`blameAnnotation.ts`). IPC: `blame`, `user`.
- **[Log search/filters](documentation/features/search-filter.html)** — `LogWith` with message/author filtering; search highlights in the log pane.
- `runStdin` helper in the git runner for buffer-fed commands.

### Changed
- **[Commit log virtualization](documentation/features/commit-log-graph.html#columns)** — smooth scrolling on large histories.
- Branch lines in the graph get stable per-segment colours.

## [0.1.9] — 2026-05-29
### Fixed
- Graph polish: lane connection rendering corrected; compact wide-history rendering test.

## [0.1.8] — 2026-05-29
### Changed
- **Graph rendering rework** — SVG generation extracted to `graphSvg.ts`; lane algorithm hardened with a topology test suite (octopus and criss-cross merges, multiple roots, lane recycling, detached HEAD, scale tests).

## [0.1.7] — 2026-05-29
### Added
- **[File history](documentation/features/history.html#filehistory) & [selection history](documentation/features/history.html#linehistory)** (`FileHistory`, `LineHistory`) — per-file log (follows renames) and per-line-range history, shown in a dedicated history panel with a side-by-side diff. IPC: `file.history`, `line.history`.

## [0.1.6] — 2026-05-27

### Added
- [Stash file lists](documentation/features/stash.html#show) (`StashFiles`), [branch-containing-commit lookup](documentation/features/branches.html#containing) (`BranchContaining`), [tag deletion](documentation/features/tags.html#delete). IPC: `stash.files`, `branch.containing`, `tag.delete`.

### Fixed
- Stash menu works as expected; starting in an empty folder / without a workspace no longer errors; context menu fixes; annotated tags resolve to commit hashes; e2e cleanup.

## [0.1.5] — 2026-05-24

### Added
- **[Tags](documentation/features/tags.html)** — list and create (`internal/git/tags.go`). IPC: `tags`, `tag.create`.
- **[Reset](documentation/features/merge-rebase-reset.html#reset)** (soft/mixed/hard) and **[pull mode](documentation/features/remotes.html#pull)** selection. IPC: `reset`, `pull.mode`.
- Per-file log. IPC: `log.file`.

### Changed
- **[New git graph (#15)](documentation/features/commit-log-graph.html#graph)** — lane allocation rewritten (column reuse, pass-through and collapsing edges); visual prettifying.
- Sidebar/UI redesign; branch filter + delete-branch button; case-insensitive file search; commit-via-HydraGit polish.
- `BUGS.MD` introduced for tracking.

## [0.1.1] — 2026-04-03 (originally shipped via tag v0.1.0 on 2026-04-02)

The MVP was replaced with the real foundation in this range (~8 400 insertions).

### Added
- **Go IPC layer** — [`status`](documentation/features/status.html) and commit implementations, daily-rotating JSON-lines [logger](documentation/features/logging.html) (`internal/logger`).
- **[Stage & commit / commit & push](documentation/features/commit.html)** (`CreateCommit`, `CommitAndPush`). IPC: `commit`, `commit.push`.
- **Core git operations** — [branches](documentation/features/branches.html) (checkout/create/delete/rename), [merge / rebase](documentation/features/merge-rebase-reset.html), [fetch / pull / push](documentation/features/remotes.html), [cherry-pick / revert](documentation/features/cherrypick-revert.html), [stash](documentation/features/stash.html), [diff](documentation/features/diff.html).
- **Full webview component set** — [main panel](documentation/features/main-panel.html) (`App`, `BranchPane`, `LogPane`, `DetailPane`, `ActionRail`, [`ContextMenu`](documentation/features/context-menus.html), `Toolbar`, `StatusBar`, `PaneDivider`) and [sidebar](documentation/features/sidebar.html) (`Sidebar`, `FileTree`, `CommitArea`), shared `messageBus`.
- **Extension host services** — `HydraStatusService` (3s status polling), TS Output Channel logger.
- First Go/webview unit-test suites (branches, merge/rebase, push/fetch/pull, cherry-pick/revert, commit edge cases).

## [0.1.0] — 2026-03-25 (tag v0.0.1-mvp covers this era)

- Initial build: extension scaffolding, first Go binary wiring, project documentation, repository setup.

---

## Feature index

Everything HydraGit ships today, by topic. Each entry links to its full
documentation (UI entry point → what happens next) in
[0.2.7]: https://github.com/latte-incognito/hydragit/compare/v0.2.6...v0.2.7
[`documentation/`](documentation/index.html).

**Views & layout** — [main panel](documentation/features/main-panel.html) · [sidebar (staging view)](documentation/features/sidebar.html) · [multi-repo workspaces](documentation/features/multi-repo.html) · [status, status bar & badge](documentation/features/status.html) · [visual file history](documentation/features/history.html#filehistory) · [selection / line history](documentation/features/history.html#linehistory) · [inline line blame](documentation/features/history.html#blame)

**Branches** — [tree & list](documentation/features/branches.html#list) · [checkout / switch](documentation/features/branches.html#checkout) · [create](documentation/features/branches.html#create) · [rename local / remote / folder](documentation/features/branches.html#rename) · [delete local](documentation/features/branches.html#delete) / [remote](documentation/features/remotes.html#remote-delete) · [branches containing a commit](documentation/features/branches.html#containing)

**Commit log & graph** — [log](documentation/features/commit-log-graph.html#log) · [lane graph](documentation/features/commit-log-graph.html#graph) · [hover-highlight](documentation/features/commit-log-graph.html#hover) · [detail pane](documentation/features/commit-log-graph.html#detail) · [columns & virtualization](documentation/features/commit-log-graph.html#columns)

**Search & filter** — [message](documentation/features/search-filter.html#message) · [hash prefix jump](documentation/features/search-filter.html#hash) · [file](documentation/features/search-filter.html#file) · [author](documentation/features/search-filter.html#author) · [pickaxe / code search](documentation/features/search-filter.html#pickaxe) · [branch scope](documentation/features/search-filter.html#scope)

**Diff & compare** — [commit diff](documentation/features/diff.html) · [branch / ref compare](documentation/features/compare.html#range) · [ref vs working tree](documentation/features/compare.html#ref) · [file vs local](documentation/features/compare.html#file)

**Commit & staging** — [stage & commit](documentation/features/commit.html#commit) · [commit & push](documentation/features/commit.html#push) · [amend](documentation/features/commit.html#amend) · [pre-commit safety checks](documentation/features/commit.html#safety)

**History rewriting** — [interactive rebase editor](documentation/features/interactive-rebase.html#editor) · [pause on conflict](documentation/features/interactive-rebase.html#pause) · [squash with parent](documentation/features/interactive-rebase.html#squash) · [drop](documentation/features/interactive-rebase.html#drop) · [reword](documentation/features/interactive-rebase.html#reword) · [create patch](documentation/features/interactive-rebase.html#patch) · [push up to a commit](documentation/features/interactive-rebase.html#pushupto) · [fixup + autosquash](documentation/features/interactive-rebase.html#fixup)

**Integrate & resolve** — [merge](documentation/features/merge-rebase-reset.html#merge) · [merge conflict preview](documentation/features/merge-rebase-reset.html#preview) · [rerere](documentation/features/conflicts.html#rerere) · [rebase](documentation/features/merge-rebase-reset.html#rebase) · [reset](documentation/features/merge-rebase-reset.html#reset) · [cherry-pick](documentation/features/cherrypick-revert.html#cherrypick) · [revert](documentation/features/cherrypick-revert.html#revert) · [conflict resolution](documentation/features/conflicts.html)

**Remotes & sync** — [sync (fetch + integrate)](documentation/features/remotes.html#sync) · [fetch](documentation/features/remotes.html#fetch) · [pull + pull mode](documentation/features/remotes.html#pull) · [push](documentation/features/remotes.html#push) · [safe force-push](documentation/features/remotes.html#force) · [auto-set upstream](documentation/features/remotes.html#upstream) · [remote branch delete](documentation/features/remotes.html#remote-delete) · [network-op timeout](documentation/features/remotes.html#timeout)

**Undo & safety** — [working-tree snapshots](documentation/features/snapshots.html) · [HEAD undo timeline (reflog)](documentation/features/reflog.html) · [reset to any point](documentation/features/reflog.html#reset) · [auto-stash safety net](documentation/features/reflog.html#autostash) · [live reflog refresh](documentation/features/reflog.html#live) · [undo last operation](documentation/features/undo-squash.html#undo) · [detached-HEAD banner](documentation/features/health-banners.html#detached) · [git identity setup](documentation/features/health-banners.html#identity) · [critical-error reload](documentation/features/health-banners.html#reload)

**Stash** — [list](documentation/features/stash.html#list) · [save](documentation/features/stash.html#save) · [apply / pop / unstash](documentation/features/stash.html#applypop) · [drop / clear](documentation/features/stash.html#dropclear) · [show diff & files](documentation/features/stash.html#show)

**Tags** — [list](documentation/features/tags.html#list) · [create](documentation/features/tags.html#create) · [delete](documentation/features/tags.html#delete) · [checkout · diff · merge · push](documentation/features/tags.html#more)

**Worktrees** — [list](documentation/features/worktrees.html#list) · [add](documentation/features/worktrees.html#add) · [open in new window](documentation/features/worktrees.html#open) · [lock / unlock](documentation/features/worktrees.html#lock) · [move](documentation/features/worktrees.html#move) · [remove](documentation/features/worktrees.html#remove) · [prune stale](documentation/features/worktrees.html#prune)

**Context menus & tooling** — [commit](documentation/features/context-menus.html#commit) / [branch](documentation/features/context-menus.html#branch) / [stash](documentation/features/context-menus.html#stash) / [tag](documentation/features/context-menus.html#tag) context menus · [logging & diagnostics](documentation/features/logging.html) · [version info](documentation/features/logging.html#version) · [force refresh](documentation/features/logging.html#refresh)

> Backlog / not-yet-built features live in [`docs/ROADMAP.md`](docs/ROADMAP.md) §5.

[0.2.6]: https://github.com/latte-incognito/hydragit/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/latte-incognito/hydragit/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/latte-incognito/hydragit/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/latte-incognito/hydragit/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/latte-incognito/hydragit/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/latte-incognito/hydragit/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/latte-incognito/hydragit/compare/v0.1.9...v0.2.0
[0.1.9]: https://github.com/latte-incognito/hydragit/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/latte-incognito/hydragit/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/latte-incognito/hydragit/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/latte-incognito/hydragit/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/latte-incognito/hydragit/compare/v0.1.1...v0.1.5
[0.1.1]: https://github.com/latte-incognito/hydragit/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/latte-incognito/hydragit/releases/tag/v0.1.0
