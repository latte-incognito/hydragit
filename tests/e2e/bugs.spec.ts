import { test, expect } from "./vscode-fixture";
import { getWebviewFrame, getSidebarFrame, workerRepo, git } from "./webview-helpers";
import fs from "fs";

// E2e coverage keyed to BUGS.MD. Intentionally overlaps the unit layer: an emit
// test proves a control fires an action, NOT that the feature works end-to-end —
// these verify real behavior in the running app, asserting REAL git state (via
// `git` against the worker's fixture repo) rather than just a status-bar flash.
// Runs on the default fixture (vscode project); the vscode/mainWindow fixtures
// build the repo + activate.
//
// Selectors mirror the Svelte components; flashes render as "⚡ …" in StatusBar.
// Mutating actions go through the dialog seam (VS Code quick-inputs + DOM
// modals, see vscode-fixture's window.dialogStyle) — answered inline.

async function main(page: any) {
  const f = await getWebviewFrame(page, "main");
  expect(f, "main webview frame").not.toBeNull();
  return f!;
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
  const f = await main(mainWindow);
  await f.locator('button.rail-btn[aria-label="Create tag"]').click();
  // dialog seam: name + annotation message arrive as VS Code quick-inputs
  const input = mainWindow.locator(".quick-input-box input");
  await input.waitFor({ state: "visible", timeout: 5000 });
  await input.fill("e2e-tag");
  await mainWindow.keyboard.press("Enter");
  await input.waitFor({ state: "visible", timeout: 5000 });
  await input.fill("e2e tag message");
  await mainWindow.keyboard.press("Enter");
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  // the tag must actually exist in the repo
  expect(git(workerRepo(test.info()), "tag -l e2e-tag")).toBe("e2e-tag");
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
  // the stash's changed files render in the detail pane…
  const file = f.locator(".tree-row--file").first();
  await expect(file).toBeVisible({ timeout: 6000 });
  await file.click();
  // …and clicking one opens its stash version in a workbench editor tab
  await expect(
    mainWindow.locator(".tab", { hasText: "stash@" }).first()
  ).toBeVisible({ timeout: 8000 });
});

// ── #19 — Merge conflicts on the sidebar ────────────────────────────────────────
test.skip("#19 merge-conflict file shown in sidebar — see conflict.spec.ts (vscode-conflict project)", async () => {});

