import { describe, it, expect } from 'vitest';
import { worktreeDefaultPath, worktreeBranchOptions } from './worktreePath';

describe('worktreeDefaultPath', () => {
  it('uses a sibling <repo>.worktrees folder derived from the main worktree', () => {
    expect(worktreeDefaultPath('feature', [{ isMain: true, path: '/home/me/proj' }])).toBe(
      '/home/me/proj.worktrees/feature',
    );
  });

  it('flattens path separators in the branch name', () => {
    expect(worktreeDefaultPath('feat/x', [{ isMain: true, path: '/a/b/repo' }])).toBe(
      '/a/b/repo.worktrees/feat-x',
    );
  });

  it('picks the main worktree, ignoring linked ones', () => {
    const wts = [
      { isMain: false, path: '/a/other' },
      { isMain: true, path: '/a/main-repo' },
    ];
    expect(worktreeDefaultPath('dev', wts)).toBe('/a/main-repo.worktrees/dev');
  });

  it('falls back to ../worktrees when no main worktree is known', () => {
    expect(worktreeDefaultPath('feature', [])).toBe('../worktrees/feature');
  });

  it('handles a Windows-style backslash main path', () => {
    expect(worktreeDefaultPath('feature', [{ isMain: true, path: 'C:\\src\\repo' }])).toBe(
      'C:/src/repo.worktrees/feature',
    );
  });
});

describe('worktreeBranchOptions', () => {
  const NEW = '✚ new';

  it('lists the new-branch sentinel first, then locals, then eligible remotes', () => {
    const branches = [
      { name: 'main', isRemote: false, trackShort: 'origin/main' },
      { name: 'dev', isRemote: false },
      { name: 'origin/feature', isRemote: true },
    ];
    const opts = worktreeBranchOptions(branches, [], 'main', NEW);
    expect(opts.map((o) => o.label)).toEqual([NEW, 'main', 'dev', 'origin/feature']);
    expect(opts[0].description).toBe('from main');
    expect(opts[1].description).toBe('local · origin/main');
    expect(opts[3].description).toBe("remote → new branch 'feature'");
  });

  it('hides branches already checked out in a worktree', () => {
    const branches = [
      { name: 'main', isRemote: false },
      { name: 'dev', isRemote: false },
    ];
    const opts = worktreeBranchOptions(branches, [{ branch: 'dev' }], 'main', NEW);
    expect(opts.map((o) => o.label)).toEqual([NEW, 'main']);
  });

  it('drops a remote when a local of the same short name exists, and skips HEAD', () => {
    const branches = [
      { name: 'feature', isRemote: false },
      { name: 'origin/feature', isRemote: true },
      { name: 'origin/HEAD', isRemote: true },
      { name: 'origin/solo', isRemote: true },
    ];
    const opts = worktreeBranchOptions(branches, [], 'feature', NEW);
    expect(opts.map((o) => o.label)).toEqual([NEW, 'feature', 'origin/solo']);
  });
});
