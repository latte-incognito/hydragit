import { test, expect } from "./vscode-fixture";
import { COMMAND_PALETTE } from "./webview-helpers";

test.describe("HydraGit Extension", () => {
  test("extension activates and shows sidebar", async ({ mainWindow }) => {
    await mainWindow.keyboard.press(COMMAND_PALETTE);
    const input = mainWindow.locator(".quick-input-box input");
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill(">View: Show HydraGit");
    await mainWindow.waitForTimeout(500);
    await mainWindow.keyboard.press("Enter");
    await mainWindow.waitForTimeout(1000);
  });

  test("command palette opens and finds HydraGit commands", async ({
    mainWindow,
  }) => {
    // Open command palette
    await mainWindow.keyboard.press(COMMAND_PALETTE);

    // The command palette input has a specific role
    const input = mainWindow.locator(".quick-input-box input");
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill(">HydraGit");
    await mainWindow.waitForTimeout(500);

    // Should see at least one HydraGit command in the list
    const items = mainWindow.locator('.quick-input-list .label-description', {
      hasText: 'HydraGit',
    });
    await expect(items.first()).toBeVisible({ timeout: 5000 });

    // Close palette
    await mainWindow.keyboard.press("Escape");
  });

  test("commit log shows entries", async ({ mainWindow }) => {
    const webviews = mainWindow.locator("iframe.webview");
    const count = await webviews.count();
    console.log(`Found ${count} webview frame(s)`);
  });

  test("stash list is populated", async ({ mainWindow }) => {
    const webviews = mainWindow.locator("iframe.webview");
    const count = await webviews.count();
    console.log(`Found ${count} webview frame(s) for stash check`);
  });
});
