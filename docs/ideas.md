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

**Priority read:** the features that actually threaten the pitch are **inline blame**, **Visual File History (per-file list)**, and **graph search/filter** — all standard daily-driver expectations from PyCharm users, all doable with `git blame --porcelain`, `git log --follow`, and `git log --grep/--author`.
