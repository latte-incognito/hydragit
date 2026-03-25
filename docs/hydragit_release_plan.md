# HydraGit — Release Plan v2

---

## GitHub repo — yes, required

You can publish to Marketplace without a public repo. But you want one anyway:
- Marketplace listing has a Repository link — empty = looks abandoned or sketchy
- Users check before installing anything with git access to their machine
- The career story requires the chain: Resume → GitHub → Marketplace install count
- VS Code shows a Source badge linking to GitHub — adds legitimacy

**Repo:** `github.com/vkushnarenko/hydragit`

**What to gitignore:**
```
out/
node_modules/
*.vsix
bin/hydragit-server*       ← compiled binaries, never commit
```

---

## Repo structure

```
hydragit/
├── .github/workflows/release.yml   ← optional CI, set up after v0.1
├── cmd/ internal/ extension/ webview/ images/ bin/
├── package.json
├── Makefile
├── README.md                        ← this IS your Marketplace page
└── CHANGELOG.md
```

---

## package.json — every field matters

```json
{
  "name": "hydragit",
  "displayName": "HydraGit",
  "description": "IntelliJ-style git panel for VS Code — branch tree, commit log, diff. No paywall.",
  "version": "0.1.0",
  "publisher": "vkushnarenko",
  "icon": "images/icon.png",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["SCM Providers", "Other"],
  "keywords": [
    "git", "git log", "git graph", "branch", "commit", "diff",
    "gitlens alternative", "git client", "intellij git", "git history"
  ],
  "repository": { "type": "git", "url": "https://github.com/vkushnarenko/hydragit" },
  "bugs": { "url": "https://github.com/vkushnarenko/hydragit/issues" },
  "activationEvents": ["onCommand:hydragit.open"],
  "main": "./extension/out/extension.js",
  "contributes": {
    "commands": [{
      "command": "hydragit.open",
      "title": "HydraGit: Open",
      "icon": "images/icon.png"
    }],
    "menus": {
      "scm/title": [{ "command": "hydragit.open", "group": "navigation" }]
    }
  }
}
```

The `scm/title` menu puts a HydraGit button in the Source Control panel header — where users already look for git tools.

---

## README.md — the Marketplace page

Structure exactly like this (order matters):

```markdown
# HydraGit

> IntelliJ-style git panel inside VS Code. Branch tree, commit log, diff — all in one place. No paywalls.

[GIF HERE — record before publishing, it is your entire marketing]

## Why

GitLens went paywalled. VS Code's built-in git panel has no history view, no log, no graph.
If you came from IntelliJ and miss having everything in one panel — this is it.

## Features

- Branch tree — local + remote, collapsible, right-click actions
- Commit log — subject, author, date, branch/tag pills
- Inline diff — click a commit, see changed files, see diff. No panel switching.
- Branch actions — checkout, merge, rebase, rename, delete, push

## Install

Search `HydraGit` in Extensions, or:
ext install vkushnarenko.hydragit

## Usage

Command palette → `HydraGit: Open`
Or click the HydraGit button in the Source Control panel header.
```

**The GIF is not optional.** Extensions without a GIF get ~5x fewer installs.
Record it before publishing. 15 seconds: open panel → branch tree visible → click branch → log updates → click commit → detail panel opens → click file → diff appears → right-click branch → context menu.

---

## Publisher registration (one-time, ~10 minutes)

**Step 1 — Microsoft account**
Any Outlook/Hotmail/Microsoft account works. `login.microsoftonline.com`

**Step 2 — Personal Access Token**
1. Go to `dev.azure.com`
2. Top-right → User Settings → Personal Access Tokens
3. New Token → Name: `hydragit-publish` → Organization: All → Expiration: 1 year
4. Scopes: Custom → **Marketplace → Manage**
5. Create → copy immediately, won't see again
6. Save in password manager

**Step 3 — Create publisher**
```bash
npm install -g @vscode/vsce
vsce create-publisher vkushnarenko
# prompts: display name, email, PAT token
```

Publisher ID `vkushnarenko` is permanent. Extension becomes `vkushnarenko.hydragit`.

---

## Local testing — always before publishing

**F5 in VS Code (Extension Development Host)**
```
Open project in VS Code → press F5
→ second VS Code window opens with your extension loaded
→ Command palette → "HydraGit: Open"
→ panel appears with real git data
```

**Install as .vsix**
```bash
make package              # → hydragit-0.1.0.vsix
code --install-extension hydragit-0.1.0.vsix
```

Use it on your own real repos for at least a week before publishing. This is how you catch issues before they affect other people.

---

## Publishing

```bash
vsce login vkushnarenko   # enter PAT when prompted
make publish              # builds everything + vsce publish
```

Live on Marketplace in ~5 minutes. URL: `marketplace.visualstudio.com/items?itemName=vkushnarenko.hydragit`

**Version bumps:**
```bash
vsce publish patch   # 0.1.0 → 0.1.1
vsce publish minor   # 0.1.0 → 0.2.0
vsce publish major   # 0.1.0 → 1.0.0
```

---

## Post-publish: first installs (do within 24h)

**r/vscode** — GIF first, then: *"Switched from IntelliJ and missed having git history, branches, and diff in one panel. Built this."* Don't use the word "extension" in the title — reads as spam. Let the GIF sell it.

**r/webdev, r/git** — same framing, different subreddit.

**LinkedIn** — short post with GIF, tag as a project, link to Marketplace.

**dev.to article** — *"How I built a VS Code git panel in Go"* — drives organic installs for months because it ranks in Google search.

**Resume** — update immediately: `HydraGit — VS Code extension · N installs · marketplace.visualstudio.com/...`

---

## Versioning plan

| Version | What it means | When |
|---|---|---|
| `0.1.0` | Branch tree + commit log + inline diff. Core two-pane layout. | Ship it. |
| `0.1.x` | Bug fixes | Every fix |
| `0.2.0` | Staged diff view, infinite scroll, working tree changes | ~1 month after 0.1 |
| `0.3.0` | Stash manager, branch compare | ~2 months after 0.2 |
| `1.0.0` | All features, polished, AI commit message | Month 4-5 |

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
- Toolbar — Fetch, Pull, Push, live commit search
- Statusbar — current branch, ahead/behind, commit + branch counts
```

---

## Checklist before shipping v0.1

- [ ] GitHub repo created and code pushed
- [ ] `images/icon.png` committed (128×128)
- [ ] `README.md` written with GIF at top
- [ ] `CHANGELOG.md` created
- [ ] `package.json` has `repository` URL field
- [ ] Microsoft account created
- [ ] Azure PAT created — scope: Marketplace → Manage
- [ ] `vsce create-publisher vkushnarenko` done
- [ ] Tested with F5 on at least 3 different repos (single branch, multi-branch, large history)
- [ ] Tested as `.vsix` installed on own machine, used for 1 week
- [ ] GIF recorded
- [ ] `make publish` run successfully
- [ ] Posted to r/vscode within 24h
- [ ] Resume updated with Marketplace link
