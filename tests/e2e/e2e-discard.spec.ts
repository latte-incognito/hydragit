import { execSync } from "child_process";
import fs from "fs";
import { test, expect } from "./vscode-fixture";
import { sidebarFrame, workerRepo, git } from "./webview-helpers";

// Cluster C — Discard (sidebar). Runs on the vscode-dirty project ("M app.js" +
// "?? NOTES.md"). Every discard auto-snapshots (refs/hydragit/snapshots), which
// we assert via real git.

const repo = () => workerRepo(test.info());

function snapshotCount(r: string): number {
  const out = git(r, "for-each-ref refs/hydragit/snapshots");
  return out ? out.split("\n").filter(Boolean).length : 0;
}

async function discardFile(f: any, mainWindow: any, fname: string) {
  await f.locator(`.file-row[data-path="${fname}"]`).hover();
  await f.locator(`button[aria-label="Discard changes in ${fname}"]`).click();
}

// 16 ── discard a single modified file → reverts + snapshot saved ───────────────
test("C16 discarding app.js reverts it and saves a snapshot", async ({ mainWindow }) => {
  const r = repo();
  const before = snapshotCount(r);
  const f = await sidebarFrame(mainWindow);
  await expect(f.locator('.file-row[data-path="app.js"]')).toBeVisible({ timeout: 8000 });

  await discardFile(f, mainWindow, "app.js");
  await mainWindow.locator(".monaco-dialog-box .monaco-button", { hasText: "Yes" }).click({ timeout: 5000 });

  await expect(() => {
    // app.js no longer differs from HEAD; a snapshot was taken first.
    expect(git(r, "status --porcelain app.js")).toBe("");
    expect(snapshotCount(r)).toBeGreaterThan(before);
  }).toPass({ timeout: 8000 });
});

// 17 ── bulk discard names the count in the confirm; clears the section ──────────
test("C17 bulk discard confirm names the file count", async ({ mainWindow }) => {
  const r = repo();
  const f = await sidebarFrame(mainWindow);
  await expect(f.locator('.file-row[data-path="app.js"]')).toBeVisible({ timeout: 8000 });

  // The Changes-section header carries a "Discard all" action.
  await f.locator(".tree-wrap").hover();
  await f.locator('button[aria-label^="Discard all"]').last().click();

  const dialog = mainWindow.locator(".monaco-dialog-box");
  await expect(dialog).toBeVisible({ timeout: 8000 });
  await expect(dialog).toContainText(/Discard changes in \d+ files/);
  await expect(dialog).toContainText(/snapshot/i);
  await dialog.locator(".monaco-button", { hasText: "Yes" }).click();

  await expect(() => {
    expect(git(r, "status --porcelain app.js")).toBe(""); // reverted
  }).toPass({ timeout: 8000 });
});

// 18 ── [−] discard is refused on a conflicted file ─────────────────────────────
test("C18 a conflicted file survives a bulk discard (skipped)", async ({ mainWindow }) => {
  const r = repo();
  // Commit the dirty state, then manufacture a real conflict.
  execSync(`git -C "${r}" add -A && git -C "${r}" commit -qm base`, { stdio: "pipe" });
  execSync(`git -C "${r}" checkout -qb other && printf 'theirs\\n' > c.txt && git -C "${r}" add c.txt && git -C "${r}" commit -qm theirs`, { stdio: "pipe" });
  execSync(`git -C "${r}" checkout -q - && printf 'mine\\n' > c.txt && git -C "${r}" add c.txt && git -C "${r}" commit -qm mine`, { stdio: "pipe" });
  execSync(`git -C "${r}" merge other || true`, { stdio: "pipe" });
  expect(git(r, "status --porcelain c.txt")).toContain("UU");

  const f = await sidebarFrame(mainWindow);
  await expect(f.locator('[data-path="c.txt"]').first()).toBeVisible({ timeout: 8000 });

  // Attempt a bulk discard — conflicted files are filtered out and stay conflicted.
  await f.locator(".tree-wrap").hover();
  await f.locator('button[aria-label^="Discard all"]').last().click().catch(() => {});
  await mainWindow.locator(".monaco-dialog-box .monaco-button", { hasText: "Yes" }).click({ timeout: 4000 }).catch(() => {});

  await expect(() => {
    expect(git(r, "status --porcelain c.txt")).toContain("UU"); // still conflicted
  }).toPass({ timeout: 8000 });
});

// 19 ── discard an untracked file deletes it; snapshot saved first ───────────────
test("C19 discarding an untracked file removes it and snapshots first", async ({ mainWindow }) => {
  const r = repo();
  const before = snapshotCount(r);
  const f = await sidebarFrame(mainWindow);
  await expect(f.locator('.file-row[data-path="NOTES.md"]')).toBeVisible({ timeout: 8000 });

  await discardFile(f, mainWindow, "NOTES.md");
  const dialog = mainWindow.locator(".monaco-dialog-box");
  await expect(dialog).toContainText(/untracked|removed from disk/i);
  await dialog.locator(".monaco-button", { hasText: "Yes" }).click();

  await expect(() => {
    expect(fs.existsSync(`${r}/NOTES.md`)).toBe(false);
    expect(snapshotCount(r)).toBeGreaterThan(before);
  }).toPass({ timeout: 8000 });
});

// 20 ── [⚠] cancelling the confirm changes nothing ──────────────────────────────
test("C20 cancelling the discard confirm leaves the file untouched", async ({ mainWindow }) => {
  const r = repo();
  const f = await sidebarFrame(mainWindow);
  await expect(f.locator('.file-row[data-path="app.js"]')).toBeVisible({ timeout: 8000 });

  await discardFile(f, mainWindow, "app.js");
  await mainWindow.locator(".monaco-dialog-box .monaco-button", { hasText: "No" }).click({ timeout: 5000 });

  // Still modified — nothing happened.
  expect(git(r, "status --porcelain app.js")).toContain("M app.js");
});
