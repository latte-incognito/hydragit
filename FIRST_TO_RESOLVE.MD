# FIRST_TO_RESOLVE

Two graph/log issues to resolve before the commit graph can be called "done".
Both were found while writing the graph tests (see `internal/graph/lanes_test.go`,
`internal/graph/wide_test.go`, `webview/src/panels/index/graphSvg.test.ts`,
`tests/e2e/graph-*.spec.ts`).

Guiding principle for both: **a thorough, correct graph beats a compact one.**
If the only way to draw the history truthfully is a wide graph, draw it wide —
even if 50 developers forked from one commit and merged back over a week without
squashing. Ugly-but-correct > pretty-but-misleading.

---

## Task 1 — Remove the 200-commit cap; scroll through the whole history

### Current behaviour

The log is hard-capped at 200 commits, and there is **no pagination or
virtualization**:

- `webview/src/panels/index/App.svelte` — requests `log` with `limit: 200` (3 call sites).
- `internal/ipc/handler.go` — `p.Limit` defaults to `200` when unset.
- `webview/src/panels/index/components/LogPane.svelte` — renders **every** row
  (`{#each commits as c}`) and builds **one monolithic SVG** sized to the full
  history (`graphSvg.ts: buildGraphSVG`, `svgH = commits.length * ROW_H`).

The cap exists only because the renderer draws everything at once — it is a
performance guard, not a product decision. Removing the cap without windowing
would freeze the webview on large repos (tens of thousands of DOM rows + a
multi-million-pixel SVG).

### Goal

The user can scroll through **all** commits in the repository, smoothly.

### Approach

- Drop / raise the `200` limit in `App.svelte` and `handler.go`. Load the full
  history (`git log` with no `--max-count`).
- Add **virtual scrolling** to `LogPane.svelte`: keep all commits + lane data in
  memory, but only render the rows in the viewport (+ a small buffer), and only
  draw the SVG slice for those rows.
- **Lanes stay global.** `AssignLanes` must run over the *entire* commit set
  (lane assignment depends on full topology); only the *drawing* is windowed.
  `AssignLanes` already runs on whatever Go returns, so this is a render-layer
  change, not an architecture change.

### Scale note (future, not blocking)

One-shot "load all as JSON over IPC" is fine into the tens of thousands of
commits. For very large repos (100k+), switch to chunked/streamed loading with
**incremental** lane computation — `AssignLanes` is a single forward pass, so it
can carry column state across chunks. Not required for v1.

### Affected when this lands

- `tests/e2e/graph-perf.spec.ts` currently asserts the 200 cap
  (`rows <= LOG_LIMIT`). That assertion must change to "renders the full history
  and stays responsive while scrolling".

---

## Task 2 — Fix lane assignment: correct connections over compactness

> ✅ **RESOLVED.** Removed the eager first-parent collapse in
> `internal/graph/lanes.go`; lanes now pass straight through and converge only
> at the real shared parent commit. The two-features-from-one-base case renders
> correctly (each feature in its own lane, converging at `M0`), and 50
> cross-merged branches now render ~50 lanes wide. Covered by
> `TestTwoFeaturesFromSameBase` and `TestManyBranchesRenderWide`
> (`internal/graph`). The webview SVG builder (`graphSvg.ts`) already scales its
> width with lane count, so it draws the wider graph as-is — horizontal overflow
> handling for very wide graphs is folded into Task 1's render work.

### The bug

`internal/graph/lanes.go : AssignLanes` **eagerly collapses** any two lanes that
await the same next parent. This keeps the graph narrow, but it can fold a
branch's tail into an **unrelated merge commit**, implying connections that do
not exist.

### Reproduction

Two developers fork featureA and featureB from the **same** commit `M0`; each
merges back into `main` without squashing.

DAG:

```
main:      M0 ───────────── MA ───── MB        MA = merge(M0, A2)
            │\              ╱          ╲        MB = merge(MA, B2)
 featureA:  │ A1 ── A2 ────╱            ╲
            │                            ╲
 featureB:  └ B1 ── B2 ──────────────────╱
```

#### How we draw it now (WRONG — verified against real `AssignLanes` output)

```
●  MB   Merge featureB
│╲
│ ●  B2          ← featureB, lane 1
│ ●  B1
●◀┘  MA   Merge featureA     ⚠️ featureB's tail folds INTO the featureA merge,
│╲                              and featureA branches out of the same node
│ ●  A2          ← lane 1 REUSED for featureA
│ ●  A1
●◀┘  M0   common base
```

