import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GoProcess } from './goProcess';
import { HydraStatusService, HydraStatusSnapshot } from './HydraStatusService';
import { RepoInfo } from './RepoService';

// ── Active repo root (multi-repo) ─────────────────────────────────────────────
// Host-side helpers resolve file paths against the active repo, not blindly
// against the first workspace folder. extension.ts updates this on every repo
// switch. When unset, it falls back to the first folder → single-repo behaviour
// is unchanged.
let activeRepoRoot: string | undefined;
export function setActiveRepoRoot(root: string | undefined): void {
  activeRepoRoot = root;
}
function repoRoot(): string {
  return activeRepoRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
}

// ── Shared diff helpers ───────────────────────────────────────────────────────

async function fileExistsAtRef(absPath: string, ref: string, root?: string): Promise<boolean> {
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execFile);
    const workspaceRoot = root ?? repoRoot();
    const relPath = path.relative(workspaceRoot, absPath);
    await exec('git', ['cat-file', '-e', `${ref}:${relPath}`], { cwd: workspaceRoot });
    return true;
  } catch {
    return false;
  }
}

export async function openFile(params: { file: string; ref?: string }, root?: string): Promise<void> {
  const workspaceRoot = root ?? repoRoot();
  const absPath = path.join(workspaceRoot, params.file);
  // With a ref, open the file's content as it was at that revision (read-only),
  // via the built-in Git extension's `git:` scheme — "Open Repository Version".
  if (params.ref) {
    const uri = vscode.Uri.parse(`git:${absPath}`).with({
      query: JSON.stringify({ path: absPath, ref: params.ref }),
    });
    await vscode.commands.executeCommand('vscode.open', uri);
    return;
  }
  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(absPath));
}

// openWorkingDiff opens a diff editor comparing a file at a given revision (left)
// against the current working-tree copy (right) — "Compare with Local". The ref
// side is read-only via the built-in Git extension's `git:` scheme.
export async function openWorkingDiff(
  params: {
    file: string;
    ref: string;
    label?: string;
  },
  root?: string
): Promise<void> {
  const workspaceRoot = root ?? repoRoot();
  const absPath = path.join(workspaceRoot, params.file);
  const refUri = vscode.Uri.parse(`git:${absPath}`).with({
    query: JSON.stringify({ path: absPath, ref: params.ref }),
  });
  const workingUri = vscode.Uri.file(absPath);
  const label = params.label ?? params.ref.slice(0, 7);
  const title = `${path.basename(params.file)} (${label} ↔ working tree)`;
  await vscode.commands.executeCommand('vscode.diff', refUri, workingUri, title, { preview: true });
}

// savePatch prompts for a destination with a native save dialog and writes the
// patch text there — the IntelliJ "Create Patch…" flow. Fire-and-forget from the
// webview; feedback is shown natively.
export async function savePatch(params: { content: string; name?: string }, root?: string): Promise<void> {
  const workspaceRoot = root ?? repoRoot();
  const defaultUri = vscode.Uri.file(path.join(workspaceRoot, params.name ?? 'changes.patch'));
  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { Patch: ['patch', 'diff'], 'All files': ['*'] },
  });
  if (!target) return; // user cancelled
  // Ensure a trailing newline (run() trims it) so `git am` is happy.
  const body = params.content.endsWith('\n') ? params.content : params.content + '\n';
  await vscode.workspace.fs.writeFile(target, Buffer.from(body, 'utf8'));
  vscode.window.showInformationMessage(`Patch saved to ${path.basename(target.fsPath)}`);
}

// Normalize a remote URL to its web (HTTPS) form. Supports the SSH and
// scp-like shorthand used by GitHub/GitLab/Bitbucket; passes through HTTPS.
function remoteUrlToWeb(raw: string): string | null {
  let url = raw.trim();
  if (!url) return null;
  if (url.endsWith('.git')) url = url.slice(0, -4);
  // ssh://git@host/owner/repo
  const ssh = url.match(/^ssh:\/\/[^@]+@([^/:]+)(?::\d+)?\/(.+)$/);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  // scp-like: git@host:owner/repo
  const scp = url.match(/^[^@]+@([^:]+):(.+)$/);
  if (scp) return `https://${scp[1]}/${scp[2]}`;
  // http(s) already
  if (/^https?:\/\//.test(url)) return url;
  return null;
}

async function openCommitUrl(params: { commit: string }, root?: string): Promise<void> {
  const { commit } = params;
  if (!commit) return;
  const workspaceRoot = root ?? repoRoot();
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execFile);
    const { stdout } = await exec('git', ['config', '--get', 'remote.origin.url'], {
      cwd: workspaceRoot,
    });
    const web = remoteUrlToWeb(stdout);
    if (!web) {
      vscode.window.showWarningMessage(`Could not parse remote URL: ${stdout.trim()}`);
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(`${web}/commit/${commit}`));
  } catch (err) {
    vscode.window.showWarningMessage(
      `No remote.origin.url configured: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function openDiff(
  params: { commit: string; parent: string; file: string; newTab?: boolean },
  opts?: { viewColumn?: vscode.ViewColumn; preserveFocus?: boolean; root?: string }
): Promise<void> {
  const { commit, parent, file } = params;

  // Target a specific editor group (history panels) or the active one (default).
  // preview:true so successive selections replace the diff in place; newTab opens
  // a persistent tab instead (double-click / "Show Diff in a New Tab").
  const show: vscode.TextDocumentShowOptions = {
    preview: !params.newTab,
    viewColumn: opts?.viewColumn,
    preserveFocus: opts?.preserveFocus,
  };

  const workspaceRoot = opts?.root ?? repoRoot();
  const absPath = path.join(workspaceRoot, file);

  // ── Working tree diff (sidebar) ──────────────────────────────────────────
  if (commit === 'HEAD' && !parent) {
    const title = `${path.basename(file)} (working tree)`;
    const workingTreeUri = vscode.Uri.file(absPath);
    const headExists = await fileExistsAtRef(absPath, 'HEAD', workspaceRoot);

    if (!headExists) {
      await vscode.commands.executeCommand('vscode.open', workingTreeUri, show, title);
      return;
    }

    const headUri = vscode.Uri.parse(`git:${absPath}`).with({
      query: JSON.stringify({ path: absPath, ref: 'HEAD' }),
    });
    await vscode.commands.executeCommand('vscode.diff', headUri, workingTreeUri, title, show);
    return;
  }

  // ── Commit diff (main panel) ─────────────────────────────────────────────
  const title = `${path.basename(file)} (${commit.slice(0, 7)})`;

  const gitUri = (ref: string) =>
    vscode.Uri.parse(`git:${absPath}`).with({
      query: JSON.stringify({ path: absPath, ref }),
    });

  const [existsInParent, existsInCommit] = await Promise.all([
    parent ? fileExistsAtRef(absPath, parent, workspaceRoot) : Promise.resolve(false),
    fileExistsAtRef(absPath, commit, workspaceRoot),
  ]);

  if (!existsInParent && !existsInCommit) {
    vscode.window.showWarningMessage(`Cannot show diff: file not found at either ref.`);
    return;
  }

  if (!existsInParent) {
    await vscode.commands.executeCommand('vscode.open', gitUri(commit), show, title);
    return;
  }

  if (!existsInCommit) {
    await vscode.commands.executeCommand('vscode.open', gitUri(parent), show, `${title} (deleted)`);
    return;
  }

  await vscode.commands.executeCommand('vscode.diff', gitUri(parent), gitUri(commit), title, show);
}

// openMergeEditor opens VS Code's built-in 3-way merge resolver for a conflicted
// file. Falls back to opening the file (with inline conflict-marker CodeLens) if
// the git extension's merge-editor command isn't available.
export async function openMergeEditor(params: { file: string }, root?: string): Promise<void> {
  const workspaceRoot = root ?? repoRoot();
  const uri = vscode.Uri.file(path.join(workspaceRoot, params.file));
  try {
    await vscode.commands.executeCommand('git.openMergeEditor', uri);
  } catch {
    await vscode.commands.executeCommand('vscode.open', uri);
  }
}

export class HydraViewProvider implements vscode.WebviewViewProvider {
  private watcher: vscode.FileSystemWatcher | undefined;
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly goProcess: GoProcess
  ) {}

  /** Reload the whole main panel — bound to `hydragit.forceRefresh`. */
  forceRefresh(): void {
    this.view?.webview.postMessage({ type: 'refresh' });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.ctx.extensionPath, 'webview')),
        vscode.Uri.file(path.join(this.ctx.extensionPath, 'images')),
      ],
    };

    const iconUri = webviewView.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.ctx.extensionPath, 'images', 'icon-tight.png'))
    );
    webviewView.webview.html = this.getHtml(webviewView.webview, iconUri);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      // openDiff is handled entirely in the extension host — no Go call needed.
      // msg.repo (when present) scopes path resolution to that repo's root, so
      // diffs opened from a non-focused sidebar group target the right files.
      if (msg.cmd === 'openDiff') {
        await openDiff(msg.params, { root: msg.repo });
        return;
      }
      if (msg.cmd === 'openFile') {
        await openFile(msg.params, msg.repo);
        return;
      }
      if (msg.cmd === 'openWorkingDiff') {
        await openWorkingDiff(msg.params, msg.repo);
        return;
      }
      if (msg.cmd === 'savePatch') {
        await savePatch(msg.params, msg.repo);
        return;
      }
      if (msg.cmd === 'openCommitUrl') {
        await openCommitUrl(msg.params, msg.repo);
        return;
      }
      // Repo switch requested from the in-panel selector / breadcrumb. Routed
      // through a command so the panel needn't know about RepoService.
      if (msg.cmd === 'repo.select') {
        await vscode.commands.executeCommand('hydragit.setActiveRepo', msg.params?.rootPath);
        return;
      }
      // Initial repo state on webview mount (the push may have fired before the
      // view resolved). Answered by the host so the panel needn't hold state.
      // Tolerates a workspace-less window where the command isn't registered —
      // returns an empty state so the webview resolves rather than hanging.
      if (msg.cmd === 'repo.list') {
        let state: unknown = { repos: [], active: undefined };
        try {
          state = await vscode.commands.executeCommand('hydragit.getRepoState');
        } catch {
          /* multi-repo not wired (no workspace) */
        }
        webviewView.webview.postMessage({ id: msg.id, ok: true, data: state });
        return;
      }
      // Breadcrumb click → open the native repo quickpick (same as status bar).
      if (msg.cmd === 'repo.pick') {
        await vscode.commands.executeCommand('hydragit.selectRepo');
        return;
      }
      // Open a worktree's folder in a new VS Code window (the primary worktree
      // action — keeps the current window's context). Host-only: not a Go cmd.
      if (msg.cmd === 'worktree.open') {
        const wtPath = msg.params?.path;
        if (wtPath) {
          await vscode.commands.executeCommand(
            'vscode.openFolder',
            vscode.Uri.file(wtPath),
            { forceNewWindow: true }
          );
        }
        return;
      }
      // Dialog seam: the webview asks the host to show native prompt/confirm UI
      // and awaits the result over the same id-based bus (see webview dialogs.ts).
      if (msg.cmd === 'ui.prompt') {
        const value = await vscode.window.showInputBox({
          prompt: msg.params?.message,
          value: msg.params?.value ?? '',
        });
        webviewView.webview.postMessage({ id: msg.id, ok: true, data: value ?? null });
        return;
      }
      if (msg.cmd === 'ui.confirm') {
        const pick = await vscode.window.showWarningMessage(
          msg.params?.message ?? 'Are you sure?',
          { modal: true },
          'Yes'
        );
        webviewView.webview.postMessage({ id: msg.id, ok: true, data: pick === 'Yes' });
        return;
      }
      if (msg.cmd === 'ui.notify') {
        // Non-modal, persistent info toast (fire-and-forget reminder).
        void vscode.window.showInformationMessage(msg.params?.message ?? '');
        return;
      }
      if (msg.cmd === 'ui.pick') {
        const choice = await vscode.window.showQuickPick(msg.params?.items ?? [], {
          placeHolder: msg.params?.placeholder ?? '',
          matchOnDescription: true,
        });
        // Items may be plain strings or {label, description} rows — resolve both
        // to the chosen label so callers always get a string back.
        const value =
          choice == null ? null : typeof choice === 'string' ? choice : (choice as vscode.QuickPickItem).label;
        webviewView.webview.postMessage({ id: msg.id, ok: true, data: value });
        return;
      }

      try {
        const data = await this.goProcess.send(msg.cmd, msg.params ?? {}, msg.repo);
        webviewView.webview.postMessage({ id: msg.id, ok: true, data });
      } catch (err) {
        webviewView.webview.postMessage({
          id: msg.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    // Watch the active repo's .git for changes → refresh. Re-pointed whenever
    // the active repo switches (see retargetWatcher).
    this.retargetWatcher(repoRoot());

    webviewView.onDidDispose(() => this.watcher?.dispose());
  }

  /**
   * Point the .git watcher at `root` (defaults to the active repo). Called on
   * every repo switch so external git activity in the *current* repo refreshes
   * the panel. logs/HEAD is the reflog — watched so the undo timeline updates.
   */
  retargetWatcher(root: string | undefined = repoRoot()): void {
    this.watcher?.dispose();
    this.watcher = undefined;
    const view = this.view;
    if (!root || !view) return;
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(root, '.git/{HEAD,refs/**,COMMIT_EDITMSG,logs/HEAD,worktrees/**}')
    );
    const refresh = () => view.webview.postMessage({ type: 'refresh' });
    this.watcher.onDidChange(refresh);
    this.watcher.onDidCreate(refresh);
    this.watcher.onDidDelete(refresh);
  }

  /** Push the repo list + active root to the webview (selector / breadcrumb). */
  postRepoState(repos: RepoInfo[], active: string | undefined): void {
    this.view?.webview.postMessage({ type: 'repoState', data: { repos, active } });
  }

  focus(): void {
    vscode.commands.executeCommand('hydragit.mainView.focus');
  }

  private getHtml(webview: vscode.Webview, iconUri: vscode.Uri): string {
    const htmlPath = path.join(this.ctx.extensionPath, 'webview', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, 'webview', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, 'webview', 'index.css')
    );

    const csp = [
      `default-src 'none'`,
      `script-src ${webview.cspSource}`,
      `style-src  ${webview.cspSource} 'unsafe-inline'`,
      `img-src data: https: blob: ${webview.cspSource}`,
      `font-src data:`,
    ].join('; ');

    html = html.replace(
      /<head>/i,
      `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`
    );
    html = html.replace('./index.js', scriptUri.toString());
    html = html.replace('</head>', `<link rel="stylesheet" href="${styleUri}"></head>`);
    html = html.replace('<body>', `<body data-icon-uri="${iconUri.toString()}">`);
    html = html.replace(
      '</head>',
      `<style>
  html, body { 
    margin: 0 !important; 
    padding: 0 !important; 
    width: 100% !important;
    height: 100% !important;
    overflow: hidden !important;
  }
  .app-root {
    width: 100vw !important;
    height: 100vh !important;
  }
</style></head>`
    );

    return html;
  }
}

export class HydraSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'hydragit.sidebarView';

  private view?: vscode.WebviewView;
  private statusSub?: vscode.Disposable;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly goProcess: GoProcess,
    private readonly statusService: HydraStatusService
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.ctx.extensionPath, 'webview'))],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.cmd === 'vscode.openFolder') {
        await vscode.commands.executeCommand('vscode.openFolder');
        return;
      }
      if (msg.cmd === 'vscode.cloneRepo') {
        await vscode.commands.executeCommand('git.clone');
        return;
      }
      // Repo switch from the sidebar selector — routed via command, same as main.
      if (msg.cmd === 'repo.select') {
        await vscode.commands.executeCommand('hydragit.setActiveRepo', msg.params?.rootPath);
        return;
      }
      // Initial repo state on mount — see main panel handler (fault-tolerant).
      if (msg.cmd === 'repo.list') {
        let state: unknown = { repos: [], active: undefined };
        try {
          state = await vscode.commands.executeCommand('hydragit.getRepoState');
        } catch {
          /* multi-repo not wired (no workspace) */
        }
        webviewView.webview.postMessage({ id: msg.id, ok: true, data: state });
        return;
      }

      if (!this.goProcess) {
        webviewView.webview.postMessage({
          id: msg?.id, ok: false,
          error: 'fatal: not a git repository (no workspace folder open)',
        });
        return;
      }

      // openDiff is handled in the extension host — same as main panel. msg.repo
      // scopes path resolution to the group's repo (grouped sidebar).
      if (msg.cmd === 'openDiff') {
        await openDiff(msg.params, { root: msg.repo });
        return;
      }

      // Conflicted files route to VS Code's 3-way merge resolver.
      if (msg.cmd === 'openMergeEditor') {
        await openMergeEditor(msg.params, msg.repo);
        return;
      }

      try {
        const data = await this.goProcess.send(msg.cmd, msg.params ?? {}, msg.repo);
        webviewView.webview.postMessage({ id: msg.id, ok: true, data });
      } catch (err) {
        webviewView.webview.postMessage({
          id: msg?.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    if (this.statusService) {
      this.statusSub?.dispose();
      this.statusSub = this.statusService.onDidChange((snapshot) => {
        this.postStatus(snapshot);
      });
      this.postStatus(this.statusService.getSnapshot());
    }

    if (this.goProcess) {
      vscode.commands.executeCommand('hydragit.revealAll');
    }
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        vscode.commands.executeCommand('hydragit.revealAll');
      }
    });
  }

  /** Reload the sidebar webview — used on repo switch. */
  forceRefresh(): void {
    this.view?.webview.postMessage({ type: 'refresh' });
  }

  /** Push the repo list + active root to the sidebar (selector). */
  postRepoState(repos: RepoInfo[], active: string | undefined): void {
    this.view?.webview.postMessage({ type: 'repoState', data: { repos, active } });
  }

  dispose(): void {
    this.statusSub?.dispose();
  }

  private postStatus(snapshot: HydraStatusSnapshot): void {
    this.view?.webview.postMessage({
      type: 'statusUpdate',
      data: snapshot,
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const htmlPath = path.join(this.ctx.extensionPath, 'webview', 'sidebar.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, 'webview', 'sidebar.js')
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, 'webview', 'sidebar.css')
    );

    html = html.replace('./sidebar.js', scriptUri.toString());
    html = html.replace('</head>', `<link rel="stylesheet" href="${styleUri}"></head>`);

    return html;
  }
}

type BadgeTreeItem = {
  id: string;
  label: string;
};

export class HydraBadgeTreeProvider implements vscode.TreeDataProvider<BadgeTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    BadgeTreeItem | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly statusService: HydraStatusService) {
    this.statusService.onDidChange(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: BadgeTreeItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.id = element.id;
    item.contextValue = 'hydragitBadgeCarrier';
    return item;
  }

  getChildren(): Thenable<BadgeTreeItem[]> {
    const snapshot = this.statusService.getSnapshot();
    const files = snapshot.files ?? [];
    const branch = snapshot.branch || '—';

    return Promise.resolve([
      {
        id: 'status',
        label: `Branch: ${branch} • Changes: ${files.length}`,
      },
    ]);
  }
}
