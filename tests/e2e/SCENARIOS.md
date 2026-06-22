# HydraGit e2e scenarios — source of truth

Real end-to-end user journeys against VS Code + the built extension, driven by
Playwright/Electron (`tests/e2e/vscode-fixture.ts`). This file is the catalogue;
each scenario maps to a `test(...)` in the spec files below.

> Like the rest of the suite, these are **authored to convention against real
> component selectors** (harvested from the shipping specs) and assert **real git
> state** via `git()`/`workerRepo()`. Selectors/timeouts get a first-run pass in
> the e2e environment — that's the established norm for this suite.

## Settled decisions

1. **Native dialogs.** The fixture forces `window.dialogStyle: "custom"`, so VS
   Code modals are DOM (`.monaco-dialog-box`) and Playwright-drivable; quick
   inputs are `.quick-input-box input`. Helpers: `answerPrompt`, `confirmModal`,
   `quickPick` (in `webview-helpers.ts`). The only non-drivable surface is the
   **OS file-save picker** (Save-as-patch destination) — handled via a
   `HYDRAGIT_TEST_PATCH_DIR` env hook in the extension so the real `.patch` is
   still asserted, never the native picker.
2. **`[msg]` contract.** `expectReadableError(text, { mentions })`: non-empty,
   ≥ 12 chars, single coherent line, does **not** start with
   `fatal:`/`error:`/`usage:`/`warning:`, no `at file:line` stack noise, and
   contains `mentions` (offending branch/ref/file) when given.
3. **Assertions.** Dual: assert the UI **and** shell out to verify real git
   state (HEAD sha, ahead/behind, branch/tag existence, reflog) with `git()`.
4. **Scale.** One spec file per cluster (A–P) + `epics.spec.ts` (`@slow`).
   Workers each get their own repo (`${repo}-w${workerIndex}`), so files
   parallelize. Dirty/conflict/remote/multi-repo scenarios are routed to
   dedicated fixture projects in `playwright.config.ts`.

## Legend

`[+]` happy · `[−]` blocked/negative · `[±]` fails-then-recovers ·
`[⚠]` adversarial (break it / bypass a guardrail) · `[msg]` asserts the
surfaced error/warning is readable **and** accurate.

---

## A. Commit & staging — `e2e-commit-staging.spec.ts` (dirty project)
1. `[+]` Stage subset via checkboxes → commit → rest stays dirty.
2. `[+]` Stage-all via section header → Commit & Push → ahead→0.
3. `[−][msg]` Empty message → Commit disabled; the *why* is shown.
4. `[−][msg]` Whitespace-only message → rejected with a readable reason.
5. `[±]` Amend last commit adding a forgotten file; message preserved.
6. `[+]` Amend to reword the last message only.
7. `[⚠]` Amend an already-pushed commit → plain Push refused non-FF.
8. `[±][msg]` Pre-commit secret warning names file+reason; proceed works.
9. `[±]` Pre-commit conflict-marker warning → cancel, fix, recommit.
10. `[⚠]` Hammer stage/unstage toggles → commit → index consistent (race).

## B. Hunk staging — `e2e-hunks.spec.ts` (dirty project)
11. `[+]` Stage one hunk of a multi-hunk file → other hunks remain.
12. `[+]` Unstage a previously staged hunk.
13. `[±][msg]` Stale hunk → "does not apply" surfaced; index intact.
14. `[−]` Binary file → no hunks, graceful.
15. `[⚠]` Discard a hunk then the whole file → fully reverted, no corruption.

## C. Discard — `e2e-discard.spec.ts` (dirty project)
16. `[+]` Discard single file (↶) → auto-snapshot created.
17. `[±][msg]` Bulk discard confirm names count **and** repo.
18. `[−]` Discard refused on a conflicted file.
19. `[+]` Discard untracked file deletes it → recover via snapshot.
20. `[⚠]` Cancel the confirm → nothing happens; re-open still scoped.

