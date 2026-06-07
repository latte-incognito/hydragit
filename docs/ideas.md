B# HydraGit — Ideas

The backlog, framed against the PyCharm/IntelliJ git panel ("IntelliJ panel, no
paywall"). Everything here is doable under the `os/exec + git CLI only`
constraint. This file is the single source of truth for what's *not yet built*.

- Shipped features → `IMPLEMENTED_FEATURES.md`

**Legend.** `Rating` = build priority (value × fit), ★1–5, 5 = build next.
`Effort` = rough size (Low / Med / High). `GitLens` / `IntelliJ` = does the
reference tool have it? ✓ yes · ~ partial · ✗ no · (Pro) = gated behind GitLens
Pro (on-brand to ship free).

**Thesis.** The same feature should read as a friendly safety net to a newcomer
and as raw git to an expert. For safety features: **warn + proceed**, never
hard-block by default.

---

## Build-next shortlist

1. **Hunk / line-level staging** — closes the last credibility gap with IntelliJ/GitLens.
2. **Pre-commit safety checks** — the viral "it stopped me committing my API key".
3. **Guided bisect** — biggest "a panel makes a clunky-but-powerful git feature usable" payoff.
4. **Pickaxe search** — low effort, high "I didn't know git could do that".
5. **rerere + fixup/autosquash** — small additions that make the rebase story best-in-class.

---

## Power editing & staging

**Hunk / line-level staging (partial commit)** — ★★★★★ · Effort: High · GitLens: ✓ · IntelliJ: ✓
The headline gap *within our own panel*. Today HydraGit staging is file-level
only (`stagedPaths` is a set of paths). Add gutter selection in the diff pane →
build a patch from the chosen hunks/lines and `git apply --cached -` (and
`--reverse` to unstage). The diff pane already renders hunks, so this is mostly
patch construction + UI.
Note: VS Code's **built-in** Source Control already does "Stage Selected Ranges"
in its diff, so this is about a *cohesive in-panel* experience, not a missing
capability — weigh effort accordingly. Still table stakes for "the panel".

**Move changes to another branch** — ★★★☆☆ · Effort: Med · GitLens: ✗ · IntelliJ: ✗
"Oops, wrong branch." Move uncommitted work (or the last commit) onto another
branch in one click instead of stash → checkout → pop. Neither reference tool
has a clean version — an original differentiator.

**True "edit" step in interactive rebase** — ★★★☆☆ · Effort: Med · GitLens: ~ · IntelliJ: ✓
Reword / squash / drop already ship; the *pause-to-amend-content* edit is
missing. Reuses the existing pause-on-conflict machinery (stop, let the user
change files, Continue).

**Fixup + autosquash** — ★★★☆☆ · Effort: Med · GitLens: ✓ · IntelliJ: ✓
"Fixup into commit X" creates `commit --fixup=<sha>`; a later
`rebase -i --autosquash` folds them automatically. Pairs with the existing
interactive-rebase editor.

---

## Beginner safety / simplicity

**Pre-commit safety checks** — ★★★★★ · Effort: Med · GitLens: ✗ · IntelliJ: ~
Before a commit, *warn* (with "commit anyway") on: a likely secret (`.env`,
API-key-shaped strings, `id_rsa`), an unusually large file, leftover conflict
markers (`<<<<<<<`), or committing straight to a protected branch (main/master).
The viral one — "it stopped me committing my API key." Tunable + disablable.

**Discard with a safety net** — ★★★☆☆ · Effort: Low · GitLens: ✗ · IntelliJ: ~
"Discard changes" that stashes a recoverable backup first instead of nuking work.

**Interactive `git clean`** — ★★☆☆☆ · Effort: Low · GitLens: ✗ · IntelliJ: ~
Visually pick which untracked files to remove (`git clean` with a checklist),
safety-net framed — "remove these N untracked files?".

---

## History, search & compare

**Pickaxe search (`log -S` / `-G`)** — ★★★★☆ · Effort: Low-Med · GitLens: ✓ · IntelliJ: ✓
"When did this string / function appear or vanish?" Searches *content changes*,
not messages. Drops into the existing search bar as a new mode. Powerful and
rarely known.

**Revision navigation** — ★★★☆☆ · Effort: Med · GitLens: ✓ · IntelliJ: ✓
Step a file back/forward through its history in the editor (diff arrows).
File/line history already exists; this is the in-editor stepping.

**Search & Compare view** — ★★★☆☆ · Effort: Med · GitLens: ✓ · IntelliJ: ✓
Cross-repo commit search + jump-between-matches. Message/author/hash/file
filters already cover the common cases; this is the dedicated, persistent view.

**range-diff** — ★★☆☆☆ · Effort: Med · GitLens: ~ · IntelliJ: ✗
Compare a branch before vs. after a rebase ("did I drop anything?"). Rare, slick,
reassuring.

---

## Debugging & investigation

**Guided `git bisect`** — ★★★★☆ · Effort: Med · GitLens: ✗ · IntelliJ: ✓
Binary-search to the commit that introduced a bug, with good/bad buttons,
auto-checkout of the midpoint, and a "X commits left" indicator. The CLI dance is
clunky enough that a UI adds 10× value.

---

## Conflict & rebase resilience

**`git rerere`** — ★★★★☆ · Effort: Low · GitLens: ✗ · IntelliJ: ~
Reuse recorded conflict resolutions — auto-resolves the same conflict on repeated
rebases/merges. Enable the config + surface a "resolution reused" indicator. Pure
safety-net brand fit, almost nobody knows it exists.

---

## Stash, patches & trust

**`git stash branch`** — ★★★☆☆ · Effort: Low · GitLens: ~ · IntelliJ: ~
Turn a stash into a new branch when it won't pop cleanly against the current tree.
Tiny, beloved by those who know it.

**Apply patch (`git am` / `git apply`)** — ★★★☆☆ · Effort: Low · GitLens: ~ · IntelliJ: ✓
Completes the round trip — "Create patch" (`format-patch`) already ships; this
applies one back.

**Blame `.git-blame-ignore-revs`** — ★★★☆☆ · Effort: Low · GitLens: ✓ · IntelliJ: ~
Skip bulk-format/reformat commits so blame shows the real author
(`--ignore-revs-file`). Blame already ships; this is a flag + setting.

**Signature verification badges** — ★★☆☆☆ · Effort: Low · GitLens: ✓ · IntelliJ: ~
Show verified / unverified commits via `%G?` in the log format. Cheap trust signal.

**Richer blame hovers** — ★★☆☆☆ · Effort: Low-Med · GitLens: ✓ · IntelliJ: ~
Full commit-detail card on blame hover (author, date, message, files). The blame
data already exists; this is presentation.

---

## Scale, topology & platform

**Multi-repo / multi-root workspaces** — ★★★★☆ · Effort: High · GitLens: ✓ · IntelliJ: ~
Today we key off `workspaceFolders[0]` — one repo per window. Real workspaces
often have several repos (and nested/sub repos). Needs a repo picker/scope in the
panel and the Go side parameterised per repo. Architectural, not a feature row —
decide before a confident v1, as many users hit this immediately.

**Submodules** — ★★☆☆☆ · Effort: Med-High · GitLens: ✓ · IntelliJ: ✓
List + update/init/sync submodules, show their status, open a submodule's own
history. A papercut for the orgs that use them (reads as "toy" without it), niche
for everyone else. Existing standalone submodule extensions are weak, so there's
room.

**Settings panel** — ★★★☆☆ · Effort: Med · GitLens: ✓ · IntelliJ: ✓
Graduates from "nice" to "required" the moment tunable features land
(pre-commit safety toggles, default pull mode, worktree default path, blame
ignore-revs file, rerere on/off). Build it alongside the first tunable feature,
not before.

---

## Out of scope / delegated to other extensions

The thesis is "the git *panel*, done right" — not "reimplement the whole git
ecosystem." These are real and valuable, but a dedicated extension (or VS Code
itself) already does them well. Plan: **interop, don't rebuild** — link out / let
them coexist, and keep our scope tight.