`MA` (the *featureA* merge) appears connected to **both** features, and the true
fork point `M0` is hidden. featureB only shares the ancestor `M0` — it never
touched `MA`.

#### How it MUST look (correct; what IntelliJ / GitLens / gitk do)

Each feature keeps its own lane down to the real fork point; each merge node
touches only its actual parents:

```
●        MB   Merge featureB
│╲
│ ●      B2          ← featureB, lane 1
│ ●      B1
│ │
●─┼┐     MA   Merge featureA   (main + featureA only; featureB passes through)
│ ││
│ │●     A2          ← featureA, lane 2
│ │●     A1
●─┴┘     M0   common base      ← BOTH features visibly fork here
```

Cost: one extra lane through the middle rows. That is acceptable.

### The invariant to enforce

> A branch line connects only to its **actual parent**, and a merge node's
> incoming lines are **only its real parents**. Never fold a branch into a merge
> node that is not its real descendant — reserve a pass-through lane instead.

### Approach

- Remove the eager same-parent collapse; replace it with **pass-through lanes**:
  a lane stays reserved (drawn straight through intervening rows) until it
  reaches its real target commit.
- Accept arbitrarily **wide** graphs. If 50 branches forked from one commit and
  all merged back without squashing, the correct drawing is ~50 lanes wide — and
  that is what we should render (Task 1's virtualization keeps it performant
  horizontally too; consider horizontal scroll for the graph column).

### Affected when this lands

- `internal/graph/wide_test.go : TestManyBranchesStayCompact` is a
  **characterization test of the current (buggy) compact behaviour**. It will
  fail once lanes no longer collapse — that is expected. Replace it with a test
  asserting the *correct* width and that no branch connects to a non-parent.
- `internal/graph/lanes_test.go` — `TestLazyAllocationCompact`,
  `TestReMergeChurn`, `TestLaneRecycling` assert `maxLane` ceilings that depend
  on collapse. Revisit each: keep the connection-correctness assertions, drop or
  loosen the width ceilings.
- `webview/src/panels/index/graphSvg.test.ts` — structure assertions should
  still hold; add a case for the two-feature-from-one-point scenario.

### Open product question

Should "wide but correct" be the only mode, or do we offer a **collapsed/compact
view toggle** (current behaviour) in addition? Default should be correct.

---

## Wide-graph follow-ups (UX cost of the Task 2 fix)

Task 2 made the graph correct, but a pathological history (e.g. 50 developers all
forking from one commit and merging back — see
`tests/e2e/graph-fork50.spec.ts`, which renders ~51 lanes) now draws very wide
and busy. These three tasks address that. Order of value: 5 (interaction) and 3
(compression) are cheap and high-impact; 4 is the deep fix.

**Important framing:** none of this is novel research. Lane assignment is
essentially **interval-graph coloring** (textbook). The hard part — long-edge
routing — is already solved in readable open-source implementations we can study
and reimplement in Go (we do NOT import a graph dependency without sign-off):

- `mhutchie/vscode-git-graph` (TypeScript, MIT) — same problem, VS Code context.
- `mlange-42/git-graph` (Rust, MIT) — full commit-graph layout engine.
- `intellij-community` `platform/vcs-log/graph` (Apache-2.0) — IntelliJ's
  production algorithm.
- git's own `graph.c` (`git log --graph`) — canonical reference (ASCII-oriented).

### Task 3 — Compress lane spacing when the graph is wide (cheap)

The graph column width is `laneCount * LANE_W + PAD * 2`
(`webview/src/panels/index/graphSvg.ts`). At 50 lanes that is ~808px, which
shoves the commit/author/date columns off-screen in `LogPane.svelte`.

- Make `LANE_W` adaptive: shrink it (e.g. 16 → 8px) as `laneCount` grows so a
  wide graph stays within a bounded gutter and the message columns stay visible.
- Optionally cap visible lanes with a "+N more" affordance.
- **Horizontal scroll is the fallback, not the goal.** If we add it, scroll the
  graph *gutter only* (keep the message columns row-aligned and in place) — never
  H-scroll the whole row, or the user loses the commit messages. Following a
  branch by scrolling sideways is the UX both IntelliJ and GitLens avoid.

### Task 4 — Long-edge routing + lane freeing (the deep fix; "Task 2b")