## D. Branch lifecycle — `e2e-branches.spec.ts` (default project)
21. `[+]` New branch from current → switch → commit → switch back.
22. `[±][msg]` Checkout blocked by dirty tree → stash → checkout → pop.
23. `[−][msg]` Duplicate branch name → error names the collision.
24. `[⚠][msg]` Invalid ref name → validated readably, not raw `fatal:`.
25. `[−]` Delete current branch refused.
26. `[±]` Delete unmerged w/o force refused → force deletes.
27. `[+]` Rename branch (HEAD follows) + rename folder prefix.
28. `[⚠][msg]` Delete a branch checked out in a worktree → refused, explains.

## E. Merge / rebase / reset — `e2e-merge-rebase-reset.spec.ts` (default)
29. `[+]` Clean FF merge updates graph + ahead/behind.
30. `[+]` Non-FF merge creates merge commit; lanes redraw.
31. `[−][msg]` Merge nonexistent branch → readable error.
32. `[+]` Merge preview predicts clean vs conflict before committing.
33. `[±]` Rebase onto another branch, clean.
34. `[±]` Rebase pause → continue; variant → skip.
35. `[±]` Rebase pause → abort restores pre-rebase HEAD.
36. `[+]` Reset soft/mixed/hard via mode prompt → auto-snapshot.

## F. Conflicts — `e2e-conflicts.spec.ts` (default; conflict built in-test)
37. `[±]` Merge conflict → Keep Current per file → continue.
38. `[±]` Merge conflict → Keep Incoming per file → continue.
39. `[±]` Merge conflict → hand-resolve → Mark Resolved → continue.
40. `[±]` Merge conflict → Abort restores.
41. `[−][msg]` Continue with unresolved → readable "resolve first"; stays paused.
42. `[±]` Cherry-pick conflict → resolve → continue.
43. `[+]` rerere on: resolve same conflict twice → second auto-resolved.

## G. Cherry-pick / revert — `e2e-cherrypick-revert.spec.ts` (default)
44. `[+]` Cherry-pick a commit lands on HEAD.
45. `[−][msg]` Cherry-pick nonexistent hash → readable error.
46. `[+]` Revert creates a revert commit.
47. `[±]` Revert that conflicts → resolve → continue.
48. `[⚠]` Cherry-pick a commit already in history → empty-result handled.

