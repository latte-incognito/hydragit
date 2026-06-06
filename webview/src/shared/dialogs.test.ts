import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.hoisted(() => vi.fn());
vi.mock('./messageBus', () => ({ send: sendMock }));

const { uiPrompt, uiConfirm } = await import('./dialogs');

beforeEach(() => sendMock.mockReset());

describe('dialog seam', () => {
  it('uiPrompt sends ui.prompt with message + default value and resolves the entered string', async () => {
    sendMock.mockResolvedValue('feature-x');
    const result = await uiPrompt('New branch name:', 'seed');
    expect(sendMock).toHaveBeenCalledWith('ui.prompt', { message: 'New branch name:', value: 'seed' });
    expect(result).toBe('feature-x');
  });

  it('uiPrompt defaults value to empty string', async () => {
    sendMock.mockResolvedValue(null);
    await uiPrompt('Tag name:');
    expect(sendMock).toHaveBeenCalledWith('ui.prompt', { message: 'Tag name:', value: '' });
  });

  it('uiPrompt resolves null when the user cancels', async () => {
    sendMock.mockResolvedValue(null);
    expect(await uiPrompt('x')).toBeNull();
  });

  it('uiConfirm sends ui.confirm and resolves the boolean result', async () => {
    sendMock.mockResolvedValue(true);
    expect(await uiConfirm('Delete branch?')).toBe(true);
    expect(sendMock).toHaveBeenCalledWith('ui.confirm', { message: 'Delete branch?' });
  });

  it('uiConfirm resolves false when declined', async () => {
    sendMock.mockResolvedValue(false);
    expect(await uiConfirm('Hard reset?')).toBe(false);
  });
});
