import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import InteractiveRebase from './InteractiveRebase.svelte';

// DOM-level coverage for the rebase editor: rendering, button reorder, the
// default Start emission, the invalid-state rendering, and cancel/overlay
// dismissal. The per-action validation + plan-building rules are unit-tested
// directly in interactiveRebasePlan.test.ts (the editor's <select bind:value>
// can't be driven under jsdom — Svelte 5's select writeback doesn't run there —
// so that logic was extracted to a pure module rather than tested through the DOM).

const commits = [
  { sha: 'aaaaaaaaaa', subject: 'A oldest' },
  { sha: 'bbbbbbbbbb', subject: 'B middle' },
  { sha: 'cccccccccc', subject: 'C newest' },
];

function selects(container: HTMLElement) {
  return Array.from(container.querySelectorAll('.ir-action')) as HTMLSelectElement[];
}
function startBtn(container: HTMLElement) {
  return container.querySelector('.ir-btn--primary') as HTMLButtonElement;
}

describe('InteractiveRebase — rendering', () => {
  it('renders one row per commit with short sha, subject and a default pick action', () => {
    const { container, getByText } = render(InteractiveRebase, { commits });
    expect(container.querySelectorAll('.ir-row')).toHaveLength(3);
    expect(getByText('aaaaaaa')).toBeTruthy(); // 7-char short sha
    expect(getByText('A oldest')).toBeTruthy();
    expect(selects(container).every((s) => s.value === 'pick')).toBe(true);
  });

  it('exposes all four actions in each row dropdown', () => {
    const { container } = render(InteractiveRebase, { commits });
    const opts = Array.from(selects(container)[0].options).map((o) => o.value);
    expect(opts).toEqual(['pick', 'squash', 'fixup', 'drop']);
  });
});

describe('InteractiveRebase — plan emission', () => {
  it('Start emits the default all-pick plan in oldest-first order', async () => {
    const onStart = vi.fn();
    const { container } = render(InteractiveRebase, { commits, onStart });
    await fireEvent.click(startBtn(container));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith([
      { sha: 'aaaaaaaaaa', action: 'pick' },
      { sha: 'bbbbbbbbbb', action: 'pick' },
      { sha: 'cccccccccc', action: 'pick' },
    ]);
  });

  it('Move down reorders the emitted plan', async () => {
    const onStart = vi.fn();
    const { container } = render(InteractiveRebase, { commits, onStart });

    // "Move down" on the first row swaps A and B.
    const firstDown = container.querySelector('.ir-row .ir-move[aria-label="Move down"]') as HTMLButtonElement;
    await fireEvent.click(firstDown);
    await fireEvent.click(startBtn(container));

    expect(onStart.mock.calls[0][0].map((r: any) => r.sha)).toEqual([
      'bbbbbbbbbb',
      'aaaaaaaaaa',
      'cccccccccc',
    ]);
  });

  it('Move up on the first row is a no-op (button disabled)', () => {
    const { container } = render(InteractiveRebase, { commits });
    const firstUp = container.querySelector('.ir-row .ir-move[aria-label="Move up"]') as HTMLButtonElement;
    expect(firstUp.disabled).toBe(true);
  });
});

describe('InteractiveRebase — invalid state rendering', () => {
  it('with no commits, Start is disabled and the guidance warning shows', () => {
    const { container, getByText } = render(InteractiveRebase, { commits: [] });
    expect(startBtn(container).disabled).toBe(true);
    expect(getByText(/first kept commit must be/i)).toBeTruthy();
  });

  it('with commits (all pick), Start is enabled and no warning shows', () => {
    const { container, queryByText } = render(InteractiveRebase, { commits });
    expect(startBtn(container).disabled).toBe(false);
    expect(queryByText(/first kept commit must be/i)).toBeNull();
  });
});

describe('InteractiveRebase — cancel', () => {
  it('Cancel fires onCancel and does not start', async () => {
    const onStart = vi.fn();
    const onCancel = vi.fn();
    const { getByText } = render(InteractiveRebase, { commits, onStart, onCancel });
    await fireEvent.click(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('clicking the overlay backdrop cancels', async () => {
    const onCancel = vi.fn();
    const { container } = render(InteractiveRebase, { commits, onCancel });
    await fireEvent.click(container.querySelector('.ir-overlay') as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
