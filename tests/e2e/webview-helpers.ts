import { Page, FrameLocator } from "@playwright/test";
import { execSync } from "child_process";

/**
 * The per-worker fixture repo path (vscode-fixture.ts builds the repo at
 * `${repoPath}-w${workerIndex}`). Lets specs assert real git state.
 */
export function workerRepo(testInfo: any): string {
  const base = (testInfo.project.use as any).repoPath;
  return `${base}-w${testInfo.workerIndex}`;
}

/** Run a git command in the fixture repo and return trimmed stdout. */
export function git(repo: string, args: string): string {
  return execSync(`git -C "${repo}" ${args}`, { stdio: "pipe" }).toString().trim();
}

// Root markers identifying each webview's Svelte app:
// main panel → LogPane's `.pane-log`; sidebar → Sidebar.svelte's `.repo-list`.
const VIEW_MARKERS: Record<string, string> = {
  main: ".pane-log",
  sidebar: ".repo-list",
};

/**
 * VS Code webviews are nested inside iframes.
 * This helper navigates into the webview frame to access Svelte DOM.
 *
 * Neither HydraGit view is open on a cold start (sidebar lives in the activity
 * bar, main view in the bottom panel), so if no frame matches we reveal the
 * view and rescan before giving up.
 */
export async function getWebviewFrame(
  page: Page,
  viewId: string
): Promise<FrameLocator | null> {
  const marker = VIEW_MARKERS[viewId] ?? `[data-view="${viewId}"]`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const frame = await scanWebviewFrames(page, marker);
    if (frame) return frame;

    if (viewId === "sidebar") {
      await openHydraGitSidebar(page);
    } else {
      await revealHydraGitPanel(page);
    }
    await page.waitForTimeout(1500); // let the webview iframe mount + Svelte render
  }
  return await scanWebviewFrames(page, marker);
}

async function scanWebviewFrames(
  page: Page,
  marker: string
): Promise<FrameLocator | null> {
  // VS Code nests webviews: outer iframe.webview > inner iframe with actual content
  const outerFrames = page.frameLocator("iframe.webview.ready");
  const count = await page.locator("iframe.webview.ready").count();

  for (let i = 0; i < count; i++) {
    const inner = outerFrames.nth(i).frameLocator("#active-frame");
    try {
      if ((await inner.locator(marker).count()) > 0) {
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
  // Activity-bar items render as tabs in current VS Code; keep the legacy
  // anchor selector as a fallback. Don't throw — getWebviewFrame retries.
  const icon = page
    .locator(
      '.activitybar [role="tab"][aria-label*="HydraGit"], a.action-label[aria-label="HydraGit"]'
    )
    .first();
  await icon.click({ timeout: 10000 }).catch(() => {});
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
