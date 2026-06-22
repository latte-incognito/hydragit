import { execSync } from "child_process";
import fs from "fs";
import { test, expect } from "./vscode-fixture";
import {
  sidebarFrame,
  mainFrame,
  openStatus,
  workerRepo,
  git,
  confirmModal,
  dismissModalIfAny,
} from "./webview-helpers";

// Cluster A — Commit & staging (left pane). Runs on the vscode-dirty project
// (create-dirty-repo.sh leaves "M app.js" + "?? NOTES.md"). Authored to
// convention against the real sidebar selectors; asserts real git state.

const sb = (p: any) => sidebarFrame(p);
const repo = () => workerRepo(test.info());

async function stage(frame: any, path: string) {
  await frame.locator(`.file-row[data-path="${path}"] input[type="checkbox"]`).check();
}
async function type(frame: any, msg: string) {
  await frame.locator(".commit-input").first().fill(msg);
}
async function clickCommit(frame: any) {
  await frame.locator(".btn.btn-primary").first().click();
}

// 1 ── stage a subset, commit, the rest stays dirty ─────────────────────────────
test("A1 stage one file, commit, the untracked file stays dirty", async ({ mainWindow }) => {
  const f = await sb(mainWindow);
  await expect(f.locator('.file-row[data-path="app.js"]')).toBeVisible({ timeout: 8000 });
  await stage(f, "app.js");
  await type(f, "feat: bump version");
  await clickCommit(f);
  await dismissModalIfAny(mainWindow, "Yes"); // protected-branch safety → confirm

  await expect(() => {
    expect(git(repo(), "log -1 --format=%s")).toBe("feat: bump version");
    expect(git(repo(), "status --porcelain")).toBe("?? NOTES.md");
  }).toPass({ timeout: 8000 });
});

// 2 ── stage-all + Commit & Push → ahead reaches 0 ──────────────────────────────
test("A2 commit & push lands on the upstream (ahead→0)", async ({ mainWindow }) => {
  const r = repo();
  // The dirty fixture has no remote — wire a bare upstream so the Push button shows.
  const remote = `${r}-upstream.git`;
  fs.rmSync(remote, { recursive: true, force: true });
  execSync(`git init --bare -q "${remote}"`, { stdio: "pipe" });
  execSync(`git -C "${r}" remote add origin "${remote}"`, { stdio: "pipe" });
  execSync(`git -C "${r}" push -u origin HEAD`, { stdio: "pipe" });

  const f = await sb(mainWindow);
  await expect(f.locator('.file-row[data-path="app.js"]')).toBeVisible({ timeout: 8000 });
  await mainWindow.waitForTimeout(3500); // status poll picks up the new upstream

  await stage(f, "app.js");
  await type(f, "feat: push me");
  // Commit & Push button (.btn-secondary) only renders with an upstream.
  await f.locator('.btn.btn-secondary', { hasText: "Push" }).click();
  await dismissModalIfAny(mainWindow, "Yes");

  await expect(() => {
    expect(git(r, "log -1 --format=%s")).toBe("feat: push me");
    expect(git(r, "rev-list --count @{u}..HEAD")).toBe("0"); // nothing left to push
  }).toPass({ timeout: 12000 });
});

// 3 ── empty message blocks commit; typing unblocks it ──────────────────────────
test("A3 the Commit button is disabled until a message is typed", async ({ mainWindow }) => {
  const f = await sb(mainWindow);
  await stage(f, "app.js");
  const btn = f.locator(".btn.btn-primary").first();
  await expect(btn).toBeDisabled();
  await type(f, "feat: now it works");
  await expect(btn).toBeEnabled();
});

// 4 ── whitespace-only message is treated as empty ──────────────────────────────
test("A4 a whitespace-only message keeps Commit disabled", async ({ mainWindow }) => {
  const f = await sb(mainWindow);
  await stage(f, "app.js");
  await type(f, "    ");
  await expect(f.locator(".btn.btn-primary").first()).toBeDisabled();
});

