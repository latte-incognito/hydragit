import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GoProcess } from './goProcess';
import { openDiff, openFile } from './panel';

type HistoryInit =
  | { mode: 'file'; file: string }
  | { mode: 'selection'; file: string; start: number; end: number };

// HistoryPanelManager owns the editor-area webview tabs for File History and
// History for Selection. Unlike the sidebar/main panels (WebviewView), these
// are WebviewPanels that live in the editor column like a document.
//
// A single panel instance is reused: re-running a history command reveals the
// existing tab and re-points it at the new file/selection.
export class HistoryPanelManager {
  private panel?: vscode.WebviewPanel;
  private lastInit?: HistoryInit;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly goProcess: GoProcess
  ) {}

  openFileHistory(uri: vscode.Uri): void {
    const file = this.toRelative(uri);
    this.reveal(`History: ${path.basename(file)}`, { mode: 'file', file });
  }

  openSelectionHistory(uri: vscode.Uri, start: number, end: number): void {
    const file = this.toRelative(uri);
    this.reveal(`History for Selection: ${path.basename(file)}`, {
      mode: 'selection',
      file,
      start,
      end,
    });
  }

  private toRelative(uri: vscode.Uri): string {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    return path.relative(root, uri.fsPath);
  }

  private reveal(title: string, init: HistoryInit): void {
    this.lastInit = init;

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'hydragit.history',
        title,
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.file(path.join(this.ctx.extensionPath, 'webview')),
          ],
        }
      );

      this.panel.webview.html = this.getHtml(this.panel.webview);
      this.panel.webview.onDidReceiveMessage((msg) => this.onMessage(msg));
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });

      // Fresh webview — it will request init via 'ready' once mounted.
      this.panel.title = title;
      this.panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    // Panel already alive — re-point it immediately.
    this.panel.title = title;
    this.panel.reveal(vscode.ViewColumn.Active);
    this.panel.webview.postMessage({ type: 'init', data: init });
  }

  private async onMessage(msg: any): Promise<void> {
    if (!this.panel) return;

    if (msg.cmd === 'ready') {
      // Webview mounted and is asking for its target.
      if (this.lastInit) {
        this.panel.webview.postMessage({ type: 'init', data: this.lastInit });
      }
      return;
    }

    if (msg.cmd === 'openDiff') {
      await openDiff(msg.params);
      return;
    }
    if (msg.cmd === 'openFile') {
      await openFile(msg.params);
      return;
    }

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
  }

  private getHtml(webview: vscode.Webview): string {
    const htmlPath = path.join(this.ctx.extensionPath, 'webview', 'history.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, 'webview', 'history.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, 'webview', 'history.css')
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
    html = html.replace('./history.js', scriptUri.toString());
    html = html.replace('</head>', `<link rel="stylesheet" href="${styleUri}"></head>`);
    html = html.replace(
      '</head>',
      `<style>
  html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; height: 100% !important; overflow: hidden !important; }
  .app-root { width: 100vw !important; height: 100vh !important; }
</style></head>`
    );

    return html;
  }
}
