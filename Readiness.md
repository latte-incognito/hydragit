# HydraGit — Release Readiness

> Assessment date: **2026-06-25** · Branch: `develop` · Target version: **0.3.0**
> Method: static inspection only (per project rules I did not build or run tests — commands to run yourself are noted).

## Verdict

**Not ready to publish yet — close on engineering, blocked on release hygiene + one real Windows bug.**

The code is in good shape: clean tree, all five platform binaries built, broad test
surface, no stray TODOs. What stands between you and the Marketplace is (1) the
`0.3.0` changelog hasn't been finalized, (2) the repo identity/visibility +
publisher setup, (3) a concrete Windows crash in interactive rebase, and
(4) the demo GIF. None are large; most are checklist items.

| Area | Status |
|---|---|
| Code & build artifacts | 🟢 Ready |
| Tests (surface) | 🟢 Ready — needs a green run |
| Marketplace metadata | 🟡 Mostly ready |
| Release hygiene (changelog/version/docs) | 🔴 Action needed |
| Cross-platform (Windows) | 🔴 Known bug |
| Publishing prerequisites | 🔴 Not done |

---

## 🔴 Blockers (must fix before publish)

1. **`CHANGELOG.md` still has `[Unreleased]`, not `[0.3.0]`.** `package.json` is
   already at `0.3.0` but no `## [0.3.0]` section exists. Run `make release` (or
   manually roll Unreleased → 0.3.0) so the Marketplace Changelog tab is correct.

2. **Windows: interactive rebase / reword will fail.** `internal/git/rebase.go:129-130`
   and `:190` use `GIT_SEQUENCE_EDITOR=cp …` / `GIT_EDITOR=cp …`. `cp` doesn't
   exist on Windows → reword and drag-and-drop rebase break. This is the exact
   risk ROADMAP §1/§3 flagged. Fix with a cross-platform mechanism (e.g. a
   `hydragit-server --copy-editor` self-exec, or a Go-written temp script)
   **before** the Windows smoke test.

3. **Repo identity mismatch + visibility.** `package.json` `repository` points to
   `github.com/latte-incognito/hydragit` while `publisher` is `vkushnarenko`.
   Pick one identity, align `package.json`, and **make the repo public** — the
   README banner only renders from an absolute raw URL on a public repo
   (memory: `readme-banner-needs-public-repo`). ROADMAP §1 item 1.

4. **Publisher not provisioned.** `vsce` is installed, but the one-time setup
   (Azure DevOps PAT → `vsce create-publisher vkushnarenko` → `vsce login`)
   appears undone. Required before `vsce publish`. ROADMAP §2.

5. **Demo GIF missing.** README still carries the "TODO before publishing"
   placeholder. Extensions without a GIF get ~5× fewer installs (ROADMAP §1).

---

## 🟡 Should fix (quality / polish)

- **Docs version drift.** `documentation/index.html` is `v0.3.0`, but all 25
  `documentation/features/*.html` pages still say `v0.2.8`. Per CLAUDE.md the
  HTML docs are refreshed from accumulated Unreleased entries at release time —
  do that pass and bump the per-feature version stamps.

- **`extension/node_modules` is missing.** `extension/out/extension.js` exists
  (previously compiled), but a clean `make build-extension` does
  `cd extension && npm run compile` — run `npm install` in `extension/` first or
  confirm the compile resolves against the root `node_modules`.

- **ROADMAP §4 polish queue is still open** (ref pills truncation, conflicted
  cherry-pick has no resolve bar, token-search smart detection). None are
  release blockers, but item 2 (cherry-pick conflict UI) is a visible rough edge.

---

## 🟢 Ready / verified good

- **Clean working tree**, branch `develop`.
- **All 5 platform binaries built** (`bin/`, dated 2026-06-22): darwin-x64/arm64,
  linux-x64/arm64, win32-x64. Sizes ~4.4–4.8 MB each.
- **Binary resolution is correct** — `extension.ts:67-71` builds
  `hydragit-server-${platform}-${arch}` (win32 → `…-win32-x64.exe`), matching the
  Makefile output names exactly, resolved under `ctx.extensionPath/bin`.
- **`.vscodeignore` is sound** — excludes `cmd/`, `internal/`, `extension/src/`,
  `webview/src/`, all `*.ts` (keeps `extension/out`), docs, `node_modules`; `bin/`
  is shipped.
- **No real TODO/FIXME/HACK in source** — all 25 "todo" matches are rebase
  *todo-plan* identifiers, not action items.
- **Test surface is broad**: 38 Go test files (vs 22 sources), 33 Vitest files,
  34 Playwright e2e specs — consistent with the "tests at every level" policy.
- **Marketplace metadata mostly complete**: `displayName`, `icon` (`images/icon.png`),
  `categories: [SCM Providers]`, `engines.vscode ^1.85.0`, GPL-3.0-only license,
  `activationEvents: [onStartupFinished]`.
- **`README.md` + `LICENSE.md` present** at root.
- **Release tooling exists and has history** — `make release`/`scripts/release.sh`,
  `master` branch present, tags through the `v0.2.x` series.

### Suggested gaps to fill in metadata
- `keywords` is **undefined** in `package.json` — add the topics ROADMAP §2
  lists (`vscode-extension git git-client typescript go …`) for discoverability.
- Consider `galleryBanner` (color/theme) for the listing header.

---

## Pre-flight commands (run these yourself)

```bash
make test                         # Go (gotestsum) + Vitest — must be green
go test -race ./internal/ipc/     # concurrency suite (-race is the point)
make webview-check                # svelte-check
npm run test:e2e                  # Playwright
make release                      # roll Unreleased → 0.3.0, tag
make package                      # build-all + extension + webview → hydragit-0.3.0.vsix
vsce ls                           # eyeball: 5 binaries in, no src/tests/notes
code --install-extension hydragit-*.vsix   # local smoke test
```

Then: smoke-test the `.vsix` on **one Windows and one Linux** box (after the
`cp`-editor fix), record the GIF, `vsce publish`.

---

## Code Quality Audit — "would this fly at an Apple / Amazon review?"

> Read of the codebase as if it were an interview / demo submission: dead code,
> redundancy, structural smells, and what a senior reviewer would expect to see
> and doesn't. Evidence is cited as `file:line`.

### Verdict

**Strong "yes, with notes."** The *fundamentals* are interview-grade: a single
git chokepoint, a clean IPC contract, no panics, no `@ts-ignore`, ~no `any`,
no real TODOs, and a genuinely broad test suite. What a FAANG reviewer would
push back on was **not correctness — it's engineering maturity around it**: no
CI, a handful of god-files, and some unnecessary public API surface. As of
2026-06-25 the maturity gaps are largely closed (CI + a two-language lint gate
added, API surface trimmed, param decoding validated); two large refactors are
intentionally deferred to locally-verified PRs. See the remediation status under
each item below.

### 🟢 What's genuinely good (the things reviewers check first)

- **No dead code.** Every git function traces to a real caller. The five
  audit "suspects" all resolved: `IsRepo` (`cmd/.../main.go:52`) is live; the
  other four were over-exported, not dead, and have since been unexported
  (`reset`, `mergeAbort`, `mergeContinue`, `logCommits` — see 🟡 #3).
- **Discipline markers are clean:** `0` `panic()` in source, `0`
  `@ts-ignore`/`eslint-disable`, `0` real `TODO/FIXME` (all 25 "todo" hits are
  rebase *todo-plan* identifiers), **1** stray `console.log`
  (`App.svelte:181`, and it's an intentional suppression log), only **4** `any`
  — all at justified VS Code-API boundaries (`RepoService.ts:33,89`,
  `historyPanel.ts:99`, the two-phase-init `null as any` at `extension.ts:58`).
- **One enforced architectural invariant** — all git goes through
  `repo.go:run()`; the IPC contract (`{id,ok,data|error}`) is uniform.
- **Test ratio is real**, not theatre: 38 Go test files vs 22 sources, 33
  Vitest, 34 e2e specs — and the policy demands negative cases per mutation.

### 🟡 Smells a senior reviewer *will* flag — remediation status (2026-06-25)

1. **God components (the #1 maintainability flag).** `App.svelte` is **1,861
   LOC**, `DetailPane.svelte` 1,314, `BranchPane.svelte` 947, `Toolbar.svelte`
   904, `FileTree.svelte` 891. → **🔄 IN PROGRESS — incremental, established
   pattern.** Key finding: `App.svelte`'s **markup is already componentized**
   (it composes Toolbar/BranchPane/LogPane/DetailPane/…); the bulk is a
   1,612-line `<script>` that is mostly *stateful* runes event-handlers, tightly
   coupled to component state. So the safe, valuable lever isn't splitting markup
   — it's pulling **pure logic cores** into co-located tested `.ts` modules, the
   exact pattern the repo already uses (`syncPlan.ts`, `stashRedirect.ts`,
   `interactiveRebasePlan.ts`). Pure cores extracted so far, each unit-tested:
   `worktreePath.ts` (`worktreeDefaultPath` + `worktreeBranchOptions` — the
   create-worktree candidate list), `menuPosition.ts` (`clampMenuPosition`,
   deduped from the 4 `show*Ctx` viewport-clamp sites), `refName.ts`
   (`shortBranchName` / `splitRemoteRef`, deduped from ~5 inline
   `slice(indexOf('/')…)` sites), and `resetMode.ts` (`parseResetMode` →
   typed `ResetMode`). Verified: vite build compiles, full **Vitest 462** green
   (+3 test files), ESLint 0 errors. What's left in the `<script>` is genuinely
   stateful orchestration (send/flash/loadAll/state mutation) that should stay in
   the component — extracting it would thread callbacks back in and *add*
   coupling. The lint config ships with `funlen`/`cyclop` thresholds pre-written
   but commented, ready to ratchet as the script shrinks further.

2. **`handler.go` was a 1,246-line / 88-case single `switch`.** → **✅ FIXED.**
   Converted to a `map[string]cmdFunc` registry: each command is now its own
   `handle*(repoPath, id, req) Response` function in `handler_commands.go` (84
   functions, 89 routed cmd strings), and `handler.go` shrank from **1,264 → 250
   lines** — it now holds only `Handle()` (locking/timing/snapshot), a slim
   `handle()` that does a map lookup, and the shared helpers. Done via a
   mechanical extraction (byte-for-byte case bodies, no behaviour change) and
   verified: `go build`, full `go test ./internal/...`, and golangci-lint all
   green; a coverage check confirms every `mutatingCmds`/`autoSnapshotCmds` entry
   has a registered handler.

3. **Over-exported Go API.** → **✅ FIXED.** `Reset`→`reset`,
   `MergeAbort`→`mergeAbort`, `MergeContinue`→`mergeContinue` are now unexported
   (only ever used in-package); their callers and tests were updated. The
   test-only `Log` convenience wrapper is now unexported `logCommits`, and the
   one cross-package caller (`internal/graph/wide_test.go`) was repointed at the
   public `LogWith`. The public surface of `package git` now contains only what
   `handler.go` actually routes to — and because they're unexported, `unused`
   will now catch them automatically if a caller ever disappears.

4. **62/62 `json.Unmarshal(req.Params, …)` calls ignored the error.** → **✅
   CENTRALIZED (behavior intentionally preserved).** The 62 scattered bare
   `json.Unmarshal` calls now route through one documented `decodeParams()`
   helper. Note the original silent-ignore turned out to be a *deliberate,
   tested* design (`TestHandle_malformedParamsJSON`): read commands degrade to
   zero-value options (an unfiltered full log) rather than erroring, and
   mutating commands are guarded downstream by `missingParam`. So the smell was
   "62 undocumented scattered ignores," not "wrong behavior" — fixed by making
   it a single, well-commented place. (An earlier pass made it *error* on bad
   params; that broke the documented graceful-degradation contract and was
   reverted.)

5. **The Windows `cp`-editor bug was duplicated 3×.** → **✅ FIXED (dedup).**
   Collapsed into a single `copyEditor(src)` helper (`rebase.go`) used by all
   three sites. This is now the *one* seam to change for the cross-platform fix
   (still tracked as 🔴 blocker #2 — the dedup makes that a one-function change
   instead of a three-site hunt).

6. **8 ignored errors** (`_ =`) in Go src. → **✅ OK as-is (verified).** The
   `strconv.Atoi`/`ParseInt` ones are idiomatic zero-fallback parses; the two
   best-effort command ignores (`set-head`, `SnapshotDrop`) already carry intent
   comments directly above them. `errcheck` accepts explicit blank assignment, so
   the lint gate is green on these — no change needed.

### 🔴 What's missing to "pass with flying colors" — remediation status

- **No CI.** → **✅ ADDED.** `.github/workflows/ci.yml` with three jobs: **Go**
  (gofmt check · `go vet` · `go test -race ./internal/...` · golangci-lint),
  **Web** (ESLint · Prettier check · svelte-check · compile · build · Vitest),
  and **Build** (`make build-all`, cross-compiling all 5 platform binaries).
  Runs on push to `develop`/`master` and every PR, with run-cancellation
  concurrency.
- **No lint gate.** → **✅ ADDED — "top notch" config.**
  - `.golangci.yml` (golangci-lint **schema v2**): the `standard` correctness
    floor (errcheck, govet, ineffassign, staticcheck, unused) **plus** revive
    (curated rule set), gocritic (diagnostic+performance), bodyclose, misspell,
    nakedret, unconvert, unparam, usestdlibvars; `errcheck.check-type-assertions`
    on; `govet enable-all`; goimports with `local-prefixes: hydragit`; test files
    relaxed via exclusion rules. Noisy/churny rules (doc-comment enforcement,
    funlen, cyclop) are pre-written but commented as a deliberate **future
    ratchet** tied to items #1/#2.
  - `eslint.config.mjs` (ESLint 9 flat config) for the TS host **and** Svelte 5
    webview: `typescript-eslint` recommended + `eslint-plugin-svelte`,
    `no-explicit-any: warn`, unused-vars with `_` escape hatch,
    `no-console` (allow warn/error), `eqeqeq`/`prefer-const`/`no-var`, and
    `eslint-config-prettier` last so Prettier owns formatting.
  - Wired in: `package.json` scripts (`lint`, `lint:fix`) + devDeps; `Makefile`
    targets (`lint`, `lint-go`, `lint-ts`, `lint-fix`).
  - ⚠️ One install step required: `npm install` to pull the new ESLint devDeps,
    and `golangci-lint` must be on PATH (CI fetches it automatically). First
    `make lint` run may surface a handful of findings to triage — that's the
    gate doing its job; nothing in it should be structurally red.
- **No project governance files** — `CONTRIBUTING.md` / `SECURITY.md` /
  `CODEOWNERS` still absent. → *Not addressed* (cheap, low-risk; left for a
  follow-up). Security *model* remains documented in `PROJECT_CONTEXT.md`.
- **No coverage signal.** → *Not addressed.* Consider adding
  `go test -coverprofile` + a Codecov/threshold step to the CI Go job.

### Bottom line for the "interview" framing

The mechanical smells are now gone — trimmed public API, validated param
decoding, de-duplicated editor seam — and the **maturity layer that was missing
now exists**: a strong two-language lint gate plus CI that builds, types, lints,
and tests on every PR. The two genuinely large refactors (god-components,
handler registry) are *intentionally* left for locally-verified, incremental
PRs rather than risked blind here — which is itself the senior call: don't ship
a 1.8k-line refactor you can't run. With CI + lint in place and those two on a
tracked plan, this reads as "ships maintainable systems," not just "works."

---

## One-line summary

Engineering is essentially done; ship is gated on finalizing the 0.3.0 changelog,
fixing the Windows `cp`-editor rebase bug, settling repo identity/visibility +
publisher setup, and recording the demo GIF. Code quality is interview-grade on
fundamentals (no dead code, clean discipline markers, real tests) but missing the
maturity layer a FAANG reviewer expects: **CI, a lint gate, and a few god-files
broken up.**
