# HydraGit — Phased Build Plan

---

## Philosophy

Ship fast → get real users → build what they actually ask for.
Every version must be **fully functional** — not a demo, not a prototype.
Users who install v0.1 should find it genuinely useful on day one.

---

## v0.1.0 — "Branches" (SHIP THIS FIRST)

**Goal:** Replace the VS Code built-in branch switcher completely.
**Timeline:** 2-3 weekends.
**The pitch:** *"See all your branches, local and remote, manage them without touching the terminal."*

### What's in it

**Branch list — left panel**
- All local branches listed with colored dots
- All remote branches listed below, slightly muted (origin/main, origin/feature/x)
- Currently checked-out branch highlighted with teal accent
- Branch search / filter box at top

**Branch actions — right-click context menu**
- Checkout (local branch)
- Checkout remote branch (creates local tracking branch)
- Create new branch from this one → input box for name
- Merge into current
- Delete local branch (disabled if current, confirmation required)
- Delete remote branch (separate item, red, double confirmation)
- Copy branch name

**Git graph — center panel**
- Commit history for selected branch, last 50 commits
- SVG branch lines showing diverge/merge points
- Each row: hash + message + author + relative time
- Click commit: shows full hash + message in a detail strip below
- No diff view yet — just the graph

**Titlebar**
- Repo name
- Current branch + logo
- Fetch button only (no push/pull yet — too much error handling for v0.1)

**Statusbar**
- Branch name · local count · remote count

### What's NOT in v0.1 (deliberately cut)

- Staged diff view
- PR compare
- Stash manager
- Push / Pull buttons
- Commit actions (squash, amend, cherry-pick)
- Diff view
- Right panel commit details

### Go backend endpoints for v0.1 only

```
GET  /status        → repoName, currentBranch, localCount, remoteCount
GET  /branches      → [{name, isCurrent, isRemote, upstream?}]
GET  /log           → ?branch=x&limit=50 → [{hash, short, message, author, time}]
POST /checkout      → {branch, createFrom?}
POST /branch/create → {name, from}
POST /branch/delete → {branch, force?, remote?}
POST /merge         → {branch}
POST /fetch         → (refreshes remote tracking refs)
```

That's 8 endpoints. Lean, shippable, testable in a weekend.

### Success criteria before publishing

- [ ] Opens on any git repo without crashing
- [ ] Shows correct local + remote branches
- [ ] Checkout works and titlebar updates
- [ ] Create branch works
- [ ] Delete with confirmation works
- [ ] Merge works (or shows clean error if conflicts)
- [ ] Graph scrolls and shows real commits
- [ ] Tested on repos with 1 branch, 5 branches, 50+ branches

---

## v0.2.0 — "See Your Changes"

**Goal:** Make staging and committing visual.
**Timeline:** 3-4 weeks after v0.1.
**The pitch:** *"See exactly what you're about to commit, file by file."*

### What's added

- Staged diff view (left panel Staged state)
- Diff viewer in center — added/removed lines syntax highlighted
- Changed files list in right panel
- Unstaged files section
- Click file → see its diff
- Commit details strip when clicking a commit in graph
- Push + Pull buttons in titlebar (with basic error display)

### New endpoints

```
GET  /diff    → ?staged=true or ?file=path&commit=hash
POST /push    → {branch}
POST /pull    → {}
```

---

## v0.3.0 — "Stash & Compare"

**Goal:** Power user features that make HydraGit sticky.
**Timeline:** 3-4 weeks after v0.2.
**The pitch:** *"Full stash manager and branch comparison built in."*

### What's added

- Stash manager tab (list, pop, apply, preview, drop)
- PR Compare state (base vs head, additions/deletions, commits ahead)
- Commit actions: cherry-pick, amend
- Right panel fully wired (commit card, changed files, action buttons)

### New endpoints

```
GET  /stash          → stash list
GET  /compare        → ?base=x&head=y
POST /stash/pop      → {index}
POST /stash/apply    → {index}
POST /stash/drop     → {index}
POST /commit/cherrypick → {hash}
POST /commit/amend   → {}
```

---

## v1.0.0 — "Full Client"

**Goal:** Everything in the requirements doc. Production quality.
**Timeline:** 6-8 weeks after v0.3.
**The pitch:** *"The git client GitLens used to be, before the paywall."*

### What's added

- Squash / interactive rebase UI
- Keyboard shortcuts
- Auto-refresh on `.git/` file changes (no manual fetch needed)
- Settings panel (configurable: log limit, fetch on open, color scheme)
- Performance: virtual scroll for repos with 1000+ commits
- Conflict resolution hints in statusbar

---

## v1.x.0 — "AI Tier" (post-1.0)

**Goal:** The feature that justifies a premium tier.
**Timeline:** After 1.0 is stable with real users.

### What's added

- AI commit message from staged diff (Claude API)
- Opt-in telemetry to understand usage patterns
- Optional $4/month Pro (removes API cost from user)

---

## Build order within v0.1

If you're starting from zero today, build in this exact order:

```
1. Go server skeleton      → main.go, HTTP server starts, /status returns hardcoded JSON
2. TS shell                → extension activates, spawns Go, opens Webview with HTML
3. Wire /branches          → Webview fetches real branches, renders list
4. Wire /log               → graph shows real commits
5. Wire /checkout          → click branch → actually checks out
6. Wire /fetch             → fetch button works
7. Wire /branch/create     → create from context menu works
8. Wire /merge             → merge works with error handling
9. Wire /branch/delete     → delete with confirmation works
10. Polish + local test    → use on real repos for a week
11. Record GIF             → 15 seconds, branch list + graph + checkout + create
12. Write README           → GIF first
13. vsce publish           → ship it
```

Each step is independently testable. Never move to the next step with a broken previous one.

---

## What Claude Code needs per version

### For v0.1 — paste this as opening message:

> Build HydraGit v0.1.0 — a VS Code extension with a Go HTTP backend.
> Reference UI: hydragit_v2_logo_contextmenu.html (attached)
> Requirements: hydragit_requirements.md sections F-01, F-02, F-03, F-04, F-05a (graph only), F-08, F-09 (v0.1 endpoints only), F-10
> Only build what's in v0.1 scope. Do not implement diff view, stash, PR compare, push/pull, or commit actions.
> Start with step 1: Go server skeleton with /status returning hardcoded JSON.

### For v0.2 — paste this:

> HydraGit v0.1.0 is shipped. Now build v0.2.0.
> Add: staged diff view (F-05b), diff viewer (F-06a), right panel commit details (F-07 partial), push/pull buttons (F-01 REQ-01.3).
> Reference: hydragit_requirements.md.
> Existing Go server is at server/. Add new endpoints to handlers.go only — do not touch v0.1 endpoints.