## H. Log & search — `e2e-log-search.spec.ts` (default)
49. `[+]` Search by message → narrows → clears back.
50. `[+]` Search by `author:`.
51. `[+]` Pickaxe `code:` (-S) finds intro/removal.
52. `[+]` `file:` filter.
53. `[−]` No-match search → empty state, not error.
54. `[⚠]` Regex-breaking / huge paste → no crash, responsive (BUG #1).
55. `[+]` "Go to parent commit" moves selection.

## I. Diff & compare — `e2e-diff-compare.spec.ts` (default)
56. `[+]` Commit → file list → file → inline diff → Open File.
57. `[+]` Compare two branches: file list + counts match `git diff`.
58. `[+]` Commit "Compare with Local".
59. `[+]` Rename detection shows R + old→new.
60. `[−][msg]` Compare against nonexistent ref → readable error.

## J. History + blame — `e2e-history.spec.ts` (default)
61. `[+]` File History timeline opens, newest-first.
62. `[+]` Step versions; each shows the right diff.
63. `[+]` Selection/line history: who changed selected lines.
64. `[+]` Blame per-line attribution (buffer-aware).
65. `[+]` Blame → click a line's commit → log selects it.
66. `[+]` Open a historical version read-only.
67. `[+]` Selection history follows a file across a rename.
68. `[−][msg]` History on an untracked file → readable empty state.
69. `[⚠]` History/blame on a binary/huge file → graceful, responsive.

## K. Stash — `e2e-stash.spec.ts` (default; has 2 seeded stashes)
70. `[+]` Stash save w/ message → appears in tree.
71. `[+]` Show stash files + diff.
72. `[+]` Apply (keeps entry) vs Pop (removes).
73. `[+]` Drop one; Clear all (with confirm).
74. `[−][msg]` Pop/drop out-of-range index → readable error.
75. `[±]` Pop a conflicting stash → conflict surfaced, not lost.

## L. Sync / remote (incl. conflicts) — `e2e-sync.spec.ts` (default; has origin)
76. `[+]` Publish a no-upstream branch (↑ Publish) → upstream set.
77. `[+]` Push ahead commits → ahead→0.
78. `[+]` Pull when behind → behind→0.
79. `[±]` Non-FF push rejected → force-with-lease offered and works.
80. `[±]` Smart Sync diverged → pull-rebase-then-push behind one confirm.
81. `[±]` Smart Sync with dirty tree → auto-stash → sync → restore.
82. `[±][msg]` Sync where pull-rebase CONFLICTS → paused, push doesn't fire.
83. `[±]` Amend a pushed commit → rewrite → single force-with-lease (not rebase-back).
84. `[⚠][msg]` Force-with-lease aborts (teammate pushed) → "stale lease", no clobber.

## M. Tags — `e2e-tags.spec.ts` (default)
85. `[+]` Create lightweight + annotated tag on a commit.
86. `[−][msg]` Duplicate tag name → readable error; bad ref → readable error.
87. `[+]` Delete a tag.

## N. Undo / reflog / snapshots — `e2e-undo-reflog-snapshots.spec.ts` (default)
88. `[±]` Undo last op: aborts in-progress; else resets to ORIG_HEAD.
89. `[⚠]` Reset hard → Undo → full recovery.
90. `[+]` Reflog timeline → restore HEAD to an earlier entry.
91. `[+]` Snapshot list/restore/drop round-trip.
92. `[−][msg]` Restore a missing snapshot → readable error.

## O. Worktrees — `e2e-worktrees.spec.ts` (default)
93. `[+]` Add a worktree for a branch → it appears.
94. `[+]` Add-new (create branch + worktree).
95. `[−][msg]` Remove a dirty worktree w/o force → refused, explains.
96. `[−]` Remove a locked worktree w/o force → refused.
97. `[+]` Lock/unlock, prune.

## P. Multi-repo — `e2e-multi-repo.spec.ts` (multi-repo project)
98. `[+]` Two repos: sidebar grouped; commit in A doesn't touch B.
99. `[+]` Switch active repo → main panel follows.
100. `[⚠]` Fire actions at both repos → each lands in the right repo.

## Epics (lengthy, multi-stage) — `epics.spec.ts` (`@slow`)
101. `[±]` Feature → partial commit → worktree hop → incoming conflict resolved in UI.
102. `[±]` Release-prep interactive rebase (reorder/squash/drop/reword) → conflict → autosquash → push.
103. `[±]` Stash-juggle context switch → hotfix → pop conflicts → resolve.
104. `[±][⚠]` Collaboration divergence → amend → force-with-lease → stale lease → retry.
105. `[±]` Cross-branch fix: cherry-pick → conflict → later revert.
106. `[+]` History investigation: pickaxe → commit → file/line history → blame → jump → fix.
107. `[+][⚠]` Multi-repo parallel work, no cross-talk.
108. `[⚠]` Destructive panic & recovery: reflog restore / snapshot restore / undo-last.

---

### Coverage of the brief
~28 `[−]`, ~12 `[⚠]`, ~20 `[msg]`, History is a full 9-scenario cluster (J),
sync-with-conflicts is explicit (#82, plus #75/#84), and the epics chain 10–20
actions each. The `[⚠]` set is the "try to destroy it" surface: races (#10,
#100), guardrail bypass (#7, #15, #24, #28, #48, #89), resource abuse (#54, #69).
