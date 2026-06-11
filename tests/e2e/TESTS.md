# E2E test inventory — what each test actually asserts

Every test launches a **real VS Code** (Electron) with the dev extension against a
**real temp git repo** built per test by a fixture script. Tests assert at two
levels:

- **UI level** — elements inside the webview iframes (`.pane-log` = main panel,
  `.repo-list` = sidebar) or the VS Code workbench (editor tabs, diff editors).
- **Repo level** — actual git state, via `git(workerRepo(test.info()), "…")`
  (helpers in `webview-helpers.ts`). A status-bar flash (`⚡ …`) alone is never
  trusted for mutating operations — an error flash is also a flash.

## Projects & fixtures (playwright.config.ts)

| Project | Fixture | Repo shape |
|---|---|---|
| `vscode` (default) | `create-test-repo.sh` | Rich history: 3 `--no-ff` merges, octopus merge, criss-cross pair, slash-named branches, 2 stashes, tags, bare local `origin` |
| `vscode-perf` | `create-perf-repo.sh` | 1000+ commits |
| `vscode-fork3` / `vscode-fork50` | `create-fork-merge-repo.sh 3|50` | N developers fork one base and merge back |
| `vscode-conflict` | `create-conflict-repo.sh` | Merge left in progress with `UU conflict.txt` |
| `vscode-dirty` | `create-dirty-repo.sh` | `M app.js` + `?? NOTES.md` uncommitted |

Useful fixture facts the tests rely on:
`feat: octopus branch a` **is** in the default branch's history (clean revert
target); `feat: cross y` is **not** (clean cherry-pick target; needs the
"All branches" log toggle); `feature/diverged` is the only feature branch not
yet merged; the default branch tracks the bare `origin`.

---

## hydragit.spec.ts — extension bootstrap

| Test | Asserts |
|---|---|
| extension activates and shows sidebar | "View: Show HydraGit" runs from the command palette without error |
| command palette opens and finds HydraGit commands | ≥1 `HydraGit:` command is listed in the palette |
| commit log shows entries / stash list is populated | smoke only — logs the webview frame count (no assertion) |

## journeys.spec.ts — user journeys (S-numbers)

| Test | Asserts |
|---|---|
| S1 cold open | branch tree rows (`.titem`) **and** commit rows (`.crow`) render |
| S2 commit → file → diff | selecting a `feat:` commit lists its files; clicking a file opens a **workbench diff editor** |
| S4 Go to Parent Commit | the selection (`.crow.sel`) moves to a row |
| S5 search filters the log | a no-match query shrinks the row count; clearing restores it |
| S6 File History | opens README.md first, runs the command, a history webview appears |
| S7 checkout via context menu | flash **and** `git rev-parse --abbrev-ref HEAD` = `feature/logging` |
| S8 merge feature branch | merges `feature/diverged` (real state change), answers the merge-preview modal, then `git merge-base --is-ancestor feature/diverged HEAD` succeeds |
| S12 cherry-pick | toggles log to All branches, picks `feat: cross y`, then `git log -1 --format=%s` = `feat: cross y` |
| S13 revert | reverts `feat: octopus branch a`, then `git log -1` = `Revert "feat: octopus branch a"` |
| S9 new branch via rail | flash, branch row visible, **and** `git branch --list journey/new-branch` lists it |
| S14 reset to commit | resets (mixed) to `docs: add contributing section`, then `git log -1` = that subject |
| S15 create tag via rail | answers name+message quick-inputs, then `git tag -l v9.9.9` = `v9.9.9` |

## journeys-dirty.spec.ts — staging/stash (vscode-dirty)

| Test | Asserts |
|---|---|
| S10 stage, message, commit | file row clears from the sidebar; `git log -1` = the typed subject; `git status --porcelain` = `?? NOTES.md` only; the commit appears in the main-panel log. Answers the protected-branch "Commit anyway?" modal |
| S11 stash then pop | after stash: `git stash list` has an entry and `M app.js` is gone; stash row appears in the tree; after Pop: stash list empty and `M app.js` is back |

## bugs.spec.ts — regression coverage keyed to BUGS.MD

| Test | Asserts |
|---|---|
| #1 file-name search stays responsive | after typing a query the log shows rows or the empty state (no freeze) |
| #2 create-tag (action rail) | answers name+message quick-inputs; `git tag -l e2e-tag` = `e2e-tag` |
| #3 stash Show Diff | stash context menu → file list renders in the detail pane; clicking a file opens a `(stash@{n})` editor tab |
| #20 external git change | an out-of-band `git checkout -b` + commit shows up in the UI (watcher refresh, no wedge) |
| #21 default-branch star | at most one branch row carries the ⭐ icon |
| #23 Edit Commit Message… | plants a real tip commit, rewords it via the menu + quick-input; `git log -1` shows the **new** message |
| #23 Drop Commit | plants `e2e-drop-me`, drops it via menu + Yes modal; the subject is gone from `git log -5` |
| #23 Push All up to Here… | plants `e2e-push-me`, pushes via menu + Yes modal; `git ls-remote origin <branch>` tip SHA = local HEAD SHA |
| #24 Revert Selected Changes | `git log -1` = `Revert "feat: octopus branch a"` |
| #24 Cherry-Pick Selected Changes | toggles to All branches; `git log -1` = `feat: cross y` |
| #24 Open Repository Version | a workbench editor tab opens with the committed file content |
| #25 Compare with / Show Diff with Working Tree | the compare renders in the detail pane (file list or hunks) |
| *skipped/fixme* | #19 → conflict.spec; #22 blame-hover timing (not automatable); #23 Create Patch… ends in a native OS save dialog (not automatable) |

