// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HydraStatusService } from './HydraStatusService';

vi.mock('vscode', () => {
  class EventEmitter {
    private handlers: Array<(v: unknown) => void> = [];
    event = (cb: (v: unknown) => void) => {
      this.handlers.push(cb);
      return () => { this.handlers = this.handlers.filter(h => h !== cb); };
    };
    fire = (v: unknown) => this.handlers.forEach(h => h(v));
    dispose = vi.fn();
  }
  return { EventEmitter };
});

vi.mock('./Logger', () => ({
  Logger: { error: vi.fn() },
}));

function makeGoProcess(resolveWith: unknown) {
  return { send: vi.fn().mockResolvedValue(resolveWith) };
}

const snapshot1 = { branch: 'main', files: [{ path: 'a.ts', status: 'M' }] };
const snapshot2 = { branch: 'main', files: [{ path: 'b.ts', status: 'A' }] };
const snapshot1b = { branch: 'main', files: [{ path: 'a.ts', status: 'M' }] };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('HydraStatusService — refresh', () => {
  it('calls goProcess.send with status command', async () => {
    const goProcess = makeGoProcess(snapshot1);
    const svc = new HydraStatusService(goProcess as never, 3000);
    await svc.refresh();
    expect(goProcess.send).toHaveBeenCalledWith('status', {});
  });

  it('fires onDidChange when snapshot changes', async () => {
    const goProcess = makeGoProcess(snapshot1);
    const svc = new HydraStatusService(goProcess as never, 3000);
    const handler = vi.fn();
    svc.onDidChange(handler);
    await svc.refresh();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not fire onDidChange when snapshot is identical', async () => {
    const goProcess = makeGoProcess(snapshot1);
    const svc = new HydraStatusService(goProcess as never, 3000);
    const handler = vi.fn();
    svc.onDidChange(handler);
    await svc.refresh();
    handler.mockClear();
    goProcess.send.mockResolvedValue(snapshot1b);
    await svc.refresh();
    expect(handler).not.toHaveBeenCalled();
  });

  it('fires onDidChange when branch changes', async () => {
    const goProcess = makeGoProcess(snapshot1);
    const svc = new HydraStatusService(goProcess as never, 3000);
    const handler = vi.fn();
    svc.onDidChange(handler);
    await svc.refresh();
    handler.mockClear();
    goProcess.send.mockResolvedValue({ branch: 'feature', files: snapshot1.files });
    await svc.refresh();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('fires onDidChange when file list changes', async () => {
    const goProcess = makeGoProcess(snapshot1);
    const svc = new HydraStatusService(goProcess as never, 3000);
    const handler = vi.fn();
    svc.onDidChange(handler);
    await svc.refresh();
    handler.mockClear();
    goProcess.send.mockResolvedValue(snapshot2);
    await svc.refresh();
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('HydraStatusService — getSnapshot', () => {
  it('returns empty snapshot before first refresh', () => {
    const svc = new HydraStatusService(makeGoProcess(snapshot1) as never, 3000);
    const snap = svc.getSnapshot();
    expect(snap.branch).toBe('');
    expect(snap.files).toEqual([]);
  });

  it('returns updated snapshot after refresh', async () => {
    const svc = new HydraStatusService(makeGoProcess(snapshot1) as never, 3000);
    await svc.refresh();
    const snap = svc.getSnapshot();
    expect(snap.branch).toBe('main');
    expect(snap.files).toHaveLength(1);
  });
});

describe('HydraStatusService — start/stop', () => {
  it('calls refresh multiple times after start', async () => {
    const goProcess = makeGoProcess(snapshot1);
    const svc = new HydraStatusService(goProcess as never, 1000);
    svc.start();
    await vi.advanceTimersByTimeAsync(3500);
    svc.stop();
    expect(goProcess.send.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('stop prevents further refreshes', async () => {
    const goProcess = makeGoProcess(snapshot1);
    const svc = new HydraStatusService(goProcess as never, 1000);
    svc.start();
    await vi.advanceTimersByTimeAsync(1500);
    svc.stop();
    const callsBefore = goProcess.send.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(goProcess.send.mock.calls.length).toBe(callsBefore);
  });
});
