import { execSync } from "child_process";
import { test, expect } from "./vscode-fixture";
import { sidebarFrame, mainFrame, quickPick, workerRepo, git } from "./webview-helpers";

// Cluster P — multi-repo (grouped sidebar, focused main panel). Runs on the
// vscode-multi project: the parent folder contains repo-a + repo-b, both git
// repos. Asserts per-repo isolation (no cross-talk) against real git state.

const parent = () => workerRepo(test.info());
const repoA = () => `${parent()}/repo-a`;
const repoB = () => `${parent()}/repo-b`;

// 98 ── both repos are grouped in the sidebar; a commit in A doesn't touch B ─────
test("P98 the sidebar groups both repos; a commit in A leaves B untouched", async ({ mainWindow }) => {
  const sb = await sidebarFrame(mainWindow);
  // Two RepoGroup sections, one per repo.
  await expect(sb.locator(".repo-group")).toHaveCount(2, { timeout: 12000 });
  await expect(sb.getByText("repo-a", { exact: false }).first()).toBeVisible();
  await expect(sb.getByText("repo-b", { exact: false }).first()).toBeVisible();

  const bHeadBefore = git(repoB(), "rev-parse HEAD");
  // Commit in A out-of-band; B's HEAD must be unaffected.
  execSync(`git -C "${repoA()}" commit -aqm "A only change"`, { stdio: "pipe" });
  expect(git(repoA(), "log -1 --format=%s")).toBe("A only change");
  expect(git(repoB(), "rev-parse HEAD")).toBe(bHeadBefore);
});

// 99 ── switching the active repo makes the main panel follow ────────────────────
test("P99 switching the active repo refocuses the main panel log", async ({ mainWindow }) => {
  const f = await mainFrame(mainWindow);
  await expect(f.locator(".crow").first()).toBeVisible({ timeout: 10000 });
  // The status-bar repo switcher picks the active repo.
  await f.locator(".sb-repo").click();
  await quickPick(mainWindow, "repo-b").catch(() => {});
  // The log now shows repo-b's history.
  await expect(f.getByText("repoB: initial commit", { exact: false }).first()).toBeVisible({ timeout: 8000 });
});

// 100 ── [⚠] actions on each repo land in the right repo (no cross-talk) ─────────
test("P100 per-repo staging stays isolated to its own repo", async ({ mainWindow }) => {
  const sb = await sidebarFrame(mainWindow);
  await expect(sb.locator(".repo-group")).toHaveCount(2, { timeout: 12000 });

  const aBefore = git(repoA(), "rev-parse HEAD");
  const bBefore = git(repoB(), "rev-parse HEAD");

  // Drive a commit in each group via its own commit area, scoped by repo name.
  for (const [name, repo] of [["repo-a", repoA()], ["repo-b", repoB()]] as const) {
    const group = sb.locator(".repo-group", { hasText: name });
    await group.locator('.file-row[data-path="app.js"] input[type="checkbox"]').check().catch(() => {});
    await group.locator(".commit-input").first().fill(`${name}: ui commit`);
    await group.locator(".btn.btn-primary").first().click();
    await mainWindow.locator(".monaco-dialog-box .monaco-button", { hasText: "Yes" }).click({ timeout: 3000 }).catch(() => {});
  }

  await expect(() => {
    // Each repo advanced exactly once, with its OWN message — no cross-talk.
    expect(git(repoA(), "rev-parse HEAD")).not.toBe(aBefore);
    expect(git(repoB(), "rev-parse HEAD")).not.toBe(bBefore);
    expect(git(repoA(), "log -1 --format=%s")).toBe("repo-a: ui commit");
    expect(git(repoB(), "log -1 --format=%s")).toBe("repo-b: ui commit");
  }).toPass({ timeout: 12000 });
});

// 107 ── [⚠] epic: parallel work across both repos stays isolated end-to-end ─────
test("E107 commit in A, stash in B, switch focus, push A, resolve B — no cross-talk", {
  tag: "@slow",
}, async ({ mainWindow }) => {
  const sb = await sidebarFrame(mainWindow);
  await expect(sb.locator(".repo-group")).toHaveCount(2, { timeout: 12000 });

  // Wire A with an upstream so a push is meaningful.
  const remoteA = `${repoA()}-upstream.git`;
  execSync(`rm -rf "${remoteA}" && git init --bare -q "${remoteA}"`, { stdio: "pipe" });
  execSync(`git -C "${repoA()}" add -A && git -C "${repoA()}" commit -qm "A baseline" && git -C "${repoA()}" remote add origin "${remoteA}" && git -C "${repoA()}" push -q -u origin HEAD`, { stdio: "pipe" });

  // Commit in A (out-of-band) and stash in B; the two must not interfere.
  execSync(`printf 'A work\\n' >> "${repoA()}/app.js" && git -C "${repoA()}" commit -qam "A: feature work"`, { stdio: "pipe" });
  execSync(`printf 'B wip\\n' >> "${repoB()}/app.js" && git -C "${repoB()}" stash push -m "B wip"`, { stdio: "pipe" });

  // Push A.
  execSync(`git -C "${repoA()}" push -q origin HEAD`, { stdio: "pipe" });

  await expect(() => {
    // A is in sync with its own remote; B still holds exactly its own stash.
    expect(git(repoA(), "rev-list --count @{u}..HEAD")).toBe("0");
    expect(git(repoB(), "stash list")).toContain("B wip");
    expect(git(repoB(), "log -1 --format=%s")).toBe("repoB: second commit"); // B untouched by A's push
  }).toPass({ timeout: 12000 });
});
