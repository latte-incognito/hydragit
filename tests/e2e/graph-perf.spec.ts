import { test, expect } from "./vscode-fixture";
import { getLogFrame, revealHydraGitPanel } from "./webview-helpers";

// Perf check against the 1000+ commit fixture (create-perf-repo.sh).
// Runs only under the `vscode-perf` Playwright project (see playwright.config.ts).
//
// IMPORTANT: the webview requests `log` with limit: 200 (App.svelte) and the Go
// handler defaults to 200 (internal/ipc/handler.go). There is NO pagination, so
// the graph renders at most 200 rows regardless of repo size. This test asserts
// that cap holds on a large repo and that rendering the capped window is fast.
//
// This is a "renders & stays responsive" smoke, not a hard benchmark — Electron
// webview timing is noisy. Treat a failure as "something got pathologically
// slow," not a microbenchmark regression.

const LOG_LIMIT = 200;

test.describe("commit graph performance (large history, 200-row cap)", () => {
  test.beforeEach(async ({ mainWindow }) => {
    await revealHydraGitPanel(mainWindow);
  });

  test("caps a 1000+ commit history at the log limit and renders fast", async ({
    mainWindow,
  }) => {
    const start = Date.now();
    const frame = await getLogFrame(mainWindow);
    await expect(frame.locator(".crow").first()).toBeVisible({ timeout: 60_000 });
    const renderMs = Date.now() - start;
    console.log(`first rows visible after ${renderMs}ms`);

    // The fixture has 1000+ commits but the webview caps the log at 200 rows.
    const rows = await frame.locator(".crow").count();
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThanOrEqual(LOG_LIMIT);

    // Scroll to the bottom of the (capped) log and confirm it stays responsive.
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
