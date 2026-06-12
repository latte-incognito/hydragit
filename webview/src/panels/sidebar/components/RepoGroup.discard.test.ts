import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

// The discard flow needs send() and uiConfirm() to actually resolve (the raw
// postMessage mock in RepoGroup.test.ts never does), so this file mocks the
// message bus + dialog seam directly.
const sendMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());
vi.mock('$shared/messageBus', () => ({ send: sendMock, on: vi.fn(() => () => {}) }));
vi.mock('$shared/dialogs', () => ({
  uiConfirm: confirmMock,
  uiPrompt: vi.fn(),
  uiNotify: vi.fn(),
  uiPick: vi.fn(),
}));

import RepoGroup from './RepoGroup.svelte';

const repo = { name: 'alpharius', rootPath: '/a' };
const status = {
  branch: 'main',
  hasUpstream: true,
  files: [
    { path: 'src/mod.ts', status: 'M' },
    { path: 'new.txt', status: 'U' },
  ],
};

beforeEach(() => {
  sendMock.mockReset();
  confirmMock.mockReset();
  sendMock.mockImplementation(async (cmd: string) => (cmd === 'status' ? status : null));
  confirmMock.mockResolvedValue(true);
});

async function renderLoaded() {
  const utils = render(RepoGroup, { repo });
  await waitFor(() => utils.getByText('mod.ts'));
  return utils;
}

describe('RepoGroup — discard flow', () => {
  it('confirms with the repo name, then sends discard scoped to this repo', async () => {
    const { getByText } = await renderLoaded();

    const row = getByText('mod.ts').closest('.file-row') as HTMLElement;
    await fireEvent.click(row.querySelector('.row-act--discard') as HTMLElement);

    await waitFor(() => expect(sendMock).toHaveBeenCalledWith('discard', { paths: ['src/mod.ts'] }, '/a'));
    expect(confirmMock.mock.calls[0][0]).toContain('mod.ts');
    expect(confirmMock.mock.calls[0][0]).toContain('alpharius');
  });

  it('untracked files get the "removed from disk" wording', async () => {
    const { getByText } = await renderLoaded();

    const row = getByText('new.txt').closest('.file-row') as HTMLElement;
    await fireEvent.click(row.querySelector('.row-act--discard') as HTMLElement);

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(confirmMock.mock.calls[0][0]).toContain('untracked');
    expect(confirmMock.mock.calls[0][0]).toContain('removed from disk');
  });

  it('a declined confirm sends nothing', async () => {
    confirmMock.mockResolvedValue(false);
    const { getByText } = await renderLoaded();

    const row = getByText('mod.ts').closest('.file-row') as HTMLElement;
    await fireEvent.click(row.querySelector('.row-act--discard') as HTMLElement);

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(sendMock.mock.calls.find((c) => c[0] === 'discard')).toBeUndefined();
  });

  it('multi-file discard mentions the count and the snapshot safety net', async () => {
    const { getByLabelText } = await renderLoaded();

    await fireEvent.click(getByLabelText('Discard all changes'));

    await waitFor(() => expect(sendMock).toHaveBeenCalledWith('discard', { paths: ['src/mod.ts', 'new.txt'] }, '/a'));
    expect(confirmMock.mock.calls[0][0]).toContain('2 files');
    expect(confirmMock.mock.calls[0][0].toLowerCase()).toContain('snapshot');
  });

  it('open-file hover action opens the file scoped to this repo', async () => {
    const { getByText } = await renderLoaded();

    const row = getByText('mod.ts').closest('.file-row') as HTMLElement;
    await fireEvent.click(row.querySelector('.row-act:not(.row-act--discard)') as HTMLElement);

    expect(sendMock).toHaveBeenCalledWith('openFile', { file: 'src/mod.ts' }, '/a');
  });
});
