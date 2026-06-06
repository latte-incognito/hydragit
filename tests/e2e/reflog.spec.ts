import { test, expect } from "./vscode-fixture";
import { getWebviewFrame } from "./webview-helpers";

// The "HEAD" undo timeline: clicking the HEAD row swaps the commit graph for the
// reflog view (with soft/mixed/hard reset buttons) and hides the detail pane;
// exiting must fully restore the graph + detail pane. Runs on the default
// rich-history fixture (any repo with commits has a reflog).

async function main(page: any) {
  const f = await getWebviewFrame(page, "main");
  expect(f, "main webview frame").not.toBeNull();
  return f!;
}

test.describe("HEAD undo timeline (reflog)", () => {
  test("clicking HEAD opens the timeline and replaces the graph", async ({ mainWindow }) => {
    const f = await main(mainWindow);
    await expect(f.locator(".crow").first()).toBeVisible({ timeout: 8000 });

    await f.locator(".titem.head").click();

    // Timeline appears with the three reset controls...
    await expect(f.locator(".reflog-pane")).toBeVisible({ timeout: 6000 });
    await expect(f.locator(".rl-reset.soft").first()).toBeVisible();
    await expect(f.locator(".rl-reset.mixed").first()).toBeVisible();
    await expect(f.locator(".rl-reset.hard").first()).toBeVisible();
    // ...and the commit graph is gone (replaced, not just hidden behind it).
    await expect(f.locator(".crow")).toHaveCount(0);
  });

  test("Back button fully restores the graph + detail pane", async ({ mainWindow }) => {
    const f = await main(mainWindow);
    await f.locator(".titem.head").click();
    await expect(f.locator(".reflog-pane")).toBeVisible({ timeout: 6000 });

    await f.locator(".rl-back").click();

    await expect(f.locator(".reflog-pane")).toHaveCount(0);
    await expect(f.locator(".crow").first()).toBeVisible({ timeout: 6000 });
    await expect(f.locator(".detail-wrap")).toBeVisible();
  });

  test("selecting a branch also exits the timeline", async ({ mainWindow }) => {
    const f = await main(mainWindow);
    await f.locator(".titem.head").click();
    await expect(f.locator(".reflog-pane")).toBeVisible({ timeout: 6000 });

    // Click a real branch row (any non-HEAD branch item).
    await f.locator(".titem.branch, .titem:not(.head)").first().click();

    await expect(f.locator(".reflog-pane")).toHaveCount(0);
    await expect(f.locator(".crow").first()).toBeVisible({ timeout: 6000 });
  });
});
