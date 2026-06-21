import { execSync } from "child_process";
import fs from "fs";
import { test, expect } from "./vscode-fixture";
import {
  mainFrame, flash, openStatus, confirmModal, dismissModalIfAny,
  workerRepo, git, defaultBranch, pushFromClone, expectReadableError,
} from "./webview-helpers";

// Cluster L — sync / remote (incl. conflicts). Default project, which wires a
// bare `origin` with an upstream on the default branch (create-test-repo.sh).
// The status-bar pills live in a collapsed bar — open it before reading them.

const repo = () => workerRepo(test.info());
const flashText = async (f: any) => (await f.locator(".sb-right").innerText()).replace(/^⚡\s*/, "");
// Wait past transient progress flashes ("Syncing…", "Pushing…") to the final message.
async function settledError(f: any) {
  await expect(async () => {
    const t = await flashText(f);
    expect(t.endsWith("…"), `still in progress: ${t}`).toBe(false);
    expectReadableError(t);
  }).toPass({ timeout: 12000 });
}
// Publish/Sync pills carry their label text; Push/Pull pills show only a count,
// so match those by their title attribute.
function pill(f: any, label: string) {
  if (label === "Push") return f.locator('.sb-pill[title*="to push"]').first();
  if (label === "Pull") return f.locator('.sb-pill[title*="to pull"]').first();
  return f.locator(".sb-pill", { hasText: label }).first();
}

async function railFetch(f: any) {
  await f.locator('button.rail-btn[aria-label="Fetch"]').click();
  await expect(flash(f)).toBeVisible({ timeout: 8000 });
}
async function showPill(f: any, label: string) {
  await openStatus(f);
  await expect(pill(f, label)).toBeVisible({ timeout: 10000 });
  return pill(f, label);
}

// 76 ── publish a branch with no upstream ────────────────────────────────────────
test("L76 Publish sets the upstream on a fresh branch", async ({ mainWindow }) => {
  const r = repo();
  execSync(`git -C "${r}" checkout -q -b pub76`, { stdio: "pipe" });
  const f = await mainFrame(mainWindow);
  await mainWindow.waitForTimeout(3500);
  await (await showPill(f, "Publish")).click();
  await expect(() => expect(git(r, "rev-parse --abbrev-ref pub76@{u}")).toBe("origin/pub76")).toPass({ timeout: 12000 });
});

// 77 ── push ahead commits → ahead reaches 0 ─────────────────────────────────────
test("L77 the Push pill pushes ahead commits", async ({ mainWindow }) => {
  const r = repo();
  execSync(`git -C "${r}" commit --allow-empty -qm "L77 ahead"`, { stdio: "pipe" });
  const f = await mainFrame(mainWindow);
  await mainWindow.waitForTimeout(3500);
  await (await showPill(f, "Push")).click();
  await dismissModalIfAny(mainWindow, "Yes");
  await expect(() => expect(git(r, "rev-list --count @{u}..HEAD")).toBe("0")).toPass({ timeout: 12000 });
});

// 78 ── pull when behind → behind reaches 0 ──────────────────────────────────────
test("L78 the Pull pill pulls incoming commits", async ({ mainWindow }) => {
  const r = repo();
  pushFromClone(r, defaultBranch(r), "incoming78.txt", "from teammate\n");
  const f = await mainFrame(mainWindow);
  await railFetch(f);
  await mainWindow.waitForTimeout(2500);
  await (await showPill(f, "Pull")).click();
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
  await f.locator('button.rail-btn[aria-label="Push"]').click();
  const dialog = mainWindow.locator(".monaco-dialog-box");
  await expect(dialog).toBeVisible({ timeout: 8000 });
  await confirmModal(mainWindow, "Cancel"); // decline the force offer
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
  await (await showPill(f, "Sync")).click();
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
  fs.appendFileSync(`${r}/README.md`, "\nuncommitted 81\n");
  const f = await mainFrame(mainWindow);
  await railFetch(f);
  await mainWindow.waitForTimeout(2500);
  await (await showPill(f, "Sync")).click();
  await confirmModal(mainWindow, "Yes");
  await expect(() => {
    expect(git(r, "rev-list --count @{u}..HEAD")).toBe("0");
    expect(fs.readFileSync(`${r}/README.md`, "utf8")).toContain("uncommitted 81");
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
  await (await showPill(f, "Sync")).click();
  await confirmModal(mainWindow, "Yes");
  await expect(() => {
    expect(git(r, "rev-parse --git-path rebase-merge").length).toBeGreaterThan(0);
  }).toPass({ timeout: 10000 });
  await settledError(f);
  expect(git(r, "log -1 --format=%s origin/" + base)).not.toBe("mine 82");
  execSync(`git -C "${r}" rebase --abort 2>/dev/null || true`, { stdio: "pipe" });
});

// 83 ── [±] amending a pushed commit Syncs via force-with-lease, not rebase-back ─
test("L83 Sync after amending a pushed commit force-pushes the rewrite", async ({ mainWindow }) => {
  const r = repo();
  const base = defaultBranch(r);
  // A NON-empty pushed commit so the amend (message change) is allowed.
  execSync(`printf 'v1\\n' > "${r}/pushed83.txt" && git -C "${r}" add pushed83.txt && git -C "${r}" commit -qm "pushed 83" && git -C "${r}" push -q origin ${base}`, { stdio: "pipe" });
  execSync(`git -C "${r}" commit -q --amend -m "pushed 83 (amended)"`, { stdio: "pipe" });
  const f = await mainFrame(mainWindow);
  await mainWindow.waitForTimeout(3500);
  await (await showPill(f, "Sync")).click();
  await confirmModal(mainWindow, "Yes");
  await expect(() => {
    expect(git(r, `log -1 --format=%s origin/${base}`)).toBe("pushed 83 (amended)");
    expect(git(r, "rev-list --count @{u}..HEAD")).toBe("0");
  }).toPass({ timeout: 15000 });
});

// 84 ── [⚠][msg] force-with-lease aborts when the remote moved (stale lease) ─────
test("L84 a stale force-with-lease aborts without clobbering the remote", async ({ mainWindow }) => {
  const r = repo();
  const base = defaultBranch(r);
  execSync(`printf 'v1\\n' > "${r}/pushed84.txt" && git -C "${r}" add pushed84.txt && git -C "${r}" commit -qm "pushed 84" && git -C "${r}" push -q origin ${base}`, { stdio: "pipe" });
  execSync(`git -C "${r}" commit -q --amend -m "pushed 84 (amended)"`, { stdio: "pipe" });
  pushFromClone(r, base, "teammate84.txt", "surprise\n");
  const f = await mainFrame(mainWindow);
  await mainWindow.waitForTimeout(3500);
  await f.locator('button.rail-btn[aria-label="Push"]').click();
  await dismissModalIfAny(mainWindow, "Yes");
  await expect(() => {
    expect(git(r, `log -1 --format=%s origin/${base}`)).not.toBe("pushed 84 (amended)");
  }).toPass({ timeout: 12000 });
  await settledError(f);
});
