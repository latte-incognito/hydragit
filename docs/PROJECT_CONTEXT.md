# HydraGit — Project Context

> IntelliJ-style git panel inside VS Code. Branch tree, commit log, inline diff, stash manager. No paywall.
> Built because GitLens went paywalled and VS Code's built-in git panel has no history view.

**Publisher:** `vkushnarenko.hydragit` (reserved — not yet published to Marketplace)
**Status:** v0.2.0 in repo, pre-publish — staging/commit, tags, blame, and file/line history built on top of the v0.1 core. The repo is the source of truth.

---

## Stack

| Layer | Tech |
|---|---|
| Extension host | TypeScript + VS Code API |
| UI | Svelte 4 (compiled via Vite → `webview/sidebar.js/.css`, `webview/index.js/.css`) |
| Git backend | Go binary — stdin/stdout newline-delimited JSON IPC |
| Git operations | `os/exec` wrapping system `git` — no go-git library |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  VS Code (Electron)                                  │
│                                                      │
│  ┌────────────────────┐   ┌────────────────────────┐ │
│  │  Extension Host    │   │  Webview               │ │
│  │  (Node.js)         │◄──►  (Chromium iframe)     │ │
│  │                    │   │                        │ │
│  │  extension.ts      │   │  Svelte panels         │ │
│  │  goProcess.ts      │   │  (sidebar + index)     │ │
│  │  panel.ts          │   │                        │ │
│  └─────────┬──────────┘   └────────────────────────┘ │
│            │ spawn                                    │
└────────────┼─────────────────────────────────────────┘
             │ stdin / stdout (newline-delimited JSON)
