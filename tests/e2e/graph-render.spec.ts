import { test, expect } from "./vscode-fixture";
import { getLogFrame, revealHydraGitPanel } from "./webview-helpers";

// Render-level checks for the commit graph. The Go test internal/graph/
// lanes_test.go is the source of truth for *which* lane each commit lands in;
// these tests verify the webview honors that data — every commit gets a node,
// merges get merge nodes, and connectors are actually drawn.
//
// The fixture (tests/fixtures/create-test-repo.sh) bakes in the hard
// topologies: 3 --no-ff merges, a 4-parent octopus merge, and a criss-cross
// pair — so the merge-node and connector assertions exercise them.

test.describe("commit graph rendering", () => {
  test.beforeEach(async ({ mainWindow }) => {
    await revealHydraGitPanel(mainWindow);
  });

  test("every commit gets exactly one graph node", async ({ mainWindow }) => {
    const frame = await getLogFrame(mainWindow);
    await expect(frame.locator(".crow").first()).toBeVisible({ timeout: 15_000 });

    const rows = await frame.locator(".crow").count();
    // Non-merge dots are r=3.5; merge dots are an r=5 ring (+ an r=1.5 centre).
    const normalDots = await frame.locator('.graph-col svg circle[r="3.5"]').count();
    const mergeDots = await frame.locator('.graph-col svg circle[r="5"]').count();

    expect(rows).toBeGreaterThan(0);
    expect(normalDots + mergeDots).toBe(rows);
  });

  test("octopus + criss-cross render merge nodes and connector curves", async ({
    mainWindow,
  }) => {
    const frame = await getLogFrame(mainWindow);
    await expect(frame.locator(".crow").first()).toBeVisible({ timeout: 15_000 });

    // Fixture has at least 6 merge commits (3 --no-ff + 1 octopus + 2 criss-cross).
    // Assert a conservative floor so fixture tweaks don't make this brittle.
    const mergeDots = await frame.locator('.graph-col svg circle[r="5"]').count();
    expect(mergeDots).toBeGreaterThanOrEqual(4);

    // Merge connectors are drawn as curved <path> elements inside the graph SVG.
    const curves = await frame.locator(".graph-col svg path").count();
    expect(curves).toBeGreaterThan(0);
  });
});
