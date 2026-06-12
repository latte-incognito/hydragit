import { test, expect } from "./vscode-fixture";
import { getWebviewFrame, workerRepo, git } from "./webview-helpers";

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
  // newest rows are clean merges (empty diff-tree) — pick a commit with files
  await f.locator(".crow", { hasText: "feat:" }).first().click();
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
  // File History acts on the active editor — open a tracked file first
  await mainWindow.keyboard.press("Meta+P");
  const quickOpen = mainWindow.locator(".quick-input-box input");
  await quickOpen.waitFor({ state: "visible", timeout: 5000 });
  await quickOpen.fill("README.md");
  await mainWindow.waitForTimeout(500);
  await mainWindow.keyboard.press("Enter");
  await mainWindow.waitForTimeout(1500);

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
  // slash-named branches nest in collapsed folders — expand "feature" first,
  // then right-click a leaf row (folder/HEAD rows have no branch menu).
  await f.locator(".titem.folder-row", { hasText: "feature" }).first().click();
  const row = f.locator(".titem:not(.folder-row):not(.head)", { hasText: "logging" }).first();
  await row.click({ button: "right" });
  await f.locator(".ctx").getByText("Switch to Branch", { exact: true }).click();
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  // HEAD must actually be on the branch now
  await expect(() => {
    expect(git(workerRepo(test.info()), "rev-parse --abbrev-ref HEAD")).toBe("feature/logging");
  }).toPass({ timeout: 8000 });
});

// ── S8 — Merge a branch into current ────────────────────────────────────────────
test("S8 merge a feature branch into the current branch", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  // feature/diverged is the only feature branch NOT yet merged into the default
  // branch — merging it is a real state change we can assert.
  await f.locator(".titem.folder-row", { hasText: "feature" }).first().click();
  await f.locator(".titem:not(.folder-row):not(.head)", { hasText: "diverged" }).first()
    .click({ button: "right" });
  await f.locator(".ctx").getByText("Merge", { exact: false }).first().click();
  await confirmModal(mainWindow); // merge preview → native 'Yes' modal
  await expect(flash(f)).toBeVisible({ timeout: 8000 });
  await expect(() => {
    const repo = workerRepo(test.info());
    git(repo, "merge-base --is-ancestor feature/diverged HEAD"); // throws if not merged
  }).toPass({ timeout: 8000 });
});

// ── S12 — Cherry-pick from the commit menu ──────────────────────────────────────
test("S12 cherry-pick a commit lands it on HEAD", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  // "feat: cross y" is not in the default branch's history → clean cherry-pick.
  // It lives on cross/y, so switch the log to all branches first.
  await f.locator(".branch-pill").click();
  await f.locator(".bd-item--all").click();
  await f.locator(".crow", { hasText: "feat: cross y" }).first().click({ button: "right" });
  await f.locator(".ctx-menu").getByText("Cherry-Pick").click();
  await expect(flash(f)).toBeVisible({ timeout: 8000 });
  await expect(() => {
    expect(git(workerRepo(test.info()), "log -1 --format=%s")).toBe("feat: cross y");
  }).toPass({ timeout: 8000 });
});

// ── S13 — Revert a commit ───────────────────────────────────────────────────────
test("S13 revert a commit creates a revert commit", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  // "feat: octopus branch a" IS in the default branch's history → clean revert
  await f.locator(".crow", { hasText: "feat: octopus branch a" }).first().click({ button: "right" });
  await f.locator(".ctx-menu").getByText("Revert Commit").click();
  await expect(flash(f)).toBeVisible({ timeout: 8000 });
  await expect(() => {
    expect(git(workerRepo(test.info()), "log -1 --format=%s"))
      .toBe('Revert "feat: octopus branch a"');
  }).toPass({ timeout: 8000 });
});

// ── S9 — Create a branch (dialog seam) ──────────────────────────────────────────
test("S9 create a new branch via the rail (native input)", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  await f.locator('button.rail-btn[aria-label="New branch"]').click();
  await answerPrompt(mainWindow, "journey/new-branch");
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  await expect(f.getByText("journey/new-branch", { exact: false }).first()).toBeVisible({ timeout: 6000 });
  expect(git(workerRepo(test.info()), "branch --list journey/new-branch")).toContain("journey/new-branch");
});

// ── S14 — Reset to a commit (dialog seam) ───────────────────────────────────────
test("S14 reset current branch to a commit (mode prompt)", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  // reset to a known commit in the default branch's history
  await f.locator(".crow", { hasText: "docs: add contributing section" }).first()
    .click({ button: "right" });
  await f.locator(".ctx-menu").getByText("Reset Current Branch to Here…").click();
  await answerPrompt(mainWindow, "mixed"); // mode input box (default 'mixed')
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  await expect(() => {
    expect(git(workerRepo(test.info()), "log -1 --format=%s")).toBe("docs: add contributing section");
  }).toPass({ timeout: 8000 });
});

// ── S15 — Tag lifecycle (dialog seam) ───────────────────────────────────────────
test("S15 create a tag via the rail (name + message prompts)", async ({ mainWindow }) => {
  const f = await main(mainWindow);
  await f.locator('button.rail-btn[aria-label="Create tag"]').click();
  await answerPrompt(mainWindow, "v9.9.9");       // name
  await answerPrompt(mainWindow, "journey tag");  // annotation message
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  expect(git(workerRepo(test.info()), "tag -l v9.9.9")).toBe("v9.9.9");
});
