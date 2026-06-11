# Changelog

All notable changes to HydraGit, grouped by version. Versions are the actual
`package.json` version bumps on `develop`; everything committed between one bump
and the next belongs to the newer version. Entries are derived from the code
diffs between bumps (new functions, IPC commands, files), not just commit
messages. Every version is tagged `vX.Y.Z` on the `release` branch — a clean
linear history with exactly one commit per version, created retroactively on
2026-06-11; each commit's diff is precisely that version's changes.

Feature entries link to the per-feature docs in [`documentation/`](documentation/index.html);
the full current feature list by topic lives in [`IMPLEMENTED_FEATURES.md`](IMPLEMENTED_FEATURES.md).

## [Unreleased]

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
