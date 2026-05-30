import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';

const sendMock = vi.hoisted(() => vi.fn());
vi.mock('$shared/messageBus', () => ({ send: sendMock, on: vi.fn() }));

import DetailPane from './DetailPane.svelte';

// Emit coverage for DetailPane's per-file context menu (right-click a changed
// file). Wired items: Show Diff → onSelectFile, Show Diff in a New Tab →
// send('openDiff'), Edit Source → send('openFile'). The remaining enabled items
// have no handler and are flagged by the bug-hunt block.

const commit = { hash: 'h1', parents: ['p0'], author: 'A', date: '2026-01-01T00:00:00Z', message: 'm', refs: [] } as any;
const files = [{ path: 'a.txt', status: 'M', additions: 1, deletions: 0 }] as any;

beforeEach(() => sendMock.mockClear());

async function openFileCtx(overrides: Record<string, unknown> = {}) {
  const onSelectFile = vi.fn();
  const onCommitAction = vi.fn();
  const onStashAction = vi.fn();
  const { container, getByText } = render(DetailPane, {
    commit, files, onSelectFile, onCommitAction, onStashAction, ...overrides,
  });
  const row = getByText('a.txt').closest('.tree-row--file') as HTMLElement;
  await fireEvent.contextMenu(row);
  return { container, getByText, onSelectFile, onCommitAction, onStashAction };
}

describe('DetailPane file context menu — wired items', () => {
  it('"Show Diff" calls onSelectFile with the path', async () => {
    const { getByText, onSelectFile } = await openFileCtx();
    await fireEvent.click(getByText('Show Diff'));
    expect(onSelectFile).toHaveBeenCalledWith('a.txt');
  });

  it('"Show Diff in a New Tab" sends openDiff for the file', async () => {
    const { getByText } = await openFileCtx();
    await fireEvent.click(getByText('Show Diff in a New Tab'));
    expect(sendMock).toHaveBeenCalledWith('openDiff', { commit: 'h1', parent: 'p0', file: 'a.txt' });
  });

  it('"Edit Source" sends openFile for the file', async () => {
    const { getByText } = await openFileCtx();
    await fireEvent.click(getByText('Edit Source'));
    expect(sendMock).toHaveBeenCalledWith('openFile', { file: 'a.txt' });
  });
});

// Enabled (non-dim) items with no handler → do nothing when clicked. FAIL by
// design (red), naming each dead item.
const DEAD_BUT_ENABLED = [
  'Compare with Local',
  'Compare Before with Local',
  'Open Repository Version',
  'Revert Selected Changes',
  'Cherry-Pick Selected Changes',
];

describe('DetailPane file context menu — enabled items must do something (BUG hunt)', () => {
  DEAD_BUT_ENABLED.forEach((label) => {
    it(`"${label}" should trigger an action`, async () => {
      const { getByText, onSelectFile, onCommitAction, onStashAction } = await openFileCtx();
      await fireEvent.click(getByText(label));
      const fired =
        sendMock.mock.calls.length +
        onSelectFile.mock.calls.length +
        onCommitAction.mock.calls.length +
        onStashAction.mock.calls.length;
      expect(fired).toBeGreaterThan(0);
    });
  });
});