**PR / forge review (GitHub/GitLab)** — *deferred, delegated.*
This is the single biggest reason people pay for GitLens — but **GitHub Pull
Requests and Issues** (Microsoft) and **GitLab Workflow** already own PR review,
inline comments, and checks. We deliberately stay out and interop instead (we
already do "View commit on GitHub" via `openCommitUrl`). Staying local-git-only
is our identity; just know this is the strategic fork in the road.

**Issues / CI-CD status** — GitHub PR & Issues + GitHub Actions extensions. Out.

**Conventional-commit linting / templates / Commitizen prompts** — Conventional
Commits / Commitizen extensions. If we ever want it, *interop*, don't embed.

**`.gitignore` generation / templates** — the `gitignore` extension. Out.

**3-way conflict merge editor** — VS Code's built-in merge editor; we already
delegate to it (`openMergeEditor`). Keep delegating, don't build our own.

**Hunk staging (raw capability)** — built-in Source Control "Stage Selected
Ranges" already does it; our entry above is purely about doing it *inside* the
HydraGit panel for cohesion. If panel cohesion isn't worth the High effort,
delegating to built-in is a legitimate choice.

---

## Deferred — Windows testing

Needs a real `windows-latest` CI runner (`.exe` naming, `\` vs `/` paths,
`os/exec` lookup) — Docker can't substitute. Note: the rebase orchestration uses
a POSIX `cp` as `GIT_SEQUENCE_EDITOR`/`GIT_EDITOR`, which won't work on Windows
as-is. Plan: `go test ./...` + a spawn-and-`status` smoke on a Windows runner.
