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
