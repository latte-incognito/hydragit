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

    // conflict.txt must show up as a changed file (it renders both in the
    // conflict banner and the file tree — any occurrence proves it's listed).
    const fileRow = sidebar!.locator("text=conflict.txt").first();
    await expect(fileRow).toBeVisible({ timeout: 8000 });
  });

  test("the conflicted file is marked with a conflict status (not plain M/A/D)", async ({
    mainWindow,
  }) => {
    const sidebar =
      (await getSidebarFrame(mainWindow)) ?? (await getWebviewFrame(mainWindow, "sidebar"));
    expect(sidebar).not.toBeNull();

    // The row carries data-status="!" (unmerged) — distinct from M/A/D and from
    // untracked "U". resolveStatus maps every UU/AA/DD/AU/UA/DU/UD code to "!".
    const conflictRow = sidebar!.locator('[data-status="!"]');
    await expect(conflictRow.first()).toBeVisible({ timeout: 8000 });
    await expect(conflictRow.first()).toHaveAttribute("data-path", "conflict.txt");
  });

  test("clicking the conflicted file opens the merge resolver", async ({ mainWindow }) => {
    const sidebar =
      (await getSidebarFrame(mainWindow)) ?? (await getWebviewFrame(mainWindow, "sidebar"));
    expect(sidebar).not.toBeNull();

    const conflictRow = sidebar!.locator('[data-path="conflict.txt"]');
    await expect(conflictRow.first()).toBeVisible({ timeout: 8000 });
    await conflictRow.first().click();

    // A workbench editor opens for conflict.txt. Prefer VS Code's 3-way merge
    // editor; accept the plain-editor / diff fallback (git.openMergeEditor may be
    // unavailable, in which case openMergeEditor() falls back to vscode.open).
    const editor = mainWindow.locator(
      ".monaco-merge-editor, .editor-instance, .monaco-diff-editor"
    );
    await expect(editor.first()).toBeVisible({ timeout: 8000 });

    const tab = mainWindow.locator(".tab", { hasText: "conflict.txt" });
    await expect(tab.first()).toBeVisible({ timeout: 8000 });
  });
});
