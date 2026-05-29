import { defineConfig } from "@playwright/test";

const REPO_DIR = "/tmp/hydragit-test-repo";
const PERF_REPO_DIR = "/tmp/hydragit-perf-repo";
const FORK3_REPO_DIR = "/tmp/hydragit-fork3-repo";
const FORK50_REPO_DIR = "/tmp/hydragit-fork50-repo";
const EXTENSION_DIR = __dirname;

// Specs that belong to their own dedicated-fixture project, not the default one.
const DEDICATED_SPECS = /graph-perf\.spec\.ts|graph-fork\d+\.spec\.ts/;

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
      // specs that need their own dedicated fixture (slow / wide repos).
      name: "vscode",
      testIgnore: DEDICATED_SPECS,
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
    {
      // 3 developers fork from one base and merge back — narrow fork-merge graph.
      name: "vscode-fork3",
      testMatch: /graph-fork3\.spec\.ts/,
      use: {
        extensionPath: EXTENSION_DIR,
        repoPath: FORK3_REPO_DIR,
        fixtureScript: "tests/fixtures/create-fork-merge-repo.sh",
        fixtureArgs: "3",
      } as any,
    },
    {
      // 50 developers fork from one base and merge back — WIDE fork-merge graph.
      name: "vscode-fork50",
      testMatch: /graph-fork50\.spec\.ts/,
      timeout: 180_000, // 150+ commits across 50 lanes — give the render headroom
      use: {
        extensionPath: EXTENSION_DIR,
        repoPath: FORK50_REPO_DIR,
        fixtureScript: "tests/fixtures/create-fork-merge-repo.sh",
        fixtureArgs: "50",
      } as any,
    },
  ],
});
