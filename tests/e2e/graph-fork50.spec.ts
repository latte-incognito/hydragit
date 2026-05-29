import { test, expect } from "./vscode-fixture";
import { getLogFrame, graphLaneCount, revealHydraGitPanel } from "./webview-helpers";

// 50 developers fork from one common base and each merges back without squashing
// (fixture: create-fork-merge-repo.sh, 50 branches → 151 commits). Runs only
// under the `vscode-fork50` project (see playwright.config.ts).
//
// This is the WIDE-graph perf/stress case. Post lane-fix (FIRST_TO_RESOLVE.MD
// Task 2) the graph no longer collapses branches together, so it renders ~51
// lanes. The test confirms the width is real and that drawing it stays
// responsive — generous budget, this flags pathological slowness only.

test.describe("fork-merge graph — 50 developers (wide)", () => {
  test.beforeEach(async ({ mainWindow }) => {
    await revealHydraGitPanel(mainWindow);
  });

  test("renders a wide ~50-lane graph within budget", async ({ mainWindow }) => {
    const start = Date.now();
    const frame = await getLogFrame(mainWindow);
    await expect(frame.locator(".crow").first()).toBeVisible({ timeout: 60_000 });
    const renderMs = Date.now() - start;
    console.log(`fork50 first rows visible after ${renderMs}ms`);

    // 50 branches × (2 commits + 1 merge) + base = 151 commits (under the 200 cap).
    const rows = await frame.locator(".crow").count();
    expect(rows).toBe(151);

    // The whole point: many concurrent lanes. Assert a generous floor, not the
    // exact 51, so the test isn't brittle to ordering details.
    const lanes = await graphLaneCount(frame);
    console.log(`fork50 lane count = ${lanes}`);
    expect(lanes).toBeGreaterThanOrEqual(20);

    // Render the wide graph + scroll to the bottom, confirm responsiveness.
    const scroller = frame.locator(".log-scroll");
    const t0 = Date.now();
    await scroller.evaluate((el: HTMLElement) => el.scrollTo(0, el.scrollHeight));
    await mainWindow.waitForTimeout(300);
    console.log(`fork50 scroll settled in ${Date.now() - t0}ms`);

    expect(renderMs).toBeLessThan(30_000);
  });
});
