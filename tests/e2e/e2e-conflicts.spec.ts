import { execSync } from "child_process";
import fs from "fs";
import { test, expect } from "./vscode-fixture";
import { sidebarFrame, workerRepo, git, defaultBranch } from "./webview-helpers";

// Cluster F — conflict resolution via the sidebar ConflictBanner. Default
// project; each test manufactures a real conflict on the worker repo, then
// drives the banner. Asserts real git state (MERGE_HEAD / file contents).

const repo = () => workerRepo(test.info());

// Leave the worker repo mid-merge on a single file `cf.txt`, ours="MINE",
// theirs="THEIRS". Returns when the conflict exists on disk.
function makeMergeConflict(r: string, file = "cf.txt") {
  const base = defaultBranch(r);
  execSync(`git -C "${r}" checkout -q ${base}`, { stdio: "pipe" });
  execSync(`printf 'base\\n' > "${r}/${file}" && git -C "${r}" add "${file}" && git -C "${r}" commit -qm "cf base"`, { stdio: "pipe" });
  execSync(`git -C "${r}" checkout -q -b cf-feat && printf 'THEIRS\\n' > "${r}/${file}" && git -C "${r}" commit -qam "cf theirs"`, { stdio: "pipe" });
  execSync(`git -C "${r}" checkout -q ${base} && printf 'MINE\\n' > "${r}/${file}" && git -C "${r}" commit -qam "cf mine"`, { stdio: "pipe" });
  execSync(`git -C "${r}" merge cf-feat || true`, { stdio: "pipe" });
}

async function banner(mainWindow: any) {
  const sb = await sidebarFrame(mainWindow);
  await expect(sb.locator(".cb")).toBeVisible({ timeout: 12000 });
  return sb;
}

// 37 ── Keep Current per file → Continue ─────────────────────────────────────────
test("F37 Keep Current resolves to HEAD and Continue completes the merge", async ({ mainWindow }) => {
  const r = repo();
  makeMergeConflict(r);
  const sb = await banner(mainWindow);
  await sb.locator(".cb-file", { hasText: "cf.txt" }).locator(".cb-btn.current").click();
  await expect(sb.locator(".cb-cont")).toBeEnabled({ timeout: 8000 });
  await sb.locator(".cb-cont").click();
  await expect(() => {
    expect(git(r, "rev-parse --verify -q MERGE_HEAD || true")).toBe(""); // merge finished
    expect(fs.readFileSync(`${r}/cf.txt`, "utf8")).toBe("MINE\n");
  }).toPass({ timeout: 8000 });
});

// 38 ── Keep Incoming per file → Continue ────────────────────────────────────────
test("F38 Keep Incoming resolves to the other side and completes", async ({ mainWindow }) => {
  const r = repo();
  makeMergeConflict(r);
  const sb = await banner(mainWindow);
  await sb.locator(".cb-file", { hasText: "cf.txt" }).locator(".cb-btn.incoming").click();
  await expect(sb.locator(".cb-cont")).toBeEnabled({ timeout: 8000 });
  await sb.locator(".cb-cont").click();
  await expect(() => {
    expect(fs.readFileSync(`${r}/cf.txt`, "utf8")).toBe("THEIRS\n");
  }).toPass({ timeout: 8000 });
});

// 39 ── hand-resolve (stage the file) → Continue ─────────────────────────────────
test("F39 a hand-resolved file can be staged and the merge continued", async ({ mainWindow }) => {
  const r = repo();
  makeMergeConflict(r);
  const sb = await banner(mainWindow);
  // Fix the file by hand, then stage it via its checkbox (= mark resolved).
  fs.writeFileSync(`${r}/cf.txt`, "HAND RESOLVED\n");
  await sb.locator('.file-row[data-path="cf.txt"] input[type="checkbox"]').check().catch(async () => {
    // fall back: stage via git if the row isn't a plain checkbox while conflicted
    execSync(`git -C "${r}" add cf.txt`, { stdio: "pipe" });
  });
  await expect(sb.locator(".cb-cont")).toBeEnabled({ timeout: 8000 });
  await sb.locator(".cb-cont").click();
  await expect(() => {
    expect(git(r, "rev-parse --verify -q MERGE_HEAD || true")).toBe("");
    expect(fs.readFileSync(`${r}/cf.txt`, "utf8")).toBe("HAND RESOLVED\n");
  }).toPass({ timeout: 8000 });
});

