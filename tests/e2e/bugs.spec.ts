import { test, expect } from "./vscode-fixture";
import { getWebviewFrame, getSidebarFrame } from "./webview-helpers";
import { execSync } from "child_process";

// E2e coverage keyed to BUGS.MD. Intentionally overlaps the unit layer: an emit
// test proves a control fires an action, NOT that the feature works end-to-end —
// these verify real behavior in the running app. Tests assert the CORRECT
// behavior, so the open bugs are RED until fixed. Runs on the default fixture
// (vscode project); the vscode/mainWindow fixtures build the repo + activate.
//
// Selectors mirror the Svelte components; flashes render as "⚡ …" in StatusBar.
// Several actions open native prompt()/confirm() dialogs — we auto-answer them
// via page.on('dialog'). Tune selectors/timing on first real run.

async function main(page: any) {
  const f = await getWebviewFrame(page, "main");
  expect(f, "main webview frame").not.toBeNull();
  return f!;
}
function autoAnswerDialogs(page: any, value = "e2e-test") {
  page.on("dialog", async (d: any) => {
    try { await d.accept(value); } catch { /* confirm() has no value */ }
  });
}
const flash = (f: any) => f.getByText("⚡", { exact: false }).first();

// ── #1 — Search by file name freezes the UI ────────────────────────────────────
test("#1 file-name search stays responsive", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  const search = f.locator('input[type="search"], .toolbar input').first();
  await expect(search).toBeVisible({ timeout: 8000 });
  await search.fill("README");
  await mainWindow.waitForTimeout(1500);
  const settled =
    (await f.locator(".crow").count().catch(() => 0)) > 0 ||
    (await f.locator(".log-empty").count().catch(() => 0)) > 0;
  expect(settled, "search must render results or empty state, not freeze").toBe(true);
});

// ── #2 — Create tag button not working ──────────────────────────────────────────
test("#2 create-tag (action rail) creates a tag", async ({ mainWindow }) => {
  autoAnswerDialogs(mainWindow, "e2e-tag");
  const f = await main(mainWindow);
  await f.locator("button.rail-btn").nth(8).click(); // tag button (last in rail)
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
});

// ── #3 — Show Diff: nothing happens on click ────────────────────────────────────
test("#3 stash 'Show Diff' opens a diff", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  // expand stashes, right-click a stash, click Show Diff → a diff/hunks must appear
  const stashHdr = f.getByText("Stashes", { exact: false }).first();
  await stashHdr.click().catch(() => {});
  const stash = f.locator(".titem.stash").first();
  if ((await stash.count()) === 0) test.skip(true, "fixture has no stash; needs a stash fixture");
  await stash.click({ button: "right" });
  await f.locator(".ctx").getByText("Show Diff", { exact: true }).click();
  await expect(f.locator(".hunk, .diff-line, .stash-diff").first()).toBeVisible({ timeout: 6000 });
});

// ── #19 — Merge conflicts on the sidebar ────────────────────────────────────────
test.skip("#19 merge-conflict file shown in sidebar — see conflict.spec.ts (vscode-conflict project)", async () => {});

// ── #20 — External git change can wedge HydraGit ────────────────────────────────
test("#20 reflects an external git change without getting stuck", async ({ mainWindow }) => {
  const cfg = test.info().project.use as { repoPath?: string };
  const repo = `${cfg.repoPath}-w${test.info().workerIndex}`;
  execSync(`git -C "${repo}" checkout -b externally-added-branch`, { stdio: "pipe" });
  execSync(`git -C "${repo}" commit --allow-empty -m "external"`, { stdio: "pipe" });
  const f = await main(mainWindow);
  await expect(f.getByText("externally-added-branch", { exact: false }).first()).toBeVisible({ timeout: 10000 });
});

// ── #21 — Star shows for master AND develop ─────────────────────────────────────
test("#21 only the default branch is starred", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  await expect(f.locator(".titem").first()).toBeVisible({ timeout: 8000 });
  // ⭐ marks the default branch; ⎇ marks the rest. A non-default local branch
  // (e.g. develop) must NOT be starred.
  const starred = await f.locator(".titem-icon", { hasText: "⭐" }).count();
  expect(starred, "at most one branch (the default) should be starred").toBeLessThanOrEqual(1);
});

// ── #22 — Inline blame popup timing (editor hover) ──────────────────────────────
// Hover-delay + "only over the blame annotation" is editor-side UX that isn't
// reliably automatable through Playwright; left as a tracked TODO.
test.fixme("#22 inline blame hover appears only after 5s and only over the annotation", async () => {});

// ── #23 — Dead commit-menu items ────────────────────────────────────────────────
for (const label of ["Create Patch…", "Edit Commit Message…", "Drop Commit", "Push All up to Here…"]) {
  test(`#23 commit menu "${label}" does something when clicked`, async ({ mainWindow }) => {
    const f = await main(mainWindow);
    await f.locator(".crow").first().click({ button: "right" });
    await f.locator(".ctx-menu").getByText(label, { exact: false }).first().click();
    await expect(flash(f)).toBeVisible({ timeout: 4000 });
  });
}

// ── #24 — Dead file-context-menu items ──────────────────────────────────────────
for (const label of ["Revert Selected Changes", "Cherry-Pick Selected Changes", "Open Repository Version"]) {
  test(`#24 file menu "${label}" does something when clicked`, async ({ mainWindow }) => {
    const f = await main(mainWindow);
    await f.locator(".crow").first().click(); // select commit → detail pane shows files
    const file = f.locator(".tree-row--file").first();
    await expect(file).toBeVisible({ timeout: 6000 });
    await file.click({ button: "right" });
    await f.locator(".ctx-menu").getByText(label, { exact: false }).first().click();
    await expect(flash(f)).toBeVisible({ timeout: 4000 });
  });
}

// ── #25 — Dead branch context-menu items ────────────────────────────────────────
for (const label of ["Compare with", "Show Diff with Working Tree"]) {
  test(`#25 branch menu "${label}" does something when clicked`, async ({ mainWindow }) => {
    const f = await main(mainWindow);
    await f.locator(".titem").first().click({ button: "right" });
    await f.locator(".ctx").getByText(label, { exact: false }).first().click();
    await expect(flash(f)).toBeVisible({ timeout: 4000 });
  });
}
