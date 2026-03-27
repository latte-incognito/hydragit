# HydraGit — Build Tasks

How to use: start each Claude Code session with:
> "Read CLAUDE.md and TASKS.md. Continue from the next unchecked item."

Check off items as they're completed and verified working.

---

## v0.1.0

### Step 1 — Go IPC skeleton

- [x] `cmd/hydragit/main.go`
  - bufio.Scanner on stdin
  - unmarshal JSON request
  - route to handler
  - marshal + println response
  - reads `HYDRAGIT_REPO` env var
  - **verify:** `echo '{"id":"1","cmd":"ping","params":{}}' | ./hydragit-server` responds

- [x] `internal/ipc/handler.go` — stub
  - `Handle(req Request) Response` switch statement
  - returns `{ok:false, error:"not implemented"}` for all cmds for now
  - **verify:** binary compiles and returns stub responses

---

### Step 2 — Git operations

- [x] `internal/git/repo.go`
  - `run(repoPath string, args ...string) (string, error)` helper
  - captures stdout, stderr on exit error
  - sets `cmd.Dir = repoPath`
  - **verify:** unit test — `run(".", "rev-parse", "--abbrev-ref", "HEAD")` returns branch name

- [x] `internal/git/log.go`
  - `Status()` — branch, ahead, behind, modified count
  - `Log(branch string, limit int)` — commits with hash, message, author, date, refs
  - **verify:** test against real repo, returns >0 commits

- [x] `internal/git/branches.go`
  - `Branches()` — local + remote, isCurrent, upstream
  - `Checkout(branch string) error`
  - `CreateBranch(name, from string) error`
  - `DeleteBranch(name string, force bool) error`
  - `RenameBranch(from, to string) error`
  - `Merge(branch string) error`
  - `Rebase(onto string) error`
  - `Push(branch string) error`
  - `Fetch() error`
  - `Pull() error`
  - **verify:** `Branches()` returns correct local+remote list on a multi-branch repo

- [x] `internal/git/diff.go`
  - `DiffCommit(commit string)` — file list with status + additions/deletions
  - `DiffFile(commit, file string)` — hunks with line type + content
  - **verify:** returns file list for a known commit hash

- [x] `internal/git/stash.go`
  - `StashList()` — index, message, time, additions, deletions
  - `StashPop(index int) error`
  - `StashApply(index int) error`
  - `StashDrop(index int) error`
  - `StashShow(index int)` — diff hunks
  - `StashSave(message string) error`
  - **verify:** list returns correct count, pop removes entry

- [x] `internal/graph/lanes.go`
  - `AssignLanes(commits []RawCommit) []LaidOutCommit`
  - see `docs/graph_algorithm.md` for full spec
  - **verify:** single branch → all lane 0, straight paths. merge commit → curve path to second parent.

### Step 2.5 — Test foundations (one per package, extend yourself)

- [x] `internal/git/repo_test.go`
  - `TestRun` — run `git rev-parse --abbrev-ref HEAD` against a real tmp repo, assert non-empty string returned
  - sets the pattern: `git.Init()` a temp dir, make commits, run assertions, cleanup
  - **this is the template all other git tests follow**

- [x] `internal/graph/lanes_test.go`
  - `TestSingleBranch` — 3 commits, 1 parent chain → all lane 0, all paths straight
  - `TestSimpleMerge` — merge commit + two parents → merge commit on lane 0, branch on lane 1, one curve path
  - pure function, no git needed, fast

---

- [x] `internal/ipc/handler.go` — full implementation
  - wire all v0.1 commands to git.* functions
  - `status`, `branches`, `log`, `diff`, `stash`, `stash.pop`, `stash.apply`, `stash.drop`, `stash.show`, `stash.save`
  - `checkout`, `branch.create`, `branch.delete`, `branch.rename`
  - `merge`, `rebase`, `fetch`, `pull`, `push`
  - `cherrypick`, `revert`
  - **verify:** each command returns real data from a test repo

---

### Step 4 — TypeScript shell

