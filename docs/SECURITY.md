# HydraGit — Security Notes

Not a web app. No network server, no auth tokens, no cloud.
Attack surface is intentionally small — local extension, local git, local filesystem.
These are the things actually worth thinking about.

> **Audited 2026-05-30 against the code.** Status legend in each section:
> ✅ done · ⚠️ still open · 🔎 verified. Most hardening TODOs below are still open —
> they describe intended defenses, not the current state.

---

## Message Bus (Webview ↔ Extension Host)

| Thing | Risk | Fix | Status |
|---|---|---|---|
| Unvalidated message shape | Malformed/missing fields crash the handler or pass garbage to Go | Validate `msg.cmd` is a string and `msg.id` is a string before processing | ⚠️ Open — `panel.ts` forwards `msg.cmd`/`msg.params` to `goProcess.send` with no shape check. (Go side: `handle()` has a `default:` returning "unknown command", so an unknown cmd fails cleanly.) |
| Unknown command names | Webview (or a bug) sends a cmd that shouldn't be callable | Allowlist all valid commands in extension host — reject anything not on the list | ⚠️ Open — no `ALLOWED_COMMANDS` set in `panel.ts`. Go's `default:` case is the only backstop. |
| `force: true` on destructive ops | Webview could send `force: true` on `branch.delete` without user ever confirming | Don't trust `force` from the webview message. Track confirmation state in extension host, set `force` there. | ⚠️ Open — `branch.delete` reads `Force` straight from params in `handler.go`; no extension-host confirmation gate. |

No encryption needed. `postMessage` is VS Code internal IPC — same machine, same process group. Encrypting it is security theater. The real boundary is the CSP.

---

## Webview CSP

The actual CSP is built in `panel.ts` `getHtml()` (main panel). It does **not**
use a nonce — it scopes scripts to the webview's own resource origin:

```
default-src 'none';
script-src <webview.cspSource>;
style-src  <webview.cspSource> 'unsafe-inline';
img-src    data: https: blob: <webview.cspSource>;
font-src   data:;
```

| Thing | Risk | Fix | Status |
|---|---|---|---|
| Weakened `script-src` | If `cspSource` were swapped for `'unsafe-inline'`, any injected script runs with full webview privileges | Keep `script-src <cspSource>` — scripts only load from the extension's own webview origin | 🔎 Correct as-is. Never add `'unsafe-inline'` to `script-src`. |
| `style-src 'unsafe-inline'` | Inline styles allowed (Svelte injects them) | Accepted — style injection is not a script-execution vector here | ⚠️ Accepted risk, documented |
| `connect-src` not explicit | Webview JS could fetch() to the internet, exfiltrating repo paths/branch names | `default-src 'none'` already blocks this — explicit is clearer | ⚠️ Open (optional) — add `connect-src 'none'` for clarity |
| Sidebar panel has no CSP meta tag | Sidebar `getHtml()` injects no CSP at all (main panel does) | Add the same CSP `<meta>` to the sidebar HTML | ⚠️ Open — `HydraSidebarProvider.getHtml()` omits the CSP meta tag |

---

## Go Binary — Params & Shell Safety

| Thing | Risk | Fix | Status |
|---|---|---|---|
| String concat into shell command | If anyone ever does `exec.Command("sh", "-c", "git " + userInput)`, that's full shell injection | Always use `exec.Command("git", args...)` with `...string` slice — never a shell string | 🔎 Verified clean — all git calls go through `repo.go` `runStdin()` using `exec.Command("git", args...)`. No `sh -c`/`bash -c` in production code (only one test fixture uses `bash`). |
| Empty or missing params | `branch.delete` with empty name, or `checkout` with empty branch, passes garbage to git | Validate params in Go handler before calling git functions — reject empty strings | ⚠️ Open — `handler.go` unmarshals params and calls git fns directly; no empty-string rejection. Git itself errors, but noisily. |
| Path traversal in branch/file names | A crafted name like `../../something` passed as a git arg | `exec.Command` with args slice already prevents shell injection. Git itself rejects bad ref names. Belt-and-suspenders: reject names containing `..` or `/` where not expected | ⚠️ Open — no `validRefName` helper in `handler.go`. Relies on git's own ref validation. |
| `HYDRAGIT_REPO` not validated | Binary starts with an empty or non-repo path, all commands silently fail or error noisily | On startup, run `git rev-parse --git-dir` against `HYDRAGIT_REPO` and exit cleanly if it fails | ⚠️ Open — `main.go` defaults an empty `HYDRAGIT_REPO` to `"."` and enters the IPC loop with no repo check. |

---

## Destructive Operations

| Thing | Risk | Fix | TODO |
|---|---|---|---|
| `branch.delete` with force | Deletes unmerged branch, work is gone | Use `-d` (safe) by default. Only pass `-D` if `force` is explicitly set AND confirmed outside the webview | See message bus `force` fix above |
| `stash.drop` | No undo — stash is permanently gone | Already requires explicit user action in UI. Go side: validate index is in range before running | ⚠️ Open — `stash.go` formats `stash@{N}` and lets git reject out-of-range (safe but unvalidated). |
| `rebase` | Rewrites history. On shared branches, force-push required, breaks teammates | No code fix — this is a git concept. Surface a warning in UI before rebasing non-local branches | Add `isRemote` check in webview before sending `rebase` cmd; show confirmation if true |
| `push` with arbitrary branch param | Could push to wrong branch if param is wrong | Validate branch param matches a known local branch (already in your branch list) | Cross-check `push` param against last-known branch list in extension host before forwarding to Go |

---

## Log Files

| Thing | Risk | Fix | TODO |
|---|---|---|---|
| Log files contain repo metadata | Branch names, file paths, git command details are all in `hydragit-YYYY-MM-DD.log` | Logs live in `ctx.logUri` — user-owned directory, not world-readable on macOS/Linux. Acceptable. | ⚠️ Open — `logger.go` uses `os.MkdirAll(logDir, 0o755)`; tighten to `0o700` if treated as sensitive. |
| Log retention | Old logs accumulate and contain repo history | Already handled: 7-day rotation, cleaned on Init | ✅ Done — 7-day rotation, cleaned on `Init`. |

---

## Binary & Distribution

| Thing | Risk | Fix | TODO |
|---|---|---|---|
| Binary in `bin/` is not signed | macOS Gatekeeper may block it; users get security prompts | Sign and notarize the binary for macOS distribution | Set up `codesign` + `xcrun notarytool` in Makefile `build-darwin` target before publishing |
| Binary committed to git | Large binaries bloat repo history | Binaries should be gitignored, bundled only in `.vsix` | ⚠️ Partly — `bin/hydragit-server*` is gitignored, but a stray root `hydragit-server` (~3 MB) is still tracked. `git rm --cached hydragit-server` to untrack. |
| `.vsix` contains all 4 platform binaries | Users download binaries for platforms they don't use (~adds ~10MB) | Acceptable for v0.1. Future: platform-specific `.vsix` via `vsce package --target` | Post-v0.1: add `--target` builds to Makefile for each platform |

---

## What is explicitly out of scope

- **Encryption of IPC** — not a network channel, wrong threat model
- **Input sanitisation against git logic bugs** — git's own validation is the authority on valid ref names
- **Sandboxing the Go binary** — it needs filesystem access to the repo by design
- **Protecting against a malicious VS Code extension** — if another extension is malicious, it already has Node.js access; not your problem to solve
