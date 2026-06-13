import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

const sendMock = vi.hoisted(() => vi.fn());
vi.mock('$shared/messageBus', () => ({ send: sendMock, on: vi.fn(() => () => {}) }));

import HunkView from './HunkView.svelte';

const hunks = [
  {
    header: '@@ -1,5 +1,5 @@',
    lines: [
      { kind: 'ctx', old: 1, new: 1, text: 'line1' },
      { kind: 'del', old: 2, text: 'line2' },
      { kind: 'add', new: 2, text: 'line2-EDITED' },
    ],
    patch: 'PATCH-A',
  },
  {
    header: '@@ -15,6 +15,6 @@',
    lines: [{ kind: 'del', old: 18, text: 'line18' }, { kind: 'add', new: 18, text: 'line18-EDITED' }],
    patch: 'PATCH-B',
  },
];

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue(hunks);
});

describe('HunkView', () => {
  it('fetches the working diff scoped to the repo (cached=false for Changes)', async () => {
    render(HunkView, { file: 'app.js', repoRoot: '/a', staged: false });
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith('diff.working', { file: 'app.js', cached: false }, '/a')
    );
  });

  it('fetches with cached=true on the staged side', async () => {
    render(HunkView, { file: 'app.js', repoRoot: '/a', staged: true });
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith('diff.working', { file: 'app.js', cached: true }, '/a')
    );
  });

  it('renders each hunk header and its add/del lines', async () => {
    const { getByText, getAllByText } = render(HunkView, { file: 'app.js', repoRoot: '/a', staged: false });
    await waitFor(() => getByText('@@ -1,5 +1,5 @@'));
    expect(getByText('line2-EDITED')).toBeTruthy();
    expect(getAllByText('Stage')).toHaveLength(2); // one per hunk
  });

  it('Stage button passes that hunk\'s opaque patch up', async () => {
    const onStage = vi.fn();
    const { getAllByText } = render(HunkView, { file: 'app.js', repoRoot: '/a', staged: false, onStage });
    await waitFor(() => getAllByText('Stage'));

    await fireEvent.click(getAllByText('Stage')[0]);
    expect(onStage).toHaveBeenCalledWith('PATCH-A');
  });

  it('the staged side shows Unstage, not Stage/Discard', async () => {
    const onUnstage = vi.fn();
    const { getAllByText, queryByText } = render(HunkView, { file: 'app.js', repoRoot: '/a', staged: true, onUnstage });
    await waitFor(() => getAllByText('Unstage'));

    expect(queryByText('Stage')).toBeNull();
    await fireEvent.click(getAllByText('Unstage')[0]);
    expect(onUnstage).toHaveBeenCalledWith('PATCH-A');
  });

  it('shows the whole-file fallback when git returns no hunks', async () => {
    sendMock.mockResolvedValue([]);
    const { getByText } = render(HunkView, { file: 'bin.dat', repoRoot: '/a', staged: false });
    await waitFor(() => getByText(/use the file checkbox/i));
  });

  it('re-fetches when refreshKey changes', async () => {
    const { rerender } = render(HunkView, { file: 'app.js', repoRoot: '/a', staged: false, refreshKey: 0 });
    await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
    await rerender({ file: 'app.js', repoRoot: '/a', staged: false, refreshKey: 1 });
    await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(2));
  });
});
