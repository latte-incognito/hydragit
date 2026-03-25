import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GoProcess } from './goProcess';

export class HydraPanel {
  private panel: vscode.WebviewPanel;
  private watcher: vscode.FileSystemWatcher | undefined;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly goProcess: GoProcess,
  ) {
    const nonce = Math.random().toString(36).slice(2);

    this.panel = vscode.window.createWebviewPanel(
      'hydragit',
      'HydraGit',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(ctx.extensionPath, 'webview')),
        ],
      },
    );

    this.panel.webview.html = this.getHtml(nonce);

    this.panel.webview.onDidReceiveMessage(async msg => {
      try {
        const data = await this.goProcess.send(msg.cmd, msg.params ?? {});
        this.panel.webview.postMessage({ id: msg.id, ok: true, data });
      } catch (err) {
        this.panel.webview.postMessage({
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
        new vscode.RelativePattern(workspaceRoot, '.git/**'),
      );
      const refresh = () => this.panel.webview.postMessage({ type: 'refresh' });
      this.watcher.onDidChange(refresh);
      this.watcher.onDidCreate(refresh);
      this.watcher.onDidDelete(refresh);
    }

    this.panel.onDidDispose(() => this.watcher?.dispose());
  }

  private getHtml(nonce: string): string {
    const htmlPath = path.join(this.ctx.extensionPath, 'webview', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    // Inject nonce into existing script tags and add CSP meta tag
    const csp = [
      `default-src 'none'`,
      `script-src 'nonce-${nonce}'`,
      `style-src 'unsafe-inline'`,
      `img-src data: https:`,
      `font-src data:`,
    ].join('; ');

    html = html.replace(
      /<head>/i,
      `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`,
    );
    html = html.replace(/<script/g, `<script nonce="${nonce}"`);

    return html;
  }

  reveal(): void {
    this.panel.reveal();
  }
}
