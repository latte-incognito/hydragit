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
