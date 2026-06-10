# HydraGit — Roadmap & Release Playbook

The single actionable doc: **what's left to ship, how to release, what to fix,
what comes later.** If a task isn't here, it isn't planned.

> Reference docs (the "how things work" side):
> [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) — architecture, IPC, concurrency,
> security model · [`IMPLEMENTED_FEATURES.md`](../IMPLEMENTED_FEATURES.md) +
> [`documentation/`](../documentation/index.html) — feature inventory ·
> [`CLAUDE.md`](../CLAUDE.md) — agent/session rules.
>
> This file replaced `FABLE.md`, `BUGS.MD`, `SECURITY.md`, `RELEASE.md` and
> `ideas.md` (consolidated 2026-06-10; history is in git).

---

## 1 · Road to the Marketplace — do these, in order

- [ ] **Pick the repo identity.** `package.json` says
      `github.com/latte-incognito/hydragit`; the publisher is `vkushnarenko`.
      Pick one, align `package.json`, make the repo public. The Marketplace
      listing links whatever `package.json` says.
- [ ] **Create `CHANGELOG.md`** — Marketplace shows a Changelog tab. Starter at
      the bottom of this file.
- [ ] **Run the suites + polish pass** — see §3 Testing and §4 Bugs. At minimum
      fix the three pre-GIF UI items (§4 → 7, 8, 9) before recording.
