import { test, expect } from "./vscode-fixture";
import { getLogFrame, revealHydraGitPanel } from "./webview-helpers";

// Scroll/perf check against the 1000+ commit fixture (create-perf-repo.sh).
// Runs only under the `vscode-perf` Playwright project (see playwright.config.ts).
//
// Note: this is a "renders & stays responsive" smoke, not a hard benchmark —
// Playwright timing in an Electron webview is noisy. The budget is deliberately
// generous; treat a failure as "something got pathologically slow," not a
// microbenchmark regression.

test.describe("commit graph performance (1000+ commits)", () => {
  test.beforeEach(async ({ mainWindow }) => {
    await revealHydraGitPanel(mainWindow);
  });

  test("large history renders within budget and scrolls", async ({ mainWindow }) => {
    const start = Date.now();
    const frame = await getLogFrame(mainWindow);
    await expect(frame.locator(".crow").first()).toBeVisible({ timeout: 60_000 });
    const renderMs = Date.now() - start;
    console.log(`first rows visible after ${renderMs}ms`);

    const rows = await frame.locator(".crow").count();
    expect(rows).toBeGreaterThan(1000);

    // Jump to the bottom of the log and confirm the view stays responsive.
    const scroller = frame.locator(".log-scroll");
    const t0 = Date.now();
    await scroller.evaluate((el: HTMLElement) => el.scrollTo(0, el.scrollHeight));
    await mainWindow.waitForTimeout(300);
    const scrollMs = Date.now() - t0;
    console.log(`scroll-to-bottom settled in ${scrollMs}ms`);

    // Generous ceiling — flags pathological slowness, not micro-regressions.
    expect(renderMs).toBeLessThan(30_000);
  });
});
