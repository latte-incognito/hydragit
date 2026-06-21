import { execSync } from "child_process";
import fs from "fs";
import { test, expect } from "./vscode-fixture";
import {
  mainFrame, flash, confirmModal, dismissModalIfAny,
  workerRepo, git, defaultBranch, pushFromClone, expectReadableError,
} from "./webview-helpers";

// Cluster L — sync / remote (incl. conflicts). Default project, which wires a
// bare `origin` with an upstream on the default branch (create-test-repo.sh).
// workers:1 keeps the shared remote isolated per test (repo is rebuilt per test).

const repo = () => workerRepo(test.info());
const flashText = async (f: any) => (await f.locator(".sb-right").innerText()).replace(/^⚡\s*/, "");
const pill = (f: any, label: string) => f.locator(".sb-pill", { hasText: label }).first();
async function railFetch(f: any) {
  await f.locator('button.rail-btn[aria-label="Fetch"]').click();
  await expect(flash(f)).toBeVisible({ timeout: 8000 });
}

// 76 ── publish a branch with no upstream ────────────────────────────────────────
test("L76 Publish sets the upstream on a fresh branch", async ({ mainWindow }) => {
  const r = repo();
  execSync(`git -C "${r}" checkout -q -b pub76`, { stdio: "pipe" });
  const f = await mainFrame(mainWindow);
  await mainWindow.waitForTimeout(3500); // status poll picks up the new branch
  await expect(pill(f, "Publish")).toBeVisible({ timeout: 8000 });
  await pill(f, "Publish").click();
  await expect(() => expect(git(r, "rev-parse --abbrev-ref pub76@{u}")).toBe("origin/pub76")).toPass({ timeout: 12000 });
});

// 77 ── push ahead commits → ahead reaches 0 ─────────────────────────────────────
test("L77 the Push pill pushes ahead commits", async ({ mainWindow }) => {
  const r = repo();
  execSync(`git -C "${r}" commit --allow-empty -qm "L77 ahead"`, { stdio: "pipe" });
  const f = await mainFrame(mainWindow);
  await mainWindow.waitForTimeout(3500);
  await expect(pill(f, "Push")).toBeVisible({ timeout: 8000 });
  await pill(f, "Push").click();
  await dismissModalIfAny(mainWindow, "Yes");
  await expect(() => expect(git(r, "rev-list --count @{u}..HEAD")).toBe("0")).toPass({ timeout: 12000 });
});

// 78 ── pull when behind → behind reaches 0 ──────────────────────────────────────
test("L78 the Pull pill pulls incoming commits", async ({ mainWindow }) => {
  const r = repo();
  pushFromClone(r, defaultBranch(r), "incoming78.txt", "from teammate\n");
  const f = await mainFrame(mainWindow);
  await railFetch(f); // local must learn the remote moved
  await mainWindow.waitForTimeout(2500);
  await expect(pill(f, "Pull")).toBeVisible({ timeout: 8000 });
  await pill(f, "Pull").click();
  await dismissModalIfAny(mainWindow, "Yes");
  await expect(() => {
    expect(git(r, "rev-list --count HEAD..@{u}")).toBe("0");
    expect(fs.existsSync(`${r}/incoming78.txt`)).toBe(true);
  }).toPass({ timeout: 12000 });
});

// 79 ── [±] a non-FF push is rejected and surfaces a choice ──────────────────────
test("L79 a non-fast-forward push is surfaced, not silently dropped", async ({ mainWindow }) => {
  const r = repo();
  pushFromClone(r, defaultBranch(r), "other79.txt", "theirs\n");
  execSync(`git -C "${r}" commit --allow-empty -qm "mine 79"`, { stdio: "pipe" });
  const f = await mainFrame(mainWindow);
  await railFetch(f);
  await mainWindow.waitForTimeout(2500);
  // Pushing now is non-FF: the host offers force-with-lease (or surfaces the reject).
  await f.locator('button.rail-btn[aria-label="Push"]').click();
  const dialog = mainWindow.locator(".monaco-dialog-box");
  await expect(dialog).toBeVisible({ timeout: 8000 });
  await confirmModal(mainWindow, "No"); // decline the force offer
  // Local still has the un-pushed commit (nothing was clobbered).
  expect(Number(git(r, "rev-list --count @{u}..HEAD"))).toBeGreaterThan(0);
});

// 80 ── [±] Smart Sync reconciles a clean divergence ─────────────────────────────
test("L80 Smart Sync rebases then pushes a clean divergence", async ({ mainWindow }) => {
  const r = repo();
  pushFromClone(r, defaultBranch(r), "their80.txt", "theirs\n");
  execSync(`printf 'mine\\n' > "${r}/mine80.txt" && git -C "${r}" add mine80.txt && git -C "${r}" commit -qm "mine 80"`, { stdio: "pipe" });
  const f = await mainFrame(mainWindow);
  await railFetch(f);
  await mainWindow.waitForTimeout(2500);
  await expect(pill(f, "Sync")).toBeVisible({ timeout: 8000 });
  await pill(f, "Sync").click();
  await confirmModal(mainWindow, "Yes");
  await expect(() => {
    expect(git(r, "rev-list --count @{u}..HEAD")).toBe("0");
    expect(git(r, "rev-list --count HEAD..@{u}")).toBe("0");
  }).toPass({ timeout: 15000 });
});

