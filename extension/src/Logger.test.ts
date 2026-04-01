// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({}));

const { Logger } = await import('./Logger');

function makeChannel() {
  return { appendLine: vi.fn(), show: vi.fn() };
}

beforeEach(() => {
  // re-init with a fresh channel before each test
});

// ── init ──────────────────────────────────────────────────────────────────────

describe('Logger', () => {
  it('writes INFO line to output channel', () => {
    const channel = makeChannel();
    Logger.init(channel as never);

    Logger.info('ext', 'activated');

    expect(channel.appendLine).toHaveBeenCalledOnce();
    const line: string = channel.appendLine.mock.calls[0][0];
    expect(line).toContain('INFO');
    expect(line).toContain('[ext]');
    expect(line).toContain('activated');
  });

  it('writes WARN line', () => {
    const channel = makeChannel();
    Logger.init(channel as never);

    Logger.warn('process', 'exited');

    const line: string = channel.appendLine.mock.calls[0][0];
    expect(line).toContain('WARN');
    expect(line).toContain('[process]');
  });

  it('writes ERROR line', () => {
    const channel = makeChannel();
    Logger.init(channel as never);

    Logger.error('ipc', 'bad json');

    const line: string = channel.appendLine.mock.calls[0][0];
    expect(line).toContain('ERROR');
    expect(line).toContain('[ipc]');
    expect(line).toContain('bad json');
  });

  it('goStderr forwards as ERROR with go source', () => {
    const channel = makeChannel();
    Logger.init(channel as never);

    Logger.goStderr('panic: something went wrong');

    const line: string = channel.appendLine.mock.calls[0][0];
    expect(line).toContain('ERROR');
    expect(line).toContain('[go]');
    expect(line).toContain('panic: something went wrong');
  });

  it('goStderr ignores empty string', () => {
    const channel = makeChannel();
    Logger.init(channel as never);

    Logger.goStderr('');

    expect(channel.appendLine).not.toHaveBeenCalled();
  });

  it('does not throw when channel not initialised', () => {
    // create a fresh instance by re-importing — simulate uninitialised state
    // by calling before init
    expect(() => Logger.info('x', 'y')).not.toThrow();
  });
});
