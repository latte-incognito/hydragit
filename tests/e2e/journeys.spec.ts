import { test, expect } from "./vscode-fixture";
import { getWebviewFrame } from "./webview-helpers";

// Real end-to-end user journeys against the default rich-history fixture. The
// vscode/mainWindow fixtures build the repo, launch VS Code, and activate the
// extension before each test.
//
// Dialog-driven journeys (S9/S14/S15) rely on the dialog seam: webview prompts
// now surface as VS Code quick-inputs / modals, which Playwright CAN drive.
//
// NOTE: authored to convention against real component selectors; selectors and
// timeouts will need a first-run pass in the e2e environment.

async function main(page: any) {
  const f = await getWebviewFrame(page, "main");
  expect(f, "main webview frame").not.toBeNull();
  return f!;
}
const flash = (f: any) => f.getByText("⚡", { exact: false }).first();

// Answer a VS Code showInputBox (the dialog seam's uiPrompt).
async function answerPrompt(page: any, text: string) {
  const input = page.locator(".quick-input-box input");
  await input.waitFor({ state: "visible", timeout: 5000 });
  await input.fill(text);
  await page.keyboard.press("Enter");
}
// Answer a VS Code modal warning (the dialog seam's uiConfirm).
async function confirmModal(page: any, label = "Yes") {
  await page.locator(".monaco-dialog-box .monaco-button", { hasText: label }).click();
}

// ── S1 — Cold open: click the icon, everything appears ──────────────────────────
test("S1 cold open renders branch tree, log, and status", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  await expect(f.locator(".titem").first()).toBeVisible({ timeout: 8000 });
  await expect(f.locator(".crow").first()).toBeVisible({ timeout: 8000 });
});

// ── S2 — Explore a commit → file → diff ─────────────────────────────────────────
test("S2 selecting a commit shows its files; clicking a file opens a diff", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  await f.locator(".crow").first().click();
  const file = f.locator(".tree-row--file").first();
  await expect(file).toBeVisible({ timeout: 6000 });
  await file.click();
  // a diff editor opens at the workbench level
  await expect(mainWindow.locator(".editor-instance, .monaco-diff-editor").first()).toBeVisible({ timeout: 8000 });
});

// ── S4 — Navigate parent/child via commit menu ──────────────────────────────────
test("S4 'Go to Parent Commit' moves the selection", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  await f.locator(".crow").first().click({ button: "right" });
  await f.locator(".ctx-menu").getByText("Go to Parent Commit").click();
  await expect(f.locator(".crow.sel")).toBeVisible({ timeout: 4000 });
});

// ── S5 — Search/filter the log ──────────────────────────────────────────────────
test("S5 search filters the log and clears back", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  const before = await f.locator(".crow").count();
  const search = f.locator('input[type="search"], .toolbar input').first();
  await search.fill("zzz-no-such-commit-zzz");
  await mainWindow.waitForTimeout(1200);
  const after = await f.locator(".crow").count();
  expect(after).toBeLessThanOrEqual(before);
  await search.fill("");
  await mainWindow.waitForTimeout(1200);
  expect(await f.locator(".crow").count()).toBeGreaterThan(0);
});

// ── S6 — File history ───────────────────────────────────────────────────────────
test("S6 File History command opens a per-file timeline", async ({ mainWindow }) => {
  await mainWindow.keyboard.press("Meta+Shift+P");
  const input = mainWindow.locator(".quick-input-box input");
  await input.fill(">HydraGit: File History");
  await mainWindow.waitForTimeout(400);
  await mainWindow.keyboard.press("Enter");
  // a history webview/editor appears
  await expect(mainWindow.locator("iframe.webview").first()).toBeVisible({ timeout: 8000 });
});

// ── S7 — Switch branch (checkout via context menu — no dialog) ──────────────────
test("S7 checkout a branch from the tree context menu", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  // pick a non-current local branch row
  const row = f.locator(".titem").filter({ hasNotText: "⭐" }).nth(1);
  await row.click({ button: "right" });
  await f.locator(".ctx").getByText("Checkout", { exact: true }).click();
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
});

// ── S8 — Merge a branch into current (no dialog) ────────────────────────────────
test("S8 merge a feature branch into the current branch", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  await f.locator(".titem").nth(1).click({ button: "right" });
  await f.locator(".ctx").getByText("Merge", { exact: false }).first().click();
  await expect(flash(f)).toBeVisible({ timeout: 8000 });
});

// ── S12 — Cherry-pick from the commit menu (no dialog) ──────────────────────────
test("S12 cherry-pick a commit", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  await f.locator(".crow").nth(1).click({ button: "right" });
  await f.locator(".ctx-menu").getByText("Cherry-Pick").click();
  await expect(flash(f)).toBeVisible({ timeout: 8000 });
});

// ── S13 — Revert a commit (no dialog) ───────────────────────────────────────────
test("S13 revert a commit creates a revert commit", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  await f.locator(".crow").first().click({ button: "right" });
  await f.locator(".ctx-menu").getByText("Revert Commit").click();
  await expect(flash(f)).toBeVisible({ timeout: 8000 });
});

// ── S9 — Create a branch (dialog seam) ──────────────────────────────────────────
test("S9 create a new branch via the rail (native input)", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  await f.locator("button.rail-btn").nth(3).click(); // New Branch
  await answerPrompt(mainWindow, "journey/new-branch");
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  await expect(f.getByText("journey/new-branch", { exact: false }).first()).toBeVisible({ timeout: 6000 });
});

// ── S14 — Reset to a commit (dialog seam) ───────────────────────────────────────
test("S14 reset current branch to a commit (mode prompt)", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  await f.locator(".crow").nth(2).click({ button: "right" });
  await f.locator(".ctx-menu").getByText("Reset Current Branch to Here…").click();
  await answerPrompt(mainWindow, "mixed"); // mode input box (default 'mixed')
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
});

// ── S15 — Tag lifecycle (dialog seam) ───────────────────────────────────────────
test("S15 create a tag via the rail (name + message prompts)", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  await f.locator("button.rail-btn").nth(8).click(); // tag
  await answerPrompt(mainWindow, "v9.9.9");       // name
  await answerPrompt(mainWindow, "journey tag");  // annotation message
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
});
