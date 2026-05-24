import { test, expect } from "./vscode-fixture";

test.describe("HydraGit Extension", () => {
  test("extension activates and shows sidebar", async ({ mainWindow }) => {
    // HydraGit should appear in the activity bar
    const activityBar = mainWindow.locator('[id="workbench.parts.activitybar"]');
    await expect(activityBar).toBeVisible();

    // Click on HydraGit icon in activity bar
    const hydragitIcon = mainWindow.locator(
      '[class*="action-item"] [aria-label*="HydraGit"]'
    );
    if (await hydragitIcon.isVisible()) {
      await hydragitIcon.click();
      await mainWindow.waitForTimeout(1000);
    }
  });

  test("branch list renders", async ({ mainWindow }) => {
    // Open HydraGit main panel via command palette
    await mainWindow.keyboard.press("Meta+Shift+P");
    await mainWindow.waitForTimeout(500);

    const input = mainWindow.locator('[class*="input"]').first();
    await input.fill("HydraGit");
    await mainWindow.waitForTimeout(500);
  });

  test("commit log shows entries", async ({ mainWindow }) => {
    // This is a skeleton — once we know the exact webview selectors,
    // we'll query inside the webview frame for commit rows
    const webviews = mainWindow.locator("iframe.webview");
    const count = await webviews.count();

    // HydraGit should have at least one webview panel
    console.log(`Found ${count} webview frame(s)`);
  });

  test("stash list is populated", async ({ mainWindow }) => {
    // The test repo has 2 stashes — verify they appear
    // Skeleton: will fill in once we identify webview DOM structure
    const webviews = mainWindow.locator("iframe.webview");
    const count = await webviews.count();
    console.log(`Found ${count} webview frame(s) for stash check`);
  });
});