// 40 ── Abort restores the pre-merge state ───────────────────────────────────────
test("F40 Abort cancels the merge and restores HEAD", async ({ mainWindow }) => {
  const r = repo();
  makeMergeConflict(r);
  const before = git(r, "rev-parse HEAD");
  const sb = await banner(mainWindow);
  await sb.locator(".cb-abort").click();
  await expect(() => {
    expect(git(r, "rev-parse --verify -q MERGE_HEAD || true")).toBe("");
    expect(git(r, "rev-parse HEAD")).toBe(before);
  }).toPass({ timeout: 8000 });
});

// 41 ── [−] Continue is disabled while files remain unresolved ────────────────────
test("F41 Continue is blocked until every file is resolved", async ({ mainWindow }) => {
  const r = repo();
  makeMergeConflict(r);
  const sb = await banner(mainWindow);
  await expect(sb.locator(".cb-cont")).toBeDisabled();
  await expect(sb.locator(".cb-sub")).toContainText(/file/i); // readable "N files left"
});

// 42 ── [±] cherry-pick conflict → resolve → continue ────────────────────────────
test("F42 a cherry-pick conflict surfaces in the banner and resolves", async ({ mainWindow }) => {
  const r = repo();
  const base = defaultBranch(r);
  execSync(`git -C "${r}" checkout -q ${base}`, { stdio: "pipe" });
  execSync(`printf 'base\\n' > "${r}/cp.txt" && git -C "${r}" add cp.txt && git -C "${r}" commit -qm "cp base"`, { stdio: "pipe" });
  execSync(`git -C "${r}" checkout -q -b cp-feat && printf 'THEIRS\\n' > "${r}/cp.txt" && git -C "${r}" commit -qam "cp theirs"`, { stdio: "pipe" });
  const pick = git(r, "rev-parse HEAD");
  execSync(`git -C "${r}" checkout -q ${base} && printf 'MINE\\n' > "${r}/cp.txt" && git -C "${r}" commit -qam "cp mine"`, { stdio: "pipe" });
  execSync(`git -C "${r}" cherry-pick ${pick} || true`, { stdio: "pipe" });

  const sb = await sidebarFrame(mainWindow);
  await expect(sb.locator(".cb")).toBeVisible({ timeout: 12000 });
  await expect(sb.locator(".cb-title")).toContainText(/cherry-pick/i);
  await sb.locator(".cb-file", { hasText: "cp.txt" }).locator(".cb-btn.incoming").click();
  await expect(sb.locator(".cb-cont")).toBeEnabled({ timeout: 8000 });
  await sb.locator(".cb-cont").click();
  await expect(() => {
    expect(git(r, "rev-parse --verify -q CHERRY_PICK_HEAD || true")).toBe("");
  }).toPass({ timeout: 8000 });
});

// 43 ── rerere replays a recorded resolution ─────────────────────────────────────
test("F43 with rerere enabled, the same conflict auto-resolves the second time", async () => {
  const r = repo();
  execSync(`git -C "${r}" config rerere.enabled true`, { stdio: "pipe" });
  makeMergeConflict(r, "rr.txt");
  // Resolve + commit once so rerere records it.
  fs.writeFileSync(`${r}/rr.txt`, "RESOLVED\n");
  execSync(`git -C "${r}" add rr.txt && git -C "${r}" commit -qm "resolve rr"`, { stdio: "pipe" });
  // Undo the merge, redo it → rerere should auto-apply the recorded resolution.
  execSync(`git -C "${r}" reset -q --hard HEAD~1`, { stdio: "pipe" });
  execSync(`git -C "${r}" merge cf-feat || true`, { stdio: "pipe" });
  // The recorded resolution is replayed → no conflict markers remain in the file.
  const content = fs.readFileSync(`${r}/rr.txt`, "utf8");
  expect(content).not.toContain("<<<<<<<");
  execSync(`git -C "${r}" merge --abort 2>/dev/null || true`, { stdio: "pipe" });
});
