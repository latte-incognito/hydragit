// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';

// ── mock child_process and readline ──────────────────────────────────────────

vi.mock('vscode', () => ({}));

// We create a fake process with controllable stdin/stdout
function makeFakeProc() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const stdin = { write: vi.fn() };

  const proc = Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    stdin,
    kill: vi.fn(),
  });

  return { proc, stdout, stderr, stdin };
}

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('readline', () => ({
  createInterface: vi.fn(() => {
    const iface = new EventEmitter();
    return iface;
  }),
}));

vi.mock('./Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), goStderr: vi.fn() },
}));

import * as cp from 'child_process';
import * as readline from 'readline';

// ── tests ─────────────────────────────────────────────────────────────────────

describe('GoProcess — send / pending map', () => {
  it('writes JSON with id, cmd, params to stdin', async () => {
    const { proc, stdout } = makeFakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc as never);

    const lineIface = new EventEmitter();
    vi.mocked(readline.createInterface).mockReturnValue(lineIface as never);

    const { GoProcess } = await import('./goProcess');
    const gp = new GoProcess('/bin/server', '/repo', '/logs');

    const promise = gp.send('status', {});

    const written = JSON.parse(gp['proc'].stdin.write.mock.calls[0][0].trim());
    expect(written.cmd).toBe('status');
    expect(written.params).toEqual({});
    expect(typeof written.id).toBe('string');

    // resolve the promise
    lineIface.emit('line', JSON.stringify({ id: written.id, ok: true, data: { branch: 'main' } }));
    const result = await promise;
    expect((result as { branch: string }).branch).toBe('main');
  });

  it('resolves with data on ok:true response', async () => {
    const { proc } = makeFakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc as never);

    const lineIface = new EventEmitter();
    vi.mocked(readline.createInterface).mockReturnValue(lineIface as never);

    const { GoProcess } = await import('./goProcess');
    const gp = new GoProcess('/bin/server', '/repo', '/logs');

    const promise = gp.send('branches', {});
    const id = JSON.parse(gp['proc'].stdin.write.mock.calls[0][0].trim()).id;

    lineIface.emit('line', JSON.stringify({ id, ok: true, data: ['main', 'feat'] }));
    const result = await promise;
    expect(result).toEqual(['main', 'feat']);
  });

  it('rejects on ok:false response', async () => {
    const { proc } = makeFakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc as never);

    const lineIface = new EventEmitter();
    vi.mocked(readline.createInterface).mockReturnValue(lineIface as never);

    const { GoProcess } = await import('./goProcess');
    const gp = new GoProcess('/bin/server', '/repo', '/logs');

    const promise = gp.send('status', {});
    const id = JSON.parse(gp['proc'].stdin.write.mock.calls[0][0].trim()).id;

    lineIface.emit('line', JSON.stringify({ id, ok: false, error: 'not a git repo' }));
    await expect(promise).rejects.toThrow('not a git repo');
  });

  it('multiple in-flight sends resolve independently', async () => {
    const { proc } = makeFakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc as never);

    const lineIface = new EventEmitter();
    vi.mocked(readline.createInterface).mockReturnValue(lineIface as never);

    const { GoProcess } = await import('./goProcess');
    const gp = new GoProcess('/bin/server', '/repo', '/logs');

    const p1 = gp.send('status', {});
    const p2 = gp.send('branches', {});

    const id1 = JSON.parse(gp['proc'].stdin.write.mock.calls[0][0].trim()).id;
    const id2 = JSON.parse(gp['proc'].stdin.write.mock.calls[1][0].trim()).id;

    // resolve in reverse order
    lineIface.emit('line', JSON.stringify({ id: id2, ok: true, data: 'branches-result' }));
    lineIface.emit('line', JSON.stringify({ id: id1, ok: true, data: 'status-result' }));

    expect(await p1).toBe('status-result');
    expect(await p2).toBe('branches-result');
  });
});
