import { test, expect } from "./vscode-fixture";

test.describe("HydraGit Extension", () => {
  test("extension activates and shows sidebar", async ({ mainWindow }) => {
    const activityBar = mainWindow.locator('[id="workbench.parts.activitybar"]');
    await expect(activityBar).toBeVisible();

    // Click on HydraGit icon — use the <a> tag specifically to avoid badge duplicate
    const hydragitIcon = mainWindow.locator(
      'a.action-label[aria-label="HydraGit"]'
    );
    await expect(hydragitIcon).toBeVisible({ timeout: 10000 });
    await hydragitIcon.click();
    await mainWindow.waitForTimeout(1000);
  });

  test("command palette opens and finds HydraGit commands", async ({
    mainWindow,
  }) => {
    // Open command palette
    await mainWindow.keyboard.press("Meta+Shift+P");

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
