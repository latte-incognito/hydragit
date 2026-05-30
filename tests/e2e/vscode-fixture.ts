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
    const baseRepoPath: string = config.repoPath;
    const extensionPath: string = config.extensionPath;
    // Projects may override which fixture builder to run (e.g. a large perf repo)
    // and pass extra args to it (e.g. a branch count).
    const fixtureScript: string =
      config.fixtureScript || "tests/fixtures/create-test-repo.sh";
    const fixtureArgs: string = config.fixtureArgs || "";
    const workerRepoPath = `${baseRepoPath}-w${testInfo.workerIndex}`;

    execSync(`bash ${fixtureScript} "${workerRepoPath}" ${fixtureArgs}`, {
      stdio: "pipe",
    });

    const vscodePath = process.env.VSCODE_PATH || getVSCodePath();

    const isHeaded = !!process.env.HEADED;

    const app = await electron.launch({
      executablePath: vscodePath,
      args: [
        workerRepoPath,
        `--extensionDevelopmentPath=${extensionPath}`,
        "--disable-other-extensions",
        "--skip-welcome",
        "--skip-release-notes",
        "--disable-workspace-trust",
        `--user-data-dir=/tmp/hydragit-test-vscode-data-${testInfo.workerIndex}`,
      ],
      env: {
        ...process.env,
        NODE_ENV: "test",
        ELECTRON_ENABLE_LOGGING: "1",
      },
    });

    // On macOS there's no true headless for Electron — minimize the window
    if (!isHeaded) {
      const win = await app.firstWindow();
      await win.evaluate(() => {
        // @ts-ignore — Electron BrowserWindow API
        require("electron").remote?.getCurrentWindow()?.minimize();
      }).catch(() => {});
    }

    await use(app);
    await app.close();
  },

  mainWindow: async ({ vscode }, use) => {
    const window = await vscode.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    // Wait for VS Code + extension to fully activate
    await window.waitForTimeout(5000);
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