> ✅ **RESOLVED.** `internal/graph/lanes.go` now frees a branch's lane when its
> first parent is already awaited by a lower "bundle" lane, and merges into that
> bundle with a **short one-row diagonal** (the `| |/` pattern git uses) — the
> bundle carries the shared path to the real ancestor. Result: 50 developers
> forking from one base render in **3 lanes** with one bundle line + short
> diagonals, byte-for-byte the shape `git log --graph` draws — and with no false
> connections (`TestTwoFeaturesFromSameBase`). Genuinely-parallel branches with
> distinct ancestors still render wide (`TestWideConcurrency`), which is correct.
> Covered by `TestManyBranchesRenderCompact` (Go) and `graph-fork50.spec.ts`
> (asserts ≤8 lanes). Validated row-by-row against `git log --graph`.
>
> An earlier attempt drew a *long* edge from each freed lane to the ancestor,
> which produced a fan of overlapping lines down the reused lane (visually buggy,
> edges not aligned with dots). The bundle/short-diagonal approach above fixes
> that. (Genuine merge connectors to a *distant* second parent are still long
> curves — that is correct, and is what git draws too.)

The real reason the fork-50 graph is 50 lanes wide: every feature lane stays
reserved from its last commit down to the shared base `M0` (the last row), so all
50 pile up near the bottom. But the features' *commit rows don't overlap* — only
their "waiting for M0" reservation does.

What mature renderers do instead:

- **Free a branch's lane right after its last commit** and draw a **long edge**
  that travels back toward the ancestor's lane (the trunk, where `M0` lives),
  converging at the real ancestor commit. The freed lane is then **recycled** by
  the next branch. Result: ~2–3 side lanes + a fan of edges into `M0`, instead of
  50 parallel rails — **correct AND compact**.
- The genuinely fiddly part is **collision-free routing**: a long edge crosses
  rows where a recycled lane now has nodes, so the edge needs offsets/curves or a
  transient routing slot. This is the part to lift from the references above.

This stays within the Task 2 invariant (edges land only on real parents) — it is
a smarter way to free lanes, not a return to the buggy collapse.

Effort: real engineering (adapt a known algorithm into `internal/graph`), not a
one-liner. Touches `lanes.go` and likely `graphSvg.ts` (to draw long/curved
edges). Re-check all `internal/graph` lane tests and
`tests/e2e/graph-fork*.spec.ts` width assertions when it lands.

### Task 5 — Branch highlight + color + filter (interaction; highest UX value)

The honest answer to "a busy graph is messy" is interaction, not layout. Even a
wide graph is usable if the user can isolate one branch. Independent of Tasks 3/4.

- **Hover a commit/branch → highlight that branch's full path, dim the rest.**
- Stable **per-branch color** (we already have `LaneColors`; tie color to branch
  identity, not just lane index).
- **Filter** the log by branch / author / path (`git log --grep/--author`,
  already feasible per the CLAUDE.md constraints).
- Optional **"show only this branch"** focus mode and a **linear / hide-merges**
  view for when topology doesn't matter.

### Task 6 — Lane straightening: last feature on the bundle lane (pixel-parity with git)

Polish left over from Task 4. The compaction is correct and compact, but the
**last feature before a shared ancestor** is laid out imperfectly. Concretely
(fork-N, all branches off one base `M0`):

- All features but the last merge cleanly into the blue "bundle" lane that
  carries down to `M0`. ✅
- The bundle lane terminates into the trunk *at* `M0`. The last feature sits on a
  separate temp lane right above `M0`, so when it merges back it either dangles
  (if drawn into the bundle, which vanishes that same row) or crosses the bundle
  to reach `M0` directly. We currently ship the second (no dangle, but the last
  feature crosses a short "ghost" bundle segment instead of riding it).

git avoids this by drawing the last feature **on the bundle lane itself** (its
`|/|` reshuffle), giving one clean blue line into `M0`.

**Approach — a post-layout straightening pass** over the result of `AssignLanes`:

1. Detect the pattern: a contiguous run of commits on a temp lane `H` running
   parallel to a *ghost* segment of a lower lane `L` (L holds a hash over those
   rows but has no commits there), where both converge at the same ancestor.
2. If L is free of commits across H's rows, **move H's commits onto L**: rewrite
   each affected commit's `Lane`, the pass-through edges on `L`, the continuation
   edges on `H`, and the merge connector (`MergePath`) that points at H so it
   now lands on L.
3. The temp lane `H` is then free and the bundle reads as one straight line into
   the ancestor — matching git.

**Scope / risk:** ~40–60 lines, but it rewrites edge/merge-path bookkeeping, so
it needs its own tests (extend `internal/graph/lanes_test.go` and the
`graph-fork*` specs) and careful validation against `git log --graph` on the
fork-N fixtures. Treat as a focused change, not a quick patch. Lane *count* and
correctness are already done; this is purely visual straightening of the final
junction. Independent of Tasks 3/5.
