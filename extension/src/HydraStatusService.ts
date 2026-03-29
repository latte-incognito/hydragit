import * as vscode from 'vscode';
import { GoProcess } from './goProcess';

type HydraStatusFile = {
  path: string;
  status: string;
};

export type HydraStatusSnapshot = {
  branch?: string;
  files?: HydraStatusFile[];
};

export class HydraStatusService implements vscode.Disposable {
  private timer: NodeJS.Timeout | undefined;
  private snapshot: HydraStatusSnapshot = { branch: '', files: [] };
  private readonly _onDidChange = new vscode.EventEmitter<HydraStatusSnapshot>();
  public readonly onDidChange = this._onDidChange.event;

  constructor(
    private readonly goProcess: GoProcess,
    private readonly intervalMs = 3000
  ) {}

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => {
      void this.refresh();
    }, this.intervalMs);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  getSnapshot(): HydraStatusSnapshot {
    return this.snapshot;
  }

  async refresh(): Promise<void> {
    try {
      const next = (await this.goProcess.send('status', {})) as HydraStatusSnapshot;

      if (this.isSameSnapshot(this.snapshot, next)) {
        return;
      }

      this.snapshot = {
        branch: next?.branch ?? '',
        files: Array.isArray(next?.files) ? next.files : [],
      };

      this._onDidChange.fire(this.snapshot);
    } catch (err) {
      // Optional: log to output channel if you want
    }
  }

  dispose(): void {
    this.stop();
    this._onDidChange.dispose();
  }

  private isSameSnapshot(a: HydraStatusSnapshot, b: HydraStatusSnapshot): boolean {
    const aBranch = a?.branch ?? '';
    const bBranch = b?.branch ?? '';
    if (aBranch !== bBranch) return false;

    const aFiles = Array.isArray(a?.files) ? a.files : [];
    const bFiles = Array.isArray(b?.files) ? b.files : [];
    if (aFiles.length !== bFiles.length) return false;

    for (let i = 0; i < aFiles.length; i++) {
      if (aFiles[i].path !== bFiles[i].path) return false;
      if (aFiles[i].status !== bFiles[i].status) return false;
    }

    return true;
  }
}
