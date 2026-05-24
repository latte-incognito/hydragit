import { test, expect } from "./vscode-fixture";
import {
  getMainPanelFrame,
  getSidebarFrame,
  openHydraGitSidebar,
  openHydraGitMainPanel,
} from "./webview-helpers";

// Each test maps to a bug from BUGS.MD.
// Tests are expected to FAIL until the bug is fixed.

test.describe("BUGS.MD regressions", () => {
  // ── Bug #1: Search by file name freezes UI and doesn't work ─────────────
  test("bug-01: file search should return results without freezing", async ({
    mainWindow,
  }) => {
    await openHydraGitMainPanel(mainWindow);
    const frame = await getMainPanelFrame(mainWindow);
    expect(frame).not.toBeNull();

    // Switch to file search mode
    const fileTab = frame!.locator("button.mtab-file");
    await fileTab.click();

    // Type a filename that exists in the test repo
    const searchInput = frame!.locator(".search-inner input");
    await searchInput.fill("main.go");
    await mainWindow.waitForTimeout(2000);

    // Should show filtered commit rows (not freeze)
    const rows = frame!.locator(".crow");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  // ── Bug #2: Create tag not working from side bar ────────────────────────
  test("bug-02: create tag should work from sidebar", async ({
    mainWindow,
  }) => {
    await openHydraGitMainPanel(mainWindow);
    const frame = await getMainPanelFrame(mainWindow);
    expect(frame).not.toBeNull();

    // Right-click on the first commit to open context menu
    const firstCommit = frame!.locator(".crow").first();
    await firstCommit.click({ button: "right" });
    await mainWindow.waitForTimeout(500);

    // Context menu should have a "Create Tag" option
    const createTag = frame!.locator(".ctx-item, .ci", { hasText: "Tag" });
    await expect(createTag.first()).toBeVisible({ timeout: 3000 });
  });

  // ── Bug #4: Context menus inside branches should have useful options ────
  test("bug-04: branch context menu should offer rename and other actions", async ({
    mainWindow,
  }) => {
    await openHydraGitMainPanel(mainWindow);
    const frame = await getMainPanelFrame(mainWindow);
    expect(frame).not.toBeNull();

    // Expand local branches
    const localHeader = frame!.locator(".tgroup-hdr", { hasText: "Local" });
    await localHeader.click();
    await mainWindow.waitForTimeout(500);

    // Right-click on a branch item
    const branchItem = frame!.locator(".titem .titem-name", {
      hasText: "feature/auth",
    });
    await branchItem.first().click({ button: "right" });
    await mainWindow.waitForTimeout(500);

    // Context menu should include Rename
    const renameOption = frame!.locator(".ci", { hasText: "Rename" });
    await expect(renameOption).toBeVisible({ timeout: 3000 });
  });

  // ── Bug #6: Side pane should expand to full screen height ───────────────
  test("bug-06: sidebar should expand to fill available height", async ({
    mainWindow,
  }) => {
    await openHydraGitSidebar(mainWindow);
    const frame = await getSidebarFrame(mainWindow);
    expect(frame).not.toBeNull();

    // The sidebar/tree container should fill its parent, not be fixed-height
    const treeWrap = frame!.locator(".tree-wrap");
    await expect(treeWrap).toBeVisible({ timeout: 5000 });

    const box = await treeWrap.boundingBox();
    expect(box).not.toBeNull();
    // Sidebar content should be taller than a small fixed box
    expect(box!.height).toBeGreaterThan(200);
  });

  // ── Bug #7: Tags should be closed by default ───────────────────────────
  test("bug-07: tags section should be collapsed by default", async ({
    mainWindow,
  }) => {
    await openHydraGitMainPanel(mainWindow);
    const frame = await getMainPanelFrame(mainWindow);
    expect(frame).not.toBeNull();

    // The Tags group arrow should have the .closed class by default
    const tagsHeader = frame!.locator(".tgroup-hdr", { hasText: "Tags" });
    await expect(tagsHeader).toBeVisible({ timeout: 5000 });

    const arrow = tagsHeader.locator(".tgroup-arrow");
    await expect(arrow).toHaveClass(/closed/);
  });

  // ── Bug #8: Double click on tag should open commit in commit pane ──────
  test("bug-08: double-click tag should navigate to its commit", async ({
    mainWindow,
  }) => {
    await openHydraGitMainPanel(mainWindow);
    const frame = await getMainPanelFrame(mainWindow);
    expect(frame).not.toBeNull();

    // Expand Tags section
    const tagsHeader = frame!.locator(".tgroup-hdr", { hasText: "Tags" });
    await tagsHeader.click();
    await mainWindow.waitForTimeout(500);

    // Double-click on v1.0.0 tag
    const tag = frame!.locator(".titem.tag-row", { hasText: "v1.0.0" });
    await expect(tag.first()).toBeVisible({ timeout: 3000 });
    await tag.first().dblclick();
    await mainWindow.waitForTimeout(1000);

    // The detail pane should show the tagged commit
    const detailMeta = frame!.locator(".dm-msg");
    await expect(detailMeta).toBeVisible({ timeout: 5000 });
    const msg = await detailMeta.textContent();
    expect(msg).toBeTruthy();
  });

  // ── Bug #9: Stash show should display contents not just changes ────────
  test("bug-09: stash show should display file contents", async ({
    mainWindow,
  }) => {
    await openHydraGitMainPanel(mainWindow);
    const frame = await getMainPanelFrame(mainWindow);
    expect(frame).not.toBeNull();

    // Expand Stashes section
    const stashHeader = frame!.locator(".tgroup-hdr", { hasText: "Stashes" });
    await stashHeader.click();
    await mainWindow.waitForTimeout(500);

    // Click on first stash
    const stash = frame!.locator(".titem.stash").first();
    await expect(stash).toBeVisible({ timeout: 3000 });
    await stash.click();
    await mainWindow.waitForTimeout(500);

    // Click Show button
    const showBtn = frame!.locator(".sab", { hasText: "Show" });
    await showBtn.click();
    await mainWindow.waitForTimeout(1000);

    // Should show file contents (hunk lines), not just a file list
    const hunkLines = frame!.locator(".hunk-line");
    const count = await hunkLines.count();
    expect(count).toBeGreaterThan(0);
  });

  // ── Bug #12: Status pane error overflow ─────────────────────────────────
  test("bug-12: status bar should handle long error messages gracefully", async ({
    mainWindow,
  }) => {
    await openHydraGitMainPanel(mainWindow);
    const frame = await getMainPanelFrame(mainWindow);
    expect(frame).not.toBeNull();

    const statusBar = frame!.locator("#statusbar, .statusbar");
    await expect(statusBar).toBeVisible({ timeout: 5000 });

    // Status bar should have overflow handling (not expand beyond its bounds)
    const box = await statusBar.boundingBox();
    expect(box).not.toBeNull();
    // Status bar should stay within reasonable height (not blow up with long text)
    expect(box!.height).toBeLessThanOrEqual(40);
  });

  // ── Bug #14: Commit button always highlighted ──────────────────────────
  test("bug-14: commit button should not be highlighted when no staged files", async ({
    mainWindow,
  }) => {
    await openHydraGitSidebar(mainWindow);
    const frame = await getSidebarFrame(mainWindow);
    expect(frame).not.toBeNull();

    // With a clean repo (no staged files), commit button should be disabled
    const commitBtn = frame!.locator(".btn-primary", { hasText: "Commit" });
    await expect(commitBtn).toBeVisible({ timeout: 5000 });
    await expect(commitBtn).toBeDisabled();
  });

  // ── Bug #15: Stash buttons don't disappear on deselect ─────────────────
  test("bug-15: stash action buttons should disappear when deselected", async ({
    mainWindow,
  }) => {
    await openHydraGitMainPanel(mainWindow);
    const frame = await getMainPanelFrame(mainWindow);
    expect(frame).not.toBeNull();

    // Expand stashes and select one
    const stashHeader = frame!.locator(".tgroup-hdr", { hasText: "Stashes" });
    await stashHeader.click();
    await mainWindow.waitForTimeout(500);

    const stash = frame!.locator(".titem.stash").first();
    await expect(stash).toBeVisible({ timeout: 3000 });
    await stash.click();
    await mainWindow.waitForTimeout(500);

    // Action buttons should be visible when stash is selected
    const actions = frame!.locator(".stash-actions");
    await expect(actions.first()).toBeVisible({ timeout: 3000 });

    // Click somewhere else to deselect (e.g. a branch or empty area)
    const branchHeader = frame!.locator(".tgroup-hdr", { hasText: "Local" });
    await branchHeader.click();
    await mainWindow.waitForTimeout(500);

    // Stash action buttons should now be hidden
    await expect(actions.first()).not.toBeVisible({ timeout: 3000 });
  });

  // ── Bug #16: Logo in status bar near branch name ───────────────────────
  test("bug-16: status bar should show HydraGit logo near branch name", async ({
    mainWindow,
  }) => {
    await openHydraGitMainPanel(mainWindow);
    const frame = await getMainPanelFrame(mainWindow);
    expect(frame).not.toBeNull();

    const statusBar = frame!.locator("#statusbar, .statusbar");
    await expect(statusBar).toBeVisible({ timeout: 5000 });

    // Should have a logo/icon element near the branch name
    const logo = statusBar.locator("img, svg, .hydragit-logo, .sb-logo");
    await expect(logo).toBeVisible({ timeout: 3000 });
  });

  // ── Bug #17: Logo near branch select pane ──────────────────────────────
  test("bug-17: branch picker should show HydraGit logo", async ({
    mainWindow,
  }) => {
    await openHydraGitMainPanel(mainWindow);
    const frame = await getMainPanelFrame(mainWindow);
    expect(frame).not.toBeNull();

    const toolbar = frame!.locator(".toolbar");
    await expect(toolbar).toBeVisible({ timeout: 5000 });

    // Should have a logo/icon in the toolbar area
    const logo = toolbar.locator("img, svg.hydragit-logo, .hg-logo");
    await expect(logo).toBeVisible({ timeout: 3000 });
  });
});