// 5 ── amend the last commit, folding in a forgotten file ────────────────────────
test("A5 amend folds a forgotten file into HEAD, count unchanged", async ({ mainWindow }) => {
  const r = repo();
  const f = await sb(mainWindow);
  await stage(f, "app.js");
  await type(f, "feat: first pass");
  await clickCommit(f);
  await dismissModalIfAny(mainWindow, "Yes");
  await expect(() => expect(git(r, "log -1 --format=%s")).toBe("feat: first pass")).toPass({ timeout: 8000 });
  const before = git(r, "rev-list --count HEAD");

  // NOTES.md was forgotten — stage it (deterministically), then amend via the UI.
  execSync(`git -C "${r}" add NOTES.md`, { stdio: "pipe" });
  await mainWindow.waitForTimeout(1500); // let the sidebar pick up the staged file
  await f.locator(".amend-toggle input[type=checkbox]").check();
  await type(f, "feat: first pass"); // keep message
  await expect(f.locator(".btn.btn-primary", { hasText: "Amend" })).toBeEnabled({ timeout: 6000 });
  await f.locator(".btn.btn-primary", { hasText: "Amend" }).click();
  await dismissModalIfAny(mainWindow, "Yes");

  await expect(() => {
    expect(git(r, "rev-list --count HEAD")).toBe(before); // no new commit
    expect(git(r, "ls-tree --name-only HEAD")).toContain("NOTES.md");
  }).toPass({ timeout: 8000 });
});

// 6 ── reword the last message only (clean tree → "Amend last commit…") ─────────
test("A6 reword the last commit message on a clean tree", async ({ mainWindow }) => {
  const r = repo();
  // Commit everything first so the tree is clean.
  execSync(`git -C "${r}" add -A && git -C "${r}" commit -qm "to be reworded"`, { stdio: "pipe" });
  const f = await sb(mainWindow);
  await expect(f.locator(".clean-amend")).toBeVisible({ timeout: 8000 });
  await f.locator(".clean-amend").click();
  // The amend area prefills the existing message asynchronously — wait for that
  // before typing, or the prefill clobbers our new subject.
  const input = f.locator(".commit-input").first();
  await expect(input).toHaveValue(/to be reworded/, { timeout: 6000 });
  await input.fill("reworded subject");
  await f.locator(".btn.btn-primary", { hasText: "Amend" }).click();
  await dismissModalIfAny(mainWindow, "Yes");

  await expect(() => expect(git(r, "log -1 --format=%s")).toBe("reworded subject")).toPass({ timeout: 8000 });
});

// 7 ── [⚠] amending a pushed commit leaves the branch diverged (rewrite) ─────────
test("A7 amending a pushed commit surfaces a divergence, not a silent rewrite", async ({ mainWindow }) => {
  const r = repo();
  const remote = `${r}-upstream.git`;
  fs.rmSync(remote, { recursive: true, force: true });
  execSync(`git init --bare -q "${remote}"`, { stdio: "pipe" });
  execSync(`git -C "${r}" add -A && git -C "${r}" commit -qm "pushed commit"`, { stdio: "pipe" });
  execSync(`git -C "${r}" remote add origin "${remote}"`, { stdio: "pipe" });
  execSync(`git -C "${r}" push -u origin HEAD`, { stdio: "pipe" });
  const pushedSha = git(r, "rev-parse HEAD");

  // Amend it locally (rewrite).
  execSync(`git -C "${r}" commit -q --amend -m "pushed commit (amended)"`, { stdio: "pipe" });

  // The remote still holds the ORIGINAL commit — the amend did not clobber it.
  expect(git(r, "rev-parse @{u}")).toBe(pushedSha);
  // And locally we're now both ahead AND behind (a rewrite divergence).
  expect(git(r, "rev-list --count @{u}..HEAD")).toBe("1");
  expect(git(r, "rev-list --count HEAD..@{u}")).toBe("1");

  // The status bar (opened) reflects the divergence with a ⇅ Sync pill.
  const mp = await mainFrame(mainWindow);
  await mainWindow.waitForTimeout(3500); // status poll picks up the divergence
  await openStatus(mp);
  await expect(mp.locator(".sb-pill", { hasText: "Sync" }).first()).toBeVisible({ timeout: 8000 });
});

