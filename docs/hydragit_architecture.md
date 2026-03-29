# HydraGit — Architecture v2

---

## Three processes, two boundaries

```
┌──────────────────────────────────────────────────────┐
│  VS Code (Electron)                                  │
│                                                      │
│  ┌────────────────────┐   ┌────────────────────────┐ │
│  │  Extension Host    │   │  Webview               │ │
│  │  (Node.js)         │◄──►  (Chromium iframe)     │ │
│  │                    │   │                        │ │
│  │  extension.ts      │   │  hydragit_twopane.html │ │
│  │  goProcess.ts      │   │  vanilla JS            │ │
│  │  panel.ts          │   │                        │ │
│  └─────────┬──────────┘   └────────────────────────┘ │
│            │ spawn                                    │
└────────────┼─────────────────────────────────────────┘
             │ stdin / stdout (newline-delimited JSON)
┌────────────▼─────────────┐
│  hydragit-server (Go)    │
│                          │
│  main.go — IPC loop      │
│  handler.go — routing    │
│  git.go — os/exec proxy  │
└──────────────────────────┘
             │ os/exec
┌────────────▼─────────────┐
│  git (system binary)     │
│  already on machine      │
└──────────────────────────┘
```

---

## What each layer does

**Extension Host (TypeScript, ~150 lines total)**
Registers `hydragit.open`, spawns the Go binary, owns the WebviewPanel, bridges postMessage to Go stdin/stdout, watches `.git/` for changes, kills Go on deactivate.

**Webview (HTML + vanilla JS) -> Sveltle**
Your finalized UI — `hydragit_twopane.html`. Sandboxed Chromium iframe. No filesystem, no spawn, no VS Code API directly. Talks to the outside world only via `vscode.postMessage()` and `window.addEventListener('message')`.

**Go Binary**
Long-running process. Reads stdin line by line. Writes JSON to stdout. Routes `cmd` strings to git operations. Wraps system git via `os/exec`. Pure proxy — zero git logic of its own. stderr for Go-internal logs only.

**git (system binary)**
Already on every developer machine. Does all actual git work. Its error messages come back as-is — human-readable, no need to rewrite them.

---

## IPC Protocol

Every message is one JSON object per line, newline-terminated.

```
Webview          Extension Host       Go binary
   │                   │                  │
   │──postMessage(req)─►│                  │
   │                   │──stdin: JSON\n──►│
   │                   │                  │── git CLI
   │                   │                  │◄─ stdout/stderr
   │                   │◄─stdout: JSON\n──│
   │◄──postMessage(res)─│                  │
```

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
- `id` echoed back — multiple in-flight requests resolve correctly via pending map
- `ok: false` means git returned non-zero exit. `error` is git's stderr, shown in statusbar as-is.
- stdout = JSON only. stderr = Go logs only. Never mixed.

---



## Project Structure

```
hydragit/
│
├── cmd/
│   └── hydragit/
│       └── main.go              ← stdin loop, routes to handler
│
├── internal/
│   ├── ipc/
│   │   ├── handler.go           ← switch on cmd → call git.*
│   │   ├── reader.go            ← bufio.Scanner on stdin
│   │   └── writer.go            ← fmt.Println JSON to stdout
│   ├── git/
│   │   ├── repo.go              ← run() helper, Open()
│   │   ├── branches.go          ← Branches, Checkout, Create, Delete, Rename, Merge, Rebase, Push, Fetch, Pull
│   │   ├── log.go               ← Log, Status
│   │   └── diff.go              ← Diff (file list + hunks for a commit)
│   └── graph/
│       └── lanes.go             ← Lane assignment algorithm (see hydragit_graph_algorithm.md)
│
├── go.mod                       ← module github.com/vkushnarenko/hydragit
│
├── extension/
│   └── src/
│       ├── extension.ts         ← activate(), deactivate(), spawn Go
│       ├── goProcess.ts         ← ChildProcess wrapper, pending promise map
│       └── panel.ts             ← WebviewPanel, postMessage relay
│
├── webview/
│   └── index.html               ← hydragit_twopane.html renamed, postMessage wired
│
├── images/
│   └── icon.png                 ← 128x128 HydraGit logo
│
├── bin/                         ← compiled binaries (gitignored, bundled in .vsix)
│   ├── hydragit-server-darwin-x64
│   ├── hydragit-server-darwin-arm64
│   ├── hydragit-server-linux-x64
│   └── hydragit-server-win32-x64.exe
│
├── package.json
├── tsconfig.json
├── Makefile
├── README.md
└── CHANGELOG.md
```

