import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ContextMenu from './ContextMenu.svelte';

// Worktree context menu: item set, lock/unlock toggle by state, main-worktree
// disabling, and action emits.

const linkedWt = {
  path: '/repo/wt-feature',
  head: 'bbbbbbb',
  branch: 'feature-x',
  isMain: false,
  detached: false,
  bare: false,
  locked: false,
  prunable: false,
} as any;

const menu = (wt: any) => ({ visible: true, x: 50, y: 50, wt });

describe('ContextMenu — worktree', () => {
  it('renders the worktree menu items for a linked, unlocked worktree', () => {
    const { getByText } = render(ContextMenu, { worktreeMenu: menu(linkedWt) });
    expect(getByText('Open in New Window')).toBeTruthy();
    expect(getByText('Lock')).toBeTruthy();
    expect(getByText('Move…')).toBeTruthy();
    expect(getByText('Prune Stale Worktrees')).toBeTruthy();
    expect(getByText('Remove')).toBeTruthy();
  });

  it('shows Unlock instead of Lock when the worktree is locked', () => {
    const { getByText, queryByText } = render(ContextMenu, {
      worktreeMenu: menu({ ...linkedWt, locked: true }),
    });
    expect(getByText('Unlock')).toBeTruthy();
    expect(queryByText('Lock')).toBeFalsy();
  });

  it('disables open/lock/move/remove for the main worktree', () => {
    const { getByText } = render(ContextMenu, { worktreeMenu: menu({ ...linkedWt, isMain: true }) });
    expect(getByText('Open in New Window').classList.contains('disabled')).toBe(true);
    expect(getByText('Lock').classList.contains('disabled')).toBe(true);
    expect(getByText('Move…').classList.contains('disabled')).toBe(true);
    expect(getByText('Remove').classList.contains('disabled')).toBe(true);
    // Prune is repo-wide, never disabled.
    expect(getByText('Prune Stale Worktrees').classList.contains('disabled')).toBe(false);
  });

  it('emits the right action for each item', async () => {
    const onWorktreeAction = vi.fn();
    const { getByText } = render(ContextMenu, { worktreeMenu: menu(linkedWt), onWorktreeAction });
    await fireEvent.click(getByText('Open in New Window'));
    await fireEvent.click(getByText('Lock'));
    await fireEvent.click(getByText('Move…'));
    await fireEvent.click(getByText('Prune Stale Worktrees'));
    await fireEvent.click(getByText('Remove'));
    expect(onWorktreeAction.mock.calls.map((c) => c[0])).toEqual([
      'open',
      'lock',
      'move',
      'prune',
      'remove',
    ]);
  });

  it('does not render when wt is null', () => {
    const { queryByText } = render(ContextMenu, { worktreeMenu: { visible: true, x: 0, y: 0, wt: null } });
    expect(queryByText('Open in New Window')).toBeFalsy();
  });
});
