# HydraGit — Build Tasks

How to use: start each Claude Code session with:
> "Read CLAUDE.md and TASKS.md. Continue from the next unchecked item."

Check off items as they're completed and verified working.

---

## v0.1.0

### Step 1 — Go IPC skeleton ✅

- [x] `cmd/hydragit/main.go` — bufio.Scanner, JSON loop, HYDRAGIT_REPO env var
- [x] `internal/ipc/handler.go` — stub routing, returns not-implemented for all cmds

### Step 2 — Git operations ✅

- [x] `internal/git/repo.go` — `run()` helper, captures stdout/stderr, sets cmd.Dir
- [x] `internal/git/log.go` — `Status()`, `Log()`
- [x] `internal/git/branches.go` — `Branches()`, `Checkout()`, `CreateBranch()`, `DeleteBranch()`, `RenameBranch()`, `Merge()`, `Rebase()`, `Push()`, `Fetch()`, `Pull()`
- [x] `internal/git/diff.go` — `DiffCommit()`, `DiffFile()`
- [x] `internal/git/stash.go` — `StashList()`, `StashPop()`, `StashApply()`, `StashDrop()`, `StashShow()`, `StashSave()`
- [x] `internal/graph/lanes.go` — `AssignLanes()` with lane/color/paths

### Step 2.5 — Test foundations ✅

- [x] `internal/git/repo_test.go` — `TestRun` against real tmp repo
- [x] `internal/graph/lanes_test.go` — `TestSingleBranch`, `TestSimpleMerge`

### Step 3 — Full IPC handler ✅

- [x] `internal/ipc/handler.go` — all v0.1 commands wired to git.* functions
- [x] `internal/logger/logger.go` — daily rotating JSON-lines log, 7-day retention
- [x] Logging wired into handler (timing, IPC request/response)

### Step 4 — TypeScript shell ✅

- [x] `extension/src/goProcess.ts` — spawn, readline, pending map, dispose()
- [x] `extension/src/extension.ts` — activate/deactivate, binary path resolution, commands
- [x] `extension/src/Logger.ts` — Output Channel singleton
- [x] `extension/src/HydraStatusService.ts` — 3s poll, onDidChange
- [x] `extension/src/panel.ts` — HydraViewProvider, HydraSidebarProvider, HydraBadgeTreeProvider

### Step 5 — Webview (Svelte) ✅

- [x] Sidebar panel: file list, per-file checkboxes, master checkbox, staged count, CommitArea
- [x] Main panel: branch pane, log pane with graph, detail pane, toolbar
- [x] messageBus.ts send/on with id-based pending map
- [x] Status polling wired (`send('status', {})` on mount)
- [x] `send('getStatus')` bug fixed → `send('status', {})`

### Step 6 — Build system ✅

- [x] `Makefile` — build-go, build-all (4 platforms), build-ts, build, package, publish
- [x] `.vscodeignore` — correct includes/excludes for .vsix

---

### Step 7 — Pre-publish QA 🚧

- [ ] Test on repo with 1 branch, no remotes
- [ ] Test on repo with 5+ branches, 2 remotes
- [ ] Test on repo with 1000+ commits (scroll performance)
- [ ] Test on repo with active stashes
- [ ] Test on repo with merge commits (graph renders correctly)
- [ ] Test on Windows (binary naming, path separators)
- [ ] `vsce package` produces valid .vsix
- [ ] Install .vsix locally: `code --install-extension hydragit-0.1.0.vsix`
- [ ] Use installed extension on own repos for 3+ days

---

### Step 8 — Release prep

- [ ] `README.md` written (GIF at top, why section, features, install command)
- [ ] GIF recorded (15s: open → branches → click commit → diff → right-click → context menu)
- [ ] `CHANGELOG.md` written
- [ ] `package.json` has `repository`, `bugs`, `homepage` fields
- [ ] GitHub repo created and code pushed
- [ ] Azure PAT created (scope: Marketplace → Manage)
- [ ] `vsce create-publisher vkushnarenko` done
- [ ] `vsce publish` run successfully
- [ ] Posted to r/vscode within 24h of publish
- [ ] Resume updated with Marketplace link + install count

---

## Post-v0.1 backlog (do not start until v0.1 is shipped)

- [ ] Staged diff view
- [ ] Split webview into index.html + index.js, use asWebviewUri, proper nonce CSP
- [ ] Unstaged diff view  
- [ ] Stage / unstage files
- [ ] Commit from extension
- [ ] Infinite scroll (load more commits)

## v0.3.0 (future)

### v0.3.0 — "Power Features"
- [ ] Stash UI in sidebar (all IPC commands exist, Svelte UI missing)
- [ ] VS Code StatusBarItem: `branch ↑2 ↓1` using `ahead`/`behind`
- [ ] Interactive rebase UI
- [ ] Branch compare / PR diff
- [ ] Conflict resolution hints in statusbar

### Cleanup (anytime)
- [ ] Remove `ContextMenu.svelte` dead code
- [ ] Add `.prettierrc`
- [ ] Downgrade no-upstream `rev-list` log from error → warn
- [ ] Relative date display in commit log (log.go returns RFC3339, UI needs human format)
- [ ] Playwright tests (after UI stabilises)
- [ ] GitHub Actions CI (when repo goes public)
