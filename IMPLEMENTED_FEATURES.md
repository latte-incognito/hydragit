# Implemented Features

The authoritative list of what HydraGit ships — by name. Each feature links to its
full documentation (UI entry points + what happens next) in [`documentation/`](documentation/index.html).

> Detailed prose now lives in the HTML docs. Open
> [`documentation/index.html`](documentation/index.html) for the browsable, cross-linked version.

---

## Views & Layout

- [Main panel](documentation/features/main-panel.html)
- [Sidebar — staging view](documentation/features/sidebar.html)
- [Multi-repo workspaces (grouped sidebar + focused main panel)](documentation/features/multi-repo.html)
- [Repository status, status bar & badge](documentation/features/status.html)
- [Visual file history](documentation/features/history.html#filehistory)
- [Selection / line history](documentation/features/history.html#linehistory)
- [Inline line blame](documentation/features/history.html#blame)

## Branches

- [Branch tree & list](documentation/features/branches.html#list)
- [Checkout / switch](documentation/features/branches.html#checkout)
- [Create branch](documentation/features/branches.html#create)
- [Rename — local](documentation/features/branches.html#rename)
- [Rename — remote](documentation/features/branches.html#rename)
- [Rename — folder](documentation/features/branches.html#rename)
- [Delete — local](documentation/features/branches.html#delete)
- [Delete — remote](documentation/features/remotes.html#remote-delete)
- [Branches containing a commit](documentation/features/branches.html#containing)

## Commit Log & Graph

- [Commit log](documentation/features/commit-log-graph.html#log)
- [Lane graph](documentation/features/commit-log-graph.html#graph)
- [Hover-highlight](documentation/features/commit-log-graph.html#hover)
- [Commit detail pane](documentation/features/commit-log-graph.html#detail)
- [Columns & virtualization](documentation/features/commit-log-graph.html#columns)

## Search & Filter

- [Message filter](documentation/features/search-filter.html#message)
- [Hash prefix jump](documentation/features/search-filter.html#hash)
- [File search](documentation/features/search-filter.html#file)
- [Author filter](documentation/features/search-filter.html#author)
- [Pickaxe / code search — commits that added or removed a string](documentation/features/search-filter.html#pickaxe)
- [Branch scope](documentation/features/search-filter.html#scope)

## Diff & Compare

- [Commit diff](documentation/features/diff.html)
- [Branch / ref compare](documentation/features/compare.html#range)
- [Ref vs working tree](documentation/features/compare.html#ref)
- [File vs local](documentation/features/compare.html#file)

## Commit & Staging

- [Stage & commit](documentation/features/commit.html#commit)
- [Commit & push](documentation/features/commit.html#push)
- [Amend last commit](documentation/features/commit.html#amend)
- [Pre-commit safety checks](documentation/features/commit.html#safety) — warn (never block) on likely secrets, conflict markers, files > 5 MB, commits straight to main/master

## History Rewriting

- [Interactive rebase editor](documentation/features/interactive-rebase.html#editor)
- [Pause on conflict](documentation/features/interactive-rebase.html#pause)
- [Squash with parent](documentation/features/interactive-rebase.html#squash)
- [Drop commit](documentation/features/interactive-rebase.html#drop)
- [Edit / reword message](documentation/features/interactive-rebase.html#reword)
- [Create patch](documentation/features/interactive-rebase.html#patch)
- [Push up to a commit](documentation/features/interactive-rebase.html#pushupto)
- [Fixup + autosquash](documentation/features/interactive-rebase.html#fixup) — park corrections as `fixup!` commits, fold them all in one autosquash rebase

## Integrate & Resolve

- [Merge](documentation/features/merge-rebase-reset.html#merge)
- [Merge conflict preview](documentation/features/merge-rebase-reset.html#preview) — dry-run verdict in every merge confirm, working tree untouched (git ≥ 2.38)
- [rerere](documentation/features/conflicts.html#rerere) — conflict resolutions recorded and silently reused on repeat (`hydragit.rerere.enabled`)
- [Rebase](documentation/features/merge-rebase-reset.html#rebase)
- [Reset](documentation/features/merge-rebase-reset.html#reset)
- [Cherry-pick](documentation/features/cherrypick-revert.html#cherrypick)
- [Revert](documentation/features/cherrypick-revert.html#revert)
- [Conflict resolution](documentation/features/conflicts.html)

## Remotes & Sync

- [Sync (fetch + integrate)](documentation/features/remotes.html#sync)
- [Fetch](documentation/features/remotes.html#fetch)
- [Pull + pull mode](documentation/features/remotes.html#pull)
- [Push](documentation/features/remotes.html#push)
- [Safe force-push](documentation/features/remotes.html#force)
- [Auto-set upstream](documentation/features/remotes.html#upstream)
- [Remote branch delete](documentation/features/remotes.html#remote-delete)
- [Network-op timeout](documentation/features/remotes.html#timeout)

## Undo & Safety

- [Working-tree snapshots](documentation/features/snapshots.html) — full tree (incl. untracked) auto-captured before risky ops; browse/diff/restore/delete from the branch pane
- [HEAD undo timeline (reflog)](documentation/features/reflog.html)
- [Reset to any point](documentation/features/reflog.html#reset)
- [Auto-stash safety net](documentation/features/reflog.html#autostash)
- [Live reflog refresh](documentation/features/reflog.html#live)
- [Undo last operation](documentation/features/undo-squash.html#undo)
- [Detached-HEAD banner](documentation/features/health-banners.html#detached)
- [Git identity setup](documentation/features/health-banners.html#identity)
- [Critical-error reload](documentation/features/health-banners.html#reload)

## Stash

- [Stash list](documentation/features/stash.html#list)
- [Save / stash changes](documentation/features/stash.html#save)
- [Apply](documentation/features/stash.html#applypop)
- [Pop](documentation/features/stash.html#applypop)
- [Unstash](documentation/features/stash.html#applypop)
- [Drop](documentation/features/stash.html#dropclear)
- [Clear](documentation/features/stash.html#dropclear)
- [Show diff & files](documentation/features/stash.html#show)

## Tags

- [Tag list](documentation/features/tags.html#list)
- [Create tag](documentation/features/tags.html#create)
- [Delete tag](documentation/features/tags.html#delete)
- [Checkout · diff · merge · push tag](documentation/features/tags.html#more)

## Worktrees

- [Worktree list](documentation/features/worktrees.html#list)
- [Add worktree](documentation/features/worktrees.html#add)
- [Open in new window](documentation/features/worktrees.html#open)
- [Lock / unlock](documentation/features/worktrees.html#lock)
- [Move](documentation/features/worktrees.html#move)
- [Remove](documentation/features/worktrees.html#remove)
- [Prune stale](documentation/features/worktrees.html#prune)

## Context Menus & Tooling

- [Commit context menu](documentation/features/context-menus.html#commit)
- [Branch context menu](documentation/features/context-menus.html#branch)
- [Stash context menu](documentation/features/context-menus.html#stash)
- [Tag context menu](documentation/features/context-menus.html#tag)
- [Logging & diagnostics](documentation/features/logging.html)
- [Show version info](documentation/features/logging.html#version)
- [Force refresh](documentation/features/logging.html#refresh)

---

> Backlog / not-yet-built features live in [`docs/ROADMAP.md`](docs/ROADMAP.md) §5 —
> the single source of truth for what's planned (frozen until after 1.0).

## Testing

The suite spans a `_test.go` per `internal/git` source file plus
`scenarios_test.go`, `internal/graph` topology tests, Vitest component +
`graphSvg` tests, and Playwright e2e. See [`CLAUDE.md`](CLAUDE.md) → Testing approach.
