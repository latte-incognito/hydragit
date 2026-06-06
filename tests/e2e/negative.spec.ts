import { test, expect } from "./vscode-fixture";
import { getLogFrame, revealHydraGitPanel } from "./webview-helpers";
import { execSync } from "child_process";

// Negative / resilience e2e against the default rich-history fixture. The
// vscode/mainWindow fixtures (beforeEach) already build the repo, launch VS
// Code, and activate the extension.

test.describe("Resilience & edge cases", () => {
  // BUGS.MD #1 — "Search by file name freezes UI and doesn't work."
  // Typing a filename query must keep the panel responsive: the log frame stays
  // reachable and re-renders (rows or an empty state) within a sane timeout. If
  // it locks up, this times out → documents the freeze.
  test("file-name search keeps the panel responsive (BUG #1)", async ({ mainWindow }) => {
    await revealHydraGitPanel(mainWindow);
    const log = await getLogFrame(mainWindow);

    const search = log.locator('input[type="search"], input.search, .toolbar input').first();
    await expect(search).toBeVisible({ timeout: 8000 });

    await search.fill("README.md");
    await mainWindow.waitForTimeout(1500);

    // The frame must still respond to queries (not frozen) and settle on either
    // matching rows or a visible empty state.
    const rows = log.locator(".commit-row, [data-commit], .log-row");
    const empty = log.locator(".empty, .no-results, text=No commits");
    const settled =
      (await rows.count().catch(() => 0)) > 0 ||
      (await empty.count().catch(() => 0)) > 0;
    expect(settled, "search should render results or an empty state, not freeze").toBe(true);
  });

  // BUGS.MD #20 — "If git state changed by another plugin or command HydraGit
  // can stuck." An external commit on the repo should be picked up (the .git
  // watcher refreshes) rather than wedging the UI.
  test("reflects an external git change without getting stuck (BUG #20)", async ({
    mainWindow,
  }) => {
    const cfg = test.info().project.use as { repoPath?: string };
    const repo = `${cfg.repoPath}-w${test.info().workerIndex}`;

    // Mutate the repo the way another tool would.
    execSync(`git -C "${repo}" checkout -b externally-added-branch`, { stdio: "pipe" });
    execSync(`git -C "${repo}" commit --allow-empty -m "external commit"`, { stdio: "pipe" });

    await revealHydraGitPanel(mainWindow);
    const log = await getLogFrame(mainWindow);

    // The new branch should appear in the branch tree after the watcher refresh.
    const branchEntry = log.locator("text=externally-added-branch");
    await expect(branchEntry).toBeVisible({ timeout: 10000 });
  });
});
