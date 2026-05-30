import { test, expect } from "./vscode-fixture";
import { getSidebarFrame, getWebviewFrame } from "./webview-helpers";

// BUGS.MD #19 — "Merge conflicts on side bar not ready."
//
// Runs against the `vscode-conflict` project (create-conflict-repo.sh leaves a
// `UU conflict.txt` merge in progress). The Go status parser drops the UU file
// (status.go:resolveStatus), so the sidebar never lists the conflict.
//
// These assert the CORRECT behavior — the conflicted file must appear in the
// sidebar, flagged as a conflict — and therefore FAIL today (red by design,
// matching the Go-layer repro in internal/git/conflict_test.go). The fixture
// `beforeEach` (the vscode/mainWindow fixtures) already opens VS Code on the
// conflicted repo and activates the extension.
test.describe("Merge conflict — sidebar (BUG #19)", () => {
  test("the conflicted file is listed in the changed-files tree", async ({ mainWindow }) => {
    const sidebar =
      (await getSidebarFrame(mainWindow)) ?? (await getWebviewFrame(mainWindow, "sidebar"));
    expect(sidebar, "sidebar webview frame should be present").not.toBeNull();

    // conflict.txt must show up as a changed file.
    const fileRow = sidebar!.locator("text=conflict.txt");
    await expect(fileRow).toBeVisible({ timeout: 8000 });
  });

  test("the conflicted file is marked with a conflict status (not plain M/A/D)", async ({
    mainWindow,
  }) => {
    const sidebar =
      (await getSidebarFrame(mainWindow)) ?? (await getWebviewFrame(mainWindow, "sidebar"));
    expect(sidebar).not.toBeNull();

    // A conflict badge / "U" (unmerged) indicator must be present for the file.
    const conflictBadge = sidebar!.locator(
      '[data-status="U"], [data-status="conflict"], .status-conflict, .file-conflict'
    );
    await expect(conflictBadge.first()).toBeVisible({ timeout: 8000 });
  });
});
