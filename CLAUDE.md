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
internal/git/repo.go          run()/runStdin() — the only place os/exec is called
internal/git/status.go        Status (ahead/behind, modified count, file list)
internal/git/branches.go      Branches, Checkout, Create, Delete, Rename, Containing, Merge, Rebase, Reset, Push, Fetch, Pull, PullMode
internal/git/log.go           Log, LogWith, LogFile, FileHistory, LineHistory
internal/git/diff.go          DiffCommit (file list), DiffFile (hunks)
internal/git/stash.go         StashList, StashPop, StashApply, StashDrop, StashShow, StashFiles, StashSave
internal/git/commit.go        CreateCommit, CommitAndPush (stage paths + commit)
internal/git/tags.go          Tags, CreateTag, DeleteTag
internal/git/blame.go         Blame — per-line, buffer-aware via runStdin
internal/git/config.go        User (committer name/email)
internal/git/cherrypick.go    CherryPick, Revert
internal/graph/lanes.go       Lane assignment algorithm — output sent to Webview as LaidOutCommit
internal/ipc/handler.go       Routes cmd strings to git.* functions, timing + logging
internal/logger/logger.go     Daily rotating JSON-lines log files, package-level singleton
extension/src/extension.ts    activate(), spawn Go binary, register commands
extension/src/goProcess.ts    ChildProcess wrapper, pending promise map
extension/src/panel.ts        WebviewPanel providers (main + sidebar + badge), postMessage relay, diff/open/url helpers
extension/src/Logger.ts       TS-side Output Channel logger
extension/src/HydraStatusService.ts  Polls status every 3s, fires onDidChange
webview/src/panels/sidebar/   Svelte sidebar: file tree, staging, commit area
webview/src/panels/index/     Svelte main panel: branch tree, log, detail/diff pane
webview/src/panels/history/   Svelte file/selection history + Shiki diff + blame cards
```

---

## Non-negotiable rules

- **os/exec + git CLI only** — never import go-git or any other git library
- **stdout = JSON only** — stderr is for Go logs only, never mix them
- **One run() helper** — all git calls go through `internal/git/repo.go:run()`, nowhere else
- **No new dependencies** without asking first
- **Never guess git output format** — verify with `git <cmd> --help` or a test before parsing
- **No `Co-authored-by: Claude` in commit messages**
- **Never run tests** — the user runs them. Write/change tests if asked, but do not execute them; suggest the command for the user to run instead.
- **Never read binaries, assets, or raw logs** — never Read/cat the `hydragit-server` binary, image assets (e.g. `docs/HydraGitLogo.png`), `package-lock.json`, or raw log files. They flood context with noise. To inspect logs, grep/filter for a specific `id` or time range; for deps, read `package.json`.

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

## Current feature surface (v0.2.0, in repo)

> Full, authoritative inventory: `IMPLEMENTED_FEATURES.md`. Quick map below.

| Feature | cmd |
|---|---|
| Status (branch, ahead/behind, modified count, files) | `status` |
| Branch list local + remote, containing | `branches`, `branch.containing` |
| Commit log with lane graph + search (msg/author) | `log`, `log.file` |
| Commit diff (file list + hunks) | `diff` |
| Stash list + pop/apply/drop/show/files/save | `stash`, `stash.*` |
| Checkout, create, delete, rename branch | `checkout`, `branch.*` |
| Merge, rebase, reset | `merge`, `rebase`, `reset` |
| Fetch, pull (+ mode), push | `fetch`, `pull`, `pull.mode`, `push` |
| Cherry-pick, revert | `cherrypick`, `revert` |
| Stage + commit / commit & push | `commit`, `commit.push` |
| Tags list/create/delete | `tags`, `tag.create`, `tag.delete` |
| Blame (buffer-aware), committer info | `blame`, `user` |
| File history + line/selection history | `file.history`, `line.history` |

## Still OUT (do not implement without asking)

- Interactive rebase UI (drag-to-reorder / squash)
- Branch / ref compare, PR diff
- Worktree management UI
- AI commit message
- Settings panel

See `docs/ideas.md` for the full backlog and rationale.

---

## Key reference docs (read on demand)

| File | Read when |
|---|---|
| `docs/PROJECT_CONTEXT.md` | Full architecture, data types, IPC reference, known issues |
| `IMPLEMENTED_FEATURES.md` | Authoritative inventory of what already ships |
| `docs/ideas.md` | Backlog — what's deliberately not built yet |
| `docs/RELEASE.md` | Packaging, publishing, Marketplace |
| `docs/SECURITY.md` | Threat model + open hardening TODOs |

---

## Testing approach

The suite is now broad: a `_test.go` per `internal/git` source file plus
`scenarios_test.go` (real temp-repo scenarios), `internal/graph` topology tests,
Vitest component + `graphSvg` tests, and Playwright e2e. Keep extending it.

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

**Do not mock git.** Use real temp repos; tests that mock `run()` test nothing useful.
**Logic-heavy spots earn deeper tests** — the lane algorithm (`internal/graph`) and the
output parsers (`log`/`diff`/`status`/`branches`) are where real bugs live; favour
invariant/scenario coverage there over thin wrappers.
**The user runs the tests** — see the Never-run-tests rule above; write them, don't execute them.

---

## How to start a session

State what you're working on and which doc to read first:

> "Working on internal/git/stash.go — read docs/PROJECT_CONTEXT.md IPC section before starting."
> "Working on internal/graph/lanes.go — read docs/PROJECT_CONTEXT.md data types section."
> "Picking the next backlog item from docs/ideas.md."
