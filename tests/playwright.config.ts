import { defineConfig } from "@playwright/test";
import path from "path";

const REPO_DIR = "/tmp/hydragit-test-repo";
const EXTENSION_DIR = path.resolve(__dirname, "..");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1, // VS Code tests must run serially

  use: {
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "vscode",
      use: {
        // These are passed to the test fixtures
        extensionPath: EXTENSION_DIR,
        repoPath: REPO_DIR,
      } as any,
    },
  ],
});
