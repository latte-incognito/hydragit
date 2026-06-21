import { test, expect } from "./vscode-fixture";
import { mainFrame } from "./webview-helpers";

// Cluster H — log & search (main panel toolbar). Default rich-history project.

const search = (f: any) => f.locator('input[type="search"], .toolbar input').first();

// 49 ── message search narrows the log, clearing restores it ─────────────────────
test("H49 message search narrows and clears back", async ({ mainWindow }) => {
  const f = await mainFrame(mainWindow);
  const before = await f.locator(".crow").count();
  await search(f).fill("logging");
  await mainWindow.waitForTimeout(1200);
  const narrowed = await f.locator(".crow").count();
  expect(narrowed).toBeLessThanOrEqual(before);
  expect(narrowed).toBeGreaterThan(0);
  await search(f).fill("");
  await mainWindow.waitForTimeout(1200);
  expect(await f.locator(".crow").count()).toBeGreaterThanOrEqual(narrowed);
});

// 50 ── author scope ─────────────────────────────────────────────────────────────
test("H50 author search filters by committer", async ({ mainWindow }) => {
  const f = await mainFrame(mainWindow);
  await search(f).fill("author:HydraGit");
  await mainWindow.waitForTimeout(1200);
  // Every commit in the fixture is by "HydraGit Test" → rows remain.
  expect(await f.locator(".crow").count()).toBeGreaterThan(0);
});

// 51 ── pickaxe code search finds the commits that add/remove a snippet ──────────
test("H51 pickaxe (code:) search finds the introducing commit", async ({ mainWindow }) => {
  const f = await mainFrame(mainWindow);
  await search(f).fill("code:Logout");
  await mainWindow.waitForTimeout(1500);
  // "func Logout()" was introduced on feature/auth → at least one match.
  await expect(f.locator(".crow").first()).toBeVisible({ timeout: 8000 });
});

// 52 ── file filter ──────────────────────────────────────────────────────────────
test("H52 file: filter narrows to commits touching a path", async ({ mainWindow }) => {
  const f = await mainFrame(mainWindow);
  await search(f).fill("file:src/auth.go");
  await mainWindow.waitForTimeout(1500);
  await expect(f.locator(".crow").first()).toBeVisible({ timeout: 8000 });
});

// 53 ── [−] a no-match query renders an empty state, not an error ────────────────
test("H53 a no-match search shows an empty state, not a freeze", async ({ mainWindow }) => {
  const f = await mainFrame(mainWindow);
  await search(f).fill("zzz-definitely-no-such-commit-zzz");
  await mainWindow.waitForTimeout(1500);
  const settled =
    (await f.locator(".crow").count().catch(() => 0)) === 0 ||
    (await f.locator(".log-empty").count().catch(() => 0)) > 0;
  expect(settled).toBe(true);
});

// 54 ── [⚠] a regex-breaking / huge paste keeps the panel responsive ────────────
test("H54 a pathological search query does not freeze the panel (BUG #1)", async ({ mainWindow }) => {
  const f = await mainFrame(mainWindow);
  await search(f).fill("(((([".repeat(50) + "x".repeat(2000));
  await mainWindow.waitForTimeout(1800);
  const settled =
    (await f.locator(".crow").count().catch(() => 0)) >= 0 &&
    ((await f.locator(".crow").count().catch(() => 0)) > 0 ||
      (await f.locator(".log-empty").count().catch(() => 0)) > 0);
  expect(settled).toBe(true);
  // Clearing recovers the full log.
  await search(f).fill("");
  await mainWindow.waitForTimeout(1200);
  expect(await f.locator(".crow").count()).toBeGreaterThan(0);
});

// 55 ── "Go to Parent Commit" moves the selection ────────────────────────────────
test("H55 Go to Parent Commit moves the selection", async ({ mainWindow }) => {
  const f = await mainFrame(mainWindow);
  await f.locator(".crow").first().click({ button: "right" });
  await f.locator(".ctx-menu").getByText("Go to Parent Commit").click();
  await expect(f.locator(".crow.sel")).toBeVisible({ timeout: 4000 });
});
