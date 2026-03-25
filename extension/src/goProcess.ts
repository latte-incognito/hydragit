import * as cp from 'child_process';
import * as readline from 'readline';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class GoProcess {
  private proc: cp.ChildProcess;
  private pending = new Map<string, Pending>();

  constructor(binaryPath: string, repoPath: string) {
    this.proc = cp.spawn(binaryPath, [], {
      env: { ...process.env, HYDRAGIT_REPO: repoPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    readline.createInterface({ input: this.proc.stdout! })
      .on('line', line => {
        let resp: { id: string; ok: boolean; data?: unknown; error?: string };
        try {
          resp = JSON.parse(line);
        } catch {
          console.log('[HydraGit] bad JSON from Go:', line);
          return;
        }
        const p = this.pending.get(resp.id);
        if (!p) { return; }
        this.pending.delete(resp.id);
        if (resp.ok) {
          p.resolve(resp.data);
        } else {
          p.reject(new Error(resp.error ?? 'unknown error'));
        }
      });

    this.proc.stderr?.on('data', (d: Buffer) =>
      console.log('[HydraGit]', d.toString().trim()));
  }

  send(cmd: string, params: object = {}): Promise<unknown> {
    const id = Math.random().toString(36).slice(2, 9);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin!.write(JSON.stringify({ id, cmd, params }) + '\n');
    });
  }

  dispose(): void {
    this.proc.kill();
  }
}
