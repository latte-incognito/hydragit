import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GoProcess } from './goProcess';
import { HydraStatusService, HydraStatusSnapshot } from './HydraStatusService';

// ── Shared diff helpers ───────────────────────────────────────────────────────

async function fileExistsAtRef(absPath: string, ref: string): Promise<boolean> {
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execFile);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const relPath = path.relative(workspaceRoot, absPath);
    await exec('git', ['cat-file', '-e', `${ref}:${relPath}`], { cwd: workspaceRoot });
    return true;
  } catch {
    return false;
  }
}

async function openDiff(params: { commit: string; parent: string; file: string }): Promise<void> {
  const { commit, parent, file } = params;

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  const absPath = path.join(workspaceRoot, file);

  // ── Working tree diff (sidebar) ──────────────────────────────────────────
  if (commit === 'HEAD' && !parent) {
    const title = `${path.basename(file)} (working tree)`;
    const workingTreeUri = vscode.Uri.file(absPath);
    const headExists = await fileExistsAtRef(absPath, 'HEAD');

    if (!headExists) {
      await vscode.commands.executeCommand('vscode.open', workingTreeUri, { preview: true }, title);
      return;
    }

    const headUri = vscode.Uri.parse(`git:${absPath}`).with({
      query: JSON.stringify({ path: absPath, ref: 'HEAD' }),
    });
    await vscode.commands.executeCommand('vscode.diff', headUri, workingTreeUri, title);
    return;
  }

  // ── Commit diff (main panel) ─────────────────────────────────────────────
  const title = `${path.basename(file)} (${commit.slice(0, 7)})`;

  const gitUri = (ref: string) =>
    vscode.Uri.parse(`git:${absPath}`).with({
      query: JSON.stringify({ path: absPath, ref }),
    });

  const [existsInParent, existsInCommit] = await Promise.all([
    parent ? fileExistsAtRef(absPath, parent) : Promise.resolve(false),
    fileExistsAtRef(absPath, commit),
  ]);

  if (!existsInParent && !existsInCommit) {
    vscode.window.showWarningMessage(`Cannot show diff: file not found at either ref.`);
    return;
  }

  if (!existsInParent) {
    await vscode.commands.executeCommand('vscode.open', gitUri(commit), { preview: true }, title);
    return;
  }

  if (!existsInCommit) {
    await vscode.commands.executeCommand('vscode.open', gitUri(parent), { preview: true }, `${title} (deleted)`);
    return;
  }

  await vscode.commands.executeCommand('vscode.diff', gitUri(parent), gitUri(commit), title);
}

export class HydraViewProvider implements vscode.WebviewViewProvider {
  private watcher: vscode.FileSystemWatcher | undefined;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly goProcess: GoProcess
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.ctx.extensionPath, 'webview')),
        vscode.Uri.file(path.join(this.ctx.extensionPath, 'images')),
      ],
    };

    const iconUri = webviewView.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.ctx.extensionPath, 'images', 'icon.png'))
    );
    webviewView.webview.html = this.getHtml(webviewView.webview, iconUri);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      // openDiff is handled entirely in the extension host — no Go call needed
      if (msg.cmd === 'openDiff') {
        await openDiff(msg.params);
        return;
      }

      try {
        const data = await this.goProcess.send(msg.cmd, msg.params ?? {});
        webviewView.webview.postMessage({ id: msg.id, ok: true, data });
      } catch (err) {
        webviewView.webview.postMessage({
          id: msg.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    // watch .git/ for file changes → refresh
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      this.watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceRoot, '.git/{HEAD,refs/**,COMMIT_EDITMSG}')
      );
      const refresh = () => webviewView.webview.postMessage({ type: 'refresh' });
      this.watcher.onDidChange(refresh);
      this.watcher.onDidCreate(refresh);
      this.watcher.onDidDelete(refresh);
    }

    webviewView.onDidDispose(() => this.watcher?.dispose());
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
      // openDiff is handled in the extension host — same as main panel
      if (msg.cmd === 'openDiff') {
        await openDiff(msg.params);
        return;
      }

      try {
        const data = await this.goProcess.send(msg.cmd, msg.params ?? {});
        webviewView.webview.postMessage({ id: msg.id, ok: true, data });
      } catch (err) {
        webviewView.webview.postMessage({
          id: msg?.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    this.statusSub?.dispose();
    this.statusSub = this.statusService.onDidChange((snapshot) => {
      this.postStatus(snapshot);
    });

    this.postStatus(this.statusService.getSnapshot());

    vscode.commands.executeCommand('hydragit.revealAll');
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        vscode.commands.executeCommand('hydragit.revealAll');
      }
    });
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
