import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ReflogPane from './ReflogPane.svelte';

const entries = [
  { hash: 'aaaaaaa1111', selector: 'HEAD@{0}', subject: 'commit: third', date: '2026-06-06T00:49:37-07:00' },
  { hash: 'bbbbbbb2222', selector: 'HEAD@{1}', subject: 'reset: moving to HEAD~1', date: '2026-06-05T09:05:11-07:00' },
];

describe('ReflogPane', () => {
  it('renders each reflog entry (selector + subject)', () => {
    const { getByText } = render(ReflogPane, { entries });
    expect(getByText('HEAD@{0}')).toBeTruthy();
    expect(getByText('commit: third')).toBeTruthy();
    expect(getByText('reset: moving to HEAD~1')).toBeTruthy();
  });

  it('calls onReset with the entry hash and the chosen mode', async () => {
    const onReset = vi.fn();
    const { getAllByText } = render(ReflogPane, { entries, onReset });

    // First row's three buttons → soft / mixed / hard for HEAD@{0}.
    await fireEvent.click(getAllByText('hard')[0]);
    expect(onReset).toHaveBeenCalledWith('aaaaaaa1111', 'hard');

    await fireEvent.click(getAllByText('soft')[0]);
    expect(onReset).toHaveBeenCalledWith('aaaaaaa1111', 'soft');

    await fireEvent.click(getAllByText('mixed')[0]);
    expect(onReset).toHaveBeenCalledWith('aaaaaaa1111', 'mixed');
  });

  it('exits via the back button', async () => {
    const onExit = vi.fn();
    const { getByText } = render(ReflogPane, { entries, onExit });
    await fireEvent.click(getByText('‹ Graph'));
    expect(onExit).toHaveBeenCalled();
  });

  it('shows an empty message when there are no entries', () => {
    const { getByText } = render(ReflogPane, { entries: [] });
    expect(getByText('No reflog entries.')).toBeTruthy();
  });
});
