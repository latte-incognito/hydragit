import { Page, FrameLocator, expect } from "@playwright/test";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";

/**
 * Command-palette chord — Cmd+Shift+P on macOS, Ctrl+Shift+P on Linux/Windows.
 * Use this instead of a hardcoded "Meta+Shift+P" so specs run on CI (Ubuntu).
 */
export const COMMAND_PALETTE =
  process.platform === "darwin" ? "Meta+Shift+P" : "Control+Shift+P";

/**
 * The per-worker fixture repo path (vscode-fixture.ts builds the repo at
 * `${repoPath}-w${workerIndex}`). Lets specs assert real git state.
 */
export function workerRepo(testInfo: any): string {
  const base = (testInfo.project.use as any).repoPath;
  return `${base}-w${testInfo.workerIndex}`;
}

/** Run a git command in the fixture repo and return trimmed stdout. */
export function git(repo: string, args: string): string {
  return execSync(`git -C "${repo}" ${args}`, { stdio: "pipe" }).toString().trim();
}

// Root markers identifying each webview's Svelte app:
// main panel → LogPane's `.pane-log`; sidebar → Sidebar.svelte's `.repo-list`.
const VIEW_MARKERS: Record<string, string> = {
  main: ".pane-log",
  sidebar: ".repo-list",
};

/**
 * VS Code webviews are nested inside iframes.
 * This helper navigates into the webview frame to access Svelte DOM.
 *
 * Neither HydraGit view is open on a cold start (sidebar lives in the activity
 * bar, main view in the bottom panel), so if no frame matches we reveal the
 * view and rescan before giving up.
 */
export async function getWebviewFrame(
  page: Page,
  viewId: string
): Promise<FrameLocator | null> {
  const marker = VIEW_MARKERS[viewId] ?? `[data-view="${viewId}"]`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const frame = await scanWebviewFrames(page, marker);
    if (frame) return frame;

    if (viewId === "sidebar") {
      await openHydraGitSidebar(page);
    } else {
      await revealHydraGitPanel(page);
    }
    await page.waitForTimeout(1500); // let the webview iframe mount + Svelte render
  }
  return await scanWebviewFrames(page, marker);
}

async function scanWebviewFrames(
  page: Page,
  marker: string
): Promise<FrameLocator | null> {
  // VS Code nests webviews: outer iframe.webview > inner iframe with actual content
  const outerFrames = page.frameLocator("iframe.webview.ready");
  const count = await page.locator("iframe.webview.ready").count();

  for (let i = 0; i < count; i++) {
    const inner = outerFrames.nth(i).frameLocator("#active-frame");
    try {
      if ((await inner.locator(marker).count()) > 0) {
        return inner;
      }
    } catch {}
  }
  return null;
}

export async function getMainPanelFrame(page: Page): Promise<FrameLocator | null> {
  return getWebviewFrame(page, "main");
}

export async function getSidebarFrame(page: Page): Promise<FrameLocator | null> {
  return getWebviewFrame(page, "sidebar");
}

/**
 * Opens the HydraGit sidebar by clicking its icon in the activity bar.
 */
export async function openHydraGitSidebar(page: Page): Promise<void> {
  // Activity-bar items render as tabs in current VS Code; keep the legacy
  // anchor selector as a fallback. Don't throw — getWebviewFrame retries.
  const icon = page
    .locator(
      '.activitybar [role="tab"][aria-label*="HydraGit"], a.action-label[aria-label="HydraGit"]'
    )
    .first();
  await icon.click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

/**
 * Opens the HydraGit main panel via command palette.
 */
export async function openHydraGitMainPanel(page: Page): Promise<void> {
  await page.keyboard.press(COMMAND_PALETTE);
  const input = page.locator(".quick-input-box input");
  await input.fill(">HydraGit: Focus on HydraGit View");
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2000);
}

/**
 * Reveals the HydraGit pane via the command palette, mirroring the proven flow
 * in hydragit.spec.ts ("View: Show HydraGit"). Call this before any test that
 * needs the commit-log webview rendered.
 */
export async function revealHydraGitPanel(page: Page): Promise<void> {
  await page.keyboard.press(COMMAND_PALETTE);
  const input = page.locator(".quick-input-box input");
  await input.waitFor({ state: "visible", timeout: 5000 });
  await input.fill(">View: Show HydraGit");
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
}

/**
 * Scans VS Code's nested webview iframes for the one rendering the commit log
 * (identified by the `.pane-log` root). Throws if none is found.
 */
export async function getLogFrame(page: Page): Promise<FrameLocator> {
  const outer = page.frameLocator("iframe.webview.ready");
  const count = await page.locator("iframe.webview.ready").count();
  for (let i = 0; i < count; i++) {
    const inner = outer.nth(i).frameLocator("#active-frame");
    if ((await inner.locator(".pane-log").count()) > 0) {
      return inner;
    }
  }
  throw new Error("commit-log webview frame (.pane-log) not found");
}

// Graph SVG geometry — must match webview/src/panels/index/graphSvg.ts.
const LANE_W = 16;
const PAD = 4;

/**
 * Number of lanes the commit graph is drawn with, derived from the graph SVG's
 * width (svgW = laneCount * LANE_W + PAD * 2). A wide graph → large lane count.
 */
export async function graphLaneCount(frame: FrameLocator): Promise<number> {
  const w = await frame.locator(".graph-col svg").first().getAttribute("width");
  const width = Number(w ?? 0);
  return Math.round((width - PAD * 2) / LANE_W);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared journey helpers — frame getters, dialog seam, error-message contract,
// and remote simulation. Centralised here so the cluster/epic specs don't each
// redefine answerPrompt/confirmModal (the older specs did inline).
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve the main-panel webview frame (the commit log / branch tree). */
export async function mainFrame(page: Page): Promise<FrameLocator> {
  const f = await getWebviewFrame(page, "main");
  expect(f, "main webview frame").not.toBeNull();
  return f!;
}

/** Resolve the sidebar webview frame (staging / commit). */
export async function sidebarFrame(page: Page): Promise<FrameLocator> {
  const f = (await getSidebarFrame(page)) ?? (await getWebviewFrame(page, "sidebar"));
  expect(f, "sidebar webview frame").not.toBeNull();
  return f!;
}

/** The App.flash() success indicator ("⚡ …" in the status bar). */
export function flash(frame: FrameLocator) {
  return frame.getByText("⚡", { exact: false }).first();
}

// The status bar (pills: Publish/Push/Pull/Sync, the repo switcher, ahead/behind
// counts) is collapsed by default — App.svelte renders it only when statusOpen
// or a flash is active. Open it before reading any .sb-* element.
export async function openStatus(frame: FrameLocator) {
  const toggle = frame.locator(".status-toggle");
  if ((await toggle.count()) === 0) return;
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
}

// Right-click a branch row by full name, expanding its folder first when the
// name is slash-nested. Flat branches (main/master, plain names) have no
// folder-row, so we only click a folder when one actually exists.
export async function rightClickBranch(frame: FrameLocator, name: string) {
  if (name.includes("/")) {
    const folder = frame.locator(".titem.folder-row", { hasText: name.split("/")[0] }).first();
    // Clicking a folder row toggles it. Only expand when it's collapsed —
    // otherwise a second call (e.g. after a reload that preserves open state)
    // would collapse the folder and hide the leaf we're about to right-click.
    if (await folder.count()) {
      const expanded = await folder.locator(".folder-arrow.open").count();
      if (!expanded) await folder.click();
    }
  }
  const leaf = name.includes("/") ? name.split("/").slice(1).join("/") : name;
  const row = frame.locator(".titem:not(.folder-row):not(.timeline)", { hasText: leaf }).first();
  await row.waitFor({ state: "visible", timeout: 8000 });
  await row.click({ button: "right" });
  return frame.locator(".ctx");
}

/** An error flash ("⚠ …"). Surfaced when a command fails. */
export function errorFlash(frame: FrameLocator) {
  return frame.getByText("⚠", { exact: false }).first();
}

/** Answer a VS Code showInputBox (the dialog seam's uiPrompt). */
export async function answerPrompt(page: Page, text: string) {
  const input = page.locator(".quick-input-box input");
  await input.waitFor({ state: "visible", timeout: 5000 });
  await input.fill(text);
  await page.keyboard.press("Enter");
}

/** Pick an item from a VS Code quick-pick by visible label. */
export async function quickPick(page: Page, label: string) {
  const input = page.locator(".quick-input-box input");
  await input.waitFor({ state: "visible", timeout: 5000 });
  await page.locator(".quick-input-list .monaco-list-row", { hasText: label }).first().click();
}

/** Click a button on a VS Code modal warning (the dialog seam's uiConfirm). */
export async function confirmModal(page: Page, label = "Yes") {
  await page
    .locator(".monaco-dialog-box .monaco-button", { hasText: label })
    .first()
    .click({ timeout: 6000 });
}

/** Dismiss a modal if one is showing (best-effort; never throws). */
export async function dismissModalIfAny(page: Page, label = "Cancel") {
  await page
    .locator(".monaco-dialog-box .monaco-button", { hasText: label })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
}

/**
 * The [msg] contract: a surfaced error/warning must read like a human sentence
 * and be accurate — not a raw `fatal:`/`error:` git dump or a stack trace.
 */
export function expectReadableError(text: string, opts: { mentions?: string } = {}) {
  const t = (text ?? "").trim();
  expect(t.length, `error text too short to be readable: ${JSON.stringify(t)}`).toBeGreaterThanOrEqual(12);
  expect(t.split("\n").length, `error text should be one coherent line: ${JSON.stringify(t)}`).toBeLessThanOrEqual(3);
  expect(/^(fatal:|error:|usage:|warning:)/i.test(t), `error leaks a raw git prefix: ${JSON.stringify(t)}`).toBe(false);
  expect(/\bat\s+\S+:\d+/.test(t), `error leaks a stack frame: ${JSON.stringify(t)}`).toBe(false);
  if (opts.mentions) {
    expect(t.includes(opts.mentions), `error should mention ${JSON.stringify(opts.mentions)}: ${JSON.stringify(t)}`).toBe(true);
  }
}

// ── Remote simulation ────────────────────────────────────────────────────────
// The default fixture wires a bare repo as `origin` (create-test-repo.sh). These
// helpers advance that remote "behind the user's back" — the only way to drive
// non-FF rejection, smart-sync, and stale-lease scenarios for real.

/** The origin URL of a working repo. */
export function remoteOf(repo: string): string {
  return git(repo, "remote get-url origin");
}

/**
 * Clone `origin`, push one new commit from the clone, and clean up — advancing
 * the remote so the local repo becomes non-fast-forwardable. Mirrors the Go
 * tests' pushOtherCommit. Returns the temp clone dir (already pushed).
 */
export function pushFromClone(repo: string, branch: string, file: string, content: string): void {
  const remote = remoteOf(repo);
  const tmp = fs.mkdtempSync(`${os.tmpdir()}/hydragit-other-`);
  try {
    execSync(`git clone --branch "${branch}" "${remote}" "${tmp}"`, { stdio: "pipe" });
    execSync(`git -C "${tmp}" config user.email other@x.com`, { stdio: "pipe" });
    execSync(`git -C "${tmp}" config user.name Other`, { stdio: "pipe" });
    fs.writeFileSync(`${tmp}/${file}`, content);
    execSync(`git -C "${tmp}" add "${file}"`, { stdio: "pipe" });
    execSync(`git -C "${tmp}" commit -m "other: ${file}"`, { stdio: "pipe" });
    execSync(`git -C "${tmp}" push origin "${branch}"`, { stdio: "pipe" });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Current branch name of a repo. */
export function currentBranch(repo: string): string {
  return git(repo, "rev-parse --abbrev-ref HEAD");
}

/** The fixture's default branch (main or master). */
export function defaultBranch(repo: string): string {
  // origin/HEAD resolves to the remote's default; fall back to current.
  try {
    const sym = git(repo, "symbolic-ref --short refs/remotes/origin/HEAD");
    return sym.replace(/^origin\//, "");
  } catch {
    return currentBranch(repo);
  }
}
