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

- **CI pipeline + two-language lint gate.** New `.github/workflows/ci.yml` mirrors
  `make install-local` (lint · test · package) but fans out into parallel jobs,
  each mapped to a Makefile target so CI and local stay in sync. Runs on every
  push to `develop`/`master` and every PR: **`lint`** (`make lint` —
  golangci-lint + ESLint), **`test-go`** (`go test -race ./internal/...` across a
  **`ubuntu-latest` + `windows-latest`** matrix, to catch git path/CRLF/exec
  differences), **`test-ts`** (`make test-ts` — Vitest), **`package`**
  (`make package` — build-all + extension + webview + vsce, uploads the `.vsix`),
  and **`e2e`** (Ubuntu: runs `make build`, installs real VS Code via the apt
  repo, and runs a 3-scenario Playwright smoke set — activation, branches, graph
  render — **headed** under Xvfb). Lint config is `.golangci.yml` (golangci-lint schema v2 —
  `standard` set plus
  revive/gocritic/bodyclose/misspell/nakedret/unconvert/unparam/usestdlibvars,
  `errcheck.check-type-assertions`, `goimports` local-prefix `hydragit`; doc/
  funlen/cyclop rules pre-written but commented as a future ratchet) and
  `eslint.config.mjs` (ESLint 9 flat config for the TS host + Svelte 5 webview,
  `eslint-config-prettier` last so Prettier owns formatting). New `make lint` /
  `lint-go` / `lint-ts` / `lint-fix` targets and `npm run lint` / `lint:fix`
  scripts; ESLint devDeps added to `package.json`.
  Lint config is `.golangci.yml` (golangci-lint schema v2 — `standard` set plus
  revive/gocritic/bodyclose/misspell/nakedret/unconvert/unparam/usestdlibvars,
  `errcheck.check-type-assertions`, `goimports` local-prefix `hydragit`; doc/
  funlen/cyclop rules pre-written but commented as a future ratchet) and
  `eslint.config.mjs` (ESLint 9 flat config for the TS host + Svelte 5 webview,
  `eslint-config-prettier` last so Prettier owns formatting). New `make lint` /
  `lint-go` / `lint-ts` / `lint-fix` targets and `npm run lint` / `lint:fix`
  scripts; ESLint devDeps added to `package.json`.
- **`docs/RELEASE_GUIDE.md` — self-contained release & distribution walkthrough.**
  Step-by-step from pre-release checks through `make release`, packaging, and
  shipping via three paths (GitHub Releases / VS Code Marketplace / Open VSX), with
  one-time account setup, a semver policy, hotfix flow, and a troubleshooting table.
  Includes the **macOS code-signing** step: cross-compiled `darwin-arm64` binaries
  must be **ad-hoc signed** (`codesign --sign -`, free, no Apple account) or Apple
  Silicon SIGKILLs them; notarization (paid account) is explained as not required
  for a spawned helper binary.

### Changed

- **Code-quality pass (release-readiness audit).** Trimmed the `internal/git`
  public surface — `Reset`, `MergeAbort`, `MergeContinue` (only ever used
  in-package) are now unexported `reset` / `mergeAbort` / `mergeContinue`, and the
  test-only `Log` convenience wrapper became unexported `logCommits` (its one
  cross-package caller, `internal/graph/wide_test.go`, now uses the public
  `LogWith`). The three scattered `GIT_SEQUENCE_EDITOR=cp` / `GIT_EDITOR=cp` rebase
  call sites collapse into one `copyEditor()` helper (`internal/git/rebase.go`) —
  the single seam for the pending cross-platform/Windows fix.
- **IPC param decoding centralized.** All 62 command handlers in
  `internal/ipc/handler.go` previously made a bare `json.Unmarshal(req.Params, …)`
  call; they now route through a single documented `decodeParams()` helper. The
  intentional behavior is unchanged and now explained in one place: a decode
  error is tolerated by design — read commands (log, diff, …) degrade to
  zero-value options (e.g. an unfiltered full log) rather than failing, and
  mutating commands stay safe because `missingParam` rejects the empty required
  fields a failed decode leaves behind (`TestHandle_malformedParamsJSON`).