┌────────────▼─────────────┐
│  hydragit-server (Go)    │
│  main.go — IPC loop      │
│  handler.go — routing    │
│  git/* — os/exec proxy   │
└────────────┬─────────────┘
             │ os/exec
┌────────────▼─────────────┐
│  git (system binary)     │
└──────────────────────────┘
```

### Message flow

```
Go Status() ──► HydraStatusService.onDidChange()
                  ──► HydraSidebarProvider.postStatus()
                        ──► webview postMessage({ type: 'statusUpdate', data })
                              ──► messageBus.on('statusUpdate') → Sidebar.svelte

Sidebar.svelte ──► messageBus.send('status', {})
                     ──► vscode.postMessage({ id, cmd:'status', params })
                           ──► panel.ts onDidReceiveMessage
                                 ──► goProcess.send('status', {})
                                       ──► Go ipc.Handle() ──► back
```

---

## Repo structure

```
bin/
  hydragit-server-darwin-arm64
  hydragit-server-darwin-x64
  hydragit-server-linux-x64
  hydragit-server-win32-x64.exe

cmd/hydragit/
  main.go                   — Go entrypoint. Reads HYDRAGIT_REPO + HYDRAGIT_LOG_DIR env vars.
                              Initialises logger, stdin JSON loop → ipc.Handle()

internal/git/
  repo.go                   — run()/runStdin() single entry point for all git CLI calls.
                              Logs every command via logger.GitCmd(). Captures duration + exit code.
                              runStdin feeds editor buffers to `git blame --contents -`.
  status.go                 — Status() → StatusResult { branch, ahead, behind, modified, files[] }
  log.go                    — Log()/LogWith()/LogFile()/FileHistory()/LineHistory() → []Commit
  branches.go               — Branches(), Checkout(), CreateBranch(), DeleteBranch(),
                              RenameBranch(), BranchContaining(), Merge(), Rebase(), Reset(),
                              Push(), Fetch(), Pull(), PullMode()
  diff.go                   — DiffCommit() → []FileStat, DiffFile() → []Hunk
  stash.go                  — StashList(), StashPop(), StashApply(), StashDrop(),
                              StashShow(), StashFiles(), StashSave()
  commit.go                 — CreateCommit(), CommitAndPush() (stage paths + commit)
  tags.go                   — Tags(), CreateTag(), DeleteTag()
  blame.go                  — Blame() → per-line blame, buffer-aware via runStdin
  config.go                 — User() → committer name/email from git config
  cherrypick.go             — CherryPick(), Revert()
  *_test.go                 — one real test per source file + scenarios_test.go
                              (real temp-repo scenarios, no mocking)

internal/graph/
  lanes.go                  — AssignLanes() assigns lane/color/paths to commits for graph rendering
                              LaneColors []string (8 colors cycling), LaidOutCommit type

internal/ipc/
  handler.go                — Handle() dispatches JSON commands to git functions.
                              Logs every request+response with timing via logger package.
                              Split into public Handle() (timing+logging) and private handle() (dispatch).

internal/logger/
  logger.go                 — Daily rotating JSON-lines log files. Package-level singleton.
                              Init(logDir, retainDays) — call once from main.go.
                              GitCmd / IPCRequest / IPCResponse / Info / Error
                              Files: hydragit-YYYY-MM-DD.log, kept 7 days, auto-cleaned on Init.
                              Log dir from HYDRAGIT_LOG_DIR env var, falls back to os.TempDir().

extension/src/
  extension.ts              — activate(): creates OutputChannel, calls Logger.init(),
                              resolves platform binary path, constructs GoProcess,
                              registers commands: hydragit.showVersionInfo, hydragit.openLogs, hydragit.revealAll
                              deactivate(): Logger.info + goProcess.dispose()
  Logger.ts                 — TS-side singleton. Logger.init(OutputChannel) once.
                              Logger.info/warn/error(source, msg) → VS Code Output Channel "HydraGit"
                              Logger.goStderr(line) → forwards Go stderr to Output Channel.
                              Format: "2026-03-30T08:00:00Z INFO  [source] msg"
                              Does NOT write to file — file logging is Go's job.
  goProcess.ts              — GoProcess(binaryPath, repoPath, logDir). Spawns Go binary with
                              HYDRAGIT_REPO + HYDRAGIT_LOG_DIR env vars.
                              stdout → readline → pending promise map (id-based).
                              stderr → Logger.goStderr()
  HydraStatusService.ts     — Polls Go every 3s via goProcess.send('status', {}).
                              Fires onDidChange(snapshot) only when snapshot actually changes.
  panel.ts                  — HydraViewProvider: main log/branch panel (index.html/js/css)
                                Watches .git/{HEAD,refs/**,COMMIT_EDITMSG} → postMessage({type:'refresh'})
                              HydraSidebarProvider: sidebar panel (sidebar.html/js/css)
                                Owns statusSub, calls postStatus() on statusService.onDidChange
                              HydraBadgeTreeProvider: badge count in sidebar title
  generated/buildInfo.ts    — version, commit, buildTime, dirty (injected at build time)

webview/src/
  shared/
    messageBus.ts           — send(cmd, params) → Promise (id-based pending map)
                              on(type, handler) → unsubscribe fn
    vscode.ts               — singleton acquireVsCodeApi() wrapper

  panels/sidebar/
    main.ts                 — entry point
    Sidebar.svelte          — root component. Owns stagedPaths: Set<string>.
                              Listens: on('statusUpdate', applyStatus)
                              On mount: send('status', {})
    types.ts                — GitFile { path, status }, GitStatus { branch, ahead, behind, files }
    components/
      SectionHeader.svelte  — collapsible header, master stage checkbox (indeterminate support)
      FileTree.svelte       — staged/unstaged file tree, per-file checkboxes, status badges
      CommitArea.svelte     — textarea + Commit / Commit & Push buttons (pinned bottom)

  panels/index/
    main.ts                 — entry point
    App.svelte              — root component for main panel
    graphSvg.ts             — pure SVG-path builder for the lane graph (unit-tested)
    components/
      BranchPane.svelte
      LogPane.svelte        — commit graph display (virtualized, inline SVG lanes)
      DetailPane.svelte
      PaneDivider.svelte
      Toolbar.svelte        — search box with mode switch, branch combobox
      ActionRail.svelte     — quick git action buttons
      StatusBar.svelte
      ContextMenu.svelte    — commit context menu (live, tested)

  panels/history/           — File / Selection (line) history views, Shiki-based diff, blame cards

  styles/
    vscode-theme.css        — VS Code CSS variable mappings
```

---

## IPC protocol

Every message is one JSON object per line, newline-terminated.

**Request (TS → Go stdin)**
```json
{"id":"x7k2m","cmd":"log","params":{"branch":"master","limit":100}}
```

**Response (Go stdout → TS)**
```json
{"id":"x7k2m","ok":true,"data":[...]}
{"id":"x7k2m","ok":false,"error":"fatal: not a git repository"}
```

Rules:
- `id` echoed back — multiple in-flight requests resolve via pending map
- `ok: false` → git returned non-zero exit, `error` = git's stderr as-is
- stdout = JSON only, stderr = Go logs only, never mixed

---

## IPC command reference

| cmd | params | returns |
|-----|--------|---------|
| ping | — | "pong" |
| status | — | StatusResult |
| branches | — | []Branch |
| log | { branch?, limit?, grep?, author? } | []LaidOutCommit |
| log.file | { path } | []LaidOutCommit |
| file.history | { path, ref? } | []Commit |
| line.history | { path, start, end } | []Commit |
| diff | { commit, file? } | []Hunk or []FileStat |
| blame | { path, ref?, contents?, dirty? } | []BlameLine |
| user | — | { name, email } |
| stash | — | []StashEntry |
| stash.pop / stash.apply / stash.drop | { index } | — |
| stash.show | { index } | []Hunk |
| stash.files | { index } | []FileStat |
| stash.save | { message? } | — |
| checkout | { branch } | — |
| branch.create | { name, from? } | — |
| branch.delete | { name, force } | — |
| branch.rename | { from, to } | — |
| branch.containing | { commit } | string |
| merge | { branch } | — |
| rebase | { onto } | — |
| reset | { commit, mode } | — |
| fetch | — | — |
| pull | — | — |
| pull.mode | { mode } | — |
| push | { branch? } | — |
| cherrypick | { commit } | — |
| revert | { commit } | — |
| commit | { message, paths[] } | CommitResult |
| commit.push | { message, paths[] } | CommitResult |
| tags | — | []Tag |
| tag.create | { name, commit?, message? } | — |
| tag.delete | { name } | — |

---

## Environment variables (Go binary)

| var | set by | purpose |
|-----|--------|---------|
| HYDRAGIT_REPO | GoProcess constructor | repo path for all git commands |
| HYDRAGIT_LOG_DIR | GoProcess constructor | log file directory (from ctx.logUri.fsPath) |

---

## VS Code commands registered

| command | title | what it does |
|---------|-------|-------------|
| hydragit.showVersionInfo | HydraGit: Show Version Info | shows version in Output Channel + info message |
| hydragit.openLogs | HydraGit: Open Logs Folder | reveals log dir in OS file manager |
| hydragit.fileHistory | HydraGit: File History | opens per-file commit timeline |
| hydragit.selectionHistory | HydraGit: History for Selection | history for an editor selection / line range |
| hydragit.lineHistory | (internal) | line-range history entry point |
| hydragit.copyCommitSha | (context menu) | copies a commit hash |
| hydragit.toggleLineBlame | HydraGit: Toggle Line Blame | toggles inline blame in the editor |
| hydragit.revealAll | (internal) | focuses main panel |

---

## Data types

### Go
```go
type StatusResult struct {
  Branch   string       `json:"branch"`
  Ahead    int          `json:"ahead"`
  Behind   int          `json:"behind"`
  Modified int          `json:"modified"`
  Files    []FileStatus `json:"files"`
}
type FileStatus struct {
  Path   string `json:"path"`
  Status string `json:"status"` // M|A|D|U|R|C|T
}
type Commit struct {
  Hash    string   `json:"hash"`
  Parents []string `json:"parents"`
  Author  string   `json:"author"`
  Date    string   `json:"date"`   // RFC3339 UTC
  Message string   `json:"message"`
  Refs    []string `json:"refs"`
}
type LaidOutCommit struct {
  git.Commit
  Lane  int    `json:"lane"`
  Color string `json:"color"`
  Paths []Path `json:"paths"`
}
type Path struct {
  FromLane, ToLane int
  FromRow, ToRow   int
  Color            string
  Type             string // "straight" | "curve"
}
```

### TypeScript (webview)
```ts
interface GitFile   { path: string; status: string }
interface GitStatus { branch: string; ahead: number; behind: number; files: GitFile[] }
```

---

## Logging architecture

### Go side (file logger)
- **Format:** JSON lines per event, daily files `hydragit-YYYY-MM-DD.log`
- **Retention:** 7 days, cleaned on startup
- **Coverage:** every git command (cmd, duration_ms, exit_code), every IPC request+response, process start/shutdown

```json
{"ts":"2026-03-30T08:00:00Z","level":"info","source":"process","msg":"start version=0.1.0"}
{"ts":"2026-03-30T08:00:01Z","level":"info","source":"ipc","cmd":"status","req_id":"abc","msg":"request"}
{"ts":"2026-03-30T08:00:01Z","level":"info","source":"git","cmd":"status --porcelain","duration_ms":16,"exit_code":0}
{"ts":"2026-03-30T08:00:01Z","level":"info","source":"ipc","cmd":"status","duration_ms":48,"ok":true,"msg":"response"}
```

### TS side (Output Channel)
- **Format:** `TIMESTAMP LEVEL [source] msg`
- **Location:** VS Code Output Channel "HydraGit" (View → Output → HydraGit)
- **Coverage:** extension activate/deactivate, Go process spawn/exit/crash, Go stderr, status poll failures

### Webview side
- `console.log/error` only — visible in webview DevTools (F12). No file logging.

---

## Design tokens

```
Teal accent:    #56c8e8   active branch, selected row border, primary btn
Teal bg:        #0e2030   selected row / #0e4a6a statusbar / #0e5a7c button
Green:          #4ec94e   added lines, feature branch pills
Green bg:       #0d2e1a / #0a200a
Red:            #f07070   removed lines, danger actions
Red bg:         #2e0d0d
Amber:          #c8a020 / #e3b341   tags, warnings, M badge
Purple:         #9a7ae8   stash selection
Hash blue:      #3e6aa0   monospace commit hashes
Backgrounds:    #1e1e1e / #252526 / #222 / #2d2d2d
Borders:        #1a1a1a / #202020 / #2a2a2a
Muted text:     #888 / #666 / #555
Row heights:    26px commits / 24px col headers / 36px toolbar / 22px statusbar
Font:           -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
Mono:           monospace
```

---

## Key design decisions

- **Staged paths are webview-only state** — `Set<string>` in `Sidebar.svelte`. On each status refresh, pruned to paths still in file list.
- **No status bar in the webview** — branch info belongs in VS Code's own status bar. `ahead`/`behind` will feed a `StatusBarItem`.
- **`canCommit` requires `stagedCount > 0`** — message alone is not enough.
- **`run()` in `repo.go` is the single git entry point** — all logging there covers all git ops.
- **`Handle()` split in `handler.go`** — public does timing+logging, private does dispatch.
- **Logger init is non-fatal** — if log dir can't be created, Go continues without logging.
- **No feature flags** — VS Code settings used instead.
- **`context.logUri`** used for log directory — VS Code manages lifecycle.

---

## What's working (as of v0.2.0)

- Full two-pane layout: branch tree + virtualized commit graph + detail/diff pane
- Sidebar staging: file tree, per-file + master checkbox, commit & commit-and-push
- Stash manager UI (list/pop/apply/drop/show/save) with diff preview
- Tags (list/create/delete), reset, cherry-pick, revert, merge, rebase
- File history + line/selection history (Shiki diff), inline blame
- Search/filter (message/author server-side, hash/file), branch scope toggle
- Commit context menu (copy/patch/cherry-pick/checkout/reset/revert/new branch/new tag)
- Full logging: Go JSON file + TS Output Channel; relative dates in the log UI
- Graph lane assignment (AssignLanes), per-branch-line color, hover highlight
- Tests: Go `_test.go` per package + scenarios, Vitest component tests, Playwright e2e

See `IMPLEMENTED_FEATURES.md` for the full, current inventory.

---

## Open follow-ups

Polish and not-yet-built items live in `docs/ideas.md` (backlog) — e.g. interactive
rebase editor, branch/ref compare, worktree UI, undo/reflog timeline, amend/reword.

---

## Known issues

- `rev-list --left-right --count @{u}...HEAD` logs as error when a branch has no
  upstream — expected/non-fatal, but noisy. Consider downgrading to warn.
- Root `hydragit-server` binary was historically committed; `bin/` platform
  binaries are gitignored and bundled only in the `.vsix`.

---

## Versioning plan

| Version | Scope | Status |
|---|---|---|
| `0.1.x` | Branch tree + commit log + stash + inline diff. Core two-pane layout. | ✅ Built (in repo) |
| `0.2.0` | Stage/unstage + commit from extension, tags, blame, file/line history | ✅ Built (in repo, pre-publish) |
| `0.3.0` | Interactive rebase UI, branch compare / ref diff, conflict resolution hints | Planned |
| `1.0.0` | All features, polished, AI commit message (Claude API, opt-in) | Planned |
