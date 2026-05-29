import { test, expect } from "./vscode-fixture";
import { getLogFrame, graphLaneCount, revealHydraGitPanel } from "./webview-helpers";

// 3 developers fork from one common base and each merges back without squashing
// (fixture: create-fork-merge-repo.sh, 3 branches → 10 commits). Runs only under
// the `vscode-fork3` project (see playwright.config.ts).
//
// Post lane-fix (FIRST_TO_RESOLVE.MD Task 2) each feature keeps its own lane and
// converges at the base, so this draws a modest ~4-lane graph (3 features + main).

test.describe("fork-merge graph — 3 developers", () => {
  test.beforeEach(async ({ mainWindow }) => {
    await revealHydraGitPanel(mainWindow);
  });

  test("renders each feature in its own lane and stays fast", async ({ mainWindow }) => {
    const start = Date.now();
    const frame = await getLogFrame(mainWindow);
    await expect(frame.locator(".crow").first()).toBeVisible({ timeout: 30_000 });
    const renderMs = Date.now() - start;
    console.log(`fork3 first rows visible after ${renderMs}ms`);

    // 3 branches × (2 commits + 1 merge) + base = 10 commits.
    const rows = await frame.locator(".crow").count();
    expect(rows).toBe(10);

    // main + 3 feature lanes. Allow a little slack but confirm it's not collapsed
    // to a single trunk and not blown up wider than the branch count warrants.
    const lanes = await graphLaneCount(frame);
    console.log(`fork3 lane count = ${lanes}`);
    expect(lanes).toBeGreaterThanOrEqual(3);
    expect(lanes).toBeLessThanOrEqual(6);

    expect(renderMs).toBeLessThan(30_000);
  });
});
