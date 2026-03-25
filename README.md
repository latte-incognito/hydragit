# HydraGit

> IntelliJ-style git panel inside VS Code. Branch tree, commit log, inline diff, stash manager. No paywall.

Built because GitLens went paywalled and VS Code's built-in git panel has no history view.
If you came from IntelliJ and miss having everything in one place — this is it.

**Stack:** Go (git proxy via os/exec) + TypeScript (VS Code extension shell) + Vanilla JS (Webview UI)
**Publisher:** vkushnarenko.hydragit
**Status:** 🚧 v0.1.0 in development
```

---

**GitHub repo Topics** (add these when you create it, helps with discoverability):
```
vscode vscode-extension git git-client typescript go golang developer-tools
```

---

And for your own notes — paste this somewhere private so you remember what this repo is if you come back to it in 3 months:
```
HydraGit — VS Code extension
Goal: IntelliJ git panel experience in VS Code
Stack: Go binary (stdin/stdout IPC, wraps system git) + TypeScript shell + HTML webview
UI: hydragit_twopane.html — two pane, branch tree left, commit log right, detail panel inline
Architecture docs: /docs folder
Build: make package → .vsix → vsce publish
Marketplace: vkushnarenko.hydragit
Started: March 2026