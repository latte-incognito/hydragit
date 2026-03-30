# HydraGit Todo — Sorted by Priority

## 🟢 Do Now — High impact, fast to fix

- **Bug: `TODO.MD` showing as `ODO.MD`** — Likely a string slice off-by-one. Ship this first.
- **Clean up TODOs from code** — Before anything goes public. Dead comments erode trust in the codebase.
- **Remove top panel (HydraGit logo, fetch/pull/push)** — Visual noise reduction. Easy delete.
- **Move bottom panel data to VS Code-style status bar** — Follows a known mental model, cleans up layout.

## 🔵 Do Soon — Important, moderate effort

- **Date representation in UI** — Affects readability of commit history. Pick a format and stick to it.
- **Version info somewhere in UI** — Important for bug reports and user trust. A corner label is fine.
- **Meaningful tests (unit/integration)** — Cover the staging logic and the filename bug area first.
- **Prepare repo with crazy paths** — Edge case harness — do this alongside writing tests.
- ** loging and observabiliry** -

## 🟡 Do Later — Lower urgency or higher effort

- **Split `panel.ts` into 3 panels** — Structural cleanup — worth doing, but nothing breaks without it now.
- **Split webview root into per-panel folders, update paths** — Pairs with the panel.ts split. Do them together.
- **Playwright UI tests** — High value but needs stable UI first — do after the layout changes settle.
- **GitHub Actions CI** — Set up after Playwright tests exist — they'll run in CI anyway. *(when repo goes public)*
- **Update architecture doc.*

## ⛔ Skip / Not Needed

- ~~**Create a separate repo for testing**~~ — Adds maintenance overhead while still prototyping. Use the crazy-paths fixture in-tree instead.