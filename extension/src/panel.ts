import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GoProcess } from './goProcess';
import { HydraStatusService, HydraStatusSnapshot } from './HydraStatusService';

export class HydraViewProvider implements vscode.WebviewViewProvider {
  private watcher: vscode.FileSystemWatcher | undefined;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly goProcess: GoProcess,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    const nonce = Math.random().toString(36).slice(2);

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.ctx.extensionPath, 'webview')),
        vscode.Uri.file(path.join(this.ctx.extensionPath, 'images')),
      ],
    };

  const iconUri =   webviewView.webview.asWebviewUri(
    vscode.Uri.file(path.join(this.ctx.extensionPath, 'images', 'icon.png'))
  );
    webviewView.webview.html = this.getHtml(nonce, iconUri);

    webviewView.webview.onDidReceiveMessage(async msg => {
      console.log('[HydraGit] received:', msg.cmd); 
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
         new vscode.RelativePattern(workspaceRoot, '.git/{HEAD,refs/**,COMMIT_EDITMSG}'),
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

  private getHtml(nonce: string, iconUri: vscode.Uri): string {
    const htmlPath = path.join(this.ctx.extensionPath, 'webview', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

const csp = [
  `default-src 'none'`,
  `script-src 'unsafe-inline'`,   // ← changed from nonce to unsafe-inline
  `style-src 'unsafe-inline'`,
  `img-src data: https: blob:`,
  `font-src data:`,
].join('; ');

html = html.replace(
  /<head>/i,
  `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`,
);
// remove the nonce injection line — not needed anymore
// html = html.replace(/<script/g, `<script nonce="${nonce}"`);
html = html.replace(/\{\{ICON_URI\}\}/g, iconUri.toString());
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
    private readonly statusService: HydraStatusService,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.ctx.extensionPath, 'webview')),
      ],
    };

    webviewView.webview.html = this.getHtml();
    
    webviewView.webview.onDidReceiveMessage(async (msg) => {
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
      // and every subsequent time sidebar becomes visible
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

  private getHtml(): string {
    const htmlPath = path.join(this.ctx.extensionPath, 'webview', 'sidebar.html');
    return fs.readFileSync(htmlPath, 'utf8');
  }
}

type BadgeTreeItem = {
  id: string;
  label: string;
};

export class HydraBadgeTreeProvider implements vscode.TreeDataProvider<BadgeTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<BadgeTreeItem | undefined | void>();
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

    // Minimal placeholder content. You can return [] if you want,
    // but one tiny row can make the view less broken if it becomes visible.
    return Promise.resolve([
      {
        id: 'status',
        label: `Branch: ${branch} • Changes: ${files.length}`,
      },
    ]);
  }
}