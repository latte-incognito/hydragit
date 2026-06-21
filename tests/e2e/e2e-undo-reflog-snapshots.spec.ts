import { execSync } from "child_process";
import fs from "fs";
import { test, expect } from "./vscode-fixture";
import {
  mainFrame, flash, answerPrompt, confirmModal, dismissModalIfAny,
  workerRepo, git, expectReadableError,
} from "./webview-helpers";

// Cluster N — undo / reflog / snapshots (main panel). Default project.

const repo = () => workerRepo(test.info());

// 88 ── Undo rewinds the last panel-driven merge to ORIG_HEAD ────────────────────
test("N88 Undo reverts the last merge to ORIG_HEAD", async ({ mainWindow }) => {
  const r = repo();
  const before = git(r, "rev-parse HEAD");
  const f = await mainFrame(mainWindow);
  // The contextual Undo button only appears for a *rail*-driven op (the rail
  // merge sets undoableOp; the context-menu merge does not). So merge via the rail.
  await f.locator('button.rail-btn[aria-label="Merge branch"]').click();
  await answerPrompt(mainWindow, "feature/diverged");
  await confirmModal(mainWindow, "Yes"); // rail merge shows a merge-preview confirm
  await expect(flash(f)).toBeVisible({ timeout: 8000 });
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
  await confirmModal(mainWindow, "Yes"); // hard mode asks a second confirm ("Hard reset to …?")
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
  // SnapshotCreate is a deliberate no-op on a clean tree ("nothing to lose"), so
  // make a working-tree change first — otherwise no snapshot is recorded.
  fs.writeFileSync(`${r}/README.md`, "# Test Project\n\nN91 snapshot change\n");
  const f = await mainFrame(mainWindow);
  // Open the Snapshots section, then take one via its add button. The +button is
  // visibility:hidden until the *header* (.tgroup-hdr) is hovered, so scope to it.
  const hdr = f.locator(".tgroup-hdr", { hasText: "Snapshots" }).first();
  await hdr.click(); // expand
  // The +button is visibility:hidden until header hover, so force-click hit-tests
  // to the element behind it — dispatchEvent fires its onclick directly.
  await hdr.locator(".tgroup-add").dispatchEvent("click");
  await answerPrompt(mainWindow, "e2e snapshot"); // newSnapshot() prompts for a label
  const snap = f.locator(".titem.snapshot").first();
  await expect(snap).toBeVisible({ timeout: 8000 });
  expect(Number(git(r, "for-each-ref --count=99 refs/hydragit/snapshots | wc -l").trim())).toBeGreaterThan(0);

  // Restore (confirm). Restore deliberately takes a *safety* snapshot of the
  // current state first, so the count grows — assert that, then drop one and
  // confirm the count goes back down. (.snap-act is display:none until row hover →
  // dispatchEvent fires its onclick directly.)
  await snap.locator(".snap-act").first().dispatchEvent("click"); // restore
  await confirmModal(mainWindow, "Yes");
  await expect(flash(f)).toBeVisible({ timeout: 8000 });

  const beforeDrop = await f.locator(".titem.snapshot").count();
  expect(beforeDrop).toBeGreaterThanOrEqual(1);
  await f.locator(".titem.snapshot").first().locator(".snap-act").last().dispatchEvent("click"); // drop
  await confirmModal(mainWindow, "Yes");
  await expect(f.locator(".titem.snapshot")).toHaveCount(beforeDrop - 1, { timeout: 8000 });
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
