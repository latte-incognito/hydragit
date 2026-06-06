import { test, expect } from "./vscode-fixture";
import { getWebviewFrame } from "./webview-helpers";

// E2e for the main-panel action rail and toolbar buttons. The vscode/mainWindow
// fixtures already build the repo, launch VS Code, and activate the extension.
//
// NOTE: branch.new / merge / rebase / branch.delete / tag open native
// prompt()/confirm() dialogs Playwright can't drive in a webview, so this spec
// covers the no-dialog buttons (fetch/pull/push/refresh) for effect and verifies
// the rail renders the full button set. Selectors mirror ActionRail.svelte /
// Toolbar.svelte; tune on first real run.

async function mainFrame(page: any) {
  const frame = await getWebviewFrame(page, "main");
  expect(frame).not.toBeNull();
  return frame!;
}

test.describe("Action rail", () => {
  test("renders all nine rail buttons", async ({ mainWindow }) => {
    const frame = await mainFrame(mainWindow);
    const btns = frame.locator("button.rail-btn");
    await expect(btns).toHaveCount(9, { timeout: 8000 });
  });

  // fetch / pull / push hit the network-less local fixture; they flash a result
  // (success or a benign "no remote" error) — either way the app responds.
  for (const [idx, name] of [[0, "fetch"], [1, "pull"], [2, "push"]] as [number, string][]) {
    test(`rail button #${idx} (${name}) responds with a flash`, async ({ mainWindow }) => {
      const frame = await mainFrame(mainWindow);
      await frame.locator("button.rail-btn").nth(idx).click();
      await expect(frame.getByText("⚡", { exact: false }).first()).toBeVisible({ timeout: 8000 });
    });
  }
});

test.describe("Toolbar", () => {
  test("refresh reloads without error", async ({ mainWindow }) => {
    const frame = await mainFrame(mainWindow);
    // refresh button — title/icon in Toolbar.svelte; fall back to the last toolbar button.
    const refresh = frame.locator('.toolbar button, [title="Refresh"]').last();
    await refresh.click();
    // commit rows should still be present after a refresh (no wedge).
    await expect(frame.locator(".crow").first()).toBeVisible({ timeout: 8000 });
  });

  test("typing a search query keeps the panel responsive (BUG #1)", async ({ mainWindow }) => {
    const frame = await mainFrame(mainWindow);
    const search = frame.locator('input[type="search"], .toolbar input').first();
    await expect(search).toBeVisible({ timeout: 8000 });
    await search.fill("README");
    await mainWindow.waitForTimeout(1500);
    // panel must remain interactive: rows or an empty state, not a freeze.
    const settled =
      (await frame.locator(".crow").count().catch(() => 0)) > 0 ||
      (await frame.locator(".log-empty").count().catch(() => 0)) > 0;
    expect(settled).toBe(true);
  });
});
