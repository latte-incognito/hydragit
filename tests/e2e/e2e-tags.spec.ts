import { test, expect } from "./vscode-fixture";
import { mainFrame, flash, answerPrompt, dismissModalIfAny, workerRepo, git, expectReadableError } from "./webview-helpers";

// Cluster M — tags (rail + Tags section). Default project (tags v1.0.0/1.1.0/1.2.0).

const repo = () => workerRepo(test.info());
const flashText = async (f: any) => (await f.locator(".sb-right").innerText()).replace(/^⚡\s*/, "");

// 85 ── create an annotated and a lightweight tag ────────────────────────────────
test("M85 create annotated then lightweight tags at HEAD", async ({ mainWindow }) => {
  const r = repo();
  const f = await mainFrame(mainWindow);

  await f.locator('button.rail-btn[aria-label="Create tag"]').click();
  await answerPrompt(mainWindow, "v9.9.0");
  await answerPrompt(mainWindow, "annotated nine"); // message → annotated
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  await expect(() => expect(git(r, "tag -l v9.9.0")).toBe("v9.9.0")).toPass({ timeout: 8000 });
  expect(git(r, "cat-file -t v9.9.0")).toBe("tag"); // annotated objects are 'tag'

  await f.locator('button.rail-btn[aria-label="Create tag"]').click();
  await answerPrompt(mainWindow, "v9.9.1");
  await answerPrompt(mainWindow, ""); // empty message → lightweight
  await expect(() => expect(git(r, "tag -l v9.9.1")).toBe("v9.9.1")).toPass({ timeout: 8000 });
});

// 86 ── [−][msg] a duplicate tag name errors readably ────────────────────────────
test("M86 a duplicate tag name reports a readable error", async ({ mainWindow }) => {
  const f = await mainFrame(mainWindow);
  await f.locator('button.rail-btn[aria-label="Create tag"]').click();
  await answerPrompt(mainWindow, "v1.0.0"); // exists
  await answerPrompt(mainWindow, "dup");
  await expect(flash(f)).toBeVisible({ timeout: 6000 });
  expectReadableError(await flashText(f), { mentions: "v1.0.0" });
});

// 87 ── delete a tag ─────────────────────────────────────────────────────────────
test("M87 delete a tag from its context menu", async ({ mainWindow }) => {
  const r = repo();
  const f = await mainFrame(mainWindow);
  await f.locator(".tgroup-label", { hasText: "Tags" }).first().click(); // expand the Tags section
  const tagRow = f.locator(".titem.tag-row", { hasText: "v1.2.0" }).first();
  await expect(tagRow).toBeVisible({ timeout: 8000 });
  await tagRow.click({ button: "right" });
  // Wait for the tag context menu, then fire its Delete item. dispatchEvent
  // triggers the Svelte onclick directly — a normal/force click flakes on the
  // menu's open transition (resolves the node but never lands the handler).
  const menu = f.locator(".ctx");
  await expect(menu).toBeVisible({ timeout: 6000 });
  await menu.locator(".ci", { hasText: "Delete" }).first().dispatchEvent("click");
  await dismissModalIfAny(mainWindow, "Yes");
  await expect(() => expect(git(r, "tag -l v1.2.0")).toBe("")).toPass({ timeout: 8000 });
});
