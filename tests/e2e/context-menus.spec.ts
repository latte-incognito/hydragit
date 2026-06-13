import { test, expect } from "./vscode-fixture";
import { getWebviewFrame } from "./webview-helpers";

// E2e contract + bug-hunt for the context menus in the real app. Runs on the
// default rich-history fixture (vscode project); the vscode/mainWindow fixtures
// already build the repo, launch VS Code, and activate the extension.
//
// NOTE: many menu actions open native prompt()/confirm() dialogs (new branch,
// delete, merge, rebase, reset, rename, new tag) which Playwright cannot drive
// through a webview iframe. So these specs verify (a) every item is PRESENT
// (contract — catches renamed/removed/duplicated items) and (b) the safe,
// no-dialog actions produce a flash. Dialog-driven actions are left to a future
// test seam. Selectors mirror the Svelte components; tune on first real run.

async function mainFrame(page: any) {
  const frame = await getWebviewFrame(page, "main");
  expect(frame, "main panel webview frame should be present").not.toBeNull();
  return frame!;
}

// ── Branch context menu ────────────────────────────────────────────────────────
const BRANCH_ITEMS = [
  "Switch to Branch", "New Branch from", "Checkout and Rebase onto", "Compare with",
  "Show Diff with Working Tree", "Rebase", "Merge", "Pull into", "Delete",
];

test.describe("Branch context menu", () => {
  test("opens with the full item set on right-click", async ({ mainWindow }) => {
    const frame = await mainFrame(mainWindow);
    // slash-named branches nest in collapsed folders — expand one and use a
    // leaf row; folder/HEAD rows don't carry the branch context menu.
    await frame.locator(".titem.folder-row", { hasText: "feature" }).first().click();
    const row = frame.locator(".titem:not(.folder-row):not(.timeline)", { hasText: "auth" }).first();
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.click({ button: "right" });

    const menu = frame.locator(".ctx");
    await expect(menu).toBeVisible({ timeout: 4000 });
    for (const label of BRANCH_ITEMS) {
      await expect(menu.getByText(label, { exact: false }).first()).toBeVisible();
    }
  });
});

// ── Commit context menu ─────────────────────────────────────────────────────────
const COMMIT_WIRED = ["Copy Revision Number", "Cherry-Pick", "Checkout Revision", "Revert Commit", "New Branch…", "New Tag…", "View in browser"];
const COMMIT_DEAD = ["Create Patch…", "Show Repository at Revision", "Compare with Local", "Edit Commit Message…", "Drop Commit", "Push All up to Here…"];

test.describe("Commit context menu", () => {
  test("opens on a commit row with all items present", async ({ mainWindow }) => {
    const frame = await mainFrame(mainWindow);
    const row = frame.locator(".crow").first();
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.click({ button: "right" });

    const menu = frame.locator(".ctx-menu");
    await expect(menu).toBeVisible({ timeout: 4000 });
    for (const label of [...COMMIT_WIRED, ...COMMIT_DEAD]) {
      await expect(menu.getByText(label, { exact: false }).first()).toBeVisible();
    }
  });

  test('"Copy Revision Number" flashes (safe, no dialog)', async ({ mainWindow }) => {
    const frame = await mainFrame(mainWindow);
    await frame.locator(".crow").first().click({ button: "right" });
    await frame.locator(".ctx-menu").getByText("Copy Revision Number").click();
    // App.flash() renders as "⚡ …" in the status bar.
    await expect(frame.getByText("⚡", { exact: false }).first()).toBeVisible({ timeout: 4000 });
  });

  // "Create Patch…" is wired now, but it ends in a native OS save dialog that
  // Playwright cannot drive — left as a tracked TODO (same as bugs.spec #23).
  test.fixme('"Create Patch…" — ends in a native save dialog (not automatable)', async () => {});
});
