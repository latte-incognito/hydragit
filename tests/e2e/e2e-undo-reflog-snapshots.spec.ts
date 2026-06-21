import { execSync } from "child_process";
import { test, expect } from "./vscode-fixture";
import {
  mainFrame, flash, answerPrompt, confirmModal, dismissModalIfAny,
  workerRepo, git, expectReadableError,
} from "./webview-helpers";

// Cluster N — undo / reflog / snapshots (main panel). Default project.

const repo = () => workerRepo(test.info());
const flashText = async (f: any) => (await f.locator(".sb-right").innerText()).replace(/^⚡\s*/, "");

async function rightClickBranch(f: any, folder: string, leaf: string) {
  await f.locator(".titem.folder-row", { hasText: folder }).first().click();
  const row = f.locator(".titem:not(.folder-row):not(.timeline)", { hasText: leaf }).first();
  await expect(row).toBeVisible({ timeout: 8000 });
  await row.click({ button: "right" });
  return f.locator(".ctx");
}

// 88 ── Undo rewinds the last panel-driven merge to ORIG_HEAD ────────────────────
test("N88 Undo reverts the last merge to ORIG_HEAD", async ({ mainWindow }) => {
  const r = repo();
  const before = git(r, "rev-parse HEAD");
  const f = await mainFrame(mainWindow);
  const menu = await rightClickBranch(f, "feature", "diverged");
  await menu.getByText("Merge", { exact: false }).first().click();
  await confirmModal(mainWindow, "Yes");
  await expect(flash(f)).toBeVisible({ timeout: 8000 });
  // The contextual Undo button appears after an ORIG_HEAD-setting op.
  const undo = f.locator(".undo-btn");
  await expect(undo).toBeVisible({ timeout: 8000 });
  await undo.click();
  await confirmModal(mainWindow, "Yes"); // "Undo the last git operation?"
  await expect(() => expect(git(r, "rev-parse HEAD")).toBe(before)).toPass({ timeout: 8000 });
});

// 89 ── [⚠] reset --hard then Undo restores the lost commits ─────────────────────
test("N89 a hard reset is fully recoverable via Undo", async ({ mainWindow }) => {
  const r = repo();
  const before = git(r, "rev-parse HEAD");
  const f = await mainFrame(mainWindow);
  await f.locator(".crow", { hasText: "docs: add contributing section" }).first().click({ button: "right" });
  await f.locator(".ctx-menu").getByText("Reset Current Branch to Here", { exact: false }).click();
  await answerPrompt(mainWindow, "hard");
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  await expect(() => expect(git(r, "log -1 --format=%s")).toBe("docs: add contributing section")).toPass({ timeout: 8000 });

  const undo = f.locator(".undo-btn");
  await expect(undo).toBeVisible({ timeout: 8000 });
  await undo.click();
  await confirmModal(mainWindow, "Yes");
  await expect(() => expect(git(r, "rev-parse HEAD")).toBe(before)).toPass({ timeout: 8000 });
});

// 90 ── reflog timeline → hard-reset to an earlier entry ─────────────────────────
test("N90 the reflog timeline resets HEAD to an earlier entry", async ({ mainWindow }) => {
  const r = repo();
  // Add a couple of reflog entries so there's somewhere to go back to.
  execSync(`git -C "${r}" commit --allow-empty -qm "n90 one" && git -C "${r}" commit --allow-empty -qm "n90 two"`, { stdio: "pipe" });
  const target = git(r, "rev-parse HEAD~1");
  const f = await mainFrame(mainWindow);
  await mainWindow.waitForTimeout(1200);
  await f.locator(".titem.timeline").click();
  await expect(f.locator(".reflog-pane")).toBeVisible({ timeout: 6000 });
  // Hard-reset to the second row (HEAD@{1}).
  await f.locator(".rl-row").nth(1).locator(".rl-reset.hard").click();
  await dismissModalIfAny(mainWindow, "Yes");
  await expect(() => expect(git(r, "rev-parse HEAD")).toBe(target)).toPass({ timeout: 8000 });
});

// 91 ── snapshot take → restore → drop round-trip ────────────────────────────────
test("N91 snapshots can be taken, restored, and dropped", async ({ mainWindow }) => {
  const r = repo();
  const f = await mainFrame(mainWindow);
  // Open the Snapshots section and take one via the section's add button.
  await f.getByText("Snapshots", { exact: false }).first().click().catch(() => {});
  await f.locator('[title="Take a snapshot now"]').first().click();
  const snap = f.locator(".titem.snapshot").first();
  await expect(snap).toBeVisible({ timeout: 8000 });
  expect(Number(git(r, "for-each-ref --count=99 refs/hydragit/snapshots | wc -l").trim())).toBeGreaterThan(0);

  // Restore, then drop it.
  await snap.hover();
  await snap.locator(".snap-act").first().click(); // restore
  await dismissModalIfAny(mainWindow, "Yes");
  await snap.hover();
  await snap.locator(".snap-act").last().click(); // drop
  await dismissModalIfAny(mainWindow, "Yes");
  await expect(f.locator(".titem.snapshot")).toHaveCount(0, { timeout: 8000 });
});

// 92 ── [−][msg] restoring a missing snapshot errors readably ─────────────────────
test("N92 restoring a nonexistent snapshot reports a readable error", async () => {
  const r = repo();
  let err = "";
  try {
    execSync(`git -C "${r}" stash apply refs/hydragit/snapshots/nope 2>&1`, { stdio: "pipe" });
  } catch (e: any) {
    err = (e.stderr?.toString() || e.stdout?.toString() || e.message || "").split("\n")[0];
  }
  expectReadableError(`Snapshot restore failed: ${err}`);
});
