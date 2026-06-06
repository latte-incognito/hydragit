import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import BranchPane from './BranchPane.svelte';

// Emit-gap coverage for BranchPane: the controls existing tests don't assert —
// the HEAD row, the right-click context-menu triggers (branch/tag/stash), and
// tag selection. (onSelectBranch/onNewBranch/onSelectStash are covered in
// BranchPane.test.ts.)

const branches = [
  { name: 'main', isCurrent: true, isRemote: false },
  { name: 'feature-x', isCurrent: false, isRemote: false },
] as any;
const tags = [{ name: 'v1.0', hash: 'abc1234', date: '2026-01-01' }];
const stashes = [{ index: 0, message: 'wip on main', ref: 'stash@{0}' }] as any;

describe('BranchPane — HEAD row', () => {
  it('clicking the HEAD row opens the undo timeline (onHead), not branch select', async () => {
    const onHead = vi.fn();
    const onSelectBranch = vi.fn();
    const { container } = render(BranchPane, {
      branches, stashes: [], tags: [], activeBranch: 'main', onHead, onSelectBranch,
    });
    const head = container.querySelector('.titem.head') as HTMLElement;
    expect(head).toBeTruthy();
    await fireEvent.click(head);
    expect(onHead).toHaveBeenCalled();
    expect(onSelectBranch).not.toHaveBeenCalled();
  });
});

describe('BranchPane — folder rename', () => {
  it('right-clicking a branch folder fires onFolderCtx with the prefix', async () => {
    const onFolderCtx = vi.fn();
    const folderBranches = [
      { name: 'feature/alpha', isCurrent: false, isRemote: false },
      { name: 'feature/beta', isCurrent: false, isRemote: false },
    ] as any;
    const { container } = render(BranchPane, {
      branches: folderBranches, stashes: [], tags: [], activeBranch: 'feature/alpha', onFolderCtx,
    });
    const folder = container.querySelector('.folder-row') as HTMLElement;
    expect(folder).toBeTruthy();
    await fireEvent.contextMenu(folder);
    expect(onFolderCtx).toHaveBeenCalledWith(expect.anything(), 'feature');
  });
});

describe('BranchPane — context-menu triggers', () => {
  it('right-clicking a branch row fires onBranchCtx', async () => {
    const onBranchCtx = vi.fn();
    const { getAllByText } = render(BranchPane, { branches, stashes: [], tags: [], activeBranch: 'main', onBranchCtx });
    const row = getAllByText('feature-x')[0].closest('.titem') as HTMLElement;
    await fireEvent.contextMenu(row);
    expect(onBranchCtx).toHaveBeenCalledWith(expect.anything(), 'feature-x', false);
  });

  it('right-clicking a stash row fires onStashCtx', async () => {
    const onStashCtx = vi.fn();
    const { getByText } = render(BranchPane, { branches, stashes, tags: [], activeBranch: 'main', onStashCtx });
    await fireEvent.click(getByText('Stashes')); // expand (stashOpen defaults false)
    const row = getByText('wip on main').closest('.titem') as HTMLElement;
    await fireEvent.contextMenu(row);
    expect(onStashCtx).toHaveBeenCalledWith(expect.anything(), 0);
  });
});

describe('BranchPane — tags', () => {
  it('clicking a tag fires onTagSelect with its hash', async () => {
    const onTagSelect = vi.fn();
    const { getByText } = render(BranchPane, { branches, stashes: [], tags, activeBranch: 'main', onTagSelect });
    await fireEvent.click(getByText('Tags')); // expand (tagsOpen defaults false)
    await fireEvent.click(getByText('v1.0'));
    expect(onTagSelect).toHaveBeenCalledWith('abc1234');
  });

  it('right-clicking a tag fires onTagCtx with its name', async () => {
    const onTagCtx = vi.fn();
    const { getByText } = render(BranchPane, { branches, stashes: [], tags, activeBranch: 'main', onTagCtx });
    await fireEvent.click(getByText('Tags'));
    const row = getByText('v1.0').closest('.titem') as HTMLElement;
    await fireEvent.contextMenu(row);
    expect(onTagCtx).toHaveBeenCalledWith(expect.anything(), 'v1.0');
  });
});
