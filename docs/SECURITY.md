# HydraGit — Security Notes

Not a web app. No network server, no auth tokens, no cloud.
Attack surface is intentionally small — local extension, local git, local filesystem.
These are the things actually worth thinking about.

---

## Message Bus (Webview ↔ Extension Host)

| Thing | Risk | Fix | TODO |
|---|---|---|---|
| Unvalidated message shape | Malformed/missing fields crash the handler or pass garbage to Go | Validate `msg.cmd` is a string and `msg.id` is a string before processing | Add shape check at top of `onDidReceiveMessage` in `panel.ts` |
| Unknown command names | Webview (or a bug) sends a cmd that shouldn't be callable | Allowlist all valid commands in extension host — reject anything not on the list | Add `ALLOWED_COMMANDS` set in `panel.ts`, return error response for unknown cmds |
| `force: true` on destructive ops | Webview could send `force: true` on `branch.delete` without user ever confirming | Don't trust `force` from the webview message. Track confirmation state in extension host, set `force` there. | Refactor `branch.delete` flow: webview sends delete intent, extension host prompts confirmation, then sends `force` if confirmed |

No encryption needed. `postMessage` is VS Code internal IPC — same machine, same process group. Encrypting it is security theater. The real boundary is the CSP.

---

## Webview CSP

| Thing | Risk | Fix | TODO |
|---|---|---|---|
| Weakened `script-src` | If nonce is dropped in favour of `'unsafe-inline'`, any injected script runs with full webview privileges | Keep `script-src 'nonce-<x>'` exactly as-is | Audit CSP string on every panel creation — never change nonce to unsafe-inline |
| `connect-src` not explicitly blocked | Webview JS could make fetch() calls to the internet, exfiltrating repo paths/branch names | `default-src 'none'` already blocks this — explicit is better | Consider adding `connect-src 'none'` explicitly for clarity |

---

## Go Binary — Params & Shell Safety

| Thing | Risk | Fix | TODO |
|---|---|---|---|
| String concat into shell command | If anyone ever does `exec.Command("sh", "-c", "git " + userInput)`, that's full shell injection | Always use `exec.Command("git", args...)` with `...string` slice — never a shell string | Grep codebase for `exec.Command("sh"` or `exec.Command("bash"` — should be zero results |
| Empty or missing params | `branch.delete` with empty name, or `checkout` with empty branch, passes garbage to git | Validate params in Go handler before calling git functions — reject empty strings | Add param validation at top of each case in `handler.go` |
| Path traversal in branch/file names | A crafted name like `../../something` passed as a git arg | `exec.Command` with args slice already prevents shell injection. Git itself rejects bad ref names. Belt-and-suspenders: reject names containing `..` or `/` where not expected | Add name validation helper in `handler.go`: `func validRefName(s string) bool` |
| `HYDRAGIT_REPO` not validated | Binary starts with an empty or non-repo path, all commands silently fail or error noisily | On startup, run `git rev-parse --git-dir` against `HYDRAGIT_REPO` and exit cleanly if it fails | Add startup check in `main.go` before entering IPC loop |

---

## Destructive Operations

| Thing | Risk | Fix | TODO |
|---|---|---|---|
| `branch.delete` with force | Deletes unmerged branch, work is gone | Use `-d` (safe) by default. Only pass `-D` if `force` is explicitly set AND confirmed outside the webview | See message bus `force` fix above |
| `stash.drop` | No undo — stash is permanently gone | Already requires explicit user action in UI. Go side: validate index is in range before running | Add bounds check on stash index in `stash.go` |
| `rebase` | Rewrites history. On shared branches, force-push required, breaks teammates | No code fix — this is a git concept. Surface a warning in UI before rebasing non-local branches | Add `isRemote` check in webview before sending `rebase` cmd; show confirmation if true |
| `push` with arbitrary branch param | Could push to wrong branch if param is wrong | Validate branch param matches a known local branch (already in your branch list) | Cross-check `push` param against last-known branch list in extension host before forwarding to Go |

---

## Log Files

| Thing | Risk | Fix | TODO |
|---|---|---|---|
| Log files contain repo metadata | Branch names, file paths, git command details are all in `hydragit-YYYY-MM-DD.log` | Logs live in `ctx.logUri` — user-owned directory, not world-readable on macOS/Linux. Acceptable. | Verify log dir permissions on creation: `os.MkdirAll(logDir, 0700)` not `0755` |
| Log retention | Old logs accumulate and contain repo history | Already handled: 7-day rotation, cleaned on Init | Nothing — already done |

---

## Binary & Distribution

| Thing | Risk | Fix | TODO |
|---|---|---|---|
| Binary in `bin/` is not signed | macOS Gatekeeper may block it; users get security prompts | Sign and notarize the binary for macOS distribution | Set up `codesign` + `xcrun notarytool` in Makefile `build-darwin` target before publishing |
| Binary committed to git | Large binaries bloat repo history | Binaries are gitignored, bundled only in `.vsix` | Confirm `bin/hydragit-server*` is in `.gitignore` — already planned |
| `.vsix` contains all 4 platform binaries | Users download binaries for platforms they don't use (~adds ~10MB) | Acceptable for v0.1. Future: platform-specific `.vsix` via `vsce package --target` | Post-v0.1: add `--target` builds to Makefile for each platform |

---

## What is explicitly out of scope

- **Encryption of IPC** — not a network channel, wrong threat model
- **Input sanitisation against git logic bugs** — git's own validation is the authority on valid ref names
- **Sandboxing the Go binary** — it needs filesystem access to the repo by design
- **Protecting against a malicious VS Code extension** — if another extension is malicious, it already has Node.js access; not your problem to solve
