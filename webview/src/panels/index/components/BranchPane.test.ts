import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import BranchPane from './BranchPane.svelte';

const localBranches = [
  { name: 'main', isCurrent: true, isRemote: false, upstream: 'origin/main', trackShort: '', gone: false },
  { name: 'feature-x', isCurrent: false, isRemote: false, upstream: '', trackShort: '', gone: false },
];

const remoteBranches = [
  { name: 'origin/main', isCurrent: false, isRemote: true, upstream: '', trackShort: '', gone: false },
  { name: 'origin/feature-x', isCurrent: false, isRemote: true, upstream: '', trackShort: '', gone: false },
];

const branches = [...localBranches, ...remoteBranches];

const stashes = [
  { index: 0, message: 'WIP: my stash', ref: 'stash@{0}', time: '2026-01-01' },
];

// ── rendering ─────────────────────────────────────────────────────────────────

describe('BranchPane — rendering', () => {
  it('bug-07: tags section is collapsed by default', () => {
    const tags = [{ name: 'v1.0.0', hash: 'abc123' }];
    const { queryByText, getByText } = render(BranchPane, { branches, stashes: [], tags, activeBranch: 'main' });
    // Tag name should NOT be visible (collapsed)
    expect(queryByText('v1.0.0')).toBeFalsy();
    // But the Tags header should be visible
    expect(getByText('Tags')).toBeTruthy();
  });

  it('renders local branch names', () => {
    const { getAllByText } = render(BranchPane, { branches, stashes: [], activeBranch: 'main' });
    expect(getAllByText('main').length).toBeGreaterThan(0);
    expect(getAllByText('feature-x').length).toBeGreaterThan(0);
  });

  it('renders remote branch names without origin/ prefix', () => {
    const { getAllByText } = render(BranchPane, { branches, stashes: [], activeBranch: 'main' });
    // remote shows as "feature-x" not "origin/feature-x" — appears in both local + remote sections
    expect(getAllByText('feature-x').length).toBe(2);
  });

  it('renders stash message', async () => {
    const { getByText } = render(BranchPane, { branches, stashes, activeBranch: 'main' });
    await fireEvent.click(getByText('Stashes'));
    expect(getByText('WIP: my stash')).toBeTruthy();
  });

  it('HEAD row is labelled "HEAD · <branch>"', () => {
    const { getByText } = render(BranchPane, { branches, stashes: [], activeBranch: 'main' });
    // click behaviour (onHead) is covered in BranchPane.emit.test.ts
    expect(getByText('HEAD · main')).toBeTruthy();
  });

  it('shows no stashes empty state', async () => {
    const { getByText } = render(BranchPane, { branches, stashes: [], activeBranch: 'main' });
    await fireEvent.click(getByText('Stashes'));
    expect(getByText('No stashes')).toBeTruthy();
  });

  it('shows local and remote counts', () => {
    const { getAllByText } = render(BranchPane, { branches, stashes: [], activeBranch: 'main' });
    const counts = getAllByText('2');
    expect(counts.length).toBe(2); // one for local, one for remote
  });
});

// ── branch selection ──────────────────────────────────────────────────────────

describe('BranchPane — branch selection', () => {
  it('calls onSelectBranch with name and false for local branch click', async () => {
    const onSelectBranch = vi.fn();
    const { getAllByText } = render(BranchPane, { branches, stashes: [], activeBranch: 'main', onSelectBranch });

    // first occurrence is in the local section
    const items = getAllByText('feature-x');
    await fireEvent.click(items[0]);
    expect(onSelectBranch).toHaveBeenCalledWith('feature-x', false);
  });

  it('calls onSelectBranch with true for remote branch click', async () => {
    const onSelectBranch = vi.fn();
    const { getAllByText } = render(BranchPane, { branches, stashes: [], activeBranch: 'main', onSelectBranch });

    // second occurrence is in the remote section
    const items = getAllByText('feature-x');
    await fireEvent.click(items[items.length - 1]);
    expect(onSelectBranch).toHaveBeenCalledWith('origin/feature-x', true);
  });

  it('calls onNewBranch when + is clicked', async () => {
    const onNewBranch = vi.fn();
    const { getByText } = render(BranchPane, { branches, stashes: [], activeBranch: 'main', onNewBranch });

    await fireEvent.click(getByText('+'));
    expect(onNewBranch).toHaveBeenCalledOnce();
  });
});

// ── stash selection ──────────────────────────────────────────────────────────

describe('BranchPane — stash selection', () => {
  it('calls onSelectStash with index when stash row clicked', async () => {
    const onSelectStash = vi.fn();
    const { getByText } = render(BranchPane, { branches, stashes, activeBranch: 'main', onSelectStash });

    await fireEvent.click(getByText('Stashes'));
    await fireEvent.click(getByText('WIP: my stash'));
    expect(onSelectStash).toHaveBeenCalledWith(0);
  });
});