// 81 ── [±] Smart Sync auto-stashes a dirty tree and restores it ─────────────────
test("L81 Smart Sync auto-stashes, syncs, and restores the working tree", async ({ mainWindow }) => {
  const r = repo();
  pushFromClone(r, defaultBranch(r), "their81.txt", "theirs\n");
  execSync(`printf 'mine\\n' > "${r}/mine81.txt" && git -C "${r}" add mine81.txt && git -C "${r}" commit -qm "mine 81"`, { stdio: "pipe" });
  fs.appendFileSync(`${r}/README.md`, "\nuncommitted 81\n"); // dirty
  const f = await mainFrame(mainWindow);
  await railFetch(f);
  await mainWindow.waitForTimeout(2500);
  await pill(f, "Sync").click();
  await confirmModal(mainWindow, "Yes");
  await expect(() => {
    expect(git(r, "rev-list --count @{u}..HEAD")).toBe("0");
    expect(fs.readFileSync(`${r}/README.md`, "utf8")).toContain("uncommitted 81"); // restored
  }).toPass({ timeout: 15000 });
});

// 82 ── [±][msg] Sync whose rebase conflicts pauses; the push never fires ────────
test("L82 a conflicting Sync pauses mid-rebase and does not push", async ({ mainWindow }) => {
  const r = repo();
  const base = defaultBranch(r);
  pushFromClone(r, base, "clash82.txt", "THEIRS\n");
  execSync(`printf 'MINE\\n' > "${r}/clash82.txt" && git -C "${r}" add clash82.txt && git -C "${r}" commit -qm "mine 82"`, { stdio: "pipe" });
  const f = await mainFrame(mainWindow);
  await railFetch(f);
  await mainWindow.waitForTimeout(2500);
  await pill(f, "Sync").click();
  await confirmModal(mainWindow, "Yes");
  // Rebase conflicts → paused; HydraGit flashes a readable instruction.
  await expect(() => {
    expect(git(r, "rev-parse --git-path rebase-merge").length).toBeGreaterThan(0);
  }).toPass({ timeout: 10000 });
  expectReadableError(await flashText(f));
  // The remote was NOT advanced by us (our commit didn't get pushed).
  expect(git(r, "log -1 --format=%s origin/" + base)).not.toBe("mine 82");
  execSync(`git -C "${r}" rebase --abort 2>/dev/null || true`, { stdio: "pipe" });
});

// 83 ── [±] amending a pushed commit Syncs via force-with-lease, not rebase-back ─
test("L83 Sync after amending a pushed commit force-pushes the rewrite", async ({ mainWindow }) => {
  const r = repo();
  const base = defaultBranch(r);
  execSync(`git -C "${r}" commit --allow-empty -qm "pushed 83" && git -C "${r}" push -q origin ${base}`, { stdio: "pipe" });
  execSync(`git -C "${r}" commit -q --amend -m "pushed 83 (amended)"`, { stdio: "pipe" });
  const f = await mainFrame(mainWindow);
  await mainWindow.waitForTimeout(3500);
  await expect(pill(f, "Sync")).toBeVisible({ timeout: 8000 });
  await pill(f, "Sync").click();
  await confirmModal(mainWindow, "Yes"); // single force-with-lease, not a rebase
  await expect(() => {
    expect(git(r, `log -1 --format=%s origin/${base}`)).toBe("pushed 83 (amended)");
    expect(git(r, "rev-list --count @{u}..HEAD")).toBe("0");
  }).toPass({ timeout: 15000 });
});

// 84 ── [⚠][msg] force-with-lease aborts when the remote moved (stale lease) ─────
test("L84 a stale force-with-lease aborts without clobbering the remote", async ({ mainWindow }) => {
  const r = repo();
  const base = defaultBranch(r);
  execSync(`git -C "${r}" commit --allow-empty -qm "pushed 84" && git -C "${r}" push -q origin ${base}`, { stdio: "pipe" });
  execSync(`git -C "${r}" commit -q --amend -m "pushed 84 (amended)"`, { stdio: "pipe" });
  // A teammate pushes AFTER our last fetch → our lease is now stale.
  pushFromClone(r, base, "teammate84.txt", "surprise\n");

  const f = await mainFrame(mainWindow);
  await mainWindow.waitForTimeout(3500);
  // Attempt the force-push path; the lease must refuse.
  await f.locator('button.rail-btn[aria-label="Push"]').click();
  await dismissModalIfAny(mainWindow, "Yes"); // accept the force offer → lease still aborts
  await expect(() => {
    // The teammate's commit is intact on the remote — not clobbered.
    expect(git(r, `log -1 --format=%s origin/${base}`)).not.toBe("pushed 84 (amended)");
  }).toPass({ timeout: 12000 });
  expectReadableError(await flashText(f));
});
