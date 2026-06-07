import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ConflictBanner from './ConflictBanner.svelte';

const info = { operation: 'merge', files: ['src/a.txt', 'b.txt'] };

describe('ConflictBanner', () => {
  it('shows the operation and per-file resolve actions', () => {
    const { getByText, getAllByText } = render(ConflictBanner, { info });
    expect(getByText(/Resolving a merge/)).toBeTruthy();
    expect(getByText('a.txt')).toBeTruthy();
    // one set of buttons per file
    expect(getAllByText('current').length).toBe(2);
    expect(getAllByText('incoming').length).toBe(2);
    expect(getAllByText('merge').length).toBe(2);
  });

  it('fires onResolve with the action and full path', async () => {
    const onResolve = vi.fn();
    const { getAllByText } = render(ConflictBanner, { info, onResolve });

    await fireEvent.click(getAllByText('current')[0]);
    expect(onResolve).toHaveBeenCalledWith('current', 'src/a.txt');

    await fireEvent.click(getAllByText('incoming')[1]);
    expect(onResolve).toHaveBeenCalledWith('incoming', 'b.txt');

    await fireEvent.click(getAllByText('merge')[0]);
    expect(onResolve).toHaveBeenCalledWith('merge-editor', 'src/a.txt');
  });

  it('disables Continue while files remain, enables it once resolved', () => {
    const { getByText, rerender } = render(ConflictBanner, { info });
    expect((getByText('Continue') as HTMLButtonElement).disabled).toBe(true);
    rerender({ info: { operation: 'merge', files: [] } });
    expect((getByText('Continue') as HTMLButtonElement).disabled).toBe(false);
  });

  it('fires onContinue / onAbort', async () => {
    const onContinue = vi.fn();
    const onAbort = vi.fn();
    const { getByText } = render(ConflictBanner, {
      info: { operation: 'merge', files: [] }, onContinue, onAbort,
    });
    await fireEvent.click(getByText('Continue'));
    expect(onContinue).toHaveBeenCalled();
    await fireEvent.click(getByText('Abort'));
    expect(onAbort).toHaveBeenCalled();
  });
});