// ── #20 — External git change can wedge HydraGit ────────────────────────────────
test("#20 reflects an external git change without getting stuck", async ({ mainWindow }) => {
  const repo = workerRepo(test.info());
  git(repo, "checkout -b externally-added-branch");
  git(repo, 'commit --allow-empty -m "external"');
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
// Each item now opens a dialog seam (quick input / native modal) that must be
// answered before the app flashes a result. "Create Patch…" ends in a native OS
// save dialog Playwright can't drive — left as a tracked TODO.
test.fixme("#23 commit menu \"Create Patch…\" — ends in a native save dialog (not automatable)", async () => {});

async function answerQuickInput(page: any, text: string) {
  const input = page.locator(".quick-input-box input");
  await input.waitFor({ state: "visible", timeout: 5000 });
  await input.fill(text);
  await page.keyboard.press("Enter");
}
async function confirmYes(page: any) {
  await page.locator(".monaco-dialog-box .monaco-button", { hasText: "Yes" }).click();
}

// Each #23 test plants a real commit on the current branch (the watcher picks it
// up), drives the menu item on that row, and asserts the rewritten history.
// The commit carries a real file change — rebase-based ops (reword/drop) discard
// empty commits.
async function plantTipCommit(f: any, testInfo: any, subject: string): Promise<string> {
  const repo = workerRepo(testInfo);
  fs.writeFileSync(`${repo}/e2e-marker.txt`, subject);
  git(repo, "add e2e-marker.txt");
  git(repo, `commit -m "${subject}"`);
  await expect(f.locator(".crow", { hasText: subject }).first()).toBeVisible({ timeout: 10000 });
  return repo;
}

test('#23 commit menu "Edit Commit Message…" rewords the commit', async ({ mainWindow }) => {
  const f = await main(mainWindow);
  const repo = await plantTipCommit(f, test.info(), "e2e-reword-me");
  await f.locator(".crow", { hasText: "e2e-reword-me" }).first().click({ button: "right" });
  await f.locator(".ctx-menu").getByText("Edit Commit Message…", { exact: false }).first().click();
  await answerQuickInput(mainWindow, "e2e: reworded message");
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  await expect(() => {
    expect(git(repo, "log -1 --format=%s")).toBe("e2e: reworded message");
  }).toPass({ timeout: 8000 });
});

test('#23 commit menu "Drop Commit" removes the commit from history', async ({ mainWindow }) => {
  const f = await main(mainWindow);
  const repo = await plantTipCommit(f, test.info(), "e2e-drop-me");
  await f.locator(".crow", { hasText: "e2e-drop-me" }).first().click({ button: "right" });
  await f.locator(".ctx-menu").getByText("Drop Commit", { exact: false }).first().click();
  await confirmYes(mainWindow);
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  await expect(() => {
    expect(git(repo, "log -5 --format=%s")).not.toContain("e2e-drop-me");
  }).toPass({ timeout: 8000 });
});

test('#23 commit menu "Push All up to Here…" updates the remote branch', async ({ mainWindow }) => {
  const f = await main(mainWindow);
  const repo = await plantTipCommit(f, test.info(), "e2e-push-me");
  const branch = git(repo, "rev-parse --abbrev-ref HEAD");
  await f.locator(".crow", { hasText: "e2e-push-me" }).first().click({ button: "right" });
  await f.locator(".ctx-menu").getByText("Push All up to Here…", { exact: false }).first().click();
  await confirmYes(mainWindow);
  await expect(flash(f)).toBeVisible({ timeout: 8000 });
  // the fixture's bare origin must now have the commit as the branch tip
  await expect(() => {
    const local = git(repo, "rev-parse HEAD");
    const remote = git(repo, `ls-remote origin refs/heads/${branch}`).split("\t")[0];
    expect(remote).toBe(local);
  }).toPass({ timeout: 8000 });
});

// ── #24 — Dead file-context-menu items ──────────────────────────────────────────
// Revert/cherry-pick operate at commit granularity. Targets are chosen so the
// op succeeds cleanly on the fixture: "feat: octopus branch a" IS in the default
// branch's history (its file exists → clean revert); "feat: cross y" is NOT
// (cross-y.txt is absent → clean cherry-pick).
async function openFileCtx(f: any, commitSubject: string, item: string) {
  await f.locator(".crow", { hasText: commitSubject }).first().click();
  const file = f.locator(".tree-row--file").first();
  await expect(file).toBeVisible({ timeout: 6000 });
  await file.click({ button: "right" });
  await f.locator(".ctx-menu").getByText(item, { exact: false }).first().click();
}

test('#24 file menu "Revert Selected Changes" creates a revert commit', async ({ mainWindow }) => {
  const f = await main(mainWindow);
  await openFileCtx(f, "feat: octopus branch a", "Revert Selected Changes");
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  await expect(() => {
    expect(git(workerRepo(test.info()), "log -1 --format=%s"))
      .toBe('Revert "feat: octopus branch a"');
  }).toPass({ timeout: 8000 });
});

test('#24 file menu "Cherry-Pick Selected Changes" lands the commit on HEAD', async ({ mainWindow }) => {
  const f = await main(mainWindow);
  // "feat: cross y" lives on cross/y — switch the log to all branches first
  await f.getByText("This branch", { exact: true }).click();
  await openFileCtx(f, "feat: cross y", "Cherry-Pick Selected Changes");
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  await expect(() => {
    expect(git(workerRepo(test.info()), "log -1 --format=%s")).toBe("feat: cross y");
  }).toPass({ timeout: 8000 });
});

test('#24 file menu "Open Repository Version" opens an editor', async ({ mainWindow }) => {
  const f = await main(mainWindow);
  await f.locator(".crow", { hasText: "feat:" }).first().click();
  const file = f.locator(".tree-row--file").first();
  await expect(file).toBeVisible({ timeout: 6000 });
  await file.click({ button: "right" });
  await f.locator(".ctx-menu").getByText("Open Repository Version", { exact: false }).first().click();
  // opens the committed file content in a workbench editor tab (no flash)
  await expect(mainWindow.locator(".tabs-container .tab").last()).toBeVisible({ timeout: 8000 });
});

// ── #25 — Dead branch context-menu items ────────────────────────────────────────
for (const label of ["Compare with", "Show Diff with Working Tree"]) {
  test(`#25 branch menu "${label}" renders the compare in the detail pane`, async ({ mainWindow }) => {
    const f = await main(mainWindow);
    // expand a branch folder and use a leaf row — folder/HEAD rows have no menu
    await f.locator(".titem.folder-row", { hasText: "feature" }).first().click();
    await f.locator(".titem:not(.folder-row):not(.head)", { hasText: "auth" }).first()
      .click({ button: "right" });
    await f.locator(".ctx").getByText(label, { exact: false }).first().click();
    // compare renders in the detail pane (no flash): a file list or hunks appear
    await expect(f.locator(".tree-row--file, .hunk").first()).toBeVisible({ timeout: 6000 });
  });
}
