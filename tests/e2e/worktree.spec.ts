import { test, expect } from "./vscode-fixture";
import { getWebviewFrame } from "./webview-helpers";
import { execSync } from "child_process";
import fs from "fs";

// WORKTREES section: lists the main working tree, picks up a worktree added by
// real git (the .git/worktrees + refs watcher → refresh), and exposes the
// per-worktree context menu. We never left-click a linked row in the test —
// that would spawn a second VS Code window.

function workerRepo(testInfo: any): string {
  const base = (testInfo.project.use as any).repoPath;
  return `${base}-w${testInfo.workerIndex}`;
}

function wtDir(testInfo: any): string {
  return `/tmp/hydragit-e2e-wt-w${testInfo.workerIndex}`;
}

async function main(page: any) {
  const f = await getWebviewFrame(page, "main");
  expect(f, "main webview frame").not.toBeNull();
  return f!;
}

test.describe("Worktrees section", () => {
  test.afterEach(async ({}, testInfo) => {
    const repo = workerRepo(testInfo);
    const dir = wtDir(testInfo);
    try {
      execSync(`git -C "${repo}" worktree remove --force "${dir}"`, { stdio: "pipe" });
    } catch {}
    try {
      execSync(`git -C "${repo}" worktree prune`, { stdio: "pipe" });
    } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("expands to show the main working tree", async ({ mainWindow }) => {
    const f = await main(mainWindow);
    await expect(f.locator(".crow").first()).toBeVisible({ timeout: 8000 });

    await f.locator(".tgroup-label", { hasText: "Worktrees" }).click();

    // Every repo has at least the main working tree, badged "main".
    await expect(f.locator(".titem.worktree")).toHaveCount(1, { timeout: 6000 });
    await expect(f.locator(".titem.worktree.current .track")).toHaveText("main");
  });

  test("picks up a worktree added by git and offers its context menu", async ({ mainWindow }, testInfo) => {
    const f = await main(mainWindow);
    await expect(f.locator(".crow").first()).toBeVisible({ timeout: 8000 });
    await f.locator(".tgroup-label", { hasText: "Worktrees" }).click();
    await expect(f.locator(".titem.worktree")).toHaveCount(1, { timeout: 6000 });

    // Real git worktree on a new branch — touches refs/heads + .git/worktrees,
    // which the panel's watcher catches → refresh → second row.
    const repo = workerRepo(testInfo);
    const dir = wtDir(testInfo);
    fs.rmSync(dir, { recursive: true, force: true });
    execSync(`git -C "${repo}" worktree add -b e2e-wt "${dir}"`, { stdio: "pipe" });

    await expect(f.locator(".titem.worktree")).toHaveCount(2, { timeout: 12000 });

    // Right-click the linked (non-main) row → the worktree context menu.
    const linked = f.locator(".titem.worktree:not(.current)").first();
    await linked.click({ button: "right" });
    await expect(f.locator(".ctx .ci", { hasText: "Open in New Window" })).toBeVisible({ timeout: 6000 });
    await expect(f.locator(".ctx .ci", { hasText: "Remove" })).toBeVisible();
  });

  test("the New-worktree button is present on the action rail", async ({ mainWindow }) => {
    const f = await main(mainWindow);
    await expect(f.locator(".crow").first()).toBeVisible({ timeout: 8000 });
    await expect(f.locator("button.rail-btn.worktree")).toBeVisible();
  });
});