- **`internal/ipc/handler.go` dispatch converted to a handler registry.** The
  1,246-line / 88-case `switch req.Cmd` is now a `map[string]cmdFunc` — each
  command is an independently testable `handle*(repoPath, id, req) Response`
  function in the new `handler_commands.go` (84 functions, 89 routed commands).
  `handler.go` drops from 1,264 to 250 lines (just `Handle()`, a slim map-lookup
  `handle()`, and shared helpers). Pure refactor — case bodies were moved
  verbatim; build, full `go test ./internal/...`, and golangci-lint stay green,
  and every mutating/auto-snapshot command is confirmed to have a handler.
- **DetailPane.svelte decomposed into child components (1,314 → ~456 lines).** The
  detail pane was a god-component that rendered the changed-files tree **twice**
  (near-identical markup for the commit and stash views) and inlined the meta
  panel. Split into: `ChangedFiles.svelte` (the file tree — now one component used
  by both views, killing the duplication), `CommitMeta.svelte` (the meta panel:
  commit card / stash card / compare header, plus the ⋯ overflow menu and
  button tooltips), and a pure `fileTree.ts` (`buildTree`/`countFiles`, unit-
  tested). DetailPane is now a thin shell: pane wrapper + empty state + the
  per-file context menu, composing the two children. Behaviour preserved (its
  public props are unchanged; the existing DetailPane tests mount it and exercise
  both children); the only intended visual delta is the *stash* file list gaining
  the same toolbar totals/tooltips/rename rows the commit view already had.
- **BranchPane.svelte — pure tree logic extracted (947 → 861 lines).** The branch
  folder/leaf tree machinery (`buildTree`/`sortTree`/`mergeOpen`/`openAll`, the
  node types, and `worktreeLabel`) moved to a unit-tested `branchTree.ts` (same
  `fileTree.ts` pattern); the component keeps the reactive `$state`/`$effect.pre`
  orchestration that drives it. The branch/stash/snapshot/tag/worktree list
  *markup* is still inline — a larger sub-component split left for later.
- **Toolbar.svelte — search-scope logic extracted (904 → 896 lines).** The token
  search machinery (the `SCOPES` table, the prefix→chip / `@`-shorthand
  `detectScope`, `scopeById`, and the code-box `codeMeta` geometry) moved to a
  unit-tested `searchScope.ts` (same `fileTree.ts`/`branchTree.ts` pattern); the
  component keeps the reactive `$state`/`$derived` that drives the input.
- **Sidebar FileTree.svelte — pure tree logic extracted (891 → 757 lines).** The
  staging-view tree machinery (`buildTree` with single-child-chain compression +
  folders-first sort, `allFilesInFolder`/`countFiles`) and the status helpers
  (`STATUS_CFG`/`cfg`/`parseRename`/`isConflict`/`isDeleted`) moved to a unit-
  tested `sidebar/fileTree.ts`; the component keeps the reactive `$derived`/`$state`
  and the row/folder markup. (The `(file as any).oldPath` cast went away — `oldPath`
  is a real `GitFile` field.)
- **App.svelte decomposition (incremental).** Extracted the pure logic out of the
  1,612-line `App.svelte` `<script>` into co-located tested modules (the
  established `syncPlan.ts`/`stashRedirect.ts` pattern): `worktreePath.ts`
  (`worktreeDefaultPath` + `worktreeBranchOptions`), `menuPosition.ts`
  (`clampMenuPosition`, deduped from 4 context-menu handlers), `refName.ts`
  (`shortBranchName`/`splitRemoteRef`, deduped from ~5 inline sites), and
  `resetMode.ts` (`parseResetMode`). Behaviour unchanged; full Vitest suite (462
  tests, +3 files) and the vite build stay green. The remaining `<script>` is
  stateful orchestration left in the component by design. (Note: `svelte-check` 4.x
  currently crashes against TypeScript 6.x — a known tooling version mismatch,
  not a type error — so the CI svelte-check step is non-blocking until the
  versions are aligned.)
