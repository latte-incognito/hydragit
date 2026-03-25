# HydraGit

VS Code extension — IntelliJ-style git panel. Branch tree + commit log + stash manager + inline diff.
Positioning: "The git panel IntelliJ has, inside VS Code. No paywall."

---

## Stack

```
TypeScript shell   VS Code extension host, ~150 lines total
Go binary          stdin/stdout JSON IPC, wraps system git via os/exec
Webview            hydragit_twopane.html — already built, frozen
```

## Architecture in one paragraph

VS Code spawns the Go binary on activation. TypeScript bridges postMessage (Webview ↔ Extension Host) to stdin/stdout (Extension Host ↔ Go). Go reads lines from stdin, runs git CLI commands via os/exec, writes JSON responses to stdout. Webview renders what it receives — no git logic in JS.

---

## Project structure

```
cmd/hydragit/main.go          IPC loop — bufio.Scanner on stdin, fmt.Println to stdout
internal/git/repo.go          run() helper — the only place os/exec is called
internal/git/branches.go      Branches, Checkout, Create, Delete, Rename, Merge, Rebase, Push, Fetch, Pull
internal/git/log.go           Log, Status (ahead/behind, modified count)
internal/git/diff.go          Diff — file list + hunks for a commit or stash
internal/git/stash.go         Stash, StashPop, StashApply, StashDrop, StashShow, StashSave
internal/graph/lanes.go       Lane assignment algorithm — runs in Go, output sent to Webview
internal/ipc/handler.go       Routes cmd strings to git.* functions
extension/src/extension.ts    activate(), spawn Go binary, register command
extension/src/goProcess.ts    ChildProcess wrapper, pending promise map
extension/src/panel.ts        WebviewPanel, postMessage relay
webview/index.html            ⛔ FROZEN — do not read or modify unless task explicitly says so
images/icon.png               128x128 HydraGit logo
```

---

## Non-negotiable rules

- **os/exec + git CLI only** — never import go-git or any other git library
- **stdout = JSON only** — stderr is for Go logs only, never mix them
- **One run() helper** — all git calls go through `internal/git/repo.go:run()`, nowhere else
- **Webview is frozen** — `webview/index.html` is the finalized UI, do not touch it unless the task explicitly requires it
- **No new dependencies** without asking first
- **Never guess git output format** — verify with `git <cmd> --help` or a test before parsing

---

## IPC protocol

Every message is one JSON object per line, newline-terminated.

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

## Key reference docs (read on demand, not by default)

| File | Read when |
|---|---|
| `docs/architecture.md` | Working on IPC, TypeScript shell, binary bundling |
| `docs/requirements.md` | Implementing any feature — has full REQ specs |
| `docs/graph_algorithm.md` | Working on `internal/graph/lanes.go` |
| `docs/build_plan.md` | Checking v0.1 vs v0.2 scope boundaries |
| `docs/release_plan.md` | Packaging, publishing, Marketplace |

---

## Design tokens (webview colors — reference only)

```
Teal accent:    #56c8e8   active branch, selected row border, primary btn
Teal bg:        #0e2030   selected row background
Green:          #4ec94e   added lines, feature branches
Red:            #f07070   removed lines, danger actions
Amber:          #e3b341   modified badge, warnings
Purple:         #9a7ae8   stash selection
Hash blue:      #3e6aa0   monospace commit hashes
Background:     #1e1e1e / #252526 / #222 / #2d2d2d
```

---

## Testing approach

**One test file per package. One real test each. You extend the rest.**

`internal/git/repo_test.go` — the template for all git tests:
```go
func TestRun(t *testing.T) {
    // init a real tmp repo
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

Tell Claude which task you're working on and which doc section to read:

> "Working on internal/git/stash.go — read docs/requirements.md section F-03b before starting."
> "Working on internal/graph/lanes.go — read docs/graph_algorithm.md before starting."
> "Working on extension/src/goProcess.ts — read docs/architecture.md IPC section before starting."

Do not ask Claude to read all docs at once — read only what's relevant to the current task.

## Work with GIT

don't add Co-authored-by: Claude <claude@anthropic.com> to commit messages