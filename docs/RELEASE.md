# HydraGit — Release Guide

---

## Binary distribution — decision

**Bundle the binaries in the `.vsix`. Do not download them at runtime.**

- Current state: `make build-all` produces 4 platform binaries at ~4 MB each (~16 MB
  total) and `vsce package` bundles them all into one `.vsix`. That size is fine —
  ship it this way for 0.x.
- **Why not runtime download** (fetching from GitHub Releases on first activation):
  breaks offline and corporate-proxy installs, requires a checksum/signature
  verification story you'd have to build and maintain, slows first activation, and
  every failure mode becomes a 1-star review. For a tool whose pitch includes a
  zero-dependency supply chain, downloading executables at runtime is also the wrong
  optics.
- **Later, when it pays for itself:** platform-specific packages via
  `vsce publish --target darwin-arm64` (one per platform). The Marketplace then serves
  each user only their ~5 MB package automatically. Purely a size optimization — not
  needed for launch.

---

## Pre-publish checklist (review findings, 2026-06-09)

Blockers — fix before first `vsce publish`:

- [ ] **Repo URL identity mismatch.** `package.json` points to
      `github.com/latte-incognito/hydragit`; this doc says
      `github.com/vkushnarenko/hydragit`. The Marketplace listing uses the
      `package.json` URL — pick one identity, make that repo public, and align both.
- [ ] **Security fixes from `FABLE.md` #1 and #2** — the `msg.repo` allowlist check in
      `panel.ts` and the 64 KB stdin scanner buffer in `main.go`. Publishing widens
      exposure, and the scanner bug (blame on any file > 64 KB kills the backend) will
      generate crash reviews on day one.
- [ ] **`CHANGELOG.md` doesn't exist.** The Marketplace shows a Changelog tab; create it
      from the starter below (current version is 0.2.3, not 0.1.0).
- [ ] **linux-arm64 binary is never built.** `extension.ts` resolves
      `hydragit-server-linux-${arch}` but `build-all` has no `GOARCH=arm64` linux target
      — the extension crashes on spawn in arm64 devcontainers (Docker on Apple Silicon)
      and ARM remote-SSH hosts. Add
      `GOOS=linux GOARCH=arm64 → bin/hydragit-server-linux-arm64` to `build-all`.

Should-fix — cheap, do in the same pass:

- [ ] `.vscodeignore`: add `FABLE.md` (don't ship a findings doc listing unpatched
      issues inside the package) and fix the dev-binary pattern — `hydragit-server`
      only matches at the repo root, so a stale `make build-go` output at
      `bin/hydragit-server` would ship; use `bin/hydragit-server` (exact path, no
      wildcard — a trailing `*` would exclude the platform binaries too).
- [ ] `package.json`: remove the duplicated `"onStartupFinished"` activation event.
- [ ] Run `vsce ls` before publishing and eyeball the file list — verify the 4 platform
      binaries are in, and no `src/`, tests, or notes leaked.
- [ ] Test the installed `.vsix` on at least one Windows and one Linux machine — the
      binary-spawn path is per-platform and F5 on macOS exercises only one of them.

Not blockers:

- macOS signing/notarization: binaries extracted from a `.vsix` by VS Code don't carry
  the quarantine attribute, so Gatekeeper doesn't intercept them in practice. Keep
  notarization as a post-1.0 nice-to-have.
- Svelte 5 syntax migration: explicitly post-release (see `FABLE.md`).

---

## Publisher setup (one-time, ~10 minutes)

**Step 1 — Microsoft account**
Any Outlook/Hotmail/Microsoft account. `login.microsoftonline.com`

**Step 2 — Personal Access Token**
1. Go to `dev.azure.com`
2. Top-right → User Settings → Personal Access Tokens
3. New Token → Name: `hydragit-publish` → Organization: All → Expiration: 1 year
4. Scopes: Custom → **Marketplace → Manage**
5. Create → copy immediately (won't show again) → save in password manager

**Step 3 — Create publisher**
```bash
npm install -g @vscode/vsce
vsce create-publisher vkushnarenko
# prompts: display name, email, PAT token
```

Publisher ID `vkushnarenko` is permanent. Extension becomes `vkushnarenko.hydragit`.

---

## package.json fields that matter

```json
{
  "name": "hydragit",
  "displayName": "HydraGit",
  "description": "IntelliJ-style git panel for VS Code — branch tree, commit log, diff. No paywall.",
  "version": "0.2.0",
  "publisher": "vkushnarenko",
  "icon": "images/icon.png",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["SCM Providers", "Other"],
  "keywords": [
    "git", "git log", "git graph", "branch", "commit", "diff",
    "gitlens alternative", "git client", "intellij git", "git history"
  ],
  "repository": { "type": "git", "url": "https://github.com/vkushnarenko/hydragit" },
  "bugs": { "url": "https://github.com/vkushnarenko/hydragit/issues" }
}
```

The `scm/title` menu entry puts a HydraGit button in the Source Control panel header — where users already look for git tools.

---

## Local testing — always before publishing

**F5 in VS Code (Extension Development Host)**
```
Open project in VS Code → press F5
→ second VS Code window opens with extension loaded
→ Command palette → "HydraGit: Open"
→ panel appears with real git data
```

**Install as .vsix**
```bash
make package              # → hydragit-0.2.0.vsix
code --install-extension hydragit-0.2.0.vsix
```

Use on your own real repos for at least 3 days before publishing.

---

## Publishing

```bash
vsce login vkushnarenko   # enter PAT when prompted
make publish              # builds everything + vsce publish
```

Live on Marketplace in ~5 minutes.
URL: `marketplace.visualstudio.com/items?itemName=vkushnarenko.hydragit`

**Version bumps:**
```bash
vsce publish patch   # 0.2.0 → 0.2.1
vsce publish minor   # 0.2.0 → 0.3.0
vsce publish major   # 0.2.0 → 1.0.0
```

> Note: not yet published to the Marketplace. The repo is the source of truth;
> `vkushnarenko.hydragit` is the reserved publisher/extension ID for first publish.

---

## GitHub repo

Required — Marketplace listing has a Repository link. Empty = looks abandoned.

**Repo:** `github.com/vkushnarenko/hydragit`

**Topics to add** (helps discoverability):
```
vscode vscode-extension git git-client typescript go golang developer-tools
```

**.gitignore must include:**
```
out/
node_modules/
*.vsix
bin/hydragit-server*
```

---

## README.md — the Marketplace page

Structure (order matters):

```markdown
# HydraGit

> IntelliJ-style git panel inside VS Code. Branch tree, commit log, diff — all in one place. No paywalls.

[GIF HERE]

## Why
GitLens went paywalled. VS Code's built-in git panel has no history view.
If you came from IntelliJ and miss having everything in one panel — this is it.

## Features
- Branch tree — local + remote, right-click actions
- Commit log — subject, author, date, branch/tag pills
- Inline diff — click a commit, see changed files and diff
- Branch actions — checkout, merge, rebase, rename, delete, push

## Install
Search `HydraGit` in Extensions, or: `ext install vkushnarenko.hydragit`

## Usage
Command palette → `HydraGit: Open`
Or click the HydraGit button in the Source Control panel header.
```

**The GIF is not optional.** Extensions without a GIF get ~5x fewer installs.
Record it before publishing. 15 seconds: open panel → branch tree → click branch → log updates → click commit → detail panel → click file → diff → right-click branch → context menu.

---

## Post-publish (do within 24h)

- **r/vscode** — GIF first, then: *"Switched from IntelliJ and missed having git history, branches, and diff in one panel. Built this."* Don't use the word "extension" in the title — reads as spam.
- **r/webdev, r/git** — same framing.
- **LinkedIn** — short post with GIF, link to Marketplace.
- **dev.to article** — *"How I built a VS Code git panel in Go"* — drives organic installs for months via Google.
- **Resume** — update immediately: `HydraGit — VS Code extension · N installs · marketplace.visualstudio.com/...`

---

## CHANGELOG.md starter

```markdown
# Changelog

## [0.1.0] - 2026-XX-XX
### Added
- Branch tree — local and remote branches, collapsible groups per remote
- Commit log — subject, author, date, branch/tag pills, merge commit visualization
- Inline detail panel — commit metadata, changed files, diff view
- Branch context menu — checkout, new branch, merge, rebase, rename, push, delete
- Stash manager — list, pop, apply, drop, show, save
- Toolbar — Fetch, Pull, Push
- Statusbar — current branch, ahead/behind counts
```
