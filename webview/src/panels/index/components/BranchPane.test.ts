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
    const { getByTitle } = render(BranchPane, { branches, stashes: [], activeBranch: 'main', onNewBranch });

    // Target the Branches header "+" by title — the Worktrees header also has a "+".
    await fireEvent.click(getByTitle('New branch'));
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

// ── remote origin group toggle ───────────────────────────────────────────────

describe('BranchPane — origin group toggle', () => {
  it('collapses and re-expands an origin group on header click', async () => {
    const { getAllByText, getByText } = render(BranchPane, { branches, stashes: [], activeBranch: 'main' });

    // visible in both local and remote sections initially
    expect(getAllByText('feature-x').length).toBe(2);

    // collapse the origin group — remote copy disappears
    await fireEvent.click(getByText('origin'));
    expect(getAllByText('feature-x').length).toBe(1);

    // expand again — remote copy is back
    await fireEvent.click(getByText('origin'));
    expect(getAllByText('feature-x').length).toBe(2);
  });
});

// ── snapshots ────────────────────────────────────────────────────────────────

describe('BranchPane — snapshots', () => {
  const snapshots = [
    { ref: 'refs/hydragit/snapshots/1', hash: 'abc1234', date: '2026-01-01T00:00:00Z', label: 'before reset', branch: 'develop' },
  ];

  it('shows the capture branch next to the label', async () => {
    const { getByText } = render(BranchPane, { branches, stashes: [], snapshots, activeBranch: 'main' });

    await fireEvent.click(getByText('Snapshots'));
    expect(getByText('before reset')).toBeTruthy();
    expect(getByText('· develop')).toBeTruthy();
  });

  it('renders a branchless (pre-0.2.7) snapshot without a branch suffix', async () => {
    const old = [{ ref: 'refs/hydragit/snapshots/0', hash: 'def5678', date: '2026-01-01T00:00:00Z', label: 'before rebase' }];
    const { getByText, container } = render(BranchPane, { branches, stashes: [], snapshots: old, activeBranch: 'main' });

    await fireEvent.click(getByText('Snapshots'));
    expect(getByText('before rebase')).toBeTruthy();
    expect(container.querySelector('.snap-branch')).toBeFalsy();
  });

  it('calls onSnapshotSelect with the snapshot when a row is clicked', async () => {
    const onSnapshotSelect = vi.fn();
    const { getByText } = render(BranchPane, { branches, stashes: [], snapshots, activeBranch: 'main', onSnapshotSelect });

    await fireEvent.click(getByText('Snapshots'));
    await fireEvent.click(getByText('before reset'));
    expect(onSnapshotSelect).toHaveBeenCalledWith(snapshots[0]);
  });

  it('shows the empty state when there are no snapshots', async () => {
    const { getByText } = render(BranchPane, { branches, stashes: [], snapshots: [], activeBranch: 'main' });

    await fireEvent.click(getByText('Snapshots'));
    expect(getByText('No snapshots — taken automatically before risky operations')).toBeTruthy();
  });
});
