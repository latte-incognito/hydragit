# HydraGit

VS Code extension — IntelliJ-style git panel. Branch tree + commit log + stash manager + inline diff.
Positioning: "The git panel IntelliJ has, inside VS Code. No paywall."

---

## Stack

```
TypeScript shell   VS Code extension host, Svelte 4 webview (compiled via Vite)
Go binary          stdin/stdout JSON IPC, wraps system git via os/exec
Webview            Two panels: sidebar (staging/commit) + main panel (log/branches/diff)
```

## Architecture in one paragraph

VS Code spawns the Go binary on activation. TypeScript bridges postMessage (Webview ↔ Extension Host) to stdin/stdout (Extension Host ↔ Go). Go reads lines from stdin, runs git CLI commands via os/exec, writes JSON responses to stdout. Webview renders what it receives — no git logic in JS/Svelte.

---

## Project structure

```
cmd/hydragit/main.go          IPC loop — bufio.Scanner on stdin, fmt.Println to stdout
internal/git/repo.go          run() helper — the only place os/exec is called
internal/git/branches.go      Branches, Checkout, Create, Delete, Rename, Merge, Rebase, Push, Fetch, Pull
internal/git/log.go           Log, Status (ahead/behind, modified count)
internal/git/diff.go          DiffCommit (file list), DiffFile (hunks)
internal/git/stash.go         StashList, StashPop, StashApply, StashDrop, StashShow, StashSave
internal/git/cherrypick.go    CherryPick, Revert
internal/graph/lanes.go       Lane assignment algorithm — output sent to Webview as LaidOutCommit
internal/ipc/handler.go       Routes cmd strings to git.* functions, timing + logging
internal/logger/logger.go     Daily rotating JSON-lines log files, package-level singleton
extension/src/extension.ts    activate(), spawn Go binary, register commands
extension/src/goProcess.ts    ChildProcess wrapper, pending promise map
extension/src/panel.ts        WebviewPanel providers (main + sidebar + badge), postMessage relay
extension/src/Logger.ts       TS-side Output Channel logger
extension/src/HydraStatusService.ts  Polls status every 3s, fires onDidChange
webview/src/panels/sidebar/   Svelte sidebar: file list, staging, commit area
webview/src/panels/index/     Svelte main panel: branch tree, log, detail/diff pane
```

---

## Non-negotiable rules

- **os/exec + git CLI only** — never import go-git or any other git library
- **stdout = JSON only** — stderr is for Go logs only, never mix them
- **One run() helper** — all git calls go through `internal/git/repo.go:run()`, nowhere else
- **No new dependencies** without asking first
- **Never guess git output format** — verify with `git <cmd> --help` or a test before parsing
- **No `Co-authored-by: Claude` in commit messages**

---

## IPC protocol

**Request (TS → Go stdin)**
```json
{"id":"x7k2m","cmd":"branches","params":{}}
```

**Response (Go stdout → TS)**
```json
{"id":"x7k2m","ok":true,"data":[...]}
{"id":"x7k2m","ok":false,"error":"fatal: not a git repository"}
```

- `id` echoed back so pending promise map resolves correctly
- `ok: false` → git returned non-zero exit, `error` = git's stderr as-is
- Go never writes anything to stdout except these JSON lines

---

## v0.1.0 scope — what is IN

| Feature | cmd |
|---|---|
| Status (branch, ahead/behind, modified count) | `status` |
| Branch list local + remote | `branches` |
| Commit log with lane graph | `log` |
| Commit diff (file list + hunks) | `diff` |
| Stash list + pop/apply/drop/show/save | `stash`, `stash.*` |
| Checkout, create, delete, rename branch | `checkout`, `branch.*` |
| Merge, rebase | `merge`, `rebase` |
| Fetch, pull, push | `fetch`, `pull`, `push` |
| Cherry-pick, revert | `cherrypick`, `revert` |

## v0.1.0 scope — what is OUT (do not implement)

- Staged diff / working tree diff
- Stage / unstage files
- Commit from extension
- Interactive rebase UI
- Branch compare / PR diff
- AI commit message
- Settings panel

---

## Key reference docs (read on demand)

| File | Read when |
|---|---|
| `PROJECT_CONTEXT.md` | Full architecture, data types, known issues |
| `TASKS.md` | Checking what's done and what's next |
| `RELEASE.md` | Packaging, publishing, Marketplace |

---

## Testing approach

**One test file per package. One real test each. Extend as needed.**

Template (`internal/git/repo_test.go`):
```go
func TestRun(t *testing.T) {
    dir := t.TempDir()
    exec.Command("git", "-C", dir, "init").Run()
    exec.Command("git", "-C", dir, "commit", "--allow-empty", "-m", "init").Run()

    out, err := run(dir, "rev-parse", "--abbrev-ref", "HEAD")
    if err != nil { t.Fatal(err) }
    if out == "" { t.Fatal("expected branch name") }
}
```

`internal/graph/lanes_test.go` — pure function, no git needed, just structs in / structs out.

**Do not mock git.** Tests that mock `run()` test nothing useful.
**Do not write exhaustive tests upfront.** Add tests when you hit a bug or edge case.

---

## How to start a session

State what you're working on and which doc to read first:

> "Working on internal/git/stash.go — read PROJECT_CONTEXT.md IPC section before starting."
> "Working on internal/graph/lanes.go — read PROJECT_CONTEXT.md data types section."
> "Continuing from TASKS.md — next unchecked item is Step 7 QA."
