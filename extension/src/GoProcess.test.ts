// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('vscode', () => ({}));
vi.mock('./Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), goStderr: vi.fn() },
}));

vi.mock('child_process', () => ({ spawn: vi.fn() }));
vi.mock('readline', () => ({ createInterface: vi.fn() }));

import * as cp from 'child_process';
import * as readline from 'readline';

// ── helpers ───────────────────────────────────────────────────────────────────

function setup() {
  const stdinWrite = vi.fn();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    stdin: { write: stdinWrite },
    kill: vi.fn(),
  });

  const lineIface = new EventEmitter();

  vi.mocked(cp.spawn).mockReturnValue(proc as never);
  vi.mocked(readline.createInterface).mockReturnValue(lineIface as never);

  return { stdinWrite, lineIface };
}

function getWrittenId(stdinWrite: ReturnType<typeof vi.fn>, callIndex = 0): string {
  return JSON.parse(stdinWrite.mock.calls[callIndex][0].trim()).id;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('GoProcess — send / pending map', () => {
  it('writes JSON with id, cmd, params to stdin', async () => {
    const { stdinWrite, lineIface } = setup();
    const { GoProcess } = await import('./goProcess');
    const gp = new GoProcess('/bin/server', '/repo', '/logs');

    const promise = gp.send('status', {});

    const written = JSON.parse(stdinWrite.mock.calls[0][0].trim());
    expect(written.cmd).toBe('status');
    expect(written.params).toEqual({});
    expect(typeof written.id).toBe('string');

    lineIface.emit('line', JSON.stringify({ id: written.id, ok: true, data: { branch: 'main' } }));
    const result = await promise;
    expect((result as { branch: string }).branch).toBe('main');
  });

  it('resolves with data on ok:true response', async () => {
    const { stdinWrite, lineIface } = setup();
    const { GoProcess } = await import('./goProcess');
    const gp = new GoProcess('/bin/server', '/repo', '/logs');

    const promise = gp.send('branches', {});
    const id = getWrittenId(stdinWrite);

    lineIface.emit('line', JSON.stringify({ id, ok: true, data: ['main', 'feat'] }));
    expect(await promise).toEqual(['main', 'feat']);
  });

  it('rejects on ok:false response', async () => {
    const { stdinWrite, lineIface } = setup();
    const { GoProcess } = await import('./goProcess');
    const gp = new GoProcess('/bin/server', '/repo', '/logs');

    const promise = gp.send('status', {});
    const id = getWrittenId(stdinWrite);

    lineIface.emit('line', JSON.stringify({ id, ok: false, error: 'not a git repo' }));
    await expect(promise).rejects.toThrow('not a git repo');
  });

  it('multiple in-flight sends resolve independently', async () => {
    const { stdinWrite, lineIface } = setup();
    const { GoProcess } = await import('./goProcess');
    const gp = new GoProcess('/bin/server', '/repo', '/logs');

    const p1 = gp.send('status', {});
    const p2 = gp.send('branches', {});

    const id1 = getWrittenId(stdinWrite, 0);
    const id2 = getWrittenId(stdinWrite, 1);

    lineIface.emit('line', JSON.stringify({ id: id2, ok: true, data: 'branches-result' }));
    lineIface.emit('line', JSON.stringify({ id: id1, ok: true, data: 'status-result' }));

    expect(await p1).toBe('status-result');
    expect(await p2).toBe('branches-result');
  });
});
