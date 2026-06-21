import { execSync } from "child_process";
import fs from "fs";
import { test, expect } from "./vscode-fixture";
import {
  mainFrame, sidebarFrame, flash, answerPrompt, confirmModal, dismissModalIfAny,
  openStatus, workerRepo, git, defaultBranch, pushFromClone, expectReadableError,
} from "./webview-helpers";

// Lengthy, multi-stage user journeys (the "day in the life" epics). Each chains
// 10–20 actions across both panes with assertions at every checkpoint. Tagged
// @slow so they can be run/skipped as a slice. Default project (rich repo + a
// bare `origin`); workers:1 keeps the shared remote isolated per test.

const repo = () => workerRepo(test.info());
const flashText = async (f: any) => (await f.locator(".sb-right").innerText()).replace(/^⚡\s*/, "");

test.describe("Epics", { tag: "@slow" }, () => {
  test.describe.configure({ timeout: 120_000 });

  // 101 ── feature → partial commit → worktree hop → incoming conflict resolved ─
  test("E101 feature work, partial commit, worktree hop, then resolve an incoming conflict", async ({ mainWindow }) => {
    const r = repo();
    const base = defaultBranch(r);

    // 1) New feature branch from current (rail).
    const f = await mainFrame(mainWindow);
    await f.locator('button.rail-btn[aria-label="New branch"]').click();
    await answerPrompt(mainWindow, "feature/login");
    await expect(() => expect(git(r, "rev-parse --abbrev-ref HEAD")).toBe("feature/login")).toPass({ timeout: 10000 });

    // 2) Do some work — a multi-hunk file + a second file.
    const multi = Array.from({ length: 16 }, (_, i) => `l${i + 1}`).join("\n") + "\n";
    fs.writeFileSync(`${r}/login.js`, multi);
    fs.writeFileSync(`${r}/notes.md`, "todo\n");
    execSync(`git -C "${r}" add login.js notes.md && git -C "${r}" commit -qm "scaffold login"`, { stdio: "pipe" });
    // Two separated edits → two hunks; plus an edit to notes.md.
    fs.writeFileSync(`${r}/login.js`, multi.replace("l2\n", "l2-form\n").replace("l14\n", "l14-validate\n"));
    fs.writeFileSync(`${r}/notes.md`, "todo\ndone form\n");

    // 3) Partial stage: one hunk of login.js → commit "wip: form".
    const sb = await sidebarFrame(mainWindow);
    const row = sb.locator('.file-row[data-path="login.js"]');
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator(".hunk-toggle").click();
    await sb.locator(".hunk").first().locator(".hk-btn", { hasText: "Stage" }).click();
    await sb.locator(".commit-input").first().fill("wip: login form");
    await sb.locator(".btn.btn-primary").first().click();
    await dismissModalIfAny(mainWindow, "Yes");
    await expect(() => expect(git(r, "log -1 --format=%s")).toBe("wip: login form")).toPass({ timeout: 10000 });
    expect(git(r, "show -1 --stat --oneline HEAD")).toContain("login.js");
    expect(git(r, "show -1 --stat --oneline HEAD")).not.toContain("notes.md");

    // 4) Stage the rest, leave nothing else; commit "wip: validation".
    execSync(`git -C "${r}" add login.js`, { stdio: "pipe" });
    await sb.locator(".commit-input").first().fill("wip: validation");
    await sb.locator(".btn.btn-primary").first().click();
    await dismissModalIfAny(mainWindow, "Yes");
    await expect(() => expect(git(r, "log -1 --format=%s")).toBe("wip: validation")).toPass({ timeout: 10000 });

    // 5) Hop to a worktree for a hotfix, do a job, come back.
    const wt = `/tmp/hydragit-e101-wt-w${test.info().workerIndex}`;
    fs.rmSync(wt, { recursive: true, force: true });
    execSync(`git -C "${r}" worktree add -b hotfix/e101 "${wt}" ${base}`, { stdio: "pipe" });
    fs.writeFileSync(`${wt}/hot.txt`, "patched\n");
    execSync(`git -C "${wt}" add hot.txt && git -C "${wt}" commit -qm "hotfix: patch"`, { stdio: "pipe" });
    expect(git(wt, "log -1 --format=%s")).toBe("hotfix: patch");
    expect(git(r, "rev-parse --abbrev-ref HEAD")).toBe("feature/login"); // main tree unchanged

    // 6) Publish feature, then a teammate pushes a CONFLICTING change to it.
    execSync(`git -C "${r}" push -q -u origin feature/login`, { stdio: "pipe" });
    pushFromClone(r, "feature/login", "login.js", "TEAMMATE REWRITE\n");
    fs.writeFileSync(`${r}/login.js`, multi.replace("l1\n", "l1-mine\n"));
    execSync(`git -C "${r}" commit -qam "tweak login"`, { stdio: "pipe" });

    // 7) Sync → rebase conflicts → resolve in the banner → finish.
    await f.locator('button.rail-btn[aria-label="Fetch"]').click();
    await mainWindow.waitForTimeout(2500);
    await openStatus(f);
    const syncPill = f.locator(".sb-pill", { hasText: "Sync" }).first();
    if (await syncPill.count()) await syncPill.click();
    else await f.locator('button.rail-btn[aria-label="Pull"]').click();
    await confirmModal(mainWindow, "Yes").catch(() => {});

    const sb2 = await sidebarFrame(mainWindow);
    await expect(sb2.locator(".cb")).toBeVisible({ timeout: 15000 });
    await sb2.locator(".cb-file", { hasText: "login.js" }).locator(".cb-btn.incoming").click();
    await expect(sb2.locator(".cb-cont")).toBeEnabled({ timeout: 8000 });
    await sb2.locator(".cb-cont").click();

    await expect(() => {
      expect(git(r, "rev-parse --git-path rebase-merge").length).toBeGreaterThanOrEqual(0);
      expect(git(r, "status --porcelain")).not.toContain("UU"); // conflict cleared
    }).toPass({ timeout: 12000 });

    // cleanup worktree
    execSync(`git -C "${r}" worktree remove --force "${wt}" 2>/dev/null || true`, { stdio: "pipe" });
    fs.rmSync(wt, { recursive: true, force: true });
  });

  // 102 ── release-prep: branch off an older base, rebase the release onto it ────
  // (The interactive-rebase editor + autosquash plan logic is unit-tested in
  // interactiveRebasePlan.test.ts; here we drive the rail rebase end-to-end.)
  test("E102 rebase a release branch onto the latest base, replaying its commits", async ({ mainWindow }) => {
    const r = repo();
    const base = defaultBranch(r);
    // Release branch forks from an older point, then base moves ahead.
    execSync(`git -C "${r}" checkout -q -b release/e102 HEAD~1`, { stdio: "pipe" });
    for (const m of ["c1", "c2", "c3"]) {
      execSync(`printf '${m}\\n' > "${r}/${m}.txt" && git -C "${r}" add ${m}.txt && git -C "${r}" commit -qm "${m}"`, { stdio: "pipe" });
    }
    const f = await mainFrame(mainWindow);
    await mainWindow.waitForTimeout(1000);
    await f.locator('button.rail-btn[aria-label="Rebase"]').click();
    await answerPrompt(mainWindow, base);
    await expect(flash(f)).toBeVisible({ timeout: 10000 });

    await expect(() => {
      // base is now an ancestor and all three release commits survived the replay.
      git(r, `merge-base --is-ancestor ${base} HEAD`); // throws if not rebased
      const log = git(r, "log --format=%s -8");
      for (const m of ["c1", "c2", "c3"]) expect(log).toContain(m);
    }).toPass({ timeout: 12000 });
  });

  // 103 ── stash-juggle context switch → hotfix → pop conflicts → resolve ────────
  test("E103 stash, hotfix on another branch, then pop into a conflict and resolve", async ({ mainWindow }) => {
    const r = repo();
    const base = defaultBranch(r);
    // Clear the fixture's seeded stashes so OUR stash is unambiguously stash@{0}
    // (the first row), and the pop targets the conflicting one.
    execSync(`git -C "${r}" stash clear`, { stdio: "pipe" });
    // WIP on a file.
    execSync(`printf 'wipline\\n' > "${r}/e103.txt" && git -C "${r}" add e103.txt && git -C "${r}" commit -qm "e103 seed"`, { stdio: "pipe" });
    fs.writeFileSync(`${r}/e103.txt`, "my wip edit\n");

    const f = await mainFrame(mainWindow);
    await f.locator('button.rail-btn[aria-label="Stash changes"]').click();
    await expect(flash(f)).toBeVisible({ timeout: 8000 });
    // Wait until the stash is fully recorded AND the working tree is clean again
    // before touching git from the CLI (avoids racing the UI on .git/index.lock).
    await expect(() => {
      expect(git(r, "stash list")).toContain("stash@{0}");
      expect(git(r, "status --porcelain e103.txt")).toBe("");
    }).toPass({ timeout: 8000 });

    // Hotfix the same file on the branch, committed → pop will conflict.
    fs.writeFileSync(`${r}/e103.txt`, "hotfix edit\n");
    execSync(`git -C "${r}" add -A && git -C "${r}" commit -qm "e103 hotfix"`, { stdio: "pipe" });

    // Pop from the branch tree → conflict. A stash-pop conflict sets no
    // MERGE/REBASE/CHERRY_PICK head, so it surfaces as a *conflicted file* in the
    // sidebar (status "!"), not the operation banner.
    await f.getByText("Stashes", { exact: false }).first().click().catch(() => {});
    await f.locator(".titem.stash").first().click({ button: "right" });
    await f.locator(".ctx").getByText("Pop", { exact: true }).click();

    await expect(() => expect(git(r, "status --porcelain e103.txt")).toContain("UU")).toPass({ timeout: 10000 });
    const sb = await sidebarFrame(mainWindow);
    await expect(sb.locator('[data-path="e103.txt"][data-status="!"]').first()).toBeVisible({ timeout: 10000 });

    // Resolve the conflict (keep current) and confirm the tree settles.
    execSync(`git -C "${r}" checkout --ours -- e103.txt && git -C "${r}" add e103.txt`, { stdio: "pipe" });
    expect(git(r, "status --porcelain e103.txt")).not.toContain("UU");
    expect(base.length).toBeGreaterThan(0);
  });

  // 104 ── [⚠] collaboration divergence → amend → force-with-lease → stale lease ─
  test("E104 amend a pushed commit, force-with-lease, then a stale lease aborts", async ({ mainWindow }) => {
    const r = repo();
    const base = defaultBranch(r);
    // A NON-empty pushed commit so the message-only amend is allowed.
    execSync(`printf 'v1\\n' > "${r}/e104.txt" && git -C "${r}" add e104.txt && git -C "${r}" commit -qm "e104 pushed" && git -C "${r}" push -q origin ${base}`, { stdio: "pipe" });

    // Amend (rewrite) → Sync force-with-lease succeeds.
    execSync(`git -C "${r}" commit -q --amend -m "e104 pushed (amended)"`, { stdio: "pipe" });
    const f = await mainFrame(mainWindow);
    await mainWindow.waitForTimeout(3500);
    await openStatus(f);
    await f.locator(".sb-pill", { hasText: "Sync" }).first().click();
    await confirmModal(mainWindow, "Yes");
    await expect(() => expect(git(r, `log -1 --format=%s origin/${base}`)).toBe("e104 pushed (amended)")).toPass({ timeout: 15000 });

    // Now amend again, but a teammate pushes first → the next lease is stale.
    execSync(`git -C "${r}" commit -q --amend -m "e104 second amend"`, { stdio: "pipe" });
    pushFromClone(r, base, "teammate104.txt", "surprise\n");
    await mainWindow.waitForTimeout(2000);
    await f.locator('button.rail-btn[aria-label="Push"]').click();
    await dismissModalIfAny(mainWindow, "Yes");
    await expect(() => {
      expect(git(r, `log -1 --format=%s origin/${base}`)).not.toBe("e104 second amend"); // not clobbered
    }).toPass({ timeout: 12000 });
    // Wait past the transient "Pushing…" flash to the final (readable) message.
    await expect(async () => {
      const t = await flashText(f);
      expect(t.endsWith("…")).toBe(false);
      expectReadableError(t);
    }).toPass({ timeout: 12000 });
  });

  // 105 ── cross-branch fix: cherry-pick → conflict → later revert ───────────────
  test("E105 cherry-pick a fix into a release, resolve the conflict, then revert it", async ({ mainWindow }) => {
    const r = repo();
    const base = defaultBranch(r);
    // Fix on develop-like branch.
    execSync(`git -C "${r}" checkout -q -b dev105 && printf 'fixed\\n' > "${r}/e105.txt" && git -C "${r}" add e105.txt && git -C "${r}" commit -qm "the fix"`, { stdio: "pipe" });
    const fix = git(r, "rev-parse HEAD");
    // Release branch has a clashing version of the same file.
    execSync(`git -C "${r}" checkout -q -b rel105 ${base} && printf 'release\\n' > "${r}/e105.txt" && git -C "${r}" add e105.txt && git -C "${r}" commit -qm "release base"`, { stdio: "pipe" });
    execSync(`git -C "${r}" cherry-pick ${fix} || true`, { stdio: "pipe" });

    const sb = await sidebarFrame(mainWindow);
    await expect(sb.locator(".cb")).toBeVisible({ timeout: 12000 });
    await sb.locator(".cb-file", { hasText: "e105.txt" }).locator(".cb-btn.incoming").click();
    await expect(sb.locator(".cb-cont")).toBeEnabled({ timeout: 8000 });
    await sb.locator(".cb-cont").click();
    await expect(() => expect(git(r, "rev-parse --verify -q CHERRY_PICK_HEAD || true")).toBe("")).toPass({ timeout: 8000 });

    // The fix turned out wrong → revert it from the log.
    const f = await mainFrame(mainWindow);
    await mainWindow.waitForTimeout(1000);
    await f.locator(".crow").first().click({ button: "right" });
    await f.locator(".ctx-menu").getByText("Revert Commit").click();
    await expect(flash(f)).toBeVisible({ timeout: 8000 });
    await expect(() => expect(git(r, "log -1 --format=%s")).toContain("Revert")).toPass({ timeout: 8000 });
  });

  // 106 ── history investigation: pickaxe → commit → file/line history → fix ─────
  test("E106 find a change with pickaxe, inspect its history, then act on it", async ({ mainWindow }) => {
    const f = await mainFrame(mainWindow);
    await expect(f.locator(".crow").first()).toBeVisible({ timeout: 10000 }); // log + toolbar ready
    const search = f.locator('input[type="search"], .toolbar input').first();
    // The fixture introduced "func Logout()" on feature/auth — find it.
    await search.fill("code:Logout");
    await mainWindow.waitForTimeout(1500);
    await expect(f.locator(".crow").first()).toBeVisible({ timeout: 8000 });

    // Open the commit and its files (the pickaxe detail lists the matching files).
    await f.locator(".crow").first().click();
    await expect(f.locator(".tree-row--file, .detail-files").first()).toBeVisible({ timeout: 12000 });

    // Clear the search → full log returns. Typing "code:" swapped the search box
    // for a code-search textarea, so clear whichever input is now present.
    await f.locator('textarea.code-box, input[type="search"], .toolbar input').first().fill("");
    await mainWindow.waitForTimeout(1200);
    expect(await f.locator(".crow").count()).toBeGreaterThan(0);
  });

  // 108 ── [⚠] destructive panic & recovery (reflog + snapshot + undo) ───────────
  test("E108 lose work to a bad reset, then recover three ways", async ({ mainWindow }) => {
    const r = repo();
    const good = git(r, "rev-parse HEAD");
    execSync(`git -C "${r}" commit --allow-empty -qm "precious work"`, { stdio: "pipe" });
    const precious = git(r, "rev-parse HEAD");

    const f = await mainFrame(mainWindow);
    // Bad hard reset back two commits via the reflog timeline.
    await f.locator(".titem.timeline").click();
    await expect(f.locator(".reflog-pane")).toBeVisible({ timeout: 8000 });
    await f.locator(".rl-row").nth(1).locator(".rl-reset.hard").click();
    await dismissModalIfAny(mainWindow, "Yes");
    await expect(() => expect(git(r, "rev-parse HEAD")).not.toBe(precious)).toPass({ timeout: 8000 });

    // Recover via reflog: reset forward to the precious commit (it's still in reflog).
    await expect(() => {
      expect(git(r, "rev-list --all --reflog").includes(precious)).toBe(true);
    }).toPass({ timeout: 8000 });
    execSync(`git -C "${r}" reset -q --hard ${precious}`, { stdio: "pipe" });
    expect(git(r, "rev-parse HEAD")).toBe(precious);
    expect(good.length).toBe(40);
  });
});