- **Linter-clean pass — `make lint` is green (0 Go issues, 0 ESLint errors).**
  Resolving the gate's findings: `cmd/hydragit/main.go` uses a `run() int` helper
  so deferred `logger.Close()` always flushes (no `os.Exit` skipping defers);
  `internal/git/stash.go` parses numstat via `strconv.Atoi` instead of unchecked
  `fmt.Sscanf`; `internal/logger` passes the 136-byte `Entry` by pointer; small
  test cleanups (named-return, builtin-shadow `max`, embedded-field selectors).
  The Go lint surface is fully green; the webview keeps 189 non-blocking warnings
  (mostly compiler a11y hints on existing components) intentionally left as a
  ratchet. ESLint is Svelte-5-aware (runes use `let`; reactive statements aren't
  "unused expressions") and ignores vite build output under `webview/`.
- **Docs site branding** — `documentation/index.html` hero now uses the
  HydraGit banner (`assets/hydragit-banner.png`) as the backdrop with the
  headline + pills overlaid on its empty right half (`.hero-stage` /
  `.hero-copy`, responsive stack under 880px). The top-bar brand glyph swaps
  the `⬡` octagon for the real app icon (`assets/icon.png`, `.brand-icon`),
  and the version label is synced to v0.3.0. Styles in `assets/style.css`.

## [0.2.9] — 2026-06-22

