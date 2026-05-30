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

// Mirrors the harness in GoProcess.test.ts, but also exposes `proc` so we can
// emit lifecycle events (exit/error) to exercise critical-failure paths.
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
  return { stdinWrite, lineIface, proc };
}

function writtenId(stdinWrite: ReturnType<typeof vi.fn>, i = 0): string {
  return JSON.parse(stdinWrite.mock.calls[i][0].trim()).id;
}

describe('GoProcess — malformed / unexpected stdout', () => {
  it('ignores a non-JSON line without throwing and still resolves later replies', async () => {
    const { stdinWrite, lineIface } = setup();
    const { GoProcess } = await import('./goProcess');
    const gp = new GoProcess('/bin/server', '/repo', '/logs');

    const p = gp.send('status', {});
    const id = writtenId(stdinWrite);

    // garbage line must not crash the readline handler or reject the pending call
    expect(() => lineIface.emit('line', '{ not valid json')).not.toThrow();
    lineIface.emit('line', JSON.stringify({ id, ok: true, data: { branch: 'main' } }));

    expect(await p).toEqual({ branch: 'main' });
  });

  it('ignores a response with an unknown/stale id', async () => {
    const { stdinWrite, lineIface } = setup();
    const { GoProcess } = await import('./goProcess');
    const gp = new GoProcess('/bin/server', '/repo', '/logs');

    const p = gp.send('status', {});
    const id = writtenId(stdinWrite);

    expect(() => lineIface.emit('line', JSON.stringify({ id: 'stale-id', ok: true, data: 1 }))).not.toThrow();
    lineIface.emit('line', JSON.stringify({ id, ok: true, data: 'ok' }));
    expect(await p).toBe('ok');
  });
});

describe('GoProcess — process death (BUGS.MD #20: app can get stuck)', () => {
  it('rejects in-flight requests when the Go process exits', async () => {
    const { stdinWrite, proc } = setup();
    const { GoProcess } = await import('./goProcess');
    const gp = new GoProcess('/bin/server', '/repo', '/logs');

    const p = gp.send('status', {});
    void writtenId(stdinWrite); // a request is in flight

    // The Go process dies (crash, external git lock, kill, …).
    proc.emit('exit', 1, null);

    // EXPECTED: the pending promise rejects so the UI can recover.
    // TODAY: GoProcess only logs on 'exit' and never settles pending promises,
    // so it stays 'pending' forever — the root of "HydraGit can stuck".
    // This assertion FAILS by design until GoProcess rejects pending on exit.
    const outcome = await Promise.race([
      p.then(() => 'resolved', () => 'rejected'),
      new Promise<string>((res) => setTimeout(() => res('pending'), 200)),
    ]);
    expect(outcome).toBe('rejected');
  });
});