- [x] `extension/src/goProcess.ts`
  - spawn binary with `HYDRAGIT_REPO` env var
  - readline on stdout, pending promise map
  - `send(cmd, params)` → Promise
  - stderr → console.log with `[HydraGit]` prefix
  - `dispose()` kills process
  - **verify:** `goProcess.send('status', {})` resolves with real data

- [x] `extension/src/extension.ts`
  - `activate()` — resolve workspace root, spawn GoProcess, register `hydragit.open`
  - `deactivate()` — goProcess.dispose()
  - binary path from `ctx.extensionPath/bin/hydragit-server-<platform>-<arch>`
  - **verify:** F5 in VS Code, command palette shows "HydraGit: Open"

- [x] `extension/src/panel.ts`
  - create WebviewPanel, load `webview/index.html`
  - `onDidReceiveMessage` → `goProcess.send()` → `panel.webview.postMessage()`
  - `.git/` file watcher → `{type:'refresh'}` to webview
  - CSP: `default-src 'none'; script-src 'nonce-<x>'; style-src 'unsafe-inline'; img-src data:`
  - **verify:** panel opens in VS Code, shows the UI

---

### Step 5 — Webview wiring

- [x] `webview/index.html` — replace mock data with real postMessage calls
  - replace hardcoded `commits`, `branches`, `stashes` arrays with `send()` calls
  - `send(cmd, params)` helper using `vscode.postMessage` + `window.addEventListener('message')`
  - on load: `send('status')`, `send('branches')`, `send('log', {branch, limit:100})`
  - on branch click: `send('log', {branch})`
  - on commit click: `send('diff', {commit: hash})`
  - on stash load: `send('stash')`
  - all branch context menu actions wired
  - all stash actions wired
  - `{type:'refresh'}` message → re-fetch status + branches + log
  - **verify:** all panels show real git data from an actual repo

---

### Step 6 — Build system

- [x] `Makefile`
  - `build-go` — current platform
  - `build-all` — all 4 platforms (darwin-x64, darwin-arm64, linux-x64, win32-x64)
  - `build-ts` — `cd extension && npm run compile`
  - `build` — build-all + build-ts
  - `package` — build + vsce package
  - `publish` — build + vsce publish

- [x] `.vscodeignore`
  - exclude: `cmd/`, `internal/`, `go.*`, `extension/src/`, `Makefile`, `*.ts`
  - include: `extension/out/`, `webview/`, `bin/`, `images/`, `package.json`, `README.md`

---

### Step 7 — Pre-publish QA

- [ ] Test on repo with 1 branch, no remotes
- [ ] Test on repo with 5+ branches, 2 remotes
- [ ] Test on repo with 1000+ commits (scroll performance)
- [ ] Test on repo with active stashes
- [ ] Test on repo with merge commits (graph renders correctly)
- [ ] Test on Windows (binary naming, path separators)
- [ ] `vsce package` produces valid .vsix
- [ ] Install .vsix locally with `code --install-extension`
- [ ] Use installed extension on own repos for 3+ days

---

### Step 8 — Release prep

- [ ] `README.md` written (GIF at top, why section, features, install command)
- [ ] GIF recorded (15s: open → branches → click commit → diff → right-click → context menu)
- [ ] `CHANGELOG.md` written
- [ ] `package.json` has `repository`, `bugs`, `homepage` fields
- [ ] GitHub repo created and pushed
- [ ] Azure PAT created (scope: Marketplace → Manage)
- [ ] `vsce create-publisher vkushnarenko` done
- [ ] `vsce publish` run successfully
- [ ] Posted to r/vscode within 24h of publish
- [ ] Resume updated with Marketplace link + install count

---

## v0.2.0 (future — do not start until v0.1 is shipped)

- [ ] Staged diff view
- [ ] Split webview into index.html + index.js, use asWebviewUri, proper nonce CSP
- [ ] Unstaged diff view  
- [ ] Stage / unstage files
- [ ] Commit from extension
- [ ] Infinite scroll (load more commits)

## v0.3.0 (future)

- [ ] Interactive rebase UI
- [ ] Branch compare / PR diff
- [ ] Conflict resolution hints
