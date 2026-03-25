# HydraGit — Feature Requirements v3
## Claude Code Handoff

**Reference UI:** `hydragit_twopane.html` — source of truth for layout, colors, interactions. Do not redesign. Wire real data into it.

**Positioning:** IntelliJ-style git panel inside VS Code. Two-pane layout. No modes, no tab switching — everything visible at once.

**Stack:** TypeScript shell → Go binary via stdin/stdout IPC → git CLI (`os/exec`)

---

## Layout Overview

```
┌─ Toolbar 36px: logo · repo · Fetch · Pull · Push · Search ──────┐
├──────────────────┬──────────────────────────────────────────────┤
│ Branch Tree      │ Commit Log                                   │
│ 200px fixed      │ [dot][subject · pills][author][date]         │
│                  │ rows 26px each, scrollable                   │
│ ▼ Local          │                                              │
│   ⭐ master       │ ────────────────────────────────────────────  │
│ ▼ Remote         │ Detail Panel (slides open on commit click)   │
│   ▼ origin       │ [meta + actions] │ [file list] │ [diff]      │
│     master       │                                              │
├──────────────────┴──────────────────────────────────────────────┤
│ Statusbar 22px                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## F-01 · Toolbar

**What it is:** 36px bar at the top. Identity, primary git actions, search.

- REQ-01.1 Logo (16px rounded) + repo folder name read from workspace root
- REQ-01.2 **Fetch** — `git fetch`, refresh branch list and ahead/behind after
- REQ-01.3 **Pull** — `git pull`, primary button (teal)
- REQ-01.4 **Push** — `git push origin <current-branch>`
- REQ-01.5 All buttons: loading state while running, statusbar flash on complete or error
- REQ-01.6 **Search box** (max 220px, right side) — filters commit log live. Matches subject, author, short hash. Case-insensitive. Clears on branch switch.

---

## F-02 · Branch Tree (left pane, 200px)

**What it is:** Collapsible tree. HEAD at top. Local group. Remote group with sub-groups per remote name.

- REQ-02.1 On load: `cmd: "branches"` → render tree
- REQ-02.2 **HEAD (Current Branch)** row always at top, always visible
- REQ-02.3 **Local** group — collapsible (▾/▸), shows branch count
- REQ-02.4 **Remote** group — collapsible. Sub-groups per remote (origin, upstream, etc.), each also collapsible
- REQ-02.5 Current branch: gold star ⭐ icon, teal left border `#56c8e8`, bg `#0e2535`
- REQ-02.6 Remote branches: indented further (36px), muted color, no star
- REQ-02.7 Left-click: select branch, load its log in right pane, update statusbar
- REQ-02.8 Right-click: branch context menu (F-03)
- REQ-02.9 **+** button in header: `showInputBox` → `git checkout -b <n>`
- REQ-02.10 Collapse/expand state preserved within session
- REQ-02.11 **Status badge** on HEAD item — `git status --short | wc -l` → amber badge `NM`. Hidden when working tree is clean.
- REQ-02.12 **Stashes** group at bottom of tree — collapsible, shows stash count. Each stash: message + `stash@{N}` + relative time + `+N -N` stats.

---

## F-03 · Branch Context Menu

**What it is:** Right-click menu on any branch tree item. Dismissed on click-outside or Escape.

- REQ-03.1 Header: full branch name (not truncated)
- REQ-03.2 **Checkout** — `git checkout <branch>`, update tree + statusbar
- REQ-03.3 **New branch from here…** — `showInputBox` + `git checkout -b <n> <branch>`
- REQ-03.4 **Merge into current** — `git merge <branch>`, flash result
- REQ-03.5 **Rebase onto current** — confirmation first, then `git rebase <branch>`
- REQ-03.6 **Rename…** — `showInputBox` + `git branch -m <old> <new>`, refresh tree
- REQ-03.7 **Push to remote** — `git push origin <branch>`
- REQ-03.8 **Copy name** — VS Code clipboard API
- REQ-03.9 **Delete branch** — red, disabled if currently checked out. Confirmation required. `git branch -d <branch>`. Refresh tree.
- REQ-03.10 Destructive actions (delete, rebase) use `vscode.window.showWarningMessage` for confirmation

---

## F-03b · Stash Manager

**What it is:** Stash list at the bottom of the branch tree. Action bar appears when a stash is selected.

