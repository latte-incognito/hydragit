import { test, expect } from "./vscode-fixture";
import { getSidebarFrame, getWebviewFrame } from "./webview-helpers";

// Stage / commit / stash journeys. Runs on the vscode-dirty project
// (create-dirty-repo.sh leaves "M app.js" + "?? NOTES.md" uncommitted). The
// vscode/mainWindow fixtures build the repo, launch VS Code, and activate.
//
// NOTE: authored to convention; sidebar selectors (file rows, stage checkboxes,
// commit message box, Commit button) mirror the Svelte sidebar components and
// will need a first-run pass.

async function sidebar(page: any) {
  const f = (await getSidebarFrame(page)) ?? (await getWebviewFrame(page, "sidebar"));
  expect(f, "sidebar webview frame").not.toBeNull();
  return f!;
}
async function main(page: any) {
  const f = await getWebviewFrame(page, "main");
  expect(f).not.toBeNull();
  return f!;
}

// ── S10 — Stage & commit ────────────────────────────────────────────────────────
test("S10 stage a file, write a message, and commit", async ({ mainWindow }) => {
  const sb = await sidebar(mainWindow);

  // the modified file shows in the changed-files tree
  await expect(sb.getByText("app.js", { exact: false }).first()).toBeVisible({ timeout: 8000 });

  // stage it via its checkbox
  await sb.locator('.file-row input[type="checkbox"], .tree-row input[type="checkbox"]').first().check();

  // write a commit message and commit
  await sb.locator("textarea, .commit-message, input.commit-input").first().fill("test: commit staged change");
  await sb.getByRole("button", { name: /commit/i }).first().click();

  // the staged file should clear from the tree
  await expect(sb.getByText("app.js", { exact: false })).toHaveCount(0, { timeout: 8000 });

  // and the new commit appears in the main-panel log
  const mp = await main(mainWindow);
  await expect(mp.getByText("test: commit staged change", { exact: false }).first()).toBeVisible({ timeout: 8000 });
});

// ── S11 — Stash & restore ────────────────────────────────────────────────────────
test("S11 stash working changes, then pop them back", async ({ mainWindow }) => {
  const mp = await main(mainWindow);

  // Stash via the action-rail "Stash changes" button (no dialog).
  await mp.locator("button.rail-btn").nth(7).click();
  await expect(mp.getByText("⚡", { exact: false }).first()).toBeVisible({ timeout: 6000 });

  // A stash entry appears in the branch tree (expand Stashes first).
  await mp.getByText("Stashes", { exact: false }).first().click().catch(() => {});
  const stashRow = mp.locator(".titem.stash").first();
  await expect(stashRow).toBeVisible({ timeout: 6000 });

  // Pop it from the context menu — changes return.
  await stashRow.click({ button: "right" });
  await mp.locator(".ctx").getByText("Pop", { exact: true }).click();
  await expect(mp.getByText("⚡", { exact: false }).first()).toBeVisible({ timeout: 6000 });
});