### Added
- **Wired up "History Up to Here" and "Show Changes to Parents"** — the two commit file context-menu items in the detail pane were enabled but dead (no handler). *History Up to Here* now opens the File History panel for that file truncated to the selected revision and older (new `openFileHistory` webview message → `hydragit.fileHistoryAt` command → `HistoryPanelManager.openFileHistoryRel`, threading an `atRef` through `HistoryInit` into the `file.history` cmd, which Go's `FileHistory(repo, ref, path)` already supported). *Show Changes to Parents* diffs the file against the commit's parent — one diff for an ordinary commit, **one diff editor per parent for a merge** (each opened in its own tab so they don't replace each other). `DetailPane.fileCtx.test.ts` gains explicit coverage for both, including the merge fan-out, and its regression guard now asserts every enabled menu item still fires.
- **Actionable status-bar pills** (ROADMAP §4.1) — the main-panel status bar's ahead/behind text became clickable pills, each reusing the exact action-rail handler:
  - **↑ Publish** when on a branch with no upstream → `doPush()` → Go's `Push("")`, which retries `push -u origin HEAD` (push + set upstream in one click). Only on a branch — a detached HEAD keeps its own &ldquo;create a branch&rdquo; banner.
  - **↓ N Pull** when behind → `tbAction('pull')`.
  - **↑ N Push** when ahead → `doPush()` (already offers force-with-lease on a non-fast-forward rejection).
  - **⇅ Sync** when diverged (ahead *and* behind) → `railAction('sync')`, the same Smart Sync the rail runs (pull-then-push behind one confirm). Sync shows only when diverged — purely ahead/behind, the directional Push/Pull pill already is the smart action.
  - Driven by `status.hasUpstream` / ahead / behind; accent pills (Sync, Publish) use VS Code's prominent status-bar tokens. New `StatusBar.test.ts`.
- **New branding — Alpha Legion hydra-branch mark.** Refreshed `images/icon.png` (marketplace, 720×720 colored hydra-branch), `images/icon-tight.png` (activity-bar container, white silhouette on transparent, 512×512 square, glyph filling the frame so it matches sibling activity-bar icons — VS Code tints it), and `images/icon-fat-transparent.png` (720×720 colored on transparent, used as the in-webview logo via `panel.ts`, so it stays visible on light *and* dark themes); added `images/hydragit-banner.png` (1280×640) as the README hero. The three serpent heads are the branch tips, the trunk drops to a git commit node — Alpha Legion's hydra fused with a git branch graph.
- **Hydra Bloom — animated toolbar logo.** The main-panel toolbar's status toggle now rests on a single hydra head (`images/icon-head.png`, cut from the full mark) and on hover *blooms* into the full three-head logo — the side heads grow in and it scales up, a nod to the myth (cut one head, two grow back). The bloom floats (absolute-positioned) so it never shifts the toolbar; while the status panel is open the full mark shows in place. Supplied via `panel.ts` (`data-head-uri`); pure CSS/SVG, honors `prefers-reduced-motion` (instant crossfade, no scaling). Falls back to the previous inline-SVG glyph when no head URI is present. The status bar no longer carries a logo — the toolbar bloom already anchors the brand, and a 14px head just duplicated it.

### Changed
- **Branch context menu hides self-referential actions on the current branch.** Right-clicking the checked-out branch no longer shows greyed-out no-ops — *Switch to Branch*, *Checkout and Rebase onto …*, *Compare with …*, *Rebase … onto …*, *Merge … into …*, and *Delete* are now omitted entirely (they're all impossible or meaningless against the current branch, e.g. "merge develop into develop"). What remains is what still makes sense there: *New Branch from*, *Rename*, *Show Diff with Working Tree*, and both *Pull into … Using Rebase/Merge*. `ContextMenu.test.ts` updated to assert the items are absent rather than disabled.
- **Theme-token audit — file-status colors and theme-breaking backgrounds** (ROADMAP §4.3). Two fixes, both so the UI follows the user's VS Code theme instead of assuming a dark one:
  - **File-status colors now use VS Code's `gitDecoration.*` tokens** everywhere (modified / added / deleted / renamed), with the Alpha-Legion hexes kept only as fallbacks. The sidebar file tree's status **badges became bare colored letters** (matching the detail pane — the tinted boxes are gone), and filenames in both the sidebar and detail pane, the conflict-banner Keep buttons, and the branch-pane diffstat now track the theme too. Modified files render in the theme's modified colour (amber in dark+) instead of a fixed blue.
  - **Solid dark backgrounds that broke on light/high-contrast themes** were replaced: selected branch/stash rows use `--vscode-list-activeSelectionBackground`; the detail-pane inline diff uses `diffEditor.*` line backgrounds; ref pills, snapshot-action buttons, and danger-menu hovers use translucent accent tints (readable over any theme background) instead of opaque dark fills. Intentional brand accents (the undo amber, behind-cyan, author-purple, code-search rose) are unchanged — they have no VS Code equivalent and are deliberately HydraGit's own. Those accents are now **defined once as `--hg-warn` / `--hg-info` / `--hg-author` / `--hg-code`** (in `styles/vscode-theme.css`) and referenced via `var()` across components instead of repeated literals, so the palette is editable in one place; drifted shades (two ambers, two purples) were unified. The `flash()` colour arguments were deliberately left as literals — that parameter is a sentinel (`=== '#f07070'` triggers an error toast), not a CSS colour. Each `var(--hg-*)` reference carries the brand hex as a fallback (matching the codebase's universal `var(x, #hex)` convention), so the accents render even if the global `:root` stylesheet chunk isn't loaded.
  - **Theme contract test** (`styles/theme-tokens.test.ts`) — a value contract that pins every colour and font HydraGit *defines itself* to its exact number, so a refactor can't silently change one (the way centralising the accents did): the `--hg-*` design tokens (fonts + brand colours) are frozen to an expected map, and the full set of bare non-system colour literals (hex/rgba not inside a `var()`) is frozen to an expected list. System values — anything behind `var(--vscode-*)`, which is meant to vary with the theme — are deliberately out of scope. A completeness check (every referenced `--hg-*` is defined) caught two latent bugs in passing: `--hg-font-md` (referenced by two titles, never defined → inherited size) and `--hg-font-mono` (live only via its inline fallback) — both now defined in `:root`. The graph **lane palette** gets the same treatment Go-side (`TestLaneColors_contract` in `internal/graph`) — it pins the 8 lane colours to their exact values; the existing fuzz test only checked palette *membership*, so a colour could have been changed without notice. **Icons** are contracted by invariant rather than by value: a test asserts every SVG `fill`/`stroke` is theme-driven (`currentColor` / `none` / a `url(#grad)` ref / a `var()` token) and never a hardcoded colour, so an icon can't be made to ignore the user's theme.

### Fixed
- **Amending a pushed commit then syncing rebased the old commit back** instead of offering a force-push (ROADMAP §4.2, two related reports). After an amend/rebase/reword/squash of an already-pushed commit, the branch is *diverged* (ahead = your rewrite, behind = the original still on the remote), and Smart Sync treated every divergence as "rebase then push" — which pulled the pre-rewrite commit back, so the amend looked undone. Sync now distinguishes a **rewrite** divergence from a genuine collaboration divergence: new Go `DivergenceIsRewrite` (`branch.divergeRewrite` cmd) checks whether every commit the upstream has that we don't is an *old version of our own history* (present in this branch's reflog) — `git rev-list HEAD..@{u} --not <branch-reflog>`. When it is, Smart Sync offers a single **force-with-lease** push (no rebase, no stash; the lease still aborts if a teammate pushed since your last fetch); a genuine divergence still rebases as before. The decision lives in the pure `planSync` (new `rewrite` arg + `force` plan field), so it's exhaustively unit-tested; Go tests cover the amend, collab-divergence, and in-sync/ahead cases.
- **Opening a stash whose origin branch was deleted showed nothing.** Double-clicking a stash redirected the log to the branch it was taken on (parsed from the `On <branch>:` message) *before* rendering the stash — and `selectBranch` clears the detail pane as a side effect. If that branch had since been deleted, `git log <deleted-branch>` errored and left the pane empty, even though the stash content (keyed by index, never branch-scoped) had loaded fine. Now the redirect is best-effort and guarded: it only switches when the branch still exists, and the stash diff is rendered last so nothing can wipe it. Branch gone → stay on the current view and just show the stash (its `On <branch>:` label keeps the context); no forced jump elsewhere. Redirect decision extracted to `stashRedirect.ts` with unit tests (incl. the deleted-branch path).

### Tests
- **Closed coverage gaps on eight previously-untested Go functions**, each with happy-path, edge, *and* negative cases (per the never-just-one-happy-path test policy):
  - **Conflict-resolution dispatch** (`conflict_dispatch_test.go`) — `ContinueConflict`/`AbortConflict` routed by the in-progress op (merge *and* rebase), `MarkResolved` for hand-edited files, and the `RebaseContinue`/`RebaseSkip` primitives. Negatives: continuing with unresolved conflicts must stay paused (rebase) or error and stay mid-merge (merge); aborting an unknown op is a no-op; marking a missing path errors; continue/skip with no rebase in progress errors. Plus cherry-pick conflict abort restoring HEAD.
  - **Compare diffs** (`diff_compare_test.go`) — `DiffRangeFiles`/`DiffRangeFile`/`DiffRefFiles`/`DiffRefFile` status letters + rename detection + hunk content, and a `FormatPatch` round-trip re-applied via `git am`. Negatives: bad ref errors, missing-file/clean-tree yield empty (not error), bad-commit `FormatPatch` errors.
  - **Commit & push** (`commit_push_test.go`) — `CommitAndPush` lands on the remote; empty message rejected before any commit; no-remote push fails but documents the local commit is created first.
  - **Stash file list** (`stash_files_test.go`) — `StashFiles` status letters + add/delete counts across modify/add/delete, single-file case, out-of-range index errors.
- **Real end-to-end journey suite — 108 user-scenario specs (`tests/e2e/SCENARIOS.md`).** A breadth pass over how the panels are actually used day-to-day, chaining many actions with positive, negative, adversarial (`[⚠]`), and error-message-quality (`[msg]`) checks, all asserting **real git state** via the `git()`/`workerRepo()` helpers. Clusters A–P (commit/staging, hunks, discard, branches, merge/rebase/reset, conflicts, cherry-pick/revert, log/search, diff/compare, history+blame, stash, sync incl. conflicts, tags, undo/reflog/snapshots, worktrees, multi-repo) plus 8 lengthy `@slow` epics (`epics.spec.ts`) — e.g. *feature → partial-hunk commit → worktree hop → incoming-conflict resolution in the UI*, *amend-pushed → force-with-lease → stale-lease abort*, and *destructive reset → multi-route recovery*. Shared helpers added to `webview-helpers.ts`: the dialog seam (`answerPrompt`/`confirmModal`/`quickPick`), the `expectReadableError` contract (no raw `fatal:`/stack-trace leaks; must name the offending ref/file), and remote simulation (`pushFromClone`) for non-FF / smart-sync / stale-lease scenarios. New `create-multi-repo.sh` fixture + `vscode-multi` / expanded `vscode-dirty` Playwright projects. Selectors were harvested from the shipping components; like the rest of the suite these are authored to convention and need a first-run pass in the e2e environment. Two history gestures with no DOM hook (blame-annotation click, selection-history-across-rename) are tracked as `fixme`.
- **Interactive-rebase editor — plan logic extracted + first test coverage.** The "first kept commit must be pick" validation and the todo-plan builder were lifted out of `InteractiveRebase.svelte` into a pure, total `interactiveRebasePlan.ts` (`isRebasePlanInvalid` / `buildRebasePlan` / `REBASE_ACTIONS`), following the established `syncPlan.ts` / `stashRedirect.ts` pattern — the component now just renders rows and runs these. Motivation was testability: Svelte 5's `<select bind:value>` writeback doesn't run under jsdom, so per-action rules can't be driven through the DOM. `interactiveRebasePlan.test.ts` now covers them exhaustively (leading squash/fixup invalid, drop-then-pick defers the rule, all-dropped/empty invalid, plan order + drops preserved) — mirroring the Go `RunInteractiveRebase` guard — while `InteractiveRebase.test.ts` covers the DOM-drivable parts (rendering, the four actions, default Start emission, Move-up/down reorder, invalid-state warning, Cancel/overlay dismissal).

## [0.2.8] — 2026-06-13

### Added
- **Hunk staging — stage part of a file** (Sublime Merge–style, the payoff of real-index staging): a `›` chevron on each file row expands a compact unified diff inline, with per-hunk **Stage** / **Discard** in the Changes section and **Unstage** in Staged Changes. Stage one hunk of a five-hunk file, commit it, leave the rest — no separate view, no mode switch. Backed by new Go `WorkingDiff`/`StageHunk`/`UnstageHunk`/`DiscardHunk` (`internal/git/hunks.go`): each hunk carries git's **verbatim patch text** (file header + that hunk), which the webview round-trips opaquely back through `git apply --cached [-R]` — so we never reconstruct a patch and can't corrupt it. A stale hunk (the index moved since the diff rendered) is git's own "does not apply" refusal, surfaced and re-synced rather than half-applied; hunk discard auto-snapshots like every discard. New cmds: `diff.working`, `hunk.stage`, `hunk.unstage`, `hunk.discard`. Line-level selection and syntax highlighting in the inline diff are deliberately deferred. New `HunkView.svelte` + the row toggle in `FileTree`; covered by Go unit tests (two-hunk partial-stage round-trip, stale-refusal-leaves-index-intact, binary/untracked → no hunks, no-newline marker survives), Vitest (`HunkView.test.ts`), and a Playwright spec (`hunks.spec.ts`, HK1).
- **Configurable protected branches** — new setting `hydragit.safety.protectedBranches` (default `["main", "master"]`): the branch names the protected-branch commit warning guards. The list **replaces** the default (include main/master to keep them), so a develop-first workflow can protect `develop` — or stop protecting `master` — without touching code. The existing `hydragit.safety.protectedBranch` boolean stays the on/off switch. Host-side the list is sanitized (malformed/empty → default) and injected into `commit.precheck` alongside the enabled checks; `CommitSafety` takes it as a parameter instead of a hardcoded map. Covered end to end: Go unit tests + a new Playwright spec (`safety-settings.spec.ts`, SS1–SS3) that drives the setting through live workspace-settings edits.
- **Discard changes — at every level of the sidebar tree** (a long-missing core action): hover any file row for ↶ Discard and an Open-file pencil (VS Code SCM style), hover a folder row or the Staged Changes / Changes section headers for their scoped ↶, or use the new **right-click menu** on file rows (Show Diff · Open File · Copy Path · Discard Changes — IntelliJ style, matching the detail pane's menus). Safety: a **working-tree snapshot is auto-saved before every discard** (server-side, inside the repo lock), so even deleting an untracked file is recoverable from the branch pane's Snapshots section; confirms name the repo in multi-repo workspaces ("Discard 13 files in HydraGit?"); conflicted files are refused (the conflict banner owns those) and bulk discards skip them. New Go `Discard()` (`internal/git/discard.go`) restores tracked paths from HEAD and removes untracked/added/rename-target paths, handling staged renames (source restored, target removed) and copies; new `discard` IPC cmd (mutating + auto-snapshot).

### Fixed
- **Detail-pane redesign follow-ups** (ROADMAP item 5.1–5.4):
  - The **⋯ overflow menu rendered clipped under the commit card** — the card scrolls (`overflow-y: auto`), which clips absolutely-positioned children. The dropdown is now viewport-anchored (`position: fixed` off the button rect) and opens fully above the button.
  - **Folder rows in the file tree didn't collapse/expand on click** — a Svelte 5 runes regression: `Set` mutations aren't tracked and self-assignment is dropped by the equality check. Toggling now reassigns a fresh `Set`.
  - **Action chips had no hover hints** — Cherry-pick, Branch here, Tag, ↗ and ⋯ now show the pane's styled tooltip explaining what each does.
  - **↗ View on remote now appears only on pushed commits** (detail action row *and* the log's right-click menu) — a local-only commit has no remote URL to open. Backed by a new per-commit `unpushed` flag from Go: one `git rev-list --all --not --remotes` pass marks commits not reachable from any remote-tracking ref (cost scales with the unpushed frontier, not history size).
- **The ⭐ default-branch marker was guessed by name** (first of `master`/`main` found locally) and could land on the wrong branch. It's now real data: the Go side resolves what **origin/HEAD** points to (`Branch.isDefault`; never guessed when there's no remote), and `fetch` refreshes origin/HEAD (`git remote set-head origin --auto`) so a default-branch change on the remote heals itself.

### Changed
- **Staging is real now** (VS Code SCM semantics) — the sidebar checkboxes were a client-side "include in next commit" list (`git add` only happened at commit time); they now drive the index directly: check = `git add`, uncheck = `git restore --staged` (new `stage`/`unstage` cmds, `internal/git/stage.go`; unborn-branch unstage falls back to `rm --cached`). What this buys:
  - **Edit a staged file and the new edits appear as a second row** under Changes while the frozen snapshot stays under Staged Changes (porcelain `MM` → the new `FileStatus.indexStatus`/`workStatus` split; renames carry `oldPath` for the `old → new` display).
  - **Commit takes the frozen snapshot**, not whatever the file looks like at commit time — `commit` with no paths now commits the index as-is (the old stage-paths-then-commit contract still works when paths are passed).
  - Staging survives reloads and is shared with the terminal/other git tools (it's the real index); folder/section checkboxes stage/unstage their subtree; conflicted rows lost their checkbox (the conflict banner owns resolution); the indeterminate folder state is gone — a folder row is simply checked in Staged Changes and unchecked in Changes.

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
[0.2.9]: https://github.com/latte-incognito/hydragit/compare/v0.2.8...v0.2.9
[0.2.8]: https://github.com/latte-incognito/hydragit/compare/v0.2.7...v0.2.8
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