- REQ-03b.1 On load: `cmd: "stash"` → `[{index, message, time, additions, deletions}]`
- REQ-03b.2 Each stash row: truncated message + `stash@{N}` + relative time + `+N` / `-N` stats
- REQ-03b.3 Click: select (purple left border `#9a7ae8`), show action bar at bottom of left pane
- REQ-03b.4 Action bar: **Pop** (primary) · **Apply** · **Show** · **Drop** (red)
  - Pop: `git stash pop stash@{N}`, removes from list, refreshes status badge
  - Apply: `git stash apply stash@{N}`, keeps in list, refreshes status badge
  - Show: loads stash diff into detail panel (read-only)
  - Drop: confirmation required, `git stash drop stash@{N}`
- REQ-03b.5 Right-click stash: context menu with same 4 actions
- REQ-03b.6 Empty state: "No stashes" in muted italic
- REQ-03b.7 **Stash changes** button in group header: `git stash push -m <msg>` via `showInputBox`

### Stash IPC commands

| cmd | params | notes |
|---|---|---|
| `stash` | — | list all stashes |
| `stash.pop` | `{index}` | pop stash@{N} |
| `stash.apply` | `{index}` | apply without removing |
| `stash.drop` | `{index}` | drop with confirmation |
| `stash.show` | `{index}` | diff hunks for the stash |
| `stash.save` | `{message?}` | create new stash |


---

## F-04 · Commit Log (right pane)

**What it is:** Main commit list. Full width. 26px rows. Columns: graph dot · subject · author · date.

- REQ-04.1 On branch select: `cmd: "log"` with `{branch, limit: 100}` → render rows
- REQ-04.2 Columns: graph dot (28px) · subject (flex) · author (100px) · date (130px)
- REQ-04.3 **Graph dot**: single colored circle on vertical line. Merge commits: converging lines + cross node. See `hydragit_twopane.html` for exact SVG patterns.
- REQ-04.4 **Pills** inline in subject:
  - Local branch: teal `#56c8e8` on `#0a3050`
  - Remote branch: muted green on `#0a200a`
  - Version tag: amber `#c8a020` on `#1a1200`
- REQ-04.5 Merge commits: subject italic, color `#555`
- REQ-04.6 Selected row: bg `#0e2030`, left border teal
- REQ-04.7 Click row: select + open detail panel. Click same row again: close detail panel.
- REQ-04.8 Search: hides non-matching rows live

---

## F-05 · Detail Panel (inline below log)

**What it is:** Opens below the commit log on row click. Fixed height ~200px. Three sections side by side.

### F-05a · Commit Meta (left, 220px)

- REQ-05a.1 Short hash — monospace, blue `#3e6aa0`
- REQ-05a.2 Full commit message
- REQ-05a.3 Author + date
- REQ-05a.4 Branch membership — "In: master, origin/master"
- REQ-05a.5 Stats — +additions (green) / -deletions (red) / N files
- REQ-05a.6 Action buttons:
  - **Cherry-pick** — `git cherry-pick <hash>`
  - **Revert** — `git revert <hash> --no-edit`
  - **Copy hash** — full hash to clipboard

### F-05b · Changed Files (middle, 200px)

- REQ-05b.1 `cmd: "diff"` with `{commit: hash}` → file list
- REQ-05b.2 Each row: M/A/D badge + filename (truncated, full path in tooltip) + `+N -N` right-aligned
- REQ-05b.3 Click file: load its diff in F-05c. Teal left border on selected.
- REQ-05b.4 Auto-select first file when commit clicked

### F-05c · Diff View (right, flex)

- REQ-05c.1 Unified diff for selected file
- REQ-05c.2 Hunk headers: bg `#0a2040`, text `#569cd6`
- REQ-05c.3 Added lines: bg `#0d2e1a`, text `#4ec94e`
- REQ-05c.4 Removed lines: bg `#2e0d0d`, text `#f07070`
- REQ-05c.5 Context lines: no bg, text `#888`
- REQ-05c.6 Line numbers: 38px column, color `#2a2a2a`
- REQ-05c.7 Horizontally + vertically scrollable
- REQ-05c.8 Placeholder: "Select a file to see diff"

---

## F-06 · Statusbar

**What it is:** 22px teal bar at the bottom. Persistent state + feedback channel.

- REQ-06.1 Left: logo (12px) · "HydraGit v1.0.0" · current branch (teal bold) · ahead/behind
- REQ-06.2 Right: "N commits · N branches"
- REQ-06.3 Flash `⚡ message` for 2.2s on any operation, then restore
- REQ-06.4 Error flash in amber `#febc2e` for 4s
- REQ-06.5 Counts refresh after mutating operations

---

## F-07 · IPC Command Contract

**Transport:** stdin/stdout newline-delimited JSON. No HTTP. No ports.
**Repo path:** env var `HYDRAGIT_REPO`.

### Request
```json
{"id":"<random>","cmd":"<command>","params":{}}
```

