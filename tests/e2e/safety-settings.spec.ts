import fs from "fs";
import path from "path";
import { test, expect } from "./vscode-fixture";
import { getSidebarFrame, getWebviewFrame, workerRepo, git } from "./webview-helpers";

// hydragit.safety.protectedBranches — the configurable protected-branch list.
// The host resolves it per-precheck via getConfiguration, which reads workspace
// settings live — so these specs write <repo>/.vscode/settings.json mid-test
// and need no VS Code relaunch. Runs on the vscode-dirty project ("M app.js"
// ready to stage).

async function sidebar(page: any) {
  const f = (await getSidebarFrame(page)) ?? (await getWebviewFrame(page, "sidebar"));
  expect(f, "sidebar webview frame").not.toBeNull();
  return f!;
}

function setWorkspaceSettings(repo: string, settings: Record<string, unknown>) {
  fs.mkdirSync(path.join(repo, ".vscode"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".vscode", "settings.json"), JSON.stringify(settings));
}

// Stage app.js by its data-path (the .vscode/settings.json this suite writes
// also shows up in the tree — "first checkbox" would be ambiguous).
async function stageAndCommit(sb: any, message: string) {
  await expect(sb.getByText("app.js", { exact: false }).first()).toBeVisible({ timeout: 8000 });
  await sb.locator('.file-row[data-path="app.js"] input[type="checkbox"]').check();
  await sb.locator("textarea, .commit-message, input.commit-input").first().fill(message);
  await sb.getByRole("button", { name: /commit/i }).first().click();
}

// ── SS1 — default list does not protect develop ────────────────────────────────
test("SS1 committing on develop with default settings shows no warning", async ({ mainWindow }) => {
  const repo = workerRepo(test.info());
  git(repo, "checkout -b develop");

  const sb = await sidebar(mainWindow);
  await stageAndCommit(sb, "test: commit on develop");

  // No safety dialog — the commit lands without a confirm in the way.
  await expect(() => {
    expect(git(repo, "log -1 --format=%s")).toBe("test: commit on develop");
  }).toPass({ timeout: 8000 });
  await expect(mainWindow.locator(".monaco-dialog-box")).toHaveCount(0);
});

// ── SS2 — user list protects develop ───────────────────────────────────────────
test("SS2 protectedBranches:[develop] warns, names the branch, and commits on Yes", async ({ mainWindow }) => {
  const repo = workerRepo(test.info());
  git(repo, "checkout -b develop");
  setWorkspaceSettings(repo, { "hydragit.safety.protectedBranches": ["develop"] });

  const sb = await sidebar(mainWindow);
  await mainWindow.waitForTimeout(2000); // let the settings watcher pick up the file
  await stageAndCommit(sb, "test: protected develop");

  const dialog = mainWindow.locator(".monaco-dialog-box");
  await expect(dialog).toBeVisible({ timeout: 8000 });
  await expect(dialog).toContainText("committing directly to develop");
  await dialog.locator(".monaco-button", { hasText: "Yes" }).click();

  await expect(() => {
    expect(git(repo, "log -1 --format=%s")).toBe("test: protected develop");
  }).toPass({ timeout: 8000 });
});

// ── SS3 — custom list replaces the default ─────────────────────────────────────
test("SS3 a custom list without main/master silences the default warning", async ({ mainWindow }) => {
  const repo = workerRepo(test.info());
  // Stay on the fixture's default branch (main or master — both are in the
  // built-in list, so without the override this commit WOULD warn; see S10).
  setWorkspaceSettings(repo, { "hydragit.safety.protectedBranches": ["develop"] });

  const sb = await sidebar(mainWindow);
  await mainWindow.waitForTimeout(2000);
  await stageAndCommit(sb, "test: main no longer protected");

  await expect(() => {
    expect(git(repo, "log -1 --format=%s")).toBe("test: main no longer protected");
  }).toPass({ timeout: 8000 });
  await expect(mainWindow.locator(".monaco-dialog-box")).toHaveCount(0);
});
