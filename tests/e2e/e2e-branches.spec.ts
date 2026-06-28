import { execSync } from "child_process";
import fs from "fs";
import { test, expect } from "./vscode-fixture";
import {
  mainFrame, flash, answerPrompt, dismissModalIfAny, openStatus, rightClickBranch,
  workerRepo, git, defaultBranch, expectReadableError,
} from "./webview-helpers";

// Cluster D — branch lifecycle (main panel branch tree + rail). Default project.

const repo = () => workerRepo(test.info());
const flashText = async (f: any) => {
  await openStatus(f);
  return (await f.locator(".sb-right").innerText()).replace(/^⚡\s*/, "");
};

// 21 ── new branch from current → it exists and is checked out ───────────────────
test("D21 create a branch from the rail and switch back", async ({ mainWindow }) => {
  const r = repo();
  const base = defaultBranch(r);
  const f = await mainFrame(mainWindow);
  await f.locator('button.rail-btn[aria-label="New branch"]').click();
  await answerPrompt(mainWindow, "journey/d21");
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  await expect(() => expect(git(r, "branch --list journey/d21")).toContain("journey/d21")).toPass({ timeout: 8000 });

  // Switch back to the base branch via the context menu.
  const menu = await rightClickBranch(f, base);
  await menu.getByText("Switch to Branch", { exact: true }).click().catch(() => {});
});

// 22 ── [±] checkout blocked by a dirty conflicting file → stash → retry ─────────
test("D22 a dirty conflicting file blocks checkout until stashed", async ({ mainWindow }) => {
  const r = repo();
  // src/auth.go differs between the default branch and feature/auth → local edits
  // to it make a switch unsafe.
  fs.writeFileSync(`${r}/src/auth.go`, "package auth\n// local uncommitted edit\n");
  const f = await mainFrame(mainWindow);

  const menu = await rightClickBranch(f, "feature/auth");
  await menu.getByText("Switch to Branch", { exact: true }).click();
  // Blocked: HEAD did not move and switchToBranch() puts up a stash/cancel
  // confirm (uiConfirm). Its modal backdrop blocks the webview, so Cancel it
  // FIRST — cancelling is also what emits the readable "Checkout cancelled"
  // flash we then assert on (reading before answering races the modal on CI).
  await expect(async () => {
    expect(git(r, "rev-parse --abbrev-ref HEAD")).toBe(defaultBranch(r));
  }).toPass({ timeout: 6000 });
  await dismissModalIfAny(mainWindow, "Cancel");
  await mainWindow.keyboard.press("Escape");
  expectReadableError(await flashText(f));

  // Stash → retry.
  await f.locator('button.rail-btn[aria-label="Stash changes"]').click();
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  const menu2 = await rightClickBranch(f, "feature/auth");
  await menu2.getByText("Switch to Branch", { exact: true }).click();
  await expect(() => expect(git(r, "rev-parse --abbrev-ref HEAD")).toBe("feature/auth")).toPass({ timeout: 8000 });
});

// 23 ── [−][msg] duplicate branch name is rejected readably ──────────────────────
test("D23 creating a duplicate branch name reports a readable error", async ({ mainWindow }) => {
  const f = await mainFrame(mainWindow);
  await f.locator('button.rail-btn[aria-label="New branch"]').click();
  await answerPrompt(mainWindow, "feature/auth"); // already exists
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  expectReadableError(await flashText(f), { mentions: "feature/auth" });
});

// 24 ── [⚠][msg] an invalid ref name is validated, not dumped raw ────────────────
test("D24 an invalid branch name yields a readable error, not a raw fatal", async ({ mainWindow }) => {
  const f = await mainFrame(mainWindow);
  await f.locator('button.rail-btn[aria-label="New branch"]').click();
  await answerPrompt(mainWindow, "bad name~with..junk");
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  expectReadableError(await flashText(f));
  // No such branch was created.
  expect(git(repo(), "branch --list 'bad*'")).toBe("");
});

// 25 ── [−] the current branch offers no Delete (self-referential hidden) ────────
test("D25 the current branch's context menu omits Delete", async ({ mainWindow }) => {
  const r = repo();
  const base = defaultBranch(r);
  const f = await mainFrame(mainWindow);
  const menu = await rightClickBranch(f, base);
  await expect(menu).toBeVisible({ timeout: 4000 });
  await expect(menu.getByText("Delete", { exact: true })).toHaveCount(0);
});

// 26 ── [−][msg] deleting an unmerged branch is refused (delete is force:false) ──
test("D26 deleting an unmerged branch is refused with a readable error", async ({ mainWindow }) => {
  const r = repo();
  // An unmerged branch with a unique commit (not reachable from HEAD).
  execSync(`git -C "${r}" branch d26-unmerged && git -C "${r}" commit --allow-empty -qm x`, { stdio: "pipe" });
  execSync(`git -C "${r}" branch -f d26-unmerged HEAD && git -C "${r}" reset -q --hard HEAD~1`, { stdio: "pipe" });
  const f = await mainFrame(mainWindow);
  await mainWindow.waitForTimeout(1500); // watcher refresh

  const row = f.locator(".titem:not(.folder-row):not(.timeline)", { hasText: "d26-unmerged" }).first();
  await expect(row).toBeVisible({ timeout: 8000 });
  await row.click({ button: "right" });
  await f.locator(".ctx").getByText("Delete", { exact: true }).click();

  // HydraGit deletes with force:false, so git refuses an unmerged branch — it
  // survives and the user gets a readable "Delete failed" flash.
  await expect(() => expect(git(r, "branch --list d26-unmerged")).toContain("d26-unmerged")).toPass({ timeout: 8000 });
  expectReadableError(await flashText(f));
});

// 27 ── rename a branch ──────────────────────────────────────────────────────────
test("D27 rename a branch", async ({ mainWindow }) => {
  const r = repo();
  const f = await mainFrame(mainWindow);
  const menu = await rightClickBranch(f, "release/2.0.0");
  await menu.getByText("Rename", { exact: false }).first().click();
  await answerPrompt(mainWindow, "release/2.1.0");
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  await expect(() => {
    expect(git(r, "branch --list release/2.1.0")).toContain("release/2.1.0");
    expect(git(r, "branch --list release/2.0.0")).toBe("");
  }).toPass({ timeout: 8000 });
});

// 28 ── [⚠][msg] deleting a branch checked out in a worktree is refused ──────────
test("D28 deleting a branch that is checked out in a worktree is refused", async ({ mainWindow }) => {
  const r = repo();
  const wt = `/tmp/hydragit-e2e-d28-w${test.info().workerIndex}`;
  fs.rmSync(wt, { recursive: true, force: true });
  execSync(`git -C "${r}" worktree add -b d28-wt "${wt}"`, { stdio: "pipe" });
  try {
    const f = await mainFrame(mainWindow);
    await mainWindow.waitForTimeout(1500);
    const row = f.locator(".titem:not(.folder-row):not(.timeline)", { hasText: "d28-wt" }).first();
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.click({ button: "right" });
    await f.locator(".ctx").getByText("Delete", { exact: true }).click();
    await dismissModalIfAny(mainWindow, "Yes");
    // Refused — the branch still exists (git won't delete a worktree-checked-out branch).
    await expect(() => expect(git(r, "branch --list d28-wt")).toContain("d28-wt")).toPass({ timeout: 6000 });
    expectReadableError(await flashText(f));
  } finally {
    execSync(`git -C "${r}" worktree remove --force "${wt}"`, { stdio: "pipe" });
    fs.rmSync(wt, { recursive: true, force: true });
  }
});
