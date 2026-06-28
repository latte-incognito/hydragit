import { defineConfig } from "@playwright/test";

const REPO_DIR = "/tmp/hydragit-test-repo";
const PERF_REPO_DIR = "/tmp/hydragit-perf-repo";
const FORK3_REPO_DIR = "/tmp/hydragit-fork3-repo";
const FORK50_REPO_DIR = "/tmp/hydragit-fork50-repo";
const CONFLICT_REPO_DIR = "/tmp/hydragit-conflict-repo";
const DIRTY_REPO_DIR = "/tmp/hydragit-dirty-repo";
const MULTI_REPO_DIR = "/tmp/hydragit-multi-repo";
const EXTENSION_DIR = __dirname;

// Specs that belong to their own dedicated-fixture project, not the default one.
// (The e2e-* cluster files for staging/hunks/discard run on the dirty project;
// e2e-multi-repo runs on its own two-repo workspace.)
const DEDICATED_SPECS = /graph-perf\.spec\.ts|graph-fork\d+\.spec\.ts|conflict\.spec\.ts|journeys-dirty\.spec\.ts|safety-settings\.spec\.ts|hunks\.spec\.ts|e2e-commit-staging\.spec\.ts|e2e-discard\.spec\.ts|e2e-multi-repo\.spec\.ts/;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  // One retry on CI (Electron/VS Code startup is flakier on slow runners);
  // none locally so a flake fails loudly on your machine.
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
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
    {
      // Conflict project: repo left in a conflicted merge (UU). Exercises the
      // sidebar's merge-conflict handling (BUGS.MD #19).
      name: "vscode-conflict",
      testMatch: /conflict\.spec\.ts/,
      use: {
        extensionPath: EXTENSION_DIR,
        repoPath: CONFLICT_REPO_DIR,
        fixtureScript: "tests/fixtures/create-conflict-repo.sh",
      } as any,
    },
    {
      // Dirty project: repo with uncommitted changes. Exercises stage / commit /
      // stash journeys (S10, S11) and the protected-branch settings (SS1–SS3).
      name: "vscode-dirty",
      testMatch: /journeys-dirty\.spec\.ts|safety-settings\.spec\.ts|hunks\.spec\.ts|e2e-commit-staging\.spec\.ts|e2e-discard\.spec\.ts/,
      use: {
        extensionPath: EXTENSION_DIR,
        repoPath: DIRTY_REPO_DIR,
        fixtureScript: "tests/fixtures/create-dirty-repo.sh",
      } as any,
    },
    {
      // Multi-repo project: a parent folder with two nested git repos (repo-a,
      // repo-b). Exercises the grouped sidebar + focused main panel + isolation.
      name: "vscode-multi",
      testMatch: /e2e-multi-repo\.spec\.ts/,
      use: {
        extensionPath: EXTENSION_DIR,
        repoPath: MULTI_REPO_DIR,
        fixtureScript: "tests/fixtures/create-multi-repo.sh",
      } as any,
    },
  ],
});
