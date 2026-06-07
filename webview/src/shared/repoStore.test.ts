import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const mockPostMessage = vi.hoisted(() => vi.fn());
vi.mock('./vscode', () => ({
  default: { postMessage: mockPostMessage },
}));

const { repoState, requestRepoState, selectRepo, openRepoPicker } = await import('./repoStore');

function postResponse(msg: object) {
  window.dispatchEvent(new MessageEvent('message', { data: msg }));
}

// Flush the .then() microtask chain after a send() resolves.
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  mockPostMessage.mockClear();
  repoState.set({ repos: [], active: undefined });
});

// ── host pushes mirror into the store ────────────────────────────────────────

describe('repoStore — repoState pushes', () => {
  it('mirrors a repoState push into the store', () => {
    postResponse({
      type: 'repoState',
      data: { repos: [{ name: 'alpharius', rootPath: '/a' }], active: '/a' },
    });
    const s = get(repoState);
    expect(s.repos).toHaveLength(1);
    expect(s.active).toBe('/a');
  });

  it('defaults repos to [] when a push omits them', () => {
    postResponse({ type: 'repoState', data: { active: undefined } });
    expect(get(repoState).repos).toEqual([]);
  });
});

// ── switching ────────────────────────────────────────────────────────────────

describe('repoStore — selectRepo', () => {
  it('posts repo.select with rootPath, fire-and-forget (no id)', () => {
    selectRepo('/b');
    const posted = mockPostMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(posted.cmd).toBe('repo.select');
    expect(posted.params).toEqual({ rootPath: '/b' });
    expect(posted.id).toBeUndefined();
  });
});

describe('repoStore — openRepoPicker', () => {
  it('posts repo.pick, fire-and-forget (no id)', () => {
    openRepoPicker();
    const posted = mockPostMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(posted.cmd).toBe('repo.pick');
    expect(posted.id).toBeUndefined();
  });
});

// ── initial pull ───────────────────────────────────────────────────────────────

describe('repoStore — requestRepoState', () => {
  it('sends repo.list and applies the response', async () => {
    requestRepoState();
    const posted = mockPostMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(posted.cmd).toBe('repo.list');

    postResponse({
      id: posted.id,
      ok: true,
      data: { repos: [{ name: 'omegon', rootPath: '/x' }], active: '/x' },
    });
    await flush();

    expect(get(repoState).active).toBe('/x');
    expect(get(repoState).repos).toHaveLength(1);
  });

  // Negative: no multi-repo wiring (e.g. no workspace) → command rejects. The
  // store must swallow it and keep its empty default, not throw.
  it('swallows a rejection and leaves the default state', async () => {
    requestRepoState();
    const posted = mockPostMessage.mock.calls[0][0] as Record<string, unknown>;

    postResponse({ id: posted.id, ok: false, error: 'command unavailable' });
    await flush();

    expect(get(repoState)).toEqual({ repos: [], active: undefined });
  });
});
