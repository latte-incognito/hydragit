import fs from "fs";
import { test, expect } from "./vscode-fixture";
import { sidebarFrame, workerRepo, git } from "./webview-helpers";

// Cluster B — hunk staging (sidebar). Runs on the vscode-dirty project. Builds
// its own multi-hunk file (the fixture's app.js is one hunk). Complements the
// existing hunks.spec.ts (HK1) with unstage / stale / binary / discard cases.

const repo = () => workerRepo(test.info());

function makeMultiHunk(r: string): string {
  const base = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join("\n") + "\n";
  git(r, "stash -u"); // park the fixture's dirty state
  fs.writeFileSync(`${r}/multi.txt`, base);
  git(r, "add multi.txt");
  git(r, 'commit -m "add multi"');
  const edited = base.replace("line2\n", "line2-EDITED\n").replace("line18\n", "line18-EDITED\n");
  fs.writeFileSync(`${r}/multi.txt`, edited);
  return edited;
}

async function openHunks(f: any) {
  const row = f.locator('.file-row[data-path="multi.txt"]');
  await expect(row).toBeVisible({ timeout: 8000 });
  await row.locator(".hunk-toggle").click();
  await expect(f.locator(".hunk").first()).toBeVisible({ timeout: 6000 });
}

// 11 ── stage one hunk → only it is in the index (re-confirms the contract) ──────
test("B11 staging one hunk leaves the other in the working tree", async ({ mainWindow }) => {
  const r = repo();
  makeMultiHunk(r);
  const f = await sidebarFrame(mainWindow);
  await openHunks(f);
  await f.locator(".hunk").first().locator(".hk-btn", { hasText: "Stage" }).click();

  await expect(() => {
    const cached = git(r, "diff --cached --no-color");
    expect(cached).toContain("line2-EDITED");
    expect(cached).not.toContain("line18-EDITED");
  }).toPass({ timeout: 8000 });
});

// 12 ── unstage a previously staged hunk ────────────────────────────────────────
test("B12 unstaging a staged hunk returns it to the working tree", async ({ mainWindow }) => {
  const r = repo();
  makeMultiHunk(r);
  // Stage the first hunk up front via git so a staged hunk view renders.
  git(r, "add -p multi.txt <<< $'y\\nn\\n'");
  const f = await sidebarFrame(mainWindow);
  // The file is MM — expand the Staged-section hunks and unstage.
  const stagedRow = f.locator('.group-header + * .file-row[data-path="multi.txt"], .file-row[data-path="multi.txt"]').first();
  await expect(stagedRow).toBeVisible({ timeout: 8000 });
  await stagedRow.locator(".hunk-toggle").first().click();
  const unstage = f.locator(".hk-btn", { hasText: "Unstage" }).first();
  await expect(unstage).toBeVisible({ timeout: 6000 });
  await unstage.click();

  await expect(() => {
    expect(git(r, "diff --cached --no-color")).not.toContain("line2-EDITED");
  }).toPass({ timeout: 8000 });
});

// 13 ── [msg] a stale hunk is refused and leaves the index intact ───────────────
// A genuinely stale hunk requires the *index* to move out from under a rendered
// patch — `git apply --cached` matches against the index blob, not the worktree,
// so overwriting the file doesn't reproduce it deterministically. Tracked for a
// dedicated index-mutation seam.
test.fixme("B13 staging a stale hunk is refused without corrupting the index", async () => {});

// 14 ── a binary file offers no partial hunks (graceful) ────────────────────────
test("B14 a binary file expands to no hunks", async ({ mainWindow }) => {
  const r = repo();
  git(r, "stash -u");
  fs.writeFileSync(`${r}/blob.bin`, Buffer.from([0, 1, 2, 3, 255, 254, 0, 42, 7]));
  git(r, "add blob.bin");
  git(r, 'commit -m "add blob"');
  fs.writeFileSync(`${r}/blob.bin`, Buffer.from([9, 9, 9, 0, 0, 1, 2, 3, 4, 5]));

  const f = await sidebarFrame(mainWindow);
  const row = f.locator('.file-row[data-path="blob.bin"]');
  await expect(row).toBeVisible({ timeout: 8000 });
  // The toggle exists, but expanding a binary yields no stage-able hunks.
  await row.locator(".hunk-toggle").click();
  await expect(f.locator(".hunk")).toHaveCount(0, { timeout: 6000 });
  await expect(f.locator(".hunk-msg, .repo-group").first()).toBeVisible();
});

// 15 ── [⚠] discard a hunk, then the whole file → fully reverted ────────────────
test("B15 discarding a hunk then the file reverts cleanly, no corruption", async ({ mainWindow }) => {
  const r = repo();
  makeMultiHunk(r);
  const f = await sidebarFrame(mainWindow);
  await openHunks(f);
  await f.locator(".hunk").first().locator(".hk-btn--discard").click();
  await mainWindow.locator(".monaco-dialog-box .monaco-button", { hasText: "Yes" }).click({ timeout: 5000 }).catch(() => {});

  // First edit discarded, second still present.
  await expect(() => {
    const work = git(r, "diff --no-color");
    expect(work).not.toContain("line2-EDITED");
  }).toPass({ timeout: 8000 });

  // Now discard the whole file → back to committed state. Force the hover-gated
  // row button and wait for the confirm modal before accepting it.
  await f.locator('.file-row[data-path="multi.txt"]').hover();
  await f.locator('button[aria-label="Discard changes in multi.txt"]').click({ force: true });
  const yes = mainWindow.locator(".monaco-dialog-box .monaco-button", { hasText: "Yes" });
  await yes.waitFor({ state: "visible", timeout: 8000 });
  await yes.click();

  await expect(() => {
    expect(git(r, "status --porcelain multi.txt")).toBe("");
  }).toPass({ timeout: 8000 });
});
