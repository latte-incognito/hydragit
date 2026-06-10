# HydraGit — Project Context

> IntelliJ-style git panel inside VS Code. Branch tree, commit log, inline diff, stash manager. No paywall.
> Built because GitLens went paywalled and VS Code's built-in git panel has no history view.

**Publisher:** `vkushnarenko.hydragit` (reserved — not yet published to Marketplace)
**Status:** manifest `v0.2.1`, pre-publish. The repo is the source of truth and already
contains the **0.3.0 feature wave** on top of the v0.1/v0.2 core: interactive rebase,
branch/ref compare, conflict-resolution guidance, reflog/undo timeline, sync, safe
force-push, amend/reword/squash/drop, and local+remote/folder branch rename.

> **Browsable feature docs:** [`documentation/index.html`](../documentation/index.html)
> documents every feature from the UI (entry point → what happens next).
> Authoritative name index: [`IMPLEMENTED_FEATURES.md`](../IMPLEMENTED_FEATURES.md).

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
                              DeleteRemoteBranch(), RenameBranch(), RenameRemoteBranch(),
                              RenameBranchFolder()(+Remote), BranchContaining(), Merge(),
                              Rebase(), Reset()/ResetWithAutostash(), Push(), PushForce(),
                              PushCommit() (push up to a commit), Fetch(), Pull(), PullMode()
  diff.go                   — DiffCommit() → []FileStat, DiffFile() → []Hunk,
                              DiffRangeFiles()/DiffRefFiles() (compare two refs / ref↔working
                              tree), FormatPatch() → `git format-patch` output for a commit
  stash.go                  — StashList(), StashPop(), StashApply(), StashDrop(),
                              StashClear(), StashShow(), StashFiles(), StashSave()
  commit.go                 — CreateCommit(), CommitAndPush() (stage paths + commit),
                              AmendCommit(), LastCommitMessage()
  rebase.go                 — RunInteractiveRebase(), DropCommit(), RewordCommit(),
                              SquashWithParent(), Rebase{Continue,Skip,Abort}(),
                              RebaseInProgress() — scripted `git rebase -i`, pause-on-conflict
  reflog.go                 — Reflog() → []ReflogEntry (HEAD undo timeline)
  undo.go                   — UndoLast() (abort in-progress op, else reset --hard ORIG_HEAD)
  conflict.go               — Conflicts(), KeepCurrent(), KeepIncoming(), MarkResolved(),
                              Continue/AbortConflict() — merge/rebase/cherry-pick guidance
  tags.go                   — Tags(), CreateTag(), DeleteTag()
  blame.go                  — Blame() → per-line blame, buffer-aware via runStdin
  config.go                 — User() → committer name/email; SetUser() (global identity)
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
- optional `repo` field on any request routes it to that repo root (multi-repo);
  absent → the spawn-time default (`HYDRAGIT_REPO`). The extension host rejects
  any `repo` that RepoService hasn't discovered (security: the webview must not
  be able to point git at arbitrary directories).

### Concurrency model (since 2026-06-09)

The stdin loop is **not serial**: each request runs in its own goroutine
(`main.go`, `WaitGroup.Go`), so a slow command — a fetch against a dead remote
holding the 30s network timeout — can't freeze the status poll or other panels.
Responses may arrive **out of order**; the TS pending-map matches by `id`.
stdout stays JSON-clean via a write mutex. The stdin scanner buffer is raised to
16 MB (blame requests carry whole editor buffers; the 64 KB default killed the
loop).

Serialization happens **per repo** in `ipc.Handle` with a `sync.RWMutex` per
repo path:

- Commands in the `mutatingCmds` set (index/worktree/HEAD/local-ref/config
  writers: checkout, merge, rebase\*, commit\*, reset, pull, stash mutations,
  worktree ops, …) take the repo's **exclusive** lock — git must never run two
  state-changing operations on one `.git` concurrently (index/ref-lock
  corruption).
- Everything else shares a **read** lock: pure reads, plus remote-only ops
  (fetch, push, `*.remote`) that touch `refs/remotes` at most — deliberately,
  so a hung fetch never blocks status.
- Distinct repos never block each other.

Just before a command in the `autoSnapshotCmds` set runs (merge, rebase\*,
reset, pull, checkout, cherry-pick, revert, undo, stash pop/apply, snapshot
restore), the handler takes a working-tree snapshot inside the same lock —
see `internal/git/snapshot.go`. Best-effort: clean tree skips, failure never
blocks the operation.

Covered by `internal/ipc/handler_concurrency_test.go` — run with
`go test -race`.

---

## IPC command reference

Authoritative list = the `case` strings in `internal/ipc/handler.go`.

**Status / read**
| cmd | params | returns |
|-----|--------|---------|
| ping | — | "pong" |
| status | — | StatusResult |
| branches | — | []Branch |
| log | { branch?, limit?, grep?, author?, pickaxe? } | []LaidOutCommit |
| log.file | { path } | []LaidOutCommit |
| file.history | { path, ref? } | []Commit |
| line.history | { path, start, end } | []Commit |
| diff | { commit, file? } | []Hunk or []FileStat |
| diff.range | { from, to } | []FileStat / []Hunk |
| diff.ref | { ref, file? } | []FileStat / []Hunk |
| blame | { path, ref?, contents?, dirty? } | []BlameLine |
| user | — | { name, email } |

