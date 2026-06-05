import * as cp from 'child_process';
import * as readline from 'readline';
import { Logger } from './Logger';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class GoProcess {
  private proc: cp.ChildProcess;
  private pending = new Map<string, Pending>();

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
    });

    this.proc.on('error', (err) => {
      Logger.error('process', `Go process error: ${err.message}`);
      this.rejectAll(new Error(`Go process error: ${err.message}`));
    });
  }

  /** Reject and clear all pending requests — used when the process dies. */
  private rejectAll(reason: Error): void {
    if (this.pending.size === 0) return;
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const p of pending) p.reject(reason);
  }

  send(cmd: string, params: object = {}): Promise<unknown> {
    const id = Math.random().toString(36).slice(2, 9);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin!.write(JSON.stringify({ id, cmd, params }) + '\n');
    });
  }

  dispose(): void {
    Logger.info('process', 'Go process disposed');
    this.proc.kill();
  }
}
