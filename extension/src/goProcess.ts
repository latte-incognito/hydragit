import * as cp from 'child_process';
import * as readline from 'readline';
import { Logger } from './Logger';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class GoProcess {
  private proc: cp.ChildProcess;
  private pending = new Map<string, Pending>();
  private disposed = false;
  /**
   * Active repo root, stamped onto every request as `repo` so the Go handler
   * routes to it. When undefined, Go falls back to its spawn-time default
   * (HYDRAGIT_REPO) — i.e. single-repo behaviour is unchanged.
   */
  private activeRepo: string | undefined;

  /**
   * Fired when the Go process dies unexpectedly (crash/error), NOT on an
   * intentional dispose(). The extension uses this to surface a critical-error
   * popup offering a reload (#3). Fires at most once per process.
   */
  onCrash?: (reason: string) => void;

  constructor(binaryPath: string, repoPath: string, logDir: string) {
    this.proc = cp.spawn(binaryPath, [], {
      env: {
        ...process.env,
        HYDRAGIT_REPO: repoPath,
        HYDRAGIT_LOG_DIR: logDir,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    Logger.info('process', `Go binary spawned: ${binaryPath}`);

    readline.createInterface({ input: this.proc.stdout! }).on('line', (line) => {
      let resp: { id: string; ok: boolean; data?: unknown; error?: string };
      try {
        resp = JSON.parse(line);
      } catch {
        Logger.error('ipc', `bad JSON from Go: ${line}`);
        return;
      }
      const p = this.pending.get(resp.id);
      if (!p) return;
      this.pending.delete(resp.id);
      if (resp.ok) {
        p.resolve(resp.data);
      } else {
        p.reject(new Error(resp.error ?? 'unknown error'));
      }
    });

    this.proc.stderr?.on('data', (d: Buffer) => {
      Logger.goStderr(d.toString().trim());
    });

    this.proc.on('exit', (code, signal) => {
      Logger.warn('process', `Go process exited code=${code} signal=${signal}`);
      // Settle every in-flight request — otherwise their promises hang forever
      // and the UI gets stuck waiting on a process that will never reply (#20).
      this.rejectAll(new Error(`Go process exited (code=${code}, signal=${signal})`));
      if (!this.disposed) this.fireCrash(`HydraGit's git backend exited unexpectedly (code=${code}, signal=${signal}).`);
    });

    this.proc.on('error', (err) => {
      Logger.error('process', `Go process error: ${err.message}`);
      this.rejectAll(new Error(`Go process error: ${err.message}`));
      if (!this.disposed) this.fireCrash(`HydraGit's git backend failed: ${err.message}`);
    });
  }

  /** Fire onCrash at most once (exit + error can both arrive for one death). */
  private fireCrash(reason: string): void {
    const cb = this.onCrash;
    this.onCrash = undefined;
    cb?.(reason);
  }

  /** Reject and clear all pending requests — used when the process dies. */
  private rejectAll(reason: Error): void {
    if (this.pending.size === 0) return;
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const p of pending) p.reject(reason);
  }

  /** Set the repo every subsequent request runs against (multi-repo switch). */
  setActiveRepo(repoPath: string | undefined): void {
    this.activeRepo = repoPath;
  }

  /**
   * @param repo Optional per-call repo override. Used by the grouped sidebar to
   * read/commit a specific repo without changing the focused (active) one. When
   * omitted, falls back to the active repo, then to Go's spawn default.
   */
  send(cmd: string, params: object = {}, repo?: string): Promise<unknown> {
    const id = Math.random().toString(36).slice(2, 9);
    const target = repo ?? this.activeRepo;
    const req: { id: string; cmd: string; params: object; repo?: string } = { id, cmd, params };
    if (target) req.repo = target;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin!.write(JSON.stringify(req) + '\n');
    });
  }

  dispose(): void {
    Logger.info('process', 'Go process disposed');
    this.disposed = true; // suppress the crash popup for an intentional shutdown
    this.proc.kill();
  }
}
