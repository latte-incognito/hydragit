import { test, expect } from "./vscode-fixture";
import { getLogFrame, graphLaneCount, revealHydraGitPanel } from "./webview-helpers";

// 50 developers fork from one common base and each merges back without squashing
// (fixture: create-fork-merge-repo.sh, 50 branches → 151 commits). Runs only
// under the `vscode-fork50` project (see playwright.config.ts).
//
// Post Task 4 (FIRST_TO_RESOLVE.MD) these 50 branches all share the base, so
// their lanes are freed and reused with long edges to the real ancestor — the
// graph renders COMPACT (~3 lanes), not 50 wide, and without false connections.
// This mirrors `git log --graph`, which also draws this in ~3 columns.

test.describe("fork-merge graph — 50 developers (compact)", () => {
  test.beforeEach(async ({ mainWindow }) => {
    await revealHydraGitPanel(mainWindow);
  });

  test("renders 50 shared-base forks compactly within budget", async ({ mainWindow }) => {
    const start = Date.now();
    const frame = await getLogFrame(mainWindow);
    await expect(frame.locator(".crow").first()).toBeVisible({ timeout: 60_000 });
    const renderMs = Date.now() - start;
    console.log(`fork50 first rows visible after ${renderMs}ms`);

    // 50 branches × (2 commits + 1 merge) + base = 151 commits (under the 200 cap).
    const rows = await frame.locator(".crow").count();
    expect(rows).toBe(151);

    // The win: branches sharing the base collapse into a few reused lanes
    // instead of 50 parallel rails. Assert a tight ceiling.
    const lanes = await graphLaneCount(frame);
    console.log(`fork50 lane count = ${lanes}`);
    expect(lanes).toBeLessThanOrEqual(8);

    // Scroll to the bottom, confirm responsiveness.
    const scroller = frame.locator(".log-scroll");
    const t0 = Date.now();
    await scroller.evaluate((el: HTMLElement) => el.scrollTo(0, el.scrollHeight));
    await mainWindow.waitForTimeout(300);
    console.log(`fork50 scroll settled in ${Date.now() - t0}ms`);

    expect(renderMs).toBeLessThan(30_000);
  });
});
