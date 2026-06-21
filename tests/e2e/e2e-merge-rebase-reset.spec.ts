import { execSync } from "child_process";
import { test, expect } from "./vscode-fixture";
import {
  mainFrame, sidebarFrame, flash, answerPrompt, confirmModal, dismissModalIfAny,
  openStatus, rightClickBranch,
  workerRepo, git, defaultBranch, expectReadableError,
} from "./webview-helpers";

// Cluster E — merge / rebase / reset (main panel). Default project.

const repo = () => workerRepo(test.info());
const flashText = async (f: any) => {
  await openStatus(f);
  return (await f.locator(".sb-right").innerText()).replace(/^⚡\s*/, "");
};

// 29 ── clean fast-forward merge advances HEAD without a merge commit ────────────
test("E29 a fast-forward merge advances HEAD by one, no merge commit", async ({ mainWindow }) => {
  const r = repo();
  const base = defaultBranch(r);
  // A strictly-ahead branch off HEAD → its merge is a fast-forward.
  execSync(`git -C "${r}" branch e29-ff && git -C "${r}" checkout -q e29-ff && git -C "${r}" commit --allow-empty -qm "ff commit" && git -C "${r}" checkout -q ${base}`, { stdio: "pipe" });
  const beforeCount = Number(git(r, "rev-list --count HEAD"));
  const f = await mainFrame(mainWindow);
  await mainWindow.waitForTimeout(1500);

  const menu = await rightClickBranch(f, "e29-ff");
  await menu.getByText("Merge", { exact: false }).first().click();
  await dismissModalIfAny(mainWindow, "Yes"); // merge preview confirm

  await expect(() => {
    expect(git(r, "log -1 --format=%s")).toBe("ff commit");
    expect(Number(git(r, "rev-list --count HEAD"))).toBe(beforeCount + 1);
    expect(git(r, "rev-list --parents -1 HEAD").trim().split(/\s+/).length).toBe(2); // 1 sha + 1 parent
  }).toPass({ timeout: 10000 });
});

// 30 ── non-FF merge creates a merge commit ──────────────────────────────────────
test("E30 a non-fast-forward merge creates a merge commit", async ({ mainWindow }) => {
  const r = repo();
  const f = await mainFrame(mainWindow);
  const menu = await rightClickBranch(f, "feature/diverged");
  await menu.getByText("Merge", { exact: false }).first().click();
  await confirmModal(mainWindow, "Yes");
  await expect(flash(f)).toBeVisible({ timeout: 8000 });
  await expect(() => {
    git(r, "merge-base --is-ancestor feature/diverged HEAD"); // throws if not merged
    expect(git(r, "rev-list --parents -1 HEAD").trim().split(/\s+/).length).toBeGreaterThanOrEqual(3); // merge commit
  }).toPass({ timeout: 10000 });
});

// 31 ── [−][msg] merging a nonexistent branch errors readably ────────────────────
test("E31 merging a nonexistent branch reports a readable error", async ({ mainWindow }) => {
  const r = repo();
  const head = git(r, "rev-parse HEAD");
  const f = await mainFrame(mainWindow);
  await openStatus(f); // keep the status bar open so the error flash is readable
  await f.locator('button.rail-btn[aria-label="Merge branch"]').click();
  await answerPrompt(mainWindow, "no-such-branch-xyz");
  await expect(async () => expectReadableError(await flashText(f))).toPass({ timeout: 8000 });
  expect(git(r, "rev-parse HEAD")).toBe(head); // nothing happened
});

// 32 ── merge preview (dry-run) shows before committing to the merge ─────────────
test("E32 the merge preview modal appears and can be cancelled", async ({ mainWindow }) => {
  const r = repo();
  const head = git(r, "rev-parse HEAD");
  const f = await mainFrame(mainWindow);
  const menu = await rightClickBranch(f, "feature/diverged");
  await menu.getByText("Merge", { exact: false }).first().click();
  const dialog = mainWindow.locator(".monaco-dialog-box");
  await expect(dialog).toBeVisible({ timeout: 8000 });
  await confirmModal(mainWindow, "Cancel"); // decline
  expect(git(r, "rev-parse HEAD")).toBe(head);
});

// 33 ── rebase onto another branch (clean) ───────────────────────────────────────
test("E33 rebase the current branch onto another, cleanly", async ({ mainWindow }) => {
  const r = repo();
  const base = defaultBranch(r);
  // Work branch off an older point so a rebase actually replays.
  execSync(`git -C "${r}" checkout -q -b e33-work HEAD~1 && git -C "${r}" commit --allow-empty -qm "work on e33"`, { stdio: "pipe" });
  const f = await mainFrame(mainWindow);
  await f.locator('button.rail-btn[aria-label="Rebase"]').click();
  await answerPrompt(mainWindow, base);
  await expect(flash(f)).toBeVisible({ timeout: 8000 });
  await expect(() => {
    git(r, `merge-base --is-ancestor ${base} HEAD`); // base now an ancestor → rebased on top
  }).toPass({ timeout: 10000 });
});

// 34/35 ── rebase pauses on conflict → abort restores ────────────────────────────
test("E35 a conflicting rebase pauses and Abort restores the branch", async ({ mainWindow }) => {
  const r = repo();
  const base = defaultBranch(r);
  // Two branches edit the same file → rebasing one onto the other conflicts.
  execSync(`git -C "${r}" checkout -q ${base} && printf 'A\\n' > "${r}/e35.txt" && git -C "${r}" add e35.txt && git -C "${r}" commit -qm "base e35"`, { stdio: "pipe" });
  execSync(`git -C "${r}" checkout -q -b e35-feat && printf 'FEAT\\n' > "${r}/e35.txt" && git -C "${r}" commit -qam "feat e35"`, { stdio: "pipe" });
  execSync(`git -C "${r}" checkout -q ${base} && printf 'MAIN\\n' > "${r}/e35.txt" && git -C "${r}" commit -qam "main e35"`, { stdio: "pipe" });
  execSync(`git -C "${r}" checkout -q e35-feat`, { stdio: "pipe" });
  const before = git(r, "rev-parse HEAD");

  const f = await mainFrame(mainWindow);
  await mainWindow.waitForTimeout(1500);
  await f.locator('button.rail-btn[aria-label="Rebase"]').click();
  await answerPrompt(mainWindow, base);

  // Paused mid-rebase — the conflict banner surfaces in the sidebar. Abort there.
  const sb = await sidebarFrame(mainWindow);
  await expect(sb.locator(".cb")).toBeVisible({ timeout: 12000 });
  await expect(sb.locator(".cb-title")).toContainText(/rebase/i);
  await sb.locator(".cb-abort").click();

  await expect(() => {
    expect(git(r, "status --porcelain")).not.toContain("UU");
    expect(git(r, "rev-parse HEAD")).toBe(before); // branch restored
  }).toPass({ timeout: 8000 });
});

// 36 ── reset to a commit via the mode prompt ────────────────────────────────────
test("E36 reset the branch to an earlier commit (mode prompt)", async ({ mainWindow }) => {
  const r = repo();
  const f = await mainFrame(mainWindow);
  await f.locator(".crow", { hasText: "docs: add contributing section" }).first().click({ button: "right" });
  await f.locator(".ctx-menu").getByText("Reset Current Branch to Here", { exact: false }).click();
  await answerPrompt(mainWindow, "mixed");
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  await expect(() => expect(git(r, "log -1 --format=%s")).toBe("docs: add contributing section")).toPass({ timeout: 8000 });
});
