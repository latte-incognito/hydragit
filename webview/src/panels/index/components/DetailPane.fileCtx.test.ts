import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';

const sendMock = vi.hoisted(() => vi.fn());
vi.mock('$shared/messageBus', () => ({ send: sendMock, on: vi.fn() }));

import DetailPane from './DetailPane.svelte';

// Emit coverage for DetailPane's per-file context menu (right-click a changed
// file). Wired items include: Show Diff → onSelectFile, Show Diff in a New Tab →
// send('openDiff'), Edit Source → send('openFile'), History Up to Here →
// send('openFileHistory'), Show Changes to Parents → send('openDiff') per
// parent. The regression block asserts every enabled item still fires.

const commit = { hash: 'h1', parents: ['p0'], author: 'A', date: '2026-01-01T00:00:00Z', message: 'm', refs: [] } as any;
const files = [{ path: 'a.txt', status: 'M', additions: 1, deletions: 0 }] as any;

beforeEach(() => sendMock.mockClear());

async function openFileCtx(overrides: Record<string, unknown> = {}) {
  const onSelectFile = vi.fn();
  const onCommitMenuAction = vi.fn();
  const onStashAction = vi.fn();
  const { container, getByText } = render(DetailPane, {
    commit, files, onSelectFile, onCommitMenuAction, onStashAction, ...overrides,
  });
  const row = getByText('a.txt').closest('.tree-row--file') as HTMLElement;
  await fireEvent.contextMenu(row);
  return { container, getByText, onSelectFile, onCommitMenuAction, onStashAction };
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
    expect(sendMock).toHaveBeenCalledWith('openDiff', { commit: 'h1', parent: 'p0', file: 'a.txt', newTab: true, snippet: '' });
  });

  it('"Edit Source" sends openFile for the file', async () => {
    const { getByText } = await openFileCtx();
    await fireEvent.click(getByText('Edit Source'));
    expect(sendMock).toHaveBeenCalledWith('openFile', { file: 'a.txt' });
  });

  it('"History Up to Here" sends openFileHistory at this commit', async () => {
    const { getByText } = await openFileCtx();
    await fireEvent.click(getByText('History Up to Here'));
    expect(sendMock).toHaveBeenCalledWith('openFileHistory', { file: 'a.txt', ref: 'h1' });
  });

  it('"Show Changes to Parents" sends one openDiff vs the lone parent', async () => {
    const { getByText } = await openFileCtx();
    await fireEvent.click(getByText('Show Changes to Parents'));
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith('openDiff', { commit: 'h1', parent: 'p0', file: 'a.txt', newTab: true });
  });

  it('"Show Changes to Parents" on a merge opens one diff per parent', async () => {
    const merge = { ...commit, parents: ['p0', 'p1'] };
    const { getByText } = await openFileCtx({ commit: merge });
    await fireEvent.click(getByText('Show Changes to Parents'));
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock).toHaveBeenCalledWith('openDiff', { commit: 'h1', parent: 'p0', file: 'a.txt', newTab: true });
    expect(sendMock).toHaveBeenCalledWith('openDiff', { commit: 'h1', parent: 'p1', file: 'a.txt', newTab: true });
  });
});

// Every enabled (non-dim) item must trigger an action when clicked — a
// regression guard against an item losing its handler (the bug that left
// "History Up to Here" / "Show Changes to Parents" dead).
const ENABLED_ITEMS = [
  'Compare with Local',
  'Compare Before with Local',
  'Open Repository Version',
  'Revert Selected Changes',
  'Cherry-Pick Selected Changes',
  'History Up to Here',
  'Show Changes to Parents',
];

describe('DetailPane file context menu — enabled items must do something', () => {
  ENABLED_ITEMS.forEach((label) => {
    it(`"${label}" should trigger an action`, async () => {
      const { getByText, onSelectFile, onCommitMenuAction, onStashAction } = await openFileCtx();
      await fireEvent.click(getByText(label));
      const fired =
        sendMock.mock.calls.length +
        onSelectFile.mock.calls.length +
        onCommitMenuAction.mock.calls.length +
        onStashAction.mock.calls.length;
      expect(fired).toBeGreaterThan(0);
    });
  });
});
