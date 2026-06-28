import { test, expect } from "./vscode-fixture";
import { getWebviewFrame, workerRepo, COMMAND_PALETTE } from "./webview-helpers";
import type { FrameLocator, Locator, Page } from "@playwright/test";
import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// DEMO DRIVER — not an assertion test. Drives the panel through the README GIF
// flow at a recording-friendly pace so you get a deterministic, smooth take. Run
// it HEADED and screen-record the VS Code window:
//
//   make demo                 # or:
//   HYDRAGIT_DEMO=1 HEADED=1 npx playwright test demo-showcase --project=vscode --headed
//
// Tunables:
//   PACE=1500   base ms for a beat (default 1100)
//   SPEED=0.5   global multiplier on every wait (default 0.5 = snappy; 1 = slow)
//
// Flow: all-branches graph (the branchy hook) → focus a branch → click a commit
// (detail pane) →
// open the commit + branch context menus (depth) → switch to a feature branch →
// create & commit a file in the sidebar (the commit pane) → interactive rebase
// editor: reorder a commit and Start Rebasing for real → land back on the graph.
//
// Skipped unless HYDRAGIT_DEMO is set, so it never runs in CI or a normal
// `npm run test:e2e`. Every step is best-effort (a missed selector won't abort
// the take). The commit + rebase mutate the fixture, which is fine: it's a
// throwaway repo rebuilt by `make demo` every run. The reordered commit adds a
// new file, so the rebase never hits a conflict. Selectors mirror the shipping
// components; tune on first run.
// ─────────────────────────────────────────────────────────────────────────────

const PACE = Number(process.env.PACE ?? 1100);
// Every wait runs through beat() and is scaled by SPEED, so one knob halves
// (default) or restores the whole demo's pacing.
const SCALE = Number(process.env.SPEED ?? 0.5);

test.describe("HydraGit showcase (demo driver)", () => {
  test.skip(
    !process.env.HYDRAGIT_DEMO,
    "demo driver — set HYDRAGIT_DEMO=1 to run it for a screen recording"
  );

  test.setTimeout(180_000);

  test("the README GIF flow, paced for recording", async ({ mainWindow }, testInfo) => {
    const page = mainWindow as Page;
    const repo = workerRepo(testInfo);
    const beat = (ms = PACE) => page.waitForTimeout(Math.max(0, Math.round(ms * SCALE)));

    // Move the real cursor to an element's centre in steps — a visible glide,
    // not Playwright's instant teleport. boundingBox() on a frame locator is
    // page-relative (it accounts for the nested webview iframes), so the mouse
    // coordinates line up.
    const glide = async (loc: Locator, steps = 26) => {
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      const b = await loc.boundingBox().catch(() => null);
      if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps });
    };
    const glideClick = async (loc: Locator, hold = 450) => {
      await glide(loc);
      await beat(hold);
      await loc.click().catch(() => {});
      await beat();
    };
    const glideRightClick = async (loc: Locator, hold = 450) => {
      await glide(loc);
      await beat(hold);
      await loc.click({ button: "right" }).catch(() => {});
      await beat();
    };

    // Switch the log to "All branches" so the graph shows the full topology —
    // the fixture's feature merges, the octopus merge, and cross/x|y lanes. A
    // single-branch view is a straight line; this is the branchy money shot.
    const showAllBranches = async () => {
      const pill = f.locator(".branch-pill");
      if (!(await pill.count())) return;
      await glideClick(pill, 350);
      const all = f.locator(".bd-item--all").first();
      if (await all.count()) await glideClick(all, 300);
    };

    // Run a VS Code command by its palette title (best-effort, never throws).
    const runCommand = async (title: string) => {
      await page.keyboard.press(COMMAND_PALETTE);
      const box = page.locator(".quick-input-box input");
      await box.waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
      await box.fill(`>${title}`);
      await beat(300);
      await page.keyboard.press("Enter");
      await beat(400);
    };

    // Reclaim screen for the recording: hide the secondary side bar (where the
    // AI / chat pane lives) so it doesn't eat horizontal space in the GIF.
    await runCommand("View: Close Secondary Side Bar").catch(() => {});
    await beat(300);

    // ── The hook: open on the lane graph and sit on it ───────────────────────
    let f = (await getWebviewFrame(page, "main"))!;
    expect(f, "main panel webview frame").not.toBeNull();
    await expect(f.locator(".pane-log")).toBeVisible({ timeout: 15_000 });
    await expect(f.locator(".graph-col svg").first()).toBeVisible({ timeout: 8000 });
    await showAllBranches(); // open on the full branchy topology, not a straight line
    await beat(2000);

    // ── Click a branch → the log refocuses to its (straight) line ────────────
    // Target feature/search: a clean, UNMERGED linear branch in the demo fixture.
    // Single-branch view shows it straight (easy to follow the rebase), and since
    // nothing merges it, rewriting it leaves no dangling/"detached"-looking lane.
    const featureFolder = f.locator(".titem.folder-row", { hasText: "feature" }).first();
    if (await featureFolder.count()) await glideClick(featureFolder, 350);
    const featBranch = f
      .locator(".titem:not(.folder-row):not(.timeline)", { hasText: "search" })
      .first();
    if (await featBranch.count()) await glideClick(featBranch, 700);
    await beat();

    // ── Click a commit → the detail pane + its changed files ─────────────────
    // Target a real file-change commit by subject (never a merge commit — those
    // show an empty/combined diff in the detail pane and are a poor rebase base).
    const realCommit = () => f.locator(".crow", { hasText: "feat: result ranking" }).first();
    await glideClick(realCommit(), 700);
    await beat(1200); // linger on the detail pane

    // ── Additional menus: the commit menu, then a branch menu (depth) ────────
    await glideRightClick(realCommit(), 350);
    const commitMenu = f.locator(".ctx-menu");
    if (await commitMenu.count()) {
      await glide(commitMenu.getByText("Cherry-Pick", { exact: false }).first());
      await beat(650);
      await glide(commitMenu.getByText("New Branch", { exact: false }).first());
      await beat(800);
    }
    await page.keyboard.press("Escape");
    await beat(500);

    // Right-click a branch → show the menu's depth, then actually SWITCH to it.
    // Switching matters: the commit below must land on a feature branch, not
    // protected main/master — committing there would pop HydraGit's protected-
    // branch safety dialog mid-demo. (Tree is clean here, so checkout is silent.)
    if (await featBranch.count()) {
      await glideRightClick(featBranch, 350);
      const branchMenu = f.locator(".ctx");
      if (await branchMenu.count()) {
        await glide(branchMenu.getByText("Merge", { exact: false }).first());
        await beat(700);
        await glideClick(branchMenu.getByText("Switch to Branch", { exact: false }).first(), 350);
      } else {
        await page.keyboard.press("Escape");
      }
      await beat(1600); // let the checkout land + status refresh
    }

    // ── Change a file → the sidebar commit pane → stage → commit ─────────────
    // A NEW (untracked) file: it shows in the staging view and, once committed,
    // leaves a clean tree so the interactive rebase below isn't blocked. We're on
    // a feature branch now, so no protected-branch dialog interrupts the take.
    fs.writeFileSync(
      path.join(repo, "HELLO_HYDRA.md"),
      "# Hello from HydraGit\n\nStaged and committed live in the demo.\n"
    );

    const sb = (await getWebviewFrame(page, "sidebar"))!;
    if (sb) {
      const fileRow = sb.locator('.file-row[data-path="HELLO_HYDRA.md"]').first();
      // Status polls every ~3s; give it time to surface the new file.
      await fileRow.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
      await glide(fileRow);
      await beat(900);
      // Stage it (check moves it to Staged Changes — the satisfying visual).
      const box = fileRow.locator('input[type="checkbox"]').first();
      await glide(box);
      await box.check().catch(() => {});
      await beat(900);
      // Type a commit message into the commit pane.
      const input = sb.locator(".commit-input").first();
      await glide(input);
      await input.click().catch(() => {});
      await input.pressSequentially("feat: add a friendly hello", { delay: Math.round(45 * SCALE) }).catch(() => {});
      await beat(900);
      // Commit (clean tree afterwards → rebase below works).
      const commitBtn = sb.locator(".btn.btn-primary").first();
      await glideClick(commitBtn, 500);
      await beat(1800); // watch it land + the file list clear
    }

    // ── The power move: interactive rebase editor → reorder → Start Rebasing ─
    f = (await getWebviewFrame(page, "main"))!;
    await expect(f.locator(".pane-log")).toBeVisible({ timeout: 8000 });
    await beat(700);

    // Rebase from a real commit (result ranking), so the plan is [result ranking,
    // hello] — both real file commits, no merge. Reordering hello (a new file) is
    // always conflict-free.
    const target = realCommit();
    await glideRightClick(target, 350);
    await f
      .locator(".ctx-menu")
      .getByText("Interactively Rebase", { exact: false })
      .first()
      .click()
      .catch(async () => {
        await target.click({ button: "right" }).catch(() => {});
        await f.locator(".ctx-menu").getByText("Interactively Rebase", { exact: false }).first().click().catch(() => {});
      });
    await beat();

    // Show the reorder affordance, then reorder via the Move buttons (reliable;
    // raw HTML5 drag is flaky under Playwright). We move OUR hello commit — it
    // adds a brand-new file, so it can be reordered past any commit without a
    // conflict, i.e. the rebase below always completes cleanly.
    await glide(f.locator(".ir-grip").first());
    await beat(500);
    const helloRow = f.locator(".ir-row", { hasText: "add a friendly hello" }).first();
    if (await helloRow.count()) {
      await glide(helloRow);
      await beat(500);
      const up = helloRow.locator('.ir-move[aria-label="Move up"]');
      const down = helloRow.locator('.ir-move[aria-label="Move down"]');
      if (await up.isEnabled().catch(() => false)) await glideClick(up, 300);
      else if (await down.isEnabled().catch(() => false)) await glideClick(down, 300);
      await beat(700);
    }

    // Start the rebase for real — history rewrites and the graph refreshes.
    const startBtn = f.locator(".ir-btn--primary");
    if ((await startBtn.isEnabled().catch(() => false))) {
      await glideClick(startBtn, 450);
    } else {
      // Plan invalid for some reason — bail cleanly instead of leaving the modal.
      await page.keyboard.press("Escape");
    }
    await beat(1500); // let the rebase run + the log re-render

    // ── Finale: the full branchy graph with the reordered tip — clean loop ───
    await showAllBranches();
    await expect(f.locator(".pane-log")).toBeVisible({ timeout: 10_000 });
    await beat(1800);

    // Hold on the final frame so you can grab a screenshot. Un-scaled (a direct
    // waitForTimeout, not beat()) so SPEED can never shrink it below 2 seconds.
    await page.waitForTimeout(2000);
  });
});
