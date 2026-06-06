# Implemented Features

A running inventory of what HydraGit already does. Grounded in the actual IPC
command surface (`internal/ipc/handler.go`), the git layer (`internal/git/*`),
the graph engine (`internal/graph/*`), and the Svelte webview
(`webview/src/panels/*`).

> Architecture recap: VS Code spawns a Go binary; TypeScript bridges
> `postMessage` ↔ stdin/stdout JSON IPC; Go wraps the system `git` CLI via
> `os/exec`; the Svelte webview renders what it receives (no git logic in JS).

---

## UI / Views

Two Svelte webviews plus a status badge, surfaced through VS Code contributions.

### Main panel — `hydragit.mainView` (bottom panel)

The IntelliJ-style git panel. Resizable split layout (`PaneDivider`):

- **Branch tree** (`BranchPane`) — local + remote branches, folder-style
  grouping for `slashed/names`, current-branch marker, ahead/behind, right-click
  context menu, all-branches toggle.
- **Commit log + graph** (`LogPane`) — the lane graph rendered as inline SVG
  (colored dots, branch-line colors, merge curves) next to **resizable
  Commit / Author / Date columns**. Virtualized (renders only the visible
  window), full history, **hover a row to highlight its branch line**.
- **Commit detail** (`DetailPane`) — selected commit's metadata + changed-file
  tree + inline diff.
- **Toolbar** (`Toolbar`) — search box with **mode switch (message / hash /
  author / file)**, branch info, all-branches toggle.
- **Action rail** (`ActionRail`) — quick git action buttons.
- **Commit context menu** (`ContextMenu`) — copy revision, create patch,
  cherry-pick, checkout revision, reset to here, revert, new branch, new tag,
  go to parent/child commit, view in browser, etc.
- **Tooltips** throughout.

### Sidebar — `hydragit.sidebarView` (activity bar)

The staging/commit view:

- **Commit area** (`CommitArea`) — commit message input, stage state, hint text,
  **Commit** / **Commit & Push** actions.
- **Changed-files tree** (`FileTree`) — staged/unstaged files with status
  badges (M/A/D/R/U), collapsible folders.
- **Section headers** (`SectionHeader`) with counts.

### File History view

Opened via `HydraGit: File History` — a per-file commit timeline (every commit
that touched the file, follows renames), each revision diffable.

### Selection / Line History view

Opened via `HydraGit: History for Selection` — history for an editor selection /
line range, rendered with a **custom Shiki-based diff** (not VS Code's native
diff). See `memory/selection-history-custom-diff.md`.

### Status bar + activity-bar badge

`StatusBar` + the badge carrier show branch, ahead/behind, and modified count,
refreshed by the 3s status poll.

---

## Repository status

- **Status** (`status`) — current branch, ahead/behind counts, modified-file
  count, upstream presence, and the changed-file list. Polled every ~3s
  (`HydraStatusService`) and surfaced in the status bar + activity-bar badge.
- Handles **detached HEAD** and **tags-only** commits correctly.

## Branches

- **Branch list** (`branches`) — local + remote-tracking, current marker,
  upstream, ahead/behind track string, gone/orphan detection.
- **Checkout** (`checkout`), **create** (`branch.create`, optionally from a
  ref/hash), **delete** (`branch.delete`).
- **Rename — local + remote** (`branch.rename`, `branch.rename.remote`) — renames
  locally, then offers to propagate to the remote (push new with tracking, delete
  the old remote ref) when the branch had an upstream.
- **Branch-folder rename** (`branch.rename.folder`) — right-click a branch folder
  to rename every local branch under that prefix at once (suffixes preserved).
- **Branches containing a commit** (`branch.containing`).
- Branch tree UI with folder-style grouping for `slashed/branch/names`.

## Commit log + graph

- **Commit log** (`log`) — full history, `--topo-order`, with author/date/refs.
- **No row cap** — the entire history loads; the log is **virtualized** (only
  the visible window is in the DOM), so it scrolls smoothly at any size.
- **Lane graph** — HydraGit's own lane-assignment engine (`internal/graph`), not
  `git log --graph`. Key properties:
  - **Correct connections** — a branch only ever connects to its real parent; a
    merge node's incoming lines are only its real parents (no false folds).
  - **Compact** — branches that share an ancestor reuse lanes via short
    bundle diagonals (the `| |/` shape git uses); 50 branches off one base
    render in ~3 lanes, not 50, validated row-by-row against `git log --graph`.
  - **Genuinely-parallel branches still render wide** (correct, not collapsed).
  - Handles **merges, octopus (3+ parents), criss-cross, multiple roots,
    re-merge churn, lane recycling, same-timestamp** topologies.
  - **Per-branch-line color** (segments) — color follows the branch line, not
    the lane (lanes are reused), so each line is consistently colored.
- **Hover-highlight** — hovering a commit row highlights its branch line and
  dims the rest.
- **Commit detail pane** — metadata + diff for the selected commit.

## Diff

- **Commit diff** (`diff`) — changed-file list + per-file hunks.
- File tree view of changes; clicking a file opens its diff (preview tab;
  double-click / "Show Diff in a New Tab" opens a persistent tab).

## Compare (ref / working-tree diff)

- **Branch / ref compare** (`diff.range`) — diff two refs; backs branch
  "Compare with <branch>".
- **Ref vs working tree** (`diff.ref`) — backs branch/tag "Show Diff with Working
  Tree" and commit "Compare with Local"; multi-file results render in the detail
  pane's compare view.
- **File vs local** — "Compare with Local" / "Compare Before with Local" open a
  file@revision ↔ working-tree diff editor (`openWorkingDiff`).

## Stash

- **List** (`stash`), **save** (`stash.save`), **pop** (`stash.pop`),
  **apply** (`stash.apply`), **drop** (`stash.drop`), **clear all**
  (`stash.clear`, confirmed), **show** (`stash.show`), **files in a stash**
  (`stash.files`).
- Stash manager UI with diff preview.

## Commit (staging + committing)

- **Stage / commit** (`commit`) and **commit & push** (`commit.push`) from the
  sidebar commit area, with changed-file staging.
- **Amend last commit** (`commit.amend`, `commit.lastMessage`) — an "Amend last
  commit" toggle prefills HEAD's message for editing and folds the staged changes
  into it; staging is optional (message-only amend supported).

## Conflict resolution

- **Guidance banner** (`conflicts`) — while a merge/rebase/cherry-pick is paused,
  the sidebar shows the operation + unmerged files, each with quick actions:
  **merge editor**, **Current** (`conflict.keepCurrent` → `--ours`), **Incoming**
  (`conflict.keepIncoming` → `--theirs`). Current/Incoming are correct for both
  merge and rebase (HEAD is always "current").
- **Continue / Abort** (`conflict.continue` / `conflict.abort`) — routes per
  operation (rebase → `rebase --continue/--abort`; merge/cherry-pick/revert →
  commit / `--abort`). Continue is gated until all files are resolved.

## Merge / rebase / reset

- **Merge** (`merge`), **rebase** (`rebase`), **reset** (`reset`).

## Interactive rebase & history editing

- **Interactive rebase editor** — a drag-to-reorder modal (`InteractiveRebase`)
  with per-commit pick / squash / fixup / drop, driving `git rebase -i`
  non-interactively (`rebase.interactive`).
- **Drop commit** (`rebase.drop`) — removes a commit via `rebase --onto`.
- **Edit commit message / reword** (`rebase.reword`) — `commit --amend` for HEAD,
  scripted rebase reword otherwise.
- **Pause-on-conflict flow** — a rebase that conflicts pauses (never auto-aborts)
  and surfaces **Continue / Skip / Abort** (`rebase.continue` / `rebase.skip` /
  `rebase.abort`), restored across reloads via `rebase.status`.
- **Create patch** (`patch.format`) — `format-patch` of a commit to a `.patch`
  file via a native save dialog.
- **Push up to a commit** (`push.upto`) — publishes history up to a chosen commit.

## HEAD undo timeline (reflog)

- **`HEAD` row → undo timeline** — the branch tree's HEAD row swaps the commit
  graph for `git reflog` (`reflog`) as a flat list; the detail pane hides for
  room, and exiting (back button or selecting a branch) fully restores the view.
- **Reset to any point** — per-row soft / mixed / hard buttons (green → amber →
  red by destructiveness, themed via VS Code vars), one confirmation each.
- **Auto-stash safety net** — a hard reset on a dirty tree auto-stashes tracked
  changes first (`ResetWithAutostash`), so nothing is lost.
- **Live refresh** — git activity (here or external) writes `.git/logs/HEAD`,
  which the file watcher catches → the timeline reloads while open.

## Remotes

- **Sync** — one-click fetch + integrate (accented rail button): `fetch` then
  `pull`, instead of reasoning about fetch vs pull vs rebase.
- **Fetch** (`fetch`), **pull** (`pull`) with selectable **pull mode**
  (`pull.mode`), **push** (`push`).
- **Safe force-push** (`push.force`) — when a push is rejected (non-fast-forward),
  HydraGit offers a `--force-with-lease` push, which won't clobber remote commits
  you haven't fetched.
- **Auto-set upstream on first push** — a no-upstream `push` transparently
  retries `push -u origin HEAD`, so the `fatal: ...has no upstream branch` wall
  never reaches the user (pros never notice).
- **Remote branch delete** (`branch.delete.remote`) — deletes a branch on the
  remote via `push <remote> --delete` and prunes the local tracking ref.
- **Network-op timeout** — remote rename/delete pushes run under a 30s deadline
  so a credential prompt with no terminal can't freeze the panel.

## Repository health banners

- **Detached-HEAD banner** — when `status.detached`, a calm banner offers
  one-click "create a branch here" so work isn't stranded.
- **Git identity setup** — when `user.name`/`user.email` are unset, a banner
  offers inline setup (`user.set`, global) instead of the cryptic
  "Please tell me who you are".
- **Critical-error reload** — if the Go backend dies unexpectedly, the extension
  surfaces a "Reload Window" prompt.

## Undo / squash

- **Undo last operation** (`undo.last`) — toolbar express lane: aborts an
  in-progress merge/rebase/cherry-pick/revert, else `reset --hard ORIG_HEAD`
  (auto-stashing a dirty tree first).
- **Squash with parent** (`commit.squash`) — folds a commit into its parent
  (messages combined) via the interactive-rebase machinery.

## Cherry-pick / revert

- **Cherry-pick** (`cherrypick`), **revert** (`revert`).

## Tags

- **List** (`tags`), **create** (`tag.create`), **delete** (`tag.delete`).

## File & line history

- **Visual File History** (`file.history` / `log.file`) — every commit that
  touched a file, follows renames.
- **Line / Selection History** (`line.history`) — history for a line range /
  editor selection, with a custom Shiki-based diff view.
- Commands: `HydraGit: File History`, `HydraGit: History for Selection`.

## Search & filter

- **Message filter** (`--grep`) and **author filter** (`--author`) — server-side
  so the graph is re-laid-out over the matches (debounced).
- **Hash prefix** jump (client-side).
- **File search** — commits touching a path.
- **Branch scope** — the all-branches toggle / branch combobox restricts the log
  to a branch or `--all`.

## Cross-cutting

- **Logging** — daily-rotating JSON-lines logs (Go + TS Output Channel);
  `HydraGit: Open Logs Folder`, `HydraGit: Show Version Info`.
- **Resizable panes / columns**, context menus, tooltips, status badge.

---

## Testing

- **Go**: one real test per package + scenario tests (`internal/git`,
  `internal/graph`, `internal/ipc`) using real temp repos — branch/stash/tag/
  status/diff/log/filter scenarios, plus the full graph topology suite
  (octopus, criss-cross, multiple roots, two-features-from-one-base, wide vs
  compact, segments) validated against `git log --graph`.
- **Vitest + @testing-library/svelte**: component tests + a pure
  `graphSvg` suite (SVG structure, windowing, highlight dimming).
- **Playwright** (VS Code Electron e2e): graph render, fork-merge (3 & 50 devs),
  and large-history virtualization/perf, each with its own git fixture and
  Playwright project.

## Known follow-ups

Remaining graph polish: lane straightening for the last feature at a shared base,
wide-graph lane-width compression, and an optional focus / linear / hide-merges
view. Broader backlog (worktrees, reflog/undo timeline, etc.) → `docs/ideas.md`.
