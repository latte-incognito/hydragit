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

**Webview (HTML + vanilla JS)**
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

## Graph Layout — Backend Responsibility

The lane assignment algorithm runs in Go, not in the Webview. The Webview only draws what it's told.

**Why backend:**
- Lane assignment requires the full commit graph visible at once — Go already has it from `git log`
- Consistent results — computed once per `log` call, same output every time
- Unit testable in isolation — pipe in commits, assert lane assignments, no browser needed
- Performance — large repos (10k+ commits) compute layout once in Go, not on every JS render

**What Go sends to Webview (per commit):**
```json
{
  "hash": "a1b2c3d",
  "shortHash": "a1b2c3",
  "message": "feat: add OAuth",
  "author": "Vitalii K.",
  "date": "2h ago",
  "isMerge": false,
  "refs": [{"name":"master","type":"local"},{"name":"origin/master","type":"remote"}],
  "lane": 0,
  "color": "#56c8e8",
  "paths": [
    {"fromLane":0,"toLane":0,"fromRow":0,"toRow":1,"type":"straight","color":"#56c8e8"}
  ]
}
```

**What Webview does with it:**
- Draws a circle at `(laneX(commit.lane), rowY(i))` with `commit.color`
- For merge commits: draws hollow circle with cross
- For each path: draws a `<line>` (straight) or `<path>` (curved bezier) between the two row/lane coordinates
- No algorithm, no parent lookups, no state — pure rendering

**Full algorithm spec:** see `hydragit_graph_algorithm.md`

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

---

## Go main.go

```go
package main

import (
    "bufio"
    "encoding/json"
    "fmt"
    "log"
    "os"
    "github.com/vkushnarenko/hydragit/internal/ipc"
)

func main() {
    log.SetOutput(os.Stderr)
    repoPath := os.Getenv("HYDRAGIT_REPO")
    if repoPath == "" { repoPath = "." }

    handler := ipc.NewHandler(repoPath)
    scanner := bufio.NewScanner(os.Stdin)

    for scanner.Scan() {
        var req ipc.Request
        if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
            log.Printf("bad request: %v", err)
            continue
        }
        resp := handler.Handle(req)
        out, _ := json.Marshal(resp)
        fmt.Println(string(out))
    }
}
```

---

## Go git.go — proxy pattern

```go
func run(repoPath string, args ...string) (string, error) {
    cmd := exec.Command("git", args...)
    cmd.Dir = repoPath
    out, err := cmd.Output()
    if err != nil {
        if e, ok := err.(*exec.ExitError); ok {
            return "", fmt.Errorf("%s", strings.TrimSpace(string(e.Stderr)))
        }
        return "", err
    }
    return strings.TrimSpace(string(out)), nil
}

func (r *Repo) Branches() ([]Branch, error) {
    out, err := run(r.path, "branch", "-a",
        "--format=%(refname:short)|%(HEAD)|%(upstream:short)")
    // parse lines into []Branch
}

func (r *Repo) Log(branch string, limit int) ([]Commit, error) {
    out, err := run(r.path, "log", branch,
        fmt.Sprintf("--max-count=%d", limit),
        "--format=%H|%h|%s|%an|%ai|%D")
    // parse lines into []Commit
}

func (r *Repo) Checkout(branch string) error {
    _, err := run(r.path, "checkout", branch)
    return err
}
```

---

## TypeScript goProcess.ts

```typescript
import * as cp from 'child_process';
import * as readline from 'readline';

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

export class GoProcess {
  private proc: cp.ChildProcess;
  private pending = new Map<string, Pending>();

  constructor(binaryPath: string, repoPath: string) {
    this.proc = cp.spawn(binaryPath, [], {
      env: { ...process.env, HYDRAGIT_REPO: repoPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    readline.createInterface({ input: this.proc.stdout! })
      .on('line', line => {
        const resp = JSON.parse(line);
        const p = this.pending.get(resp.id);
        if (!p) return;
        this.pending.delete(resp.id);
        resp.ok ? p.resolve(resp.data) : p.reject(new Error(resp.error));
      });

    this.proc.stderr?.on('data', d =>
      console.log('[HydraGit]', d.toString().trim()));
  }

  send(cmd: string, params: object = {}): Promise<any> {
    const id = Math.random().toString(36).slice(2, 9);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin!.write(JSON.stringify({ id, cmd, params }) + '\n');
    });
  }

  dispose() { this.proc.kill(); }
}
```

---

## Binary naming convention

```typescript
// extension.ts — pick right binary at runtime
const name = `hydragit-server-${process.platform}-${process.arch}`;
const bin = process.platform === 'win32' ? name + '.exe' : name;
const binaryPath = path.join(ctx.extensionPath, 'bin', bin);
```

```makefile
build-all:
	GOOS=darwin  GOARCH=amd64 go build -o bin/hydragit-server-darwin-x64    ./cmd/hydragit
	GOOS=darwin  GOARCH=arm64 go build -o bin/hydragit-server-darwin-arm64  ./cmd/hydragit
	GOOS=linux   GOARCH=amd64 go build -o bin/hydragit-server-linux-x64     ./cmd/hydragit
	GOOS=windows GOARCH=amd64 go build -o bin/hydragit-server-win32-x64.exe ./cmd/hydragit

build: build-all
	cd extension && npm run compile

package: build
	vsce package

publish: build
	vsce publish
```

---

## .vscodeignore

```
cmd/
internal/
go.mod
go.sum
extension/src/
extension/node_modules/
Makefile
**/*.ts
!extension/out/**
**/.git
```

**Goes INTO .vsix:** `extension/out/` · `webview/index.html` · `bin/` · `images/icon.png` · `package.json` · `README.md` · `CHANGELOG.md`

---

## Testing strategy

**Go** — unit tests against a real `.git` repo created in `TestMain`. Pipe JSON in, assert JSON out. No VS Code needed.

**Webview** — open `hydragit_twopane.html` directly in browser with mock data. Already works from design phase.

**Integration** — F5 in VS Code against a real repo. Acceptance test. Do this last.

---

## Claude Code opening message

Paste this verbatim to start a Claude Code session:

> Build HydraGit v0.1.0. Architecture: VS Code TypeScript extension spawning a Go binary via stdin/stdout JSON IPC. Go is a pure proxy wrapping system git CLI via os/exec.
>
> Attached files:
> - hydragit_architecture.md — structure, code skeletons, build system
> - hydragit_requirements.md — feature requirements v3, v0.1 scope only
> - hydragit_twopane.html — finalized UI, wire real data into this, do not redesign
>
> Build in this exact order, one step at a time:
> 1. cmd/hydragit/main.go — stdin loop. Verify it compiles and starts.
> 2. internal/git/repo.go — run() helper
> 3. internal/git/branches.go — Branches() against real git
> 4. internal/git/log.go — Log() and Status()
> 5. internal/git/diff.go — Diff() file list for a commit
> 6. internal/ipc/handler.go — route all v0.1 commands
> 7. extension/src/goProcess.ts — spawn + IPC bridge
> 8. extension/src/extension.ts — activate, register command
> 9. extension/src/panel.ts — WebviewPanel, postMessage relay
> 10. webview/index.html — replace mock data with postMessage calls
>
> Complete and verify each step before moving to the next.
