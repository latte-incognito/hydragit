import { Page, FrameLocator } from "@playwright/test";

/**
 * VS Code webviews are nested inside iframes.
 * This helper navigates into the webview frame to access Svelte DOM.
 */
export async function getWebviewFrame(
  page: Page,
  viewId: string
): Promise<FrameLocator | null> {
  // VS Code nests webviews: outer iframe.webview > inner iframe with actual content
  const outerFrames = page.frameLocator("iframe.webview.ready");
  const count = await page.locator("iframe.webview.ready").count();

  for (let i = 0; i < count; i++) {
    const outer = outerFrames.nth(i);
    const inner = outer.frameLocator("#active-frame");
    try {
      const marker = inner.locator(`[data-view="${viewId}"], .app-root, .sidebar`);
      if (await marker.count() > 0) {
        return inner;
      }
    } catch {}
  }
  return null;
}

export async function getMainPanelFrame(page: Page): Promise<FrameLocator | null> {
  return getWebviewFrame(page, "main");
}

export async function getSidebarFrame(page: Page): Promise<FrameLocator | null> {
  return getWebviewFrame(page, "sidebar");
}

/**
 * Opens the HydraGit sidebar by clicking its icon in the activity bar.
 */
export async function openHydraGitSidebar(page: Page): Promise<void> {
  const icon = page.locator('a.action-label[aria-label="HydraGit"]');
  await icon.click();
  await page.waitForTimeout(1000);
}

/**
 * Opens the HydraGit main panel via command palette.
 */
export async function openHydraGitMainPanel(page: Page): Promise<void> {
  await page.keyboard.press("Meta+Shift+P");
  const input = page.locator(".quick-input-box input");
  await input.fill(">HydraGit: Focus on HydraGit View");
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2000);
}

/**
 * Reveals the HydraGit pane via the command palette, mirroring the proven flow
 * in hydragit.spec.ts ("View: Show HydraGit"). Call this before any test that
 * needs the commit-log webview rendered.
 */
export async function revealHydraGitPanel(page: Page): Promise<void> {
  await page.keyboard.press("Meta+Shift+P");
  const input = page.locator(".quick-input-box input");
  await input.waitFor({ state: "visible", timeout: 5000 });
  await input.fill(">View: Show HydraGit");
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
}

/**
 * Scans VS Code's nested webview iframes for the one rendering the commit log
 * (identified by the `.pane-log` root). Throws if none is found.
 */
export async function getLogFrame(page: Page): Promise<FrameLocator> {
  const outer = page.frameLocator("iframe.webview.ready");
  const count = await page.locator("iframe.webview.ready").count();
  for (let i = 0; i < count; i++) {
    const inner = outer.nth(i).frameLocator("#active-frame");
    if ((await inner.locator(".pane-log").count()) > 0) {
      return inner;
    }
  }
  throw new Error("commit-log webview frame (.pane-log) not found");
}

// Graph SVG geometry — must match webview/src/panels/index/graphSvg.ts.
const LANE_W = 16;
const PAD = 4;

/**
 * Number of lanes the commit graph is drawn with, derived from the graph SVG's
 * width (svgW = laneCount * LANE_W + PAD * 2). A wide graph → large lane count.
 */
export async function graphLaneCount(frame: FrameLocator): Promise<number> {
  const w = await frame.locator(".graph-col svg").first().getAttribute("width");
  const width = Number(w ?? 0);
  return Math.round((width - PAD * 2) / LANE_W);
}
