import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPostMessage = vi.hoisted(() => vi.fn());
vi.mock('./vscode', () => ({
  default: { postMessage: mockPostMessage },
}));

const { send, on } = await import('./messageBus');

// Helper — simulate extension host posting a response back into the window
function postResponse(msg: object) {
  window.dispatchEvent(new MessageEvent('message', { data: msg }));
}

beforeEach(() => {
  mockPostMessage.mockClear();
});

// ── send — regular command ────────────────────────────────────────────────────

describe('send', () => {
  it('posts a message with id, cmd, params', async () => {
    const promise = send('status', {});

    // grab what was posted
    const posted = mockPostMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(posted.cmd).toBe('status');
    expect(posted.params).toEqual({});
    expect(typeof posted.id).toBe('string');
    expect((posted.id as string).length).toBeGreaterThan(0);

    // resolve it so the promise doesn't hang
    postResponse({ id: posted.id, ok: true, data: { branch: 'main' } });
    await promise;
  });

  it('resolves with data on ok:true response', async () => {
    const promise = send<{ branch: string }>('status', {});
    const posted = mockPostMessage.mock.calls[0][0] as Record<string, unknown>;

    postResponse({ id: posted.id, ok: true, data: { branch: 'main' } });
    const result = await promise;

    expect(result.branch).toBe('main');
  });

  it('rejects with error on ok:false response', async () => {
    const promise = send('status', {});
    const posted = mockPostMessage.mock.calls[0][0] as Record<string, unknown>;

    postResponse({ id: posted.id, ok: false, error: 'not a git repo' });

    await expect(promise).rejects.toThrow('not a git repo');
  });

  it('each send gets a unique id', async () => {
    const p1 = send('status', {});
    const p2 = send('branches', {});

    const id1 = (mockPostMessage.mock.calls[0][0] as Record<string, unknown>).id;
    const id2 = (mockPostMessage.mock.calls[1][0] as Record<string, unknown>).id;
    expect(id1).not.toBe(id2);

    // clean up
    postResponse({ id: id1, ok: true, data: null });
    postResponse({ id: id2, ok: true, data: [] });
    await Promise.all([p1, p2]);
  });

  it('resolves correct promise when multiple in-flight', async () => {
    const p1 = send<string>('log', {});
    const p2 = send<string>('branches', {});

    const id1 = (mockPostMessage.mock.calls[0][0] as Record<string, unknown>).id;
    const id2 = (mockPostMessage.mock.calls[1][0] as Record<string, unknown>).id;

    // resolve in reverse order
    postResponse({ id: id2, ok: true, data: 'branches-result' });
    postResponse({ id: id1, ok: true, data: 'log-result' });

    expect(await p1).toBe('log-result');
    expect(await p2).toBe('branches-result');
  });
});

// ── HOST_ONLY_CMDS — fire and forget ─────────────────────────────────────────

describe('send — HOST_ONLY_CMDS', () => {
  it('openDiff posts without id and resolves immediately', async () => {
    const result = await send('openDiff', { commit: 'abc', file: 'foo.ts', parent: 'def' });

    expect(result).toBeUndefined();
    const posted = mockPostMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(posted.cmd).toBe('openDiff');
    expect(posted.id).toBeUndefined();
  });

  it('openDiff does not add to pending — no hanging promise', async () => {
    // if it were in pending, this would hang forever with no response
    await expect(
      Promise.race([
        send('openDiff', { commit: 'abc', file: 'foo.ts', parent: 'def' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 50)),
      ])
    ).resolves.toBeUndefined();
  });
});

// ── on — push event subscription ─────────────────────────────────────────────

describe('on', () => {
  it('calls handler when matching push event arrives', () => {
    const handler = vi.fn();
    on('statusUpdate', handler);

    postResponse({ type: 'statusUpdate', data: { branch: 'main' } });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ branch: 'main' });
  });

  it('does not call handler for different event type', () => {
    const handler = vi.fn();
    on('statusUpdate', handler);

    postResponse({ type: 'refresh', data: {} });

    expect(handler).not.toHaveBeenCalled();
  });

  it('unsubscribe stops handler from being called', () => {
    const handler = vi.fn();
    const unsub = on('statusUpdate', handler);
    unsub();

    postResponse({ type: 'statusUpdate', data: {} });

    expect(handler).not.toHaveBeenCalled();
  });

  it('multiple handlers for same type all get called', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    on('statusUpdate', h1);
    on('statusUpdate', h2);

    postResponse({ type: 'statusUpdate', data: { branch: 'feat' } });

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('push events do not resolve pending send promises', async () => {
    const promise = send('status', {});
    const posted = mockPostMessage.mock.calls[0][0] as Record<string, unknown>;

    // push event with type — should not resolve the pending send
    postResponse({ type: 'statusUpdate', data: { branch: 'main' } });

    // resolve properly
    postResponse({ id: posted.id, ok: true, data: 'ok' });
    await promise;
  });
});
