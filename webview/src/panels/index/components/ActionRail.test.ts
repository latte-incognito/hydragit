import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ActionRail from './ActionRail.svelte';

// The main-panel action rail. Each icon button is positional (SVG, no text), so
// we select by DOM order and assert it fires onAction with the documented name.
// Order matches ActionRail.svelte top-to-bottom.
const RAIL_ACTIONS = [
  'sync',                           // primary — fetch + integrate
  'branch.switch',                  // checkout — high-frequency, kept near the top
  'fetch', 'pull', 'push',          // granular remote group
  'branch.new', 'merge', 'rebase', 'branch.delete', // branch group
  'stash.save', 'tag',              // stash / tag group
  'worktree.new',                   // new worktree (purple accent)
];

describe('ActionRail', () => {
  it('renders exactly one button per action', () => {
    const { container } = render(ActionRail, {});
    const btns = container.querySelectorAll('button.rail-btn');
    expect(btns.length).toBe(RAIL_ACTIONS.length);
  });

  it('each button fires onAction with the correct name, in order', async () => {
    const onAction = vi.fn();
    const { container } = render(ActionRail, { onAction });
    const btns = container.querySelectorAll('button.rail-btn');

    for (let i = 0; i < RAIL_ACTIONS.length; i++) {
      await fireEvent.click(btns[i]);
      expect(onAction).toHaveBeenNthCalledWith(i + 1, RAIL_ACTIONS[i]);
    }
    expect(onAction).toHaveBeenCalledTimes(RAIL_ACTIONS.length);
  });

  it('highlights the pull button when hasPending is true', () => {
    const { container } = render(ActionRail, { hasPending: true });
    const pending = container.querySelectorAll('button.rail-btn.pending');
    expect(pending.length).toBe(1);
  });

  it('marks the delete button as danger', () => {
    const { container } = render(ActionRail, {});
    const danger = container.querySelectorAll('button.rail-btn.danger');
    expect(danger.length).toBe(1);
  });

  it('marks the worktree button purple and fires worktree.new', async () => {
    const onAction = vi.fn();
    const { container } = render(ActionRail, { onAction });
    const wt = container.querySelector('button.rail-btn.worktree') as HTMLElement;
    expect(wt).toBeTruthy();
    await fireEvent.click(wt);
    expect(onAction).toHaveBeenCalledWith('worktree.new');
  });

  it('Sync is the first, primary-accented button', async () => {
    const onAction = vi.fn();
    const { container } = render(ActionRail, { onAction });
    const first = container.querySelector('button.rail-btn') as HTMLElement;
    expect(first.classList.contains('primary')).toBe(true);
    await fireEvent.click(first);
    expect(onAction).toHaveBeenCalledWith('sync');
  });

  it('does not fire onAction before any click', () => {
    const onAction = vi.fn();
    render(ActionRail, { onAction });
    expect(onAction).not.toHaveBeenCalled();
  });
});
