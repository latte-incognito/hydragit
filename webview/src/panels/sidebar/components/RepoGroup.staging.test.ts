import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

// Real-index staging flow: checkboxes drive the `stage`/`unstage` cmds (git
// add / restore --staged), and commit sends no paths — the index is the truth.
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
    { path: 'src/mod.ts', status: 'M', workStatus: 'M' },
    { path: 'staged.ts', status: 'M', indexStatus: 'M' },
  ],
};

beforeEach(() => {
  sendMock.mockReset();
  confirmMock.mockReset();
  sendMock.mockImplementation(async (cmd: string) => {
    if (cmd === 'status') return status;
    if (cmd === 'commit.precheck') return [];
    if (cmd === 'commit') return { hash: 'abc', message: 'm' };
    return null;
  });
  confirmMock.mockResolvedValue(true);
});

async function renderLoaded() {
  const utils = render(RepoGroup, { repo });
  await waitFor(() => utils.getByText('mod.ts'));
  return utils;
}

describe('RepoGroup — real-index staging', () => {
  it('checking a changes row sends the stage cmd scoped to this repo', async () => {
    const { getByLabelText } = await renderLoaded();

    await fireEvent.change(getByLabelText('Stage mod.ts'));
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith('stage', { paths: ['src/mod.ts'] }, '/a')
    );
  });

  it('unchecking a staged row sends the unstage cmd', async () => {
    const { getByLabelText } = await renderLoaded();

    await fireEvent.change(getByLabelText('Unstage staged.ts'));
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith('unstage', { paths: ['staged.ts'] }, '/a')
    );
  });

  it('commit sends no paths — the index is the source of truth', async () => {
    const { getByPlaceholderText, getByRole } = await renderLoaded();

    await fireEvent.input(getByPlaceholderText('Message'), { target: { value: 'msg' } });
    // The button reads "Commit 1" when something is staged.
    await fireEvent.click(getByRole('button', { name: /^commit/i }));

    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith('commit', { message: 'msg', paths: [] }, '/a')
    );
    // …while the precheck still inspects the actually-staged paths.
    expect(sendMock).toHaveBeenCalledWith('commit.precheck', { paths: ['staged.ts'] }, '/a');
  });
});