## buttons.spec.ts — action rail & toolbar

| Test | Asserts |
|---|---|
| renders the full rail button set | exactly **12** `button.rail-btn` (mirrors ActionRail.svelte) |
| rail Fetch / Pull / Push succeeds against origin | the **success** flash text (`fetch done` / `pull done` / `Pushed …`) — an error flash fails the test |
| refresh reloads without error | commit rows still present after refresh |
| search keeps the panel responsive | rows or empty state after typing (BUG #1 twin) |

## context-menus.spec.ts — menu contracts

| Test | Asserts |
|---|---|
| branch menu full item set | right-click on a leaf branch row shows all 9 expected items (Switch to Branch … Delete) |
| commit menu all items present | right-click on a commit row shows every wired + previously-dead item |
| Copy Revision Number | produces a flash (clipboard isn't readable from the test) |
| *fixme* Create Patch… | native OS save dialog — not automatable |

## reflog.spec.ts — HEAD undo timeline

| Test | Asserts |
|---|---|
| clicking HEAD opens the timeline | `.reflog-pane` with soft/mixed/hard reset buttons appears; the commit graph is **gone** (count 0), not hidden |
| Back button restores | `.reflog-pane` gone; graph rows and detail pane back |
| selecting a branch exits the timeline | clicking a leaf branch row closes the pane and restores the graph |
| timeline auto-updates | an out-of-band `git commit` appears as the newest reflog subject (watcher → refresh) |

## worktree.spec.ts — worktrees section

| Test | Asserts |
|---|---|
| expands to show the main working tree | exactly 1 `.titem.worktree`, badged `main` |
| picks up an externally added worktree | `git worktree add` → second row appears (watcher); its context menu offers Open in New Window / Remove |
| New-worktree rail button | `button.rail-btn.worktree` is present |

## negative.spec.ts — resilience

| Test | Asserts |
|---|---|
| file-name search responsive (BUG #1) | rows (`.crow`) or empty state (`.log-empty`) after a filename query |
| external git change (BUG #20) | out-of-band branch + commit becomes visible without wedging |

## conflict.spec.ts — merge conflict UI (vscode-conflict)

| Test | Asserts |
|---|---|
| conflicted file listed | `conflict.txt` appears in the sidebar's changed-files tree |
| conflict status marker | the row has `data-status="!"` (unmerged — not plain M/A/D) and `data-path="conflict.txt"` |
| opens the merge resolver | clicking the row opens a merge/diff/plain editor and a `conflict.txt` tab |

## blame.spec.ts — inline blame (editor-side)

| Test | Asserts |
|---|---|
| summary at end of active line | the blame decoration's pseudo-element `content` contains the fixture's commit summary (`Initial commit`) in the Monaco DOM |

## graph-render.spec.ts — graph correctness

| Test | Asserts |
|---|---|
| every commit gets exactly one node | `#nodes (r=3.5 dots + r=5 merge rings) == #rows` |
| octopus + criss-cross | ≥4 merge rings rendered and connector `<path>` curves exist |

## graph-perf.spec.ts / graph-fork3 / graph-fork50 — scale & lanes

| Test | Asserts |
|---|---|
| perf: 1000+ commits | full history loaded (scroll spacer > 1000 rows) **but** <150 rows in the DOM (virtualization); scroll-to-bottom still renders; first paint <30 s |
| fork3 | spacer = exactly 10 commits; lane count 3–6 (each feature keeps a lane, no collapse, no blow-up) |
| fork50 | spacer = exactly 151 commits; DOM virtualized; lane count ≤8 (shared-base lanes are reused — not 50 wide); scroll responsive |

---

## Conventions

- **Reveal first**: `getWebviewFrame()` auto-reveals the view (palette / activity
  bar) and retries — specs don't need to open HydraGit manually.
- **Dialog seam**: app prompts surface as VS Code quick-inputs; confirms as DOM
  modals (the fixture forces `window.dialogStyle: "custom"` — macOS native
  modals are invisible to Playwright). Answer with `.quick-input-box input` +
  Enter, or click `Yes` in `.monaco-dialog-box`.
- **Rail buttons by `aria-label`**, never by index — the rail grows.
- **Branch rows**: slash-named branches nest in collapsed folders; expand the
  folder and use a leaf row (`.titem:not(.folder-row):not(.head)`); folder/HEAD
  rows have no branch context menu.
- **Merge commits have an empty `diff-tree`** — pick a `feat:` commit when a
  test needs a file list.
- **Not automatable** (kept as `test.fixme` so they stay on the radar): native
  OS save dialog (Create Patch…), blame hover timing (#22).
