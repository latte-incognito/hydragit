<p align="center">
  <img src="images/hydragit-banner.png" alt="HydraGit" width="100%">
</p>

# HydraGit

> IntelliJ-style git panel inside VS Code. Branch tree, commit log, diff — all in one place. No paywalls.

[GIF HERE]

## Why
GitLens went paywalled. VS Code's built-in git panel has no history view.
If you came from IntelliJ and miss having everything in one panel — this is it.

## Features
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