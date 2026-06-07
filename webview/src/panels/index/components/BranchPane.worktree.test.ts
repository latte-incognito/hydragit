import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import BranchPane from './BranchPane.svelte';

// WORKTREES section coverage: collapsed-by-default, rendering of branch/main/
// locked/detached rows, the create (+) affordance, and row click/right-click
// emits. Mirrors the tags/stashes test style in this folder. Branches are left
// empty so worktree branch labels don't collide with local-branch rows.

const worktrees = [
  { path: '/repo/main', head: 'aaaaaaa', branch: 'master', isMain: true, detached: false, bare: false, locked: false, prunable: false },
  { path: '/repo/wt-feature', head: 'bbbbbbb', branch: 'feature-x', isMain: false, detached: false, bare: false, locked: false, prunable: false },
] as any;

function expand(getByText: (t: string) => HTMLElement) {
  return fireEvent.click(getByText('Worktrees'));
}

describe('BranchPane — worktrees rendering', () => {
  it('worktrees section is collapsed by default', () => {
    const { queryByText, getByText } = render(BranchPane, { branches: [], stashes: [], worktrees, activeBranch: 'master' });
    expect(getByText('Worktrees')).toBeTruthy();
    expect(queryByText('feature-x')).toBeFalsy();
  });

  it('shows the worktree count', () => {
    const { getByText } = render(BranchPane, { branches: [], stashes: [], worktrees, activeBranch: 'master' });
    const header = getByText('Worktrees').closest('.tgroup-hdr') as HTMLElement;
    expect(header.querySelector('.tgroup-count')?.textContent).toBe('2');
  });

  it('renders a row per worktree with the branch label and a "main" badge', async () => {
    const { getByText, container } = render(BranchPane, { branches: [], stashes: [], worktrees, activeBranch: 'master' });
    await expand(getByText);
    const rows = container.querySelectorAll('.titem.worktree');
    expect(rows.length).toBe(2);
    expect(getByText('feature-x')).toBeTruthy();
    // The main worktree carries a "main" badge.
    const badge = container.querySelector('.titem.worktree.current .track');
    expect(badge?.textContent?.trim()).toBe('main');
  });

  it('shows the empty state when there are no worktrees', async () => {
    const { getByText } = render(BranchPane, { branches: [], stashes: [], worktrees: [], activeBranch: 'master' });
    await expand(getByText);
    expect(getByText('No worktrees')).toBeTruthy();
  });

  it('renders a detached worktree as a short hash', async () => {
    const detached = [
      { path: '/repo/det', head: 'cafebabe1234', branch: '', isMain: false, detached: true, bare: false, locked: false, prunable: false },
    ] as any;
    const { getByText } = render(BranchPane, { branches: [], stashes: [], worktrees: detached, activeBranch: 'master' });
    await expand(getByText);
    expect(getByText('cafebab (detached)')).toBeTruthy();
  });

  it('marks a locked worktree with a "locked" badge', async () => {
    const locked = [
      { path: '/repo/l', head: 'd', branch: 'held', isMain: false, detached: false, bare: false, locked: true, lockReason: 'why', prunable: false },
    ] as any;
    const { getByText } = render(BranchPane, { branches: [], stashes: [], worktrees: locked, activeBranch: 'master' });
    await expand(getByText);
    expect(getByText('locked')).toBeTruthy();
  });
});

describe('BranchPane — worktree emits', () => {
  it('clicking a worktree row fires onSelectWorktree with its path', async () => {
    const onSelectWorktree = vi.fn();
    const { getByText } = render(BranchPane, { branches: [], stashes: [], worktrees, activeBranch: 'master', onSelectWorktree });
    await expand(getByText);
    await fireEvent.click(getByText('feature-x'));
    expect(onSelectWorktree).toHaveBeenCalledWith('/repo/wt-feature');
  });

  it('right-clicking a worktree row fires onWorktreeCtx with the worktree', async () => {
    const onWorktreeCtx = vi.fn();
    const { getByText } = render(BranchPane, { branches: [], stashes: [], worktrees, activeBranch: 'master', onWorktreeCtx });
    await expand(getByText);
    const row = getByText('feature-x').closest('.titem') as HTMLElement;
    await fireEvent.contextMenu(row);
    expect(onWorktreeCtx).toHaveBeenCalledWith(expect.anything(), worktrees[1]);
  });
});