**Branches / refs**
| cmd | params | returns |
|-----|--------|---------|
| checkout | { branch } | — |
| branch.create | { name, from? } | — |
| branch.delete | { name, force } | — |
| branch.delete.remote | { name } | — |
| branch.rename | { from, to } | — |
| branch.rename.remote | { from, to } | — |
| branch.rename.folder | { from, to } | — |
| branch.rename.folder.remote | { from, to } | — |
| branch.containing | { commit } | string |
| tags | — | []Tag |
| tag.create | { name, commit?, message? } | — |
| tag.delete | { name } | — |

**Integrate / rewrite history**
| cmd | params | returns |
|-----|--------|---------|
| merge | { branch } | — |
| merge.preview | { ours?, theirs } | { clean, files[] } (dry-run via merge-tree, git ≥ 2.38) |
| rebase | { onto } | — |
| reset | { commit, mode } | { stashed } |
| cherrypick | { commit } | — |
| revert | { commit } | — |
| rebase.interactive | { base, items[] } | { conflict } |
| rebase.drop | { commit } | { conflict } |
| rebase.reword | { commit, message } | { conflict } |
| commit.squash | { commit } | { conflict } |
| rebase.continue / rebase.skip | — | { conflict } |
| commit.fixup | { commit, paths[] } | CommitResult (`commit --fixup`) |
| rebase.autosquash | { base } | { conflict } |
| rebase.abort / rebase.status | — | — / status |
| patch.format | { commit } | string (.patch) |
| push.upto | { commit, branch } | — |

**Conflicts**
| cmd | params | returns |
|-----|--------|---------|
| conflicts | — | ConflictInfo |
| conflict.keepCurrent / conflict.keepIncoming | { file } | — |
| conflict.continue / conflict.abort | — | — |

**Remotes**
| cmd | params | returns |
|-----|--------|---------|
| fetch | — | — |
| pull | — | — |
| pull.mode | { mode } | — |
| push | { branch? } | — |
| push.force | { branch? } | — (force-with-lease) |

**Stash**
| cmd | params | returns |
|-----|--------|---------|
| stash | — | []StashEntry |
| stash.pop / stash.apply / stash.drop | { index } | — |
| stash.clear | — | — |
| stash.show | { index } | []Hunk |
| stash.files | { index } | []FileStat |
| stash.save | { message? } | — |

**Commit / undo / config**
| cmd | params | returns |
|-----|--------|---------|
| commit | { message, paths[] } | CommitResult |
| commit.push | { message, paths[] } | CommitResult |
| commit.amend | { message, paths[] } | CommitResult |
| commit.precheck | { paths[], checks[]? } | []SafetyWarning (checks injected by host from settings) |
| commit.lastMessage | — | string |
| undo.last | — | UndoResult |
| reflog | — | []ReflogEntry |
| user.set | { name, email, global? } | — |
| rerere.enable | — | — (repo-local rerere.enabled + autoupdate) |

**Snapshots (working-tree time machine)**
| cmd | params | returns |
|-----|--------|---------|
| snapshot.list | — | []Snapshot |
| snapshot.save | { label? } | Snapshot or null (clean tree) |
| snapshot.restore | { hash } | — |
| snapshot.drop | { ref } | — (refuses non-snapshot refs) |

**Worktrees**
| cmd | params | returns |
|-----|--------|---------|
| worktree.list | — | []Worktree |
| worktree.add | { path, branch?, newBranch?, start? } | — |
| worktree.remove | { path, force } | — |
| worktree.lock / worktree.unlock | { path, reason? } | — |
| worktree.move | { from, to } | — |
| worktree.prune | — | — |

---

## Security model

Threat model + audit history live in [`SECURITY.md`](SECURITY.md). The
load-bearing mitigations, all enforced in code as of 2026-06-10:

- **Webview boundary** (`panel.ts`): per-request `repo` allowlisted against
  RepoService's discovered roots; `worktree.open` paths validated against
  `worktree.list`; destructive ops (`force: true`, `push.force`, `stash.clear`)
  only forward within 30s of a native ui.confirm Yes.
- **CSP**: all three webviews share `default-src 'none'` + `connect-src 'none'`
  and no `https:` in `img-src` — zero network egress. Never loosen with blanket
  `https:`; allowlist a specific host if ever needed.
- **Go binary**: single exec point (`repo.go`), args-slice only (no shell);
  `missingParam()` rejects empty required params on mutating cmds;
  `HYDRAGIT_REPO` sanity-checked at startup (warn, not exit — multi-repo
  overrides may still be valid); logs `0o700`/`0o600`.

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
| hydragit.forceRefresh | HydraGit: Force Refresh | re-pulls status/branches/log/stash/tags |
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

The 0.3.0 wave (interactive rebase, branch/ref compare, conflict guidance, undo/reflog
timeline, sync, safe force-push, amend/reword/squash/drop) is **now built and in the repo**.
Remaining not-yet-built items live in `docs/ideas.md` (backlog) — e.g. worktree UI,
settings panel, PR diff, and graph polish (lane straightening, wide-graph compression,
focus/linear/hide-merges view).

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
| `0.3.0` | Interactive rebase UI, branch compare / ref diff, conflict-resolution guidance, undo/reflog timeline, sync, safe force-push, amend, local+remote/folder rename | ✅ Built (in repo) |
| `1.0.0` | Beginner-safety wave (pre-commit secret guard, auto-upstream, detached-HEAD banner), worktrees, polish | Planned |
