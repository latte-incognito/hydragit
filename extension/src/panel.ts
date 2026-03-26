import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GoProcess } from './goProcess';

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
      ],
    };

    webviewView.webview.html = this.getHtml(nonce);

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

  private getHtml(nonce: string): string {
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

    return html;
  }
}

export class HydraSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'hydragit.sidebarView';
  private panelOpened = false;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly goProcess: GoProcess,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.ctx.extensionPath, 'webview')),
      ],
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async msg => {
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

    // auto-open main panel first time sidebar becomes visible
  webviewView.onDidChangeVisibility(() => {
  if (webviewView.visible) {
    vscode.commands.executeCommand('hydragit.open');
  }
});
// open main panel immediately on first load
  vscode.commands.executeCommand('hydragit.open');

  // and every subsequent time sidebar becomes visible
  webviewView.onDidChangeVisibility(() => {
    if (webviewView.visible) {
      vscode.commands.executeCommand('hydragit.open');
    }
  });
  }

  private getHtml(): string {
    const htmlPath = path.join(this.ctx.extensionPath, 'webview', 'sidebar.html');
    return fs.readFileSync(htmlPath, 'utf8');
  }
}