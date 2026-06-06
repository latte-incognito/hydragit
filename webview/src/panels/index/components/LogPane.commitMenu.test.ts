import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import LogPane from './LogPane.svelte';
import type { Commit } from '../types';

// Emit + wiring coverage for the COMMIT context menu (rendered in LogPane, shown
// on right-click of a commit row). This was the untested 4th context menu.
//
// Two commits so Go-to-parent/child have somewhere to go: c1's parent is c0.
function commits(): Commit[] {
  return [
    { hash: 'aaaaaaaaaaaa', parents: ['bbbbbbbbbbbb'], author: 'A', date: '2026-01-02T00:00:00Z', message: 'child', refs: [], lane: 0, seg: 0 } as unknown as Commit,
    { hash: 'bbbbbbbbbbbb', parents: [], author: 'B', date: '2026-01-01T00:00:00Z', message: 'root', refs: [], lane: 0, seg: 0 } as unknown as Commit,
  ];
}

// Right-click row `idx`, then click the menu item with the given text.
async function openAndClick(rowIdx: number, text: string, onCommitAction = vi.fn(), onSelect = vi.fn()) {
  const cs = commits();
  const { container, getByText } = render(LogPane, {
    commits: cs, selectedIdx: null, onCommitAction, onSelect,
  });
  const rows = container.querySelectorAll('.crow');
  await fireEvent.contextMenu(rows[rowIdx]);
  await fireEvent.click(getByText(text));
  return { onCommitAction, onSelect, cs };
}

// [menu label, emitted action] — items that ARE wired (have on:click → runAction)
const WIRED: [string, string][] = [
  ['Copy Revision Number', 'copy-hash'],
  ['Cherry-Pick', 'cherry-pick'],
  ['Checkout Revision', 'checkout'],
  ['Reset Current Branch to Here…', 'reset'],
  ['Revert Commit', 'revert'],
  ['New Branch…', 'new-branch'],
  ['New Tag…', 'new-tag'],
  ['View in browser', 'view-in-browser'],
  ['Squash with Parent', 'squash'],
];

describe('Commit context menu — wired items emit onCommitAction', () => {
  WIRED.forEach(([label, action]) => {
    it(`"${label}" emits onCommitAction("${action}", commit)`, async () => {
      const { onCommitAction, cs } = await openAndClick(0, label);
      expect(onCommitAction).toHaveBeenCalledWith(action, cs[0]);
    });
  });
});

describe('Commit context menu — navigation items', () => {
  it('"Go to Parent Commit" selects the parent row', async () => {
    // right-click the child (row 0); its parent is c1 (row 1)
    const { onSelect } = await openAndClick(0, 'Go to Parent Commit');
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('"Go to Child Commit" selects the child row', async () => {
    // right-click the root (row 1); its child is c0 (row 0)
    const { onSelect } = await openAndClick(1, 'Go to Child Commit');
    expect(onSelect).toHaveBeenCalledWith(0);
  });
});

// Items that render as enabled (NOT dimmed) but have NO on:click handler — they
// do nothing when clicked. These FAIL by design (red CI), naming each dead item
// so it gets wired or removed. Dimmed items (Undo/Fixup/Squash) are intentionally
// disabled and excluded.
// 'Show Repository at Revision' is intentionally deferred (dimmed/disabled), so
// it joins Undo/Fixup/Squash in the excluded set rather than this bug-hunt list.
const DEAD_BUT_ENABLED = [
  'Create Patch…',
  'Compare with Local',
  'Edit Commit Message…',
  'Drop Commit',
  'Interactively Rebase from Here…',
  'Push All up to Here…',
];

describe('Commit context menu — enabled items must do something (BUG hunt)', () => {
  DEAD_BUT_ENABLED.forEach((label) => {
    it(`"${label}" should emit an action when clicked`, async () => {
      const { onCommitAction } = await openAndClick(0, label);
      expect(onCommitAction).toHaveBeenCalled();
    });
  });
});
