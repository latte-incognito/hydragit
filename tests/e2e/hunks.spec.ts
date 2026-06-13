import fs from "fs";
import { test, expect } from "./vscode-fixture";
import { getSidebarFrame, getWebviewFrame, workerRepo, git } from "./webview-helpers";

// Hunk staging (Sublime-style inline): expand a file's hunks in the sidebar,
// stage ONE of two, and assert only that hunk lands in the index while the
// other stays in the working tree. Runs on the vscode-dirty project but builds
// its own multi-hunk file (the fixture's app.js is single-line → one hunk).

async function sidebar(page: any) {
  const f = (await getSidebarFrame(page)) ?? (await getWebviewFrame(page, "sidebar"));
  expect(f, "sidebar webview frame").not.toBeNull();
  return f!;
}

test("HK1 stage one of two hunks → only it lands in the index", async ({ mainWindow }) => {
  const repo = workerRepo(test.info());

  // A 20-line file, then two well-separated edits → exactly two hunks.
  const base = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join("\n") + "\n";
  git(repo, `stash -u`); // park the fixture's dirty state out of the way
  fs.writeFileSync(`${repo}/multi.txt`, base);
  git(repo, "add multi.txt");
  git(repo, 'commit -m "add multi"');
  const edited = base.replace("line2\n", "line2-EDITED\n").replace("line18\n", "line18-EDITED\n");
  fs.writeFileSync(`${repo}/multi.txt`, edited);

  const sb = await sidebar(mainWindow);

  // The file row appears; expand its hunks via the chevron toggle.
  const row = sb.locator('.file-row[data-path="multi.txt"]');
  await expect(row).toBeVisible({ timeout: 8000 });
  await row.locator(".hunk-toggle").click();

  // Two hunks render; stage the first.
  await expect(sb.locator(".hunk").first()).toBeVisible({ timeout: 6000 });
  await sb.locator(".hunk").first().locator(".hk-btn", { hasText: "Stage" }).click();

  // The index now holds exactly the first edit; the worktree keeps the second.
  await expect(() => {
    const cached = git(repo, "diff --cached --no-color");
    expect(cached).toContain("line2-EDITED");
    expect(cached).not.toContain("line18-EDITED");
    const work = git(repo, "diff --no-color");
    expect(work).toContain("line18-EDITED");
  }).toPass({ timeout: 8000 });

  // And the file is now MM — present in both Staged Changes and Changes.
  await expect(git(repo, "status --porcelain multi.txt")).toBe("MM multi.txt");
});
