import { test as base, _electron as electron, ElectronApplication, Page } from "@playwright/test";
import path from "path";
import { execSync } from "child_process";

export type TestFixtures = {
  vscode: ElectronApplication;
  mainWindow: Page;
};

export const test = base.extend<TestFixtures>({
  vscode: async ({}, use, testInfo) => {
    const config = testInfo.project.use as any;
    const repoPath: string = config.repoPath;
    const extensionPath: string = config.extensionPath;

    // Find VS Code binary
    const vscodePath = getVSCodePath();

    const app = await electron.launch({
      executablePath: vscodePath,
      args: [
        repoPath,
        `--extensionDevelopmentPath=${extensionPath}`,
        "--disable-extensions", // disable all other extensions
        "--skip-welcome",
        "--skip-release-notes",
        "--disable-workspace-trust",
        `--user-data-dir=/tmp/hydragit-test-vscode-data`,
      ],
      env: {
        ...process.env,
        NODE_ENV: "test",
      },
    });

    await use(app);
    await app.close();
  },

  mainWindow: async ({ vscode }, use) => {
    const window = await vscode.firstWindow();
    // Wait for VS Code to fully load
    await window.waitForLoadState("domcontentloaded");
    // Give extensions time to activate
    await window.waitForTimeout(3000);
    await use(window);
  },
});

export { expect } from "@playwright/test";

function getVSCodePath(): string {
  const platform = process.platform;

  if (platform === "darwin") {
    const paths = [
      "/Applications/Visual Studio Code.app/Contents/MacOS/Electron",
      "/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron",
      `${process.env.HOME}/Applications/Visual Studio Code.app/Contents/MacOS/Electron`,
    ];
    for (const p of paths) {
      try {
        execSync(`test -f "${p}"`);
        return p;
      } catch {}
    }
  }

  if (platform === "linux") {
    try {
      return execSync("which code").toString().trim();
    } catch {}
  }

  throw new Error(
    "Could not find VS Code. Install it or set VSCODE_PATH env var."
  );
}
