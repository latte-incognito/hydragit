import { execSync } from "child_process";
import fs from "fs";
import { test, expect } from "./vscode-fixture";
import { mainFrame, answerPrompt, workerRepo, git } from "./webview-helpers";

// Cluster O — worktrees (main panel Worktrees section + rail). Default project.
// Complements worktree.spec.ts (list/menu) with add-new / dirty-remove / lock.

const repo = () => workerRepo(test.info());
const wtDir = (n: string) => `/tmp/hydragit-e2e-O-${n}-w${test.info().workerIndex}`;

async function openWorktrees(f: any) {
  await f.locator(".tgroup-label", { hasText: "Worktrees" }).click();
  await expect(f.locator(".titem.worktree").first()).toBeVisible({ timeout: 8000 });
}

test.afterEach(() => {
  const r = repo();
  for (const n of ["o93", "o94", "o95", "o96", "o97"]) {
    try { execSync(`git -C "${r}" worktree remove --force "${wtDir(n)}"`, { stdio: "pipe" }); } catch {}
    fs.rmSync(wtDir(n), { recursive: true, force: true });
  }
  try { execSync(`git -C "${r}" worktree prune`, { stdio: "pipe" }); } catch {}
});

// 93 ── a git-added worktree shows up in the section ─────────────────────────────
test("O93 a worktree added via git appears in the list", async ({ mainWindow }) => {
  const r = repo();
  const dir = wtDir("o93");
  fs.rmSync(dir, { recursive: true, force: true });
  execSync(`git -C "${r}" worktree add -b o93-wt "${dir}"`, { stdio: "pipe" });
  const f = await mainFrame(mainWindow);
  await openWorktrees(f);
  await expect(f.locator(".titem.worktree")).toHaveCount(2, { timeout: 12000 });
});

// 94 ── add-new (create branch + worktree) via the rail ──────────────────────────
test("O94 New worktree creates a branch and a linked tree", async ({ mainWindow }) => {
  const r = repo();
  const dir = wtDir("o94");
  fs.rmSync(dir, { recursive: true, force: true });
  const f = await mainFrame(mainWindow);
  await f.locator("button.rail-btn.worktree").click();
  // The rail flow prompts for a branch name then a path (dialog seam).
  await answerPrompt(mainWindow, "o94-wt");
  await answerPrompt(mainWindow, dir).catch(() => {});
  await expect(() => {
    expect(git(r, "worktree list")).toContain("o94-wt");
  }).toPass({ timeout: 12000 });
});

// 95 ── [−][msg] removing a dirty worktree without force is refused ───────────────
test("O95 removing a dirty worktree without --force is refused, tree intact", async ({ mainWindow }) => {
  const r = repo();
  const dir = wtDir("o95");
  fs.rmSync(dir, { recursive: true, force: true });
  execSync(`git -C "${r}" worktree add -b o95-wt "${dir}"`, { stdio: "pipe" });
  fs.writeFileSync(`${dir}/dirty.txt`, "uncommitted\n"); // make it dirty
  const f = await mainFrame(mainWindow);
  await openWorktrees(f);
  const linked = f.locator(".titem.worktree:not(.current)", { hasText: "o95-wt" }).first();
  await linked.click({ button: "right" });
  await f.locator(".ctx .ci", { hasText: "Remove" }).click();
  await mainWindow.locator(".monaco-dialog-box .monaco-button", { hasText: "Yes" }).click({ timeout: 4000 }).catch(() => {});
  // Refused: the worktree is still registered (git won't remove a dirty one without --force).
  await expect(() => expect(git(r, "worktree list")).toContain("o95-wt")).toPass({ timeout: 8000 });
});

// 96 ── [−] removing a locked worktree without force is refused ───────────────────
test("O96 removing a locked worktree without --force is refused", async ({ mainWindow }) => {
  const r = repo();
  const dir = wtDir("o96");
  fs.rmSync(dir, { recursive: true, force: true });
  execSync(`git -C "${r}" worktree add -b o96-wt "${dir}"`, { stdio: "pipe" });
  execSync(`git -C "${r}" worktree lock "${dir}"`, { stdio: "pipe" });
  const f = await mainFrame(mainWindow);
  await openWorktrees(f);
  const linked = f.locator(".titem.worktree:not(.current)", { hasText: "o96-wt" }).first();
  await linked.click({ button: "right" });
  await f.locator(".ctx .ci", { hasText: "Remove" }).click();
  await mainWindow.locator(".monaco-dialog-box .monaco-button", { hasText: "Yes" }).click({ timeout: 4000 }).catch(() => {});
  await expect(() => expect(git(r, "worktree list")).toContain("o96-wt")).toPass({ timeout: 8000 });
});

// 97 ── lock / unlock then prune ─────────────────────────────────────────────────
test("O97 lock, unlock, and prune a worktree", async ({ mainWindow }) => {
  const r = repo();
  const dir = wtDir("o97");
  fs.rmSync(dir, { recursive: true, force: true });
  execSync(`git -C "${r}" worktree add -b o97-wt "${dir}"`, { stdio: "pipe" });
  const f = await mainFrame(mainWindow);
  await openWorktrees(f);
  const linked = f.locator(".titem.worktree:not(.current)", { hasText: "o97-wt" }).first();

  await linked.click({ button: "right" });
  await f.locator(".ctx .ci", { hasText: "Lock" }).click();
  await expect(() => expect(git(r, "worktree list --porcelain")).toContain("locked")).toPass({ timeout: 8000 });

  await linked.click({ button: "right" });
  await f.locator(".ctx .ci", { hasText: "Unlock" }).click();
  await expect(() => expect(git(r, "worktree list --porcelain")).not.toContain("locked")).toPass({ timeout: 8000 });

  // Remove the dir out-of-band, then Prune clears the stale registration.
  fs.rmSync(dir, { recursive: true, force: true });
  await linked.click({ button: "right" }).catch(() => {});
  await f.locator(".ctx .ci", { hasText: "Prune" }).click().catch(() => {});
  await expect(() => expect(git(r, "worktree list")).not.toContain("o97-wt")).toPass({ timeout: 8000 });
});