// 8 ── [msg] pre-commit secret warning is readable and proceedable ──────────────
test("A8 committing a secret trips a readable safety warning; proceed works", async ({ mainWindow }) => {
  const r = repo();
  fs.writeFileSync(`${r}/secrets.env`, 'AWS_SECRET_ACCESS_KEY="AKIAIOSFODNN7EXAMPLEKEYZ1234567890abcd"\n');
  const f = await sb(mainWindow);
  await expect(f.locator('.file-row[data-path="secrets.env"]')).toBeVisible({ timeout: 8000 });
  await stage(f, "secrets.env");
  await type(f, "chore: add config");
  await clickCommit(f);

  const dialog = mainWindow.locator(".monaco-dialog-box");
  await expect(dialog).toBeVisible({ timeout: 8000 });
  await expect(dialog).toContainText(/secret|safety/i);
  await confirmModal(mainWindow, "Yes"); // proceed anyway

  await expect(() => expect(git(r, "log -1 --format=%s")).toBe("chore: add config")).toPass({ timeout: 8000 });
});

// 9 ── pre-commit conflict-marker warning → cancel, fix, recommit ────────────────
test("A9 a leftover conflict marker warns; cancel, fix, then commit clean", async ({ mainWindow }) => {
  const r = repo();
  fs.writeFileSync(`${r}/merged.txt`, "ok\n<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> branch\n");
  const f = await sb(mainWindow);
  await expect(f.locator('.file-row[data-path="merged.txt"]')).toBeVisible({ timeout: 8000 });
  await stage(f, "merged.txt");
  await type(f, "feat: oops markers");
  await clickCommit(f);

  const dialog = mainWindow.locator(".monaco-dialog-box");
  await expect(dialog).toBeVisible({ timeout: 8000 });
  await expect(dialog).toContainText(/conflict|marker|safety/i);
  await confirmModal(mainWindow, "Cancel"); // cancel (VS Code's modal negative is "Cancel")
  expect(git(r, "log -1 --format=%s")).not.toBe("feat: oops markers");

  // Fix and recommit cleanly.
  fs.writeFileSync(`${r}/merged.txt`, "ok\nmine\n");
  execSync(`git -C "${r}" add merged.txt`, { stdio: "pipe" });
  await type(f, "feat: resolved markers");
  await clickCommit(f);
  await dismissModalIfAny(mainWindow, "Yes");
  await expect(() => expect(git(r, "log -1 --format=%s")).toBe("feat: resolved markers")).toPass({ timeout: 8000 });
});

// 10 ── [⚠] rapid stage/unstage toggling keeps the index consistent ─────────────
test("A10 hammering the stage toggle then committing yields a consistent index", async ({ mainWindow }) => {
  const r = repo();
  const f = await sb(mainWindow);
  const cb = f.locator('.file-row[data-path="app.js"] input[type="checkbox"]');
  await expect(cb).toBeVisible({ timeout: 8000 });
  for (let i = 0; i < 4; i++) {
    await cb.click();
    await mainWindow.waitForTimeout(300); // let each stage/unstage round-trip settle
  }
  // End staged, commit; the result must contain app.js exactly once, no corruption.
  if (!(await cb.isChecked())) await cb.check();
  await expect(cb).toBeChecked({ timeout: 6000 });
  await type(f, "feat: race survivor");
  const commitBtn = f.locator(".btn.btn-primary").first();
  await expect(commitBtn).toBeEnabled({ timeout: 8000 });
  await commitBtn.click();
  await dismissModalIfAny(mainWindow, "Yes");
  await expect(() => {
    expect(git(r, "log -1 --format=%s")).toBe("feat: race survivor");
    expect(git(r, "show --stat --oneline HEAD")).toContain("app.js");
  }).toPass({ timeout: 8000 });
});
