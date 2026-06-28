// Pure worktree-creation helpers, extracted from App.svelte so they can be
// unit-tested (the same pattern as syncPlan.ts / stashRedirect.ts /
// interactiveRebasePlan.ts).
import { shortBranchName } from './refName';

// Default filesystem path for a new worktree, following the GitLens convention:
// a sibling "<repo>.worktrees/" folder, keyed by branch name with path
// separators flattened. Derived from the main worktree's absolute path so it
// works regardless of the current working directory.
export function worktreeDefaultPath(
  branch: string,
  worktrees: { isMain: boolean; path: string }[],
): string {
  const safe = branch.replace(/[\\/]/g, '-');
  const main = worktrees.find((w) => w.isMain)?.path ?? '';
  if (!main) return `../worktrees/${safe}`;
  const parts = main.split(/[\\/]/);
  const repo = parts.pop() || 'repo';
  const parent = parts.join('/');
  return `${parent}/${repo}.worktrees/${safe}`;
}

export interface WorktreeBranchOption {
  label: string;
  description: string;
}

// worktreeBranchOptions builds the QuickPick list for "create worktree": a
// "create new branch" sentinel first, then local branches, then remote branches
// that have no local of the same short name (picking one creates a local
// tracking branch, GitLens-style). A branch can live in only one worktree, so
// any branch already checked out in a worktree is hidden (this also covers the
// current branch, via the main worktree).
export function worktreeBranchOptions(
  branches: { name: string; isRemote: boolean; trackShort?: string }[],
  worktrees: { branch?: string }[],
  activeBranch: string,
  newLabel: string,
): WorktreeBranchOption[] {
  const inWorktree = new Set(worktrees.map((w) => w.branch).filter(Boolean));
  const locals = branches.filter((b) => !b.isRemote);
  const localNames = new Set(locals.map((b) => b.name));

  const localItems = locals
    .filter((b) => !inWorktree.has(b.name))
    .map((b) => ({ label: b.name, description: b.trackShort ? `local · ${b.trackShort}` : 'local' }));

  const remoteItems = branches
    .filter((b) => b.isRemote)
    .map((b) => ({ full: b.name, short: shortBranchName(b.name) }))
    .filter((r) => r.short !== 'HEAD' && !localNames.has(r.short) && !inWorktree.has(r.short))
    .map((r) => ({ label: r.full, description: `remote → new branch '${r.short}'` }));

  return [{ label: newLabel, description: `from ${activeBranch}` }, ...localItems, ...remoteItems];
}
