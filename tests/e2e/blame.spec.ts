import { test, expect } from './vscode-fixture';

// Inline blame renders in the real editor (a TextEditorDecorationType), not a
// webview — so we drive actual VS Code and assert the decoration text lands in
// the Monaco DOM. The fixture's README.md was created by a single "Initial
// commit", so that summary appearing at the end of the line proves the blame
// annotation rendered.
test.describe('Inline line blame', () => {
  test('shows the commit summary at the end of the active line', async ({ mainWindow }) => {
    // Open README.md via Quick Open.
    await mainWindow.keyboard.press('Meta+P');
    const quickInput = mainWindow.locator('.quick-input-box input');
    await expect(quickInput).toBeVisible({ timeout: 5000 });
    await quickInput.fill('README.md');
    await mainWindow.waitForTimeout(500);
    await mainWindow.keyboard.press('Enter');

    // Editor opens; click the FIRST line so blame has an entry for it (the
    // trailing empty line has no blame data).
    const viewLines = mainWindow.locator('.monaco-editor .view-lines').first();
    await expect(viewLines).toBeVisible({ timeout: 10000 });
    await mainWindow.locator('.monaco-editor .view-line').first().click();

    // Blame is fetched over IPC then painted on the active line (debounced).
    // VS Code renders a `after.contentText` decoration as a CSS pseudo-element,
    // so the text lives in computed `content`, not the DOM tree — scan for it.
    // The annotation carries the fixture's first-commit summary ("Initial commit").
    await expect
      .poll(
        () =>
          mainWindow.evaluate(() => {
            const els = document.querySelectorAll(
              '.monaco-editor .view-line, .monaco-editor .view-line *'
            );
            for (const el of els) {
              for (const pseudo of ['::after', '::before']) {
                const c = getComputedStyle(el, pseudo).content;
                if (c && c.includes('Initial commit')) return true;
              }
            }
            return false;
          }),
        { timeout: 15000 }
      )
      .toBe(true);
  });
});
