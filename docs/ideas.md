# HydraGit — Ideas

## A) GitLens Pro features that fit HydraGit's vision (worth stealing)

These align with the "IntelliJ panel, no paywall" positioning, and all are implementable under the `os/exec + git CLI only` constraint. The PyCharm column shows how JetBrains already solves the same need — that's the real bar to clear, not GitLens' visuals.

| GitLens Pro feature | What it does | HydraGit status | PyCharm equivalent |
|---|---|---|---|
| **Commit Graph search/filter** | Filter graph by author/message/file/branch, jump between matches | Graph exists; no search/filter | Git log tab — filter dropdowns (Branch / User / Date / Path) + text search |
| **Visual File History** | Per-file timeline — every commit that touched a file, who/when | DONE | `Git → Show History` — per-file commit list with diff on each revision |
| **Line/file blame & hovers** | Inline blame annotations, "who changed this line + commit" | Not present | `Annotate with Git Blame` — per-line author/commit/date in the gutter |
| **Revision navigation** | Step backward/forward through a file's history in the editor | Not present | History tab + diff viewer; arrow through revisions in the diff view |
| **Worktree management UI** | Create/switch/remove worktrees visually | Not present | `Git → Manage Worktrees` (newer versions); otherwise branch-based |
| **Interactive rebase editor** | Drag-to-reorder/squash UI | Backlog (v0.3), not built | Interactive rebase dialog (`Git → Rebase` → Interactively) |
| **Branch/ref compare** | Diff two branches or arbitrary refs | Backlog (v0.3) | `Git → Compare with Branch` / `Compare with Local` |
| **Search & Compare view** | Search commits across the repo by message/SHA/author | Not present | Git log tab search + `Find in Files` for commit metadata |
| **interactive branch foleder renaming** | | Not present | |
|source branch chabge rename adding additional one | | Not present | |

**Priority read:** the features that actually threaten the pitch are **inline blame**, **Visual File History (per-file list)**, and **graph search/filter** — all standard daily-driver expectations from PyCharm users, all doable with `git blame --porcelain`, `git log --follow`, and `git log --grep/--author`.

## B) Done

- **Visual File History** — per-file commit timeline. Shipped (#20).
- **Selection History** — selection/range history with custom diff. Shipped (#20).

## C) Graph polish (separate track)

A nicer / more beautiful graph rendering is its own work item — not bundled with the history features above. Keep it scoped on its own so it doesn't block or get blocked by the functional features (search/filter, blame, etc.).

## D) Testing — Windows (deferred)

Windows is **not** a current concern, but it's the one test scenario that needs real infrastructure, so it's parked here rather than implemented.

**Why it can't go in the existing test layers:**

- It's a *build + spawn* concern (binary naming `hydragit` vs `hydragit.exe`, `\` vs `/` path separators, `os/exec` lookup), not git-output parsing or webview rendering — so neither the Go integration tests nor the Playwright specs cover it.
- **Docker does not help.** A Linux container can't exercise `.exe` resolution or backslash paths, so containerizing buys nothing here.

**Plan when we do care:**

- Add a `windows-latest` GitHub Actions runner to the CI matrix.
- Run the Go test suite there (`go test ./...`) — confirms `run()` / `os/exec` resolve git correctly on Windows.
- Add a smoke launch: spawn the built binary, send one `status` IPC request, assert a JSON line comes back. Catches binary-naming / spawn-path bugs the extension would otherwise hit on activation.
- Playwright e2e on Windows is lower priority (the webview is OS-independent); revisit only if a Windows-specific render bug surfaces.

Everything else in the testing table is already covered: graph topology edge cases (octopus, criss-cross, multiple roots, lane recycling, re-merge churn, wide concurrency) as pure-function tests in `internal/graph/lanes_test.go`; repo-state scenarios (single branch / no remotes, 5+ branches & 2 remotes, multiple stashes, detached HEAD, tags-only commits, 1000 branches, same-timestamp topo-order) as Go integration tests in `internal/git/scenarios_test.go`; and graph render + 1000-commit scroll perf as Playwright specs (`tests/e2e/graph-render.spec.ts`, `graph-perf.spec.ts`).
