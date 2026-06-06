import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPostMessage = vi.hoisted(() => vi.fn());
vi.mock('./vscode', () => ({
  default: { postMessage: mockPostMessage },
}));

const { send } = await import('./messageBus');

function postResponse(msg: object) {
  window.dispatchEvent(new MessageEvent('message', { data: msg }));
}

beforeEach(() => {
  mockPostMessage.mockClear();
});

describe('messageBus — malformed / unexpected inbound messages', () => {
  it('ignores a response with an unknown id without throwing', async () => {
    const promise = send('status', {});
    const posted = mockPostMessage.mock.calls[0][0] as Record<string, unknown>;

    // a stale/unknown id must be a no-op, not a crash
    expect(() => postResponse({ id: 'unknown-id', ok: true, data: 1 })).not.toThrow();

    // the real reply still resolves the original call
    postResponse({ id: posted.id, ok: true, data: 'real' });
    expect(await promise).toBe('real');
  });

  it('ignores a message with neither id nor type', () => {
    expect(() => postResponse({ ok: true, data: 'orphan' })).not.toThrow();
  });

  it('a second reply for an already-settled id is ignored', async () => {
    const promise = send('status', {});
    const posted = mockPostMessage.mock.calls[0][0] as Record<string, unknown>;

    postResponse({ id: posted.id, ok: true, data: 'first' });
    expect(await promise).toBe('first');

    // duplicate reply — pending entry already deleted, must be a no-op
    expect(() => postResponse({ id: posted.id, ok: true, data: 'second' })).not.toThrow();
  });
});

describe('messageBus — host-only commands', () => {
  it('openDiff resolves immediately and posts without expecting a reply', async () => {
    const result = send('openDiff', { commit: 'abc', parent: 'def', file: 'a.txt' });
    const posted = mockPostMessage.mock.calls[0][0] as Record<string, unknown>;

    expect(posted.cmd).toBe('openDiff');
    expect(posted.id).toBeUndefined(); // fire-and-forget: no correlation id
    await expect(result).resolves.toBeUndefined();
  });
});
