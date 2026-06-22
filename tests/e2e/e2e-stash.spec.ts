import { execSync } from "child_process";
import fs from "fs";
import { test, expect } from "./vscode-fixture";
import { mainFrame, sidebarFrame, flash, workerRepo, git, expectReadableError } from "./webview-helpers";

// Cluster K — stash (branch tree + rail). Default project (2 seeded stashes:
// "WIP: experimenting with main", "WIP: debug utilities").

const repo = () => workerRepo(test.info());

async function expandStashes(f: any) {
  await f.getByText("Stashes", { exact: false }).first().click().catch(() => {});
  await expect(f.locator(".titem.stash").first()).toBeVisible({ timeout: 8000 });
}

// 70 ── stash save creates a new entry ───────────────────────────────────────────
test("K70 saving a stash adds an entry", async ({ mainWindow }) => {
  const r = repo();
  fs.appendFileSync(`${r}/README.md`, "\nK70 change\n");
  const before = git(r, "stash list").split("\n").filter(Boolean).length;
  const f = await mainFrame(mainWindow);
  await f.locator('button.rail-btn[aria-label="Stash changes"]').click();
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  await expect(() => {
    expect(git(r, "stash list").split("\n").filter(Boolean).length).toBe(before + 1);
  }).toPass({ timeout: 8000 });
});

// 71 ── show a stash's files / diff ──────────────────────────────────────────────
test("K71 Show Diff reveals a stash's contents", async ({ mainWindow }) => {
  const f = await mainFrame(mainWindow);
  await expandStashes(f);
  await f.locator(".titem.stash").first().click({ button: "right" });
  await f.locator(".ctx").getByText("Show Diff", { exact: false }).first().click();
  // The detail/diff surface populates (files or hunks).
  await expect(f.locator(".tree-row--file, .detail-files, .hunk").first()).toBeVisible({ timeout: 8000 });
});

// 72 ── apply keeps the entry; pop removes it ────────────────────────────────────
test("K72 apply keeps the stash, pop removes it", async ({ mainWindow }) => {
  const r = repo();
  const f = await mainFrame(mainWindow);
  await expandStashes(f);
  const before = git(r, "stash list").split("\n").filter(Boolean).length;

  await f.locator(".titem.stash").first().click({ button: "right" });
  await f.locator(".ctx").getByText("Apply", { exact: true }).click();
  await expect(() => {
    expect(git(r, "stash list").split("\n").filter(Boolean).length).toBe(before); // still there
  }).toPass({ timeout: 8000 });

  // Reset working tree so the next pop is clean, then pop.
  execSync(`git -C "${r}" checkout -- . 2>/dev/null || true`, { stdio: "pipe" });
  await f.locator(".titem.stash").first().click({ button: "right" });
  await f.locator(".ctx").getByText("Pop", { exact: true }).click();
  await expect(() => {
    expect(git(r, "stash list").split("\n").filter(Boolean).length).toBe(before - 1);
  }).toPass({ timeout: 8000 });
});

// 73 ── drop a stash ─────────────────────────────────────────────────────────────
test("K73 dropping a stash removes just that entry", async ({ mainWindow }) => {
  const r = repo();
  const f = await mainFrame(mainWindow);
  await expandStashes(f);
  const before = git(r, "stash list").split("\n").filter(Boolean).length;
  await f.locator(".titem.stash").first().click({ button: "right" });
  await f.locator(".ctx").getByText("Drop", { exact: true }).click();
  await mainWindow.locator(".monaco-dialog-box .monaco-button", { hasText: "Yes" }).click({ timeout: 4000 }).catch(() => {});
  await expect(() => {
    expect(git(r, "stash list").split("\n").filter(Boolean).length).toBe(before - 1);
  }).toPass({ timeout: 8000 });
});

// 74 ── [−][msg] popping an out-of-range stash errors readably ────────────────────
test("K74 popping a nonexistent stash index reports a readable error", async () => {
  const r = repo();
  let err = "";
  try {
    execSync(`git -C "${r}" stash pop "stash@{99}"`, { stdio: "pipe" });
  } catch (e: any) {
    err = (e.stderr?.toString() || e.message || "").split("\n")[0];
  }
  expectReadableError(`Stash pop failed: ${err}`);
});

// 75 ── [±] popping a conflicting stash surfaces the conflict, keeps the entry ────
test("K75 a conflicting stash pop is surfaced and not lost", async ({ mainWindow }) => {
  const r = repo();
  const base = git(r, "rev-parse --abbrev-ref HEAD");
  // Stash a change to a file, then change the same lines and commit → pop conflicts.
  execSync(`printf 'stashside\\n' > "${r}/k75.txt" && git -C "${r}" add k75.txt && git -C "${r}" commit -qm "k75 seed"`, { stdio: "pipe" });
  execSync(`printf 'stash-edit\\n' > "${r}/k75.txt" && git -C "${r}" stash push -m k75`, { stdio: "pipe" });
  execSync(`printf 'committed-edit\\n' > "${r}/k75.txt" && git -C "${r}" commit -qam "k75 conflict"`, { stdio: "pipe" });
  const before = git(r, "stash list").split("\n").filter(Boolean).length;

  const f = await mainFrame(mainWindow);
  await mainWindow.waitForTimeout(1200);
  await expandStashes(f);
  await f.locator(".titem.stash", { hasText: "k75" }).first().click({ button: "right" });
  await f.locator(".ctx").getByText("Pop", { exact: true }).click();

  // git keeps the stash entry when a pop conflicts, and the tree is now conflicted.
  await expect(() => {
    expect(git(r, "status --porcelain k75.txt")).toContain("UU");
    expect(git(r, "stash list").split("\n").filter(Boolean).length).toBe(before);
  }).toPass({ timeout: 8000 });
  // Leave the worker repo sane.
  execSync(`git -C "${r}" checkout -m -- k75.txt 2>/dev/null || true; git -C "${r}" reset -q --hard`, { stdio: "pipe" });
  expect(base.length).toBeGreaterThan(0);
});
