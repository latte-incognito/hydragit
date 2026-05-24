import { defineConfig } from "@playwright/test";

const REPO_DIR = "/tmp/hydragit-test-repo";
const EXTENSION_DIR = __dirname;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "vscode",
      use: {
        extensionPath: EXTENSION_DIR,
        repoPath: REPO_DIR,
      } as any,
    },
  ],
});
