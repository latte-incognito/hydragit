import { defineConfig } from "@playwright/test";

const REPO_DIR = "/tmp/hydragit-test-repo";
const PERF_REPO_DIR = "/tmp/hydragit-perf-repo";
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
      // Default project: rich-topology fixture. Runs everything except the
      // large perf repo (which is slow to build and belongs to its own project).
      name: "vscode",
      testIgnore: /graph-perf\.spec\.ts/,
      use: {
        extensionPath: EXTENSION_DIR,
        repoPath: REPO_DIR,
        fixtureScript: "tests/fixtures/create-test-repo.sh",
      } as any,
    },
    {
      // Perf project: 1000+ commit fixture, only the scroll/perf spec.
      name: "vscode-perf",
      testMatch: /graph-perf\.spec\.ts/,
      timeout: 180_000, // building the big repo + first render needs headroom
      use: {
        extensionPath: EXTENSION_DIR,
        repoPath: PERF_REPO_DIR,
        fixtureScript: "tests/fixtures/create-perf-repo.sh",
      } as any,
    },
  ],
});
