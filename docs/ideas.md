# HydraGit — Ideas

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

## 🧊 FEATURE FREEZE — declared 2026-06-10

**The feature set is done for 1.0.** The panel covers the full IntelliJ git tool
window plus things it doesn't have (conflict preview, working-tree snapshots,
pickaxe search, fixup/autosquash, rerere). Everything below this section is
**post-1.0 material — do not build any of it before the Marketplace release.**

Current mode is **polish and ship**:
1. `BUGS.MD` — real bugs (#1–6) and the UI review items (#7–21; #7–9 before the GIF)
2. `docs/RELEASE.md` pre-publish checklist (repo URL identity, CHANGELOG.md,
   linux-arm64 build, `vsce ls`, Windows/Linux smoke test)
3. The demo GIF, then publish

First candidates *after* 1.0 ships and real users weigh in: guided bisect,
move-changes-to-another-branch, hunk staging.

---

## Build-next shortlist (historical)

> ✅ **All five shipped 2026-06-10** (`pickaxe` log search mode · `merge.preview`
> dry-run conflict prediction in merge confirms · `commit.precheck` safety warnings
> with VS Code settings toggles · `commit.fixup`/`rebase.autosquash` + rerere
> via `hydragit.rerere.enabled` · `snapshot.*` working-tree time machine with
> auto-capture before risky ops). Settings went through VS Code's native
> contributes.configuration instead of a custom panel — revisit a panel only if
> the toggle count outgrows it.

---

## Power editing & staging

**Hunk / line-level staging (partial commit)** — ★★★★☆ · Effort: High · GitLens: ✓ · IntelliJ: ✓ · *post-1.0*
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
Subsumed by **working-tree snapshots** if that ships first — build whichever lands
sooner, not both as separate mechanisms.

---

## History, search & compare

**Pickaxe search (`log -S` / `-G`)** — ★★★★☆ · Effort: Low-Med · GitLens: ✓ · IntelliJ: ✓
"When did this string / function appear or vanish?" Searches *content changes*,
not messages. Drops into the existing search bar as a new mode. Powerful and
rarely known.

**Revision navigation** — ★★☆☆☆ · Effort: Med · GitLens: ✓ · IntelliJ: ✓ · *deferred*
Step a file back/forward through its history in the editor (diff arrows).
File/line history panels already cover the need; in-editor stepping is polish —
revisit on user demand.

**range-diff** — ★★☆☆☆ · Effort: Med · GitLens: ~ · IntelliJ: ✗ · *deferred*
Compare a branch before vs. after a rebase ("did I drop anything?"). Rare, slick,
reassuring — natural companion to the interactive-rebase story, not before 1.0.

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

**Signature verification badges** — ★★☆☆☆ · Effort: Low · GitLens: ✓ · IntelliJ: ~ · *deferred*
Show verified / unverified commits via `%G?` in the log format. Cheap, but a trust
signal almost no solo/small-team user reads — revisit on demand.

---

## Scale, topology & platform

**Multi-repo / multi-root workspaces** — ✅ Shipped → see
[`multi-repo`](../documentation/features/multi-repo.html). Sidebar shows every
repo as a collapsible group; the main panel follows the focused repo; the Go side
is parameterised per request (`Request.Repo`). *Remaining gaps:* inline blame
still binds to the first workspace folder (wrong for a file in a non-focused
repo); per-group 3s polling rather than file watchers; no Playwright e2e yet
(needs a multi-root fixture).

**Submodules** — ★★☆☆☆ · Effort: Med-High · GitLens: ✓ · IntelliJ: ✓ · *post-1.0, demand-driven*
List + update/init/sync submodules, show their status, open a submodule's own
history. A papercut for the orgs that use them (reads as "toy" without it), niche
for everyone else. Don't build until real users ask — Med-High effort on
speculation is how solo projects stall.

**Settings panel** — ★★★☆☆ · Effort: Med · GitLens: ✓ · IntelliJ: ✓
Graduates from "nice" to "required" the moment tunable features land
(pre-commit safety toggles, default pull mode, worktree default path, blame
ignore-revs file, rerere on/off). Build it alongside the first tunable feature,
not before.

---

## Borrowed from other clients (proposed 2026-06-09)

Ideas lifted from git clients outside the GitLens/IntelliJ frame of reference.
All implementable under `os/exec + git CLI only`. Items marked *git ≥ 2.38* need
a version check (`git version`) with graceful hiding on older installs.

**Working-tree snapshots ("local history for git")** — ★★★★★ · Effort: Med · GitLens: ✗ · IntelliJ: ~ (IDE Local History, not git)
*From GitButler's oplog / IntelliJ Local History.* `git stash create` builds a
stash commit **without touching the working tree**; store the resulting sha under
`refs/hydragit/snapshots/<timestamp>` via `update-ref`. Snapshot automatically
before every risky op (rebase, reset, merge, checkout with dirty tree) and
optionally on a timer. Browse/diff/restore from the existing undo timeline.
Invisible in `git stash list`, ordinary objects, GC-safe while referenced. The
maximal expression of the safety-net thesis: *uncommitted* work becomes
recoverable, always. Nothing in the VS Code ecosystem does this with plain git.

**Merge conflict preview** — ★★★★☆ · Effort: Low-Med · GitLens: ✗ · IntelliJ: ✗ · *git ≥ 2.38*
*From the jj/merge-tree school.* `git merge-tree --write-tree <ours> <theirs>`
dry-runs a merge entirely in the object DB — working tree untouched — and reports
conflicted paths. Surface as a badge before merge/rebase ("will conflict: 3
files") and optionally in the branch context menu. Answers the question every
developer asks before merging, and no GUI client in this space does it.

**Absorb — auto-route staged changes into the commits they belong to** — ★★★★☆ · Effort: Med · GitLens: ✗ · IntelliJ: ✗
*From `git-absorb` / Mercurial's `hg absorb`.* For each staged hunk, blame the
touched lines to find the commit that introduced them, create
`commit --fixup=<sha>` per target, then offer the autosquash rebase. One button:
"absorb staged changes". Pairs with (and should ship after) the planned
fixup/autosquash item. Spiritual sibling of the pickaxe — "I didn't know git
could do that".

**Stacked branches / restack** — ★★★★☆ · Effort: Low · GitLens: ✗ · IntelliJ: ✗ · *git ≥ 2.38*
*From Graphite / stacked-PR workflows.* `git rebase --update-refs` moves every
branch ref in the rebased range along with it — the entire stack restacks in one
operation. Expose as a checkbox on the existing rebase flow, and render stacks
(branch-on-branch chains) as indented groups in the branch tree. Very low effort
on top of existing rebase machinery; very current workflow.

**Patch from commit — line-level history surgery** — ★★★☆☆ · Effort: High · GitLens: ✗ · IntelliJ: ✗ · *deferred until hunk staging exists*
*From lazygit's custom patch builder (its signature feature).* Select hunks/lines
*inside an existing commit's diff* and pull them out — into the working tree, the
index, or a new commit — via `format-patch`-style patch construction +
`apply --reverse` against the commit, wrapped in the rebase machinery. Shares all
patch-building plumbing with hunk-level staging; build it second, not first.

**Smartlog — "just my work" graph view** — ★★☆☆☆ · Effort: Med · GitLens: ✗ · IntelliJ: ✗ · *deferred*
*From Meta's Sapling (`sl smartlog`) / git-branchless.* A log mode that hides the
noise: show only commits reachable from *my* local branches but not from
upstream main, plus main's tip as an anchor — i.e. the tree of my unmerged work.
One `rev-list` expression (`--branches --not --remotes=origin`) feeding the
existing lane algorithm. Pure filter + reuse.

---

## Cut / closed (triage 2026-06-10)

Verified against the thesis ("the git *panel*, done right" + safety net) and against
what already ships. Revival condition noted per item — cut is not forever, it's
"not without a reason".

**Interactive `git clean`** — CUT. The explorer + built-in SCM discard already cover
removing untracked files; a checklist UI for a rare, destructive op invites accidents
for marginal value. *Revive if:* users ask after working-tree snapshots ship (the
safety net would make it defensible).

**Search & Compare view** — CUT. The log search already does message / hash / file /
author + branch scope; a separate persistent view duplicates it for the rare
cross-repo case. *Revive if:* multi-repo users specifically request cross-repo commit
search.

**Richer blame hovers** — CLOSED, essentially shipped. `blameAnnotation.ts`
`buildHoverMarkdown` already renders summary, author + email, relative + absolute
time, sha, plus command links; the history panel has full blame cards. The only
missing piece (changed-files list *inside the hover*) is clutter the command links
already answer. No work remains.

**Guided bisect** — DEMOTED from the shortlist, kept in its section. High wow, low
frequency — first candidate when the current shortlist drains.

Also deferred in place (marked on the items): hunk staging (post-1.0), revision
navigation, range-diff, signature badges, submodules (demand-driven), smartlog,
patch-from-commit (needs hunk staging's plumbing first).

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
