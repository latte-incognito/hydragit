# HydraGit — Ideas

Backlog of features worth stealing from GitLens Pro, framed against the PyCharm
bar (the real target, given the "IntelliJ panel, no paywall" positioning). All
implementable under the `os/exec + git CLI only` constraint.

- Shipped features → `IMPLEMENTED_FEATURES.md`
- Graph-engine polish already in progress → `FIRST_TO_RESOLVE.MD`

## Backlog (not yet built)

| Feature | What it does | PyCharm equivalent |
|---|---|---|
| **Revision navigation** | Step back/forward through a file's history in the editor | History tab + diff arrows |
| **Worktree management UI** | Create / switch / remove worktrees visually | `Git → Manage Worktrees` |
| **Interactive rebase editor** | Drag-to-reorder / squash UI | Interactive rebase dialog |
| **Branch / ref compare** | Diff two branches or arbitrary refs | `Compare with Branch` |
| **Search & Compare view** | Cross-repo commit search + jump-between-matches | Git log search + Find in Files |
| **Interactive branch-folder rename** | Rename a whole `folder/` of branches at once | — |

**Top priority: inline blame** — the one remaining standard PyCharm daily-driver
expectation not yet covered. Doable with `git blame --porcelain`.

## Quality-of-life git actions (high-frequency, low-friction)

"Do it from the UI in one click, not 10 moves in the terminal." These wrap
common multi-step git dances behind a single guarded action.

| Action | What it does (and the friction it removes) |
|---|---|
| **Undo / reflog timeline** | Cancel the last operation or step back a chain: `--abort` for in-progress merge/rebase/cherry-pick, `reset --hard ORIG_HEAD` for a just-finished merge/rebase/pull, or surface `git reflog` as a timeline to reset to any point. Guard: stash/warn about uncommitted work before a hard reset. |
| **Rename branch (local + remote)** | Rename and propagate to the remote in one action — `branch -m`, push the new name with upstream, delete the old remote branch — instead of the ~3-step manual dance. Guard: block on the default/protected branch, confirm before deleting the old remote ref. Extends the existing local-only `branch.rename`. |
| **Squash adjacent commits** | Select 2+ contiguous commits in the log → squash into one (scripted `rebase -i`, or `reset --soft` for the HEAD case). Non-adjacent squash needs reordering (conflict-prone) → that's the interactive-rebase editor. |
| **Amend / reword last commit** | Edit the last commit's message, or fold staged changes into it (`git commit --amend`), from the UI. |
| **Move changes to another branch** | "Oops, wrong branch" fix — move uncommitted work (or the last commit) onto a new/other branch safely, instead of stash → checkout → pop. |
| **Sync + safe force-push** | One-click fetch + integrate; force-push uses `--force-with-lease` so it won't clobber a teammate's pushes. |

## Deferred — Windows testing

Needs a real `windows-latest` CI runner (binary `.exe` naming, `\` vs `/` paths,
`os/exec` lookup) — Docker can't substitute. Plan when it matters: run
`go test ./...` + a spawn-and-`status` smoke on a Windows runner.
