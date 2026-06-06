import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

// Mock the message bus so we can assert exactly which command Sidebar emits when
// a file row is clicked. `send`/`on` are hoisted so the vi.mock factory can see
// them (vi.mock is hoisted above imports).
const { send, on } = vi.hoisted(() => ({
  send: vi.fn(),
  on: vi.fn(() => () => {}),
}));
vi.mock('$shared/messageBus', () => ({ send, on }));

import Sidebar from './Sidebar.svelte';

const files = [
  { path: 'src/app.ts', status: 'M' },
  { path: 'conflict.txt', status: '!' }, // unmerged — must open the merge resolver
];

beforeEach(() => {
  vi.clearAllMocks();
  on.mockReturnValue(() => {});
  // loadChanges() awaits send('status'); everything else resolves to undefined.
  send.mockImplementation((cmd: string) =>
    cmd === 'status'
      ? Promise.resolve({ files, branch: 'main', hasUpstream: false })
      : Promise.resolve()
  );
});

describe('Sidebar — file-click routing (BUG #19)', () => {
  it("emits 'openMergeEditor' when a conflicted ('!') file is clicked", async () => {
    const { container } = render(Sidebar);

    const row = await waitFor(() => {
      const el = container.querySelector('[data-path="conflict.txt"]');
      if (!el) throw new Error('conflict row not rendered yet');
      return el as HTMLElement;
    });

    await fireEvent.click(row);

    expect(send).toHaveBeenCalledWith('openMergeEditor', { file: 'conflict.txt' });
    // and must NOT fall through to the plain 2-way diff for a conflict
    expect(send).not.toHaveBeenCalledWith(
      'openDiff',
      expect.objectContaining({ file: 'conflict.txt' })
    );
  });

  it("emits 'openDiff' (not the merge editor) for a normal modified file", async () => {
    const { container } = render(Sidebar);

    const row = await waitFor(() => {
      const el = container.querySelector('[data-path="src/app.ts"]');
      if (!el) throw new Error('modified row not rendered yet');
      return el as HTMLElement;
    });

    await fireEvent.click(row);

    expect(send).toHaveBeenCalledWith('openDiff', {
      commit: 'HEAD',
      parent: '',
      file: 'src/app.ts',
    });
    expect(send).not.toHaveBeenCalledWith('openMergeEditor', { file: 'src/app.ts' });
  });
});