- [ ] **`make build-all`** — now produces 5 binaries (incl. linux-arm64; the
      Makefile target was added 2026-06-10 but the binary hasn't been built yet).
- [ ] **`vsce ls`** — eyeball the package list: 5 binaries in, no `src/`, no
      tests, no notes.
- [ ] **Smoke-test the `.vsix` on one Windows and one Linux machine** — the
      binary-spawn path is per-platform; F5 on macOS exercises only one of them.
      Known Windows risk: rebase orchestration uses POSIX `cp` as
      `GIT_SEQUENCE_EDITOR`/`GIT_EDITOR` — won't work on Windows as-is (§3).
- [ ] **Record the GIF** (~15 s: open panel → branch tree → click branch → log →
      click commit → diff → right-click → context menu). Extensions without a
      GIF get ~5× fewer installs. Put it at the top of README.
- [ ] **Publish** (§2), then within 24 h:
      - r/vscode — GIF first; framing: *"Switched from IntelliJ and missed having
        git history, branches, and diff in one panel. Built this."* Don't use the
        word "extension" in the title.
      - r/webdev, r/git — same framing.
      - LinkedIn — short post with GIF + Marketplace link.
      - dev.to — *"How I built a VS Code git panel in Go"* (drives organic
        installs for months).
      - Resume — `HydraGit — VS Code extension · N installs · marketplace.…`

Done already (kept for the record): GPL-3.0 relicense (before first publish,
sole-author, clean) · all FABLE security fixes · `.vscodeignore` fixes ·
duplicate activation event · linux-arm64 Makefile target.

---

## 2 · Release mechanics

**One-time publisher setup (~10 min)**
1. Microsoft account → `dev.azure.com` → User Settings → Personal Access Tokens
   → New Token (`hydragit-publish`, Organization: All, 1 year, scope
   **Marketplace → Manage**) → save the PAT.
2. `npm install -g @vscode/vsce`
3. `vsce create-publisher vkushnarenko` (permanent ID → `vkushnarenko.hydragit`)

**Build · package · publish**
```bash
make package              # build-all + extension + webview → hydragit-<ver>.vsix
code --install-extension hydragit-*.vsix   # local install test
vsce login vkushnarenko
make publish              # builds + vsce publish → live in ~5 min
vsce publish patch|minor|major             # later version bumps
```
Use the extension on real repos for ≥ 3 days before the first publish.

**Binary distribution — decided:** bundle all platform binaries (~4 MB each) in
one `.vsix`. No runtime downloads (breaks offline/proxy installs, needs an
integrity story, bad first-run failure modes). When size matters later:
platform-specific `vsce publish --target` packages.

**GitHub repo:** add topics `vscode vscode-extension git git-client typescript
go golang developer-tools` once public.

---

## 3 · Testing

```bash
make test            # Go (gotestsum) + Vitest
go test -race ./internal/ipc/    # the concurrency suite — -race is the point
make webview-check   # svelte-check
npm run test:e2e     # Playwright (builds a fixture repo in /tmp)
```

**Windows — deferred, needs a real `windows-latest` CI runner** (Docker can't
substitute): `.exe` naming, `\` vs `/` paths, `os/exec` lookup. Known issue to
fix first: the rebase orchestration uses a POSIX `cp` as
`GIT_SEQUENCE_EDITOR`/`GIT_EDITOR` — replace with a cross-platform mechanism
(e.g. a tiny `hydragit-server --copy-editor` self-exec or Go-written temp
script). Plan: `go test ./...` + a spawn-and-`status` smoke on the runner.

Testing philosophy (real temp repos, no mocking `run()`, negative cases for
every mutation) lives in `CLAUDE.md` → Testing approach.

---

## 4 · Bugs & polish queue

Real bugs:
1. ~~Scrollbars (activity rail + branch pane) widen on hover~~ — fixed
   2026-06-10: VS Code's injected webview stylesheet (bare
   `::-webkit-scrollbar`, 10px) could win the cascade over our bare 2px rules
   depending on injection order. Now `:root *`-prefixed for deterministic
   specificity; the action rail hides its scrollbar entirely. **Verify
   visually under F5** — if it still widens, the fallback is standard
   `scrollbar-width: thin` + `scrollbar-color` (non-expanding, but ~8px).
2. Main-panel status bar: show "no upstream / unpublished branch" state after
   the branch name, clickable → push & set upstream.
3. Amend with remote sync not amending; after amending, "magic sync" rebases
   back instead of force-with-lease offering. (Two related reports.)
4. Colors must come from VS Code theme tokens — HydraGit status bar doesn't
   follow theme changes.

Main panel UI (7–9 = **fix before recording the GIF**):

7. Detail pane shows raw ISO timestamp — humanize like the log column.
8. Date column truncates — smart dates (time today / `Jun 7` this year / full).
9. Author column is pure repetition in single-author repos — initials chip or
   auto-hide.
10. Ref pills eat the subject — `HEAD →` as icon, middle-truncate, `+N` overflow.
11. Selected log row: orange outline reads as focus ring — use
    `list.activeSelectionBackground` fill; outline = keyboard focus only.
12. Detail action row: add checkout-at-commit, create branch/tag, View on
    GitHub; visually separate Revert (destructive) from Copy hash.
13. Search mode switching (msg→author/file/hash/code) — make the chip obviously
    clickable or a dropdown.
14. Dim author/date text — use `descriptionForeground` token, not hardcoded gray.

Sidebar (multi-repo):

15. Clean repos render the full commit UI (~400 px dead space each) — collapse
    to header + "No changes"; show the commit area only when changes exist.
    **This is what makes the sidebar scale past 2 repos.**
16. "Amend last commit" on a clean tree: button/hint contradict — decide
    (message-only reword should work) and align.
17. Change-count shown 3× per repo — drop the CHANGES badge.
18. No clear indicator of the *active* repo group — give it an explicit header
    treatment.
19. Empty-state text duplicated (resolved by 15).
20. Message textarea full-height when empty ×N repos — single-line, grow on focus.
21. Branch pill in group header truncates badly — middle-truncate like the
    main-panel pills (10).

Graph style (from the design review): drop `stroke-dasharray` from `ATTR` in
`graphSvg.ts` (solid = premium look; keep dashes only if given a semantic
meaning like remote-only), +1 `stroke-width` on the hovered lane, ~120 ms
opacity transition on the hover dim.

---

## 5 · Backlog — 🧊 frozen until after 1.0

**The feature set is done for 1.0** (declared 2026-06-10, after the five-feature
wave: pickaxe, merge preview, safety checks, fixup/autosquash + rerere,
snapshots). Build nothing below before the Marketplace release; let real users
re-rank it.

First candidates after 1.0:
- **Guided bisect** — good/bad buttons, auto-checkout midpoint, "N commits left".
- **Move changes to another branch** — "oops, wrong branch" in one click.
- **Hunk/line staging** — High effort; built-in SCM has the raw capability, this
  is in-panel cohesion. Then **patch-from-commit** (lazygit-style, shares the
  patch plumbing).
- **True "edit" step in interactive rebase** — pause-to-amend, reuses the
  conflict-pause machinery.
- Small: stash→branch, apply patch (`git am`), blame `.git-blame-ignore-revs`.

Deferred, demand-driven: submodules · revision navigation (in-editor file
stepping) · range-diff · signature badges · smartlog ("just my work" view) ·
custom settings panel (VS Code settings suffice until toggle count outgrows
them) · platform-specific `.vsix` targets · macOS notarization.

Cut (2026-06-10 triage; revive only on user demand): interactive `git clean`
(built-in discard covers it) · Search & Compare view (log search covers it) ·
richer blame hovers (already shipped in essentials).

**Out of scope on principle — interop, don't rebuild:** PR/forge review (GitHub
PR & Issues ext owns it), issues/CI status, commit-lint/Commitizen,
`.gitignore` generators, a custom 3-way merge editor (VS Code's is delegated to
already). Local-git-only is the identity.

---

## 6 · Security backlog

Threat model + enforced mitigations: `PROJECT_CONTEXT.md` → Security model.
Open hardening items (defense-in-depth — behind the repo gate + Go's `default:`
case, not exposed holes):

- [ ] Message **shape validation** in `panel.ts` (`msg.cmd`/`msg.id` are strings)
      and an explicit host-side **command allowlist**.
- [ ] Belt-and-suspenders **ref-name validation** in `handler.go` (reject `..`
      etc. where a ref is expected; git's own validation is the current backstop).
- [ ] macOS **signing/notarization** — post-1.0 nice-to-have (`.vsix`-extracted
      binaries don't carry the quarantine attribute in practice).

Accepted risks (documented, deliberate): `style-src 'unsafe-inline'` (Svelte
injects styles; not a script vector) · destructive-op gate confirms *a* recent
native Yes, not the specific op · rerere config stays in repos after disabling
the setting.

---

## 7 · CHANGELOG.md starter

```markdown
# Changelog

## [0.3.0] - 2026-06-XX
### Added
- Working-tree snapshots — auto-captured before risky operations (incl. untracked files); browse, diff, restore, delete from the branch pane
- Merge conflict preview — every merge confirm shows a dry-run verdict (git ≥ 2.38)
- Pre-commit safety checks — warns on likely secrets, conflict markers, large files, protected branches (hydragit.safety.*)
- Code search (pickaxe) — find commits that added or removed a string
- Fixup & autosquash from the commit context menu; git rerere enabled per repo (hydragit.rerere.enabled)
### Changed
- Concurrent git backend — slow network operations no longer freeze the panels; per-repo operation locking
- License: GPL-3.0
### Security
- Webview hardening: repo allowlist, worktree-path validation, zero-network-egress CSP on all panels, destructive-op confirmation gate
```
