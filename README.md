<!--
  BANNER — currently broken in the VS Code Details view / Marketplace because
  the README renderer only loads ABSOLUTE https URLs; relative paths never
  resolve there (the file ships in the .vsix, but markdown can't reach it).
  FIX once the GitHub repo is PUBLIC — replace the line below with:
  <p align="center">
    <img src="https://raw.githubusercontent.com/latte-incognito/hydragit/develop/images/hydragit-banner.png" alt="HydraGit" width="100%">
  </p>
  (raw URLs 404 while the repo is private.)
-->
![HydraGit](images/hydragit-banner.png)

# HydraGit

> **An IntelliJ-style git panel for VS Code — branches, history, and diff in one place. No paywall.**

[GIF HERE]

Everything git, in **one panel**: your branch tree, the full commit graph, and the
diff — right where you'd expect them. Click a branch to switch. Click a commit to
see what changed. Right-click for the action you want. That's the whole learning
curve.

No sign-in, no cloud, no "upgrade to Pro." HydraGit drives plain `git` through a
tiny local binary — your code never leaves your machine — so it's instant on the
first open and works fully offline.

## Why
I love how the JetBrains-style IDEs put branches, history, and diff in one place —
and I missed that in VS Code, where the built-in git view has no history graph. So
I built the panel I wanted: that one-panel workflow, native to VS Code, and **free
for good**.

## What you get
Three things, immediately, with zero config:

- 🌳 **See your history** — a real lane graph of every branch and commit, virtualized so it stays smooth on huge repos.
- 🖱️ **Move around it** — one click to switch branches, stage, commit, push, stash, or diff. No command palette spelunking.
- 🛟 **Fix mistakes safely** — visual interactive rebase, guided conflict resolution, and an undo timeline that auto-snapshots before anything risky.

## All features
- **Branch tree** — local + remote, folder grouping, right-click actions, ahead/behind
- **Commit log + lane graph** — HydraGit's own lane engine, virtualized full history, hover-highlight, search (message / hash / file / author)
- **Inline diff** — click a commit, see changed files and per-file hunks
- **Compare** — branch/ref ↔ ref, ref ↔ working tree, file ↔ local
- **Stage & commit** — file tree, commit / commit & push / amend, right from the sidebar
- **Stash manager** — list, save, pop, apply, drop, clear, show
- **Branch actions** — checkout, create, merge, rebase, reset, rename (local + remote + folder), delete (local + remote)
- **History rewriting** — interactive rebase editor, squash, drop, reword, create patch, push-up-to — all pause-on-conflict
- **Conflict resolution** — guided banner: keep current/incoming, open merge editor, continue/abort
- **Remotes** — one-click Sync, fetch/pull (+ mode)/push, safe force-push (`--force-with-lease`), auto-set upstream
- **Undo & safety** — reflog undo timeline (soft/mixed/hard reset), undo last operation, auto-stash net, detached-HEAD & identity banners
- **Tags** — list, create (lightweight/annotated), delete
- **History & blame** — file history, line/selection history, inline blame

📖 **Full feature documentation** (every entry point → what happens next):
[`documentation/index.html`](documentation/index.html) ·
feature index + per-version history: [`CHANGELOG.md`](CHANGELOG.md)

## Install
Search `HydraGit` in Extensions, or: `ext install vkushnarenko.hydragit`

## Usage
Open it from either surface:
- Click the **HydraGit** hexagon in the **activity bar** (sidebar staging view).
- Open the **HydraGit** tab in VS Code's **bottom panel** (branch tree + log + diff).

Editor extras: right-click a file → **HydraGit: File History**; select lines →
**History for Selection**; **Toggle Line Blame** for inline blame.

> **TODO before publishing:** record the demo GIF for the Marketplace listing
> (15s: open panel → branch tree → click branch → log → click commit → detail → file → diff → right-click → context menu). Extensions without a GIF get ~5× fewer installs.

## License

[GPL-3.0](LICENSE.md) — free forever. Forks must stay open source under the same
license, so nobody can take HydraGit, tweak it, and put it behind a paywall.

**The HydraGit name and logo are not covered by this license** — forks must use
their own name and branding.

---
Marketplace: vkushnarenko.hydragit
Started: March 2026