import { test, expect } from "./vscode-fixture";
import { getWebviewFrame } from "./webview-helpers";
import { execSync } from "child_process";

// The fixture builds the repo at `${repoPath}-w${workerIndex}` (see
// vscode-fixture.ts) — reconstruct it so the test can drive real git.
function workerRepo(testInfo: any): string {
  const base = (testInfo.project.use as any).repoPath;
  return `${base}-w${testInfo.workerIndex}`;
}

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

    await f.locator(".titem.timeline").click();

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
    await f.locator(".titem.timeline").click();
    await expect(f.locator(".reflog-pane")).toBeVisible({ timeout: 6000 });

    await f.locator(".rl-back").click();

    await expect(f.locator(".reflog-pane")).toHaveCount(0);
    await expect(f.locator(".crow").first()).toBeVisible({ timeout: 6000 });
    await expect(f.locator(".detail-wrap")).toBeVisible();
  });

  test("selecting a branch also exits the timeline", async ({ mainWindow }) => {
    const f = await main(mainWindow);
    await f.locator(".titem.timeline").click();
    await expect(f.locator(".reflog-pane")).toBeVisible({ timeout: 6000 });

    // Click a real branch row — leaf only; folder rows just expand/collapse.
    await f.locator(".titem:not(.folder-row):not(.timeline)").first().click();

    await expect(f.locator(".reflog-pane")).toHaveCount(0);
    await expect(f.locator(".crow").first()).toBeVisible({ timeout: 6000 });
  });

  test("the timeline auto-updates when a commit lands while it is open", async ({ mainWindow }, testInfo) => {
    const f = await main(mainWindow);
    await f.locator(".titem.timeline").click();
    await expect(f.locator(".reflog-pane")).toBeVisible({ timeout: 6000 });
    // The marker isn't there yet.
    await expect(f.locator(".rl-subject").first()).not.toContainText("e2e-autoupdate-marker");

    // A real commit from outside the webview (the watcher must catch it).
    const repo = workerRepo(testInfo);
    execSync(`git -C "${repo}" commit --allow-empty -m "e2e-autoupdate-marker"`, { stdio: "pipe" });

    // watcher (.git/logs/HEAD + refs) → refresh → reflog reload → new HEAD@{0}.
    await expect(f.locator(".rl-subject").first()).toContainText("e2e-autoupdate-marker", {
      timeout: 10000,
    });
  });
});