### Response
```json
{"id":"<same>","ok":true,"data":{}}
{"id":"<same>","ok":false,"error":"<git stderr>"}
```

### Commands — v0.1 scope

| cmd | params | data |
|---|---|---|
| `status` | — | `{branch, ahead, behind, repoName, commitCount, branchCount}` |
| `branches` | — | `[{name, isCurrent, isRemote, remote, upstream}]` |
| `log` | `{branch, limit}` | `[{hash, shortHash, message, author, date, isMerge, refs:[{name,type}]}]` |
| `diff` | `{commit, file}` | `{hunks:[{header, lines:[{type,lineNo,text}]}], files:[{path,status,additions,deletions}]}` |
| `checkout` | `{branch}` | — |
| `branch.create` | `{name, from}` | — |
| `branch.rename` | `{from, to}` | — |
| `branch.delete` | `{name, force}` | — |
| `merge` | `{branch}` | `{conflicts?}` |
| `rebase` | `{onto}` | `{conflicts?}` |
| `fetch` | — | — |
| `pull` | — | `{conflicts?}` |
| `push` | `{branch}` | — |
| `cherrypick` | `{hash}` | `{conflicts?}` |
| `revert` | `{hash}` | — |
| `stash` | — | `[{index,message,time,additions,deletions}]` |
| `stash.pop` | `{index}` | — |
| `stash.apply` | `{index}` | — |
| `stash.drop` | `{index}` | — |
| `stash.show` | `{index}` | `{hunks:[...]}` |
| `stash.save` | `{message?}` | — |

### Go implementation rules

- `os/exec` wrapping git CLI for **everything** — no go-git library
- One `run(repoPath string, args ...string) (string, error)` helper
- stderr from git → `error` field in response (git messages are already human-readable)
- stderr from Go itself → `os.Stderr` only, never stdout
- All parsing: `strings.Split` on `\n` and `|` using git `--format` flags

### Key git commands

```bash
# status
git rev-parse --abbrev-ref HEAD
git rev-list --count HEAD..@{upstream}   # behind
git rev-list --count @{upstream}..HEAD   # ahead

# branches — name|isCurrent|upstream
git branch -a --format="%(refname:short)|%(HEAD)|%(upstream:short)"

# log — hash|shorthash|subject|author|date|refs
git log <branch> --max-count=<n> --format="%H|%h|%s|%an|%ai|%D"

# diff files for a commit
git show <hash> --stat --format="" --name-status

# diff content for one file
git show <hash> -- <file> --unified=3
```

---

## F-08 · TypeScript Extension Shell

- REQ-08.1 Register command `hydragit.open`
- REQ-08.2 On activation: resolve workspace root, spawn Go binary with `HYDRAGIT_REPO=<path>`
- REQ-08.3 Binary: `bin/hydragit-server` (or `.exe` on Windows)
- REQ-08.4 Load Webview from `webview/index.html`
- REQ-08.5 postMessage bridge: Webview ↔ Extension Host ↔ Go stdin/stdout
- REQ-08.6 On deactivate: kill Go process
- REQ-08.7 `.git/` file watcher → `{type:'refresh'}` to Webview on any change
- REQ-08.8 CSP: `default-src 'none'; script-src 'nonce-<x>'; style-src 'unsafe-inline'; img-src data:` — no network needed

---

## Design Tokens

```
Backgrounds:  #1e1e1e / #252526 / #222 / #2d2d2d
Borders:      #1a1a1a / #202020 / #2a2a2a
Teal:         #56c8e8 — active, selected, primary button
Teal bg:      #0e2030 (row) / #0e4a6a (statusbar) / #0e5a7c (button)
Green:        #4ec94e — added, remote pills
Green bg:     #0d2e1a / #0a2510 / #0a200a
Red:          #f07070 — removed, danger
Red bg:       #2e0d0d
Amber:        #c8a020 / #e3b341 — tags, warnings, M badge
Muted:        #888 / #666 / #555 / #444
Text:         #ccc / #bbb / #ddd / #eee
Hash:         #3e6aa0 (monospace)
Diff hunk:    #569cd6
Row height:   26px commits / 24px col headers / 36px toolbar / 22px statusbar
Font:         -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
Mono:         monospace
```

---

## Deferred — not in v0.1

- Staged diff / working tree changes — v0.2
- Commit from extension (stage files, write message) — v0.2
- Stash manager — v0.3
- PR / branch compare — v0.3
- Commit amend, squash, interactive rebase — v0.3
- Infinite scroll — v0.2
- AI commit message — v1.0+
- Settings — v1.0+
- Multi-root workspace — v1.0+
