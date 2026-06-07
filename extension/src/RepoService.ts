import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './Logger';

export interface RepoInfo {
  /** Display name — folder basename (may collide across roots; UI disambiguates). */
  name: string;
  /** Absolute repo root, stamped onto Go requests as `repo`. */
  rootPath: string;
}

const STATE_KEY = 'hydragit.activeRepo';

/**
 * Single source of truth for "which repos exist" and "which one is active".
 *
 * Discovery leans on VS Code's built-in Git extension (multi-root + nested
 * repos, kept live via onDidOpenRepository/onDidCloseRepository); if that
 * extension is unavailable it falls back to scanning workspace folders for a
 * `.git`. The active selection is persisted per-workspace so it survives reloads.
 *
 * It owns no git logic — it only decides the path that GoProcess stamps and the
 * host path-helpers resolve against. Fires onDidChange when the list or the
 * active repo changes.
 */
export class RepoService implements vscode.Disposable {
  private repos: RepoInfo[] = [];
  private activeRepoPath: string | undefined;
  private disposables: vscode.Disposable[] = [];
  // The built-in Git extension's API (vscode.git, getAPI(1)). Untyped — we
  // don't want a dependency on the git extension's .d.ts just for two fields.
  private gitApi: any;

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  /** Connect to the git API, discover repos, restore the persisted selection. */
  async init(): Promise<void> {
    await this.connectGitApi();
    this.refreshRepos();

    const saved = this.ctx.workspaceState.get<string>(STATE_KEY);
    if (saved && this.repos.some((r) => r.rootPath === saved)) {
      this.activeRepoPath = saved;
    } else {
      this.activeRepoPath = this.repos[0]?.rootPath;
    }
    this._onDidChange.fire();
  }

  private async connectGitApi(): Promise<void> {
    try {
      const ext = vscode.extensions.getExtension('vscode.git');
      if (!ext) {
        Logger.warn('repo', 'built-in Git extension not found — falling back to folder scan');
        return;
      }
      if (!ext.isActive) await ext.activate();
      this.gitApi = ext.exports?.getAPI(1);
      if (this.gitApi) {
        this.disposables.push(
          this.gitApi.onDidOpenRepository(() => this.refreshRepos()),
          this.gitApi.onDidCloseRepository(() => this.refreshRepos())
        );
      }
    } catch (err) {
      Logger.warn('repo', `git API unavailable: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private refreshRepos(): void {
    const found = this.gitApi ? this.discoverViaApi() : this.discoverViaScan();
    this.repos = found;

    // Active repo vanished (folder removed / repo closed) → fall back to first.
    if (this.activeRepoPath && !found.some((r) => r.rootPath === this.activeRepoPath)) {
      this.activeRepoPath = found[0]?.rootPath;
      this.persist();
    } else if (!this.activeRepoPath) {
      this.activeRepoPath = found[0]?.rootPath;
    }
    this._onDidChange.fire();
  }

  private discoverViaApi(): RepoInfo[] {
    const repos: RepoInfo[] = (this.gitApi.repositories ?? []).map((r: any) => {
      const root = r.rootUri.fsPath as string;
      return { name: path.basename(root), rootPath: root };
    });
    // Git API may report nothing before it finishes scanning — scan as backup.
    return this.dedupe(repos.length ? repos : this.discoverViaScan());
  }

  private discoverViaScan(): RepoInfo[] {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const repos: RepoInfo[] = [];
    for (const f of folders) {
      const root = f.uri.fsPath;
      if (fs.existsSync(path.join(root, '.git'))) {
        repos.push({ name: path.basename(root), rootPath: root });
      }
    }
    return this.dedupe(repos);
  }

  private dedupe(repos: RepoInfo[]): RepoInfo[] {
    const seen = new Set<string>();
    return repos.filter((r) => (seen.has(r.rootPath) ? false : (seen.add(r.rootPath), true)));
  }

  getRepos(): RepoInfo[] {
    return this.repos;
  }

  getActiveRoot(): string | undefined {
    return this.activeRepoPath;
  }

  getActive(): RepoInfo | undefined {
    return this.repos.find((r) => r.rootPath === this.activeRepoPath);
  }

  /** Switch the active repo. No-op if unchanged or not a known repo. */
  setActive(rootPath: string): void {
    if (rootPath === this.activeRepoPath) return;
    if (!this.repos.some((r) => r.rootPath === rootPath)) return;
    this.activeRepoPath = rootPath;
    this.persist();
    this._onDidChange.fire();
  }

  private persist(): void {
    void this.ctx.workspaceState.update(STATE_KEY, this.activeRepoPath);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this._onDidChange.dispose();
  }
}
