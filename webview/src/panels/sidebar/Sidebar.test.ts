import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

// Mock the message bus so we can assert exactly which command the sidebar emits
// when a file row is clicked. `send`/`on` are hoisted so the vi.mock factory can
// see them (vi.mock is hoisted above imports).
const { send, on } = vi.hoisted(() => ({
  send: vi.fn(),
  on: vi.fn(() => () => {}),
}));
vi.mock('$shared/messageBus', () => ({ send, on }));

import Sidebar from './Sidebar.svelte';
import { repoState } from '$shared/repoStore';

// Real-index model: rows render from the index/worktree split, so each file
// needs its side set (workStatus here — both are working-tree changes).
const files = [
  { path: 'src/app.ts', status: 'M', workStatus: 'M' },
  { path: 'conflict.txt', status: '!', workStatus: '!' }, // unmerged — must open the merge resolver
];

// One repo → the group renders flat (no header). RepoGroup fetches status via
// send('status', {}, '/a'), so file rows appear and clicks route per-repo.
beforeEach(() => {
  vi.clearAllMocks();
  on.mockReturnValue(() => {});
  send.mockImplementation((cmd: string) =>
    cmd === 'status'
      ? Promise.resolve({ files, branch: 'main', hasUpstream: false })
      : Promise.resolve()
  );
  repoState.set({ repos: [{ name: 'repo', rootPath: '/a' }], active: '/a' });
});

describe('Sidebar — file-click routing through RepoGroup (BUG #19)', () => {
  it("emits 'openMergeEditor' (scoped to the repo) for a conflicted ('!') file", async () => {
    const { container } = render(Sidebar);

    const row = await waitFor(() => {
      const el = container.querySelector('[data-path="conflict.txt"]');
      if (!el) throw new Error('conflict row not rendered yet');
      return el as HTMLElement;
    });

    await fireEvent.click(row);

    expect(send).toHaveBeenCalledWith('openMergeEditor', { file: 'conflict.txt' }, '/a');
    // must NOT fall through to the plain 2-way diff for a conflict
    expect(send).not.toHaveBeenCalledWith(
      'openDiff',
      expect.objectContaining({ file: 'conflict.txt' }),
      '/a'
    );
  });

  it("emits 'openDiff' (scoped to the repo) for a normal modified file", async () => {
    const { container } = render(Sidebar);

    const row = await waitFor(() => {
      const el = container.querySelector('[data-path="src/app.ts"]');
      if (!el) throw new Error('modified row not rendered yet');
      return el as HTMLElement;
    });

    await fireEvent.click(row);

    expect(send).toHaveBeenCalledWith(
      'openDiff',
      { commit: 'HEAD', parent: '', file: 'src/app.ts' },
      '/a'
    );
    expect(send).not.toHaveBeenCalledWith('openMergeEditor', { file: 'src/app.ts' }, '/a');
  });
});
