import { test, expect } from "./vscode-fixture";
import { getLogFrame, revealHydraGitPanel } from "./webview-helpers";

// Perf check against the 1000+ commit fixture (create-perf-repo.sh).
// Runs only under the `vscode-perf` Playwright project (see playwright.config.ts).
//
// The 200-commit cap is gone (Task 1): the webview loads the FULL history and
// virtualizes rendering — only the rows in/near the viewport are in the DOM,
// while the scroll spacer spans every commit. This test asserts both: the full
// history is loaded (tall spacer) and the DOM stays small (virtualization), and
// that it renders fast and scrolls responsively.
//
// This is a "renders & stays responsive" smoke, not a hard benchmark — Electron
// webview timing is noisy. Treat a failure as "something got pathologically
// slow," not a microbenchmark regression.

const ROW_H = 22;

test.describe("commit graph performance (full history, virtualized)", () => {
  test.beforeEach(async ({ mainWindow }) => {
    await revealHydraGitPanel(mainWindow);
  });

  test("loads a 1000+ commit history, virtualizes the DOM, and scrolls fast", async ({
    mainWindow,
  }) => {
    const start = Date.now();
    const frame = await getLogFrame(mainWindow);
    await expect(frame.locator(".crow").first()).toBeVisible({ timeout: 60_000 });
    const renderMs = Date.now() - start;
    console.log(`first rows visible after ${renderMs}ms`);

    // Full history is loaded: the scroll spacer spans all 1000+ commits.
    const innerH = await frame
      .locator(".log-inner")
      .evaluate((el: HTMLElement) => el.clientHeight);
    console.log(`log-inner height = ${innerH}px (~${Math.round(innerH / ROW_H)} rows)`);
    expect(innerH).toBeGreaterThan(1000 * ROW_H);

    // …but the DOM stays small — only the viewport's worth of rows is rendered,
    // not all 1000+. That's the virtualization win.
    const rows = await frame.locator(".crow").count();
    console.log(`rendered rows = ${rows}`);
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThan(150);

    // Scroll to the bottom and confirm rows still render there (recycled window)
    // and the view stays responsive.
    const scroller = frame.locator(".log-scroll");
    const t0 = Date.now();
    await scroller.evaluate((el: HTMLElement) => el.scrollTo(0, el.scrollHeight));
    await mainWindow.waitForTimeout(400);
    console.log(`scroll-to-bottom settled in ${Date.now() - t0}ms`);
    expect(await frame.locator(".crow").count()).toBeGreaterThan(0);

    // Generous ceiling — flags pathological slowness, not micro-regressions.
    expect(renderMs).toBeLessThan(30_000);
  });
});
