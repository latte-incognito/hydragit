import { test as base, _electron as electron, ElectronApplication, Page } from "@playwright/test";
import { execSync } from "child_process";
import fs from "fs";

export type TestFixtures = {
  vscode: ElectronApplication;
  mainWindow: Page;
};

export const test = base.extend<TestFixtures>({
  vscode: async ({}, use, testInfo) => {
    const config = testInfo.project.use as any;
    const repoPath: string = config.repoPath;
    const extensionPath: string = config.extensionPath;

    const vscodePath = process.env.VSCODE_PATH || getVSCodePath();

    const app = await electron.launch({
      executablePath: vscodePath,
      args: [
        repoPath,
        `--extensionDevelopmentPath=${extensionPath}`,
        "--disable-other-extensions",
        "--skip-welcome",
        "--skip-release-notes",
        "--disable-workspace-trust",
        "--user-data-dir=/tmp/hydragit-test-vscode-data",
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
    await window.waitForLoadState("domcontentloaded");
    await window.waitForTimeout(3000);
    await use(window);
  },
});

export { expect } from "@playwright/test";

function getVSCodePath(): string {
  const candidates: string[] = [];

  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Visual Studio Code.app/Contents/MacOS/Electron",
      "/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron",
      `${process.env.HOME}/Applications/Visual Studio Code.app/Contents/MacOS/Electron`,
    );
  } else if (process.platform === "linux") {
    try {
      return execSync("which code").toString().trim();
    } catch {}
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    "Could not find VS Code. Set VSCODE_PATH env var to the Electron binary path."
  );
}
