import * as vscode from 'vscode';
import * as path from 'path';
import { GoProcess } from './goProcess';
import { HydraPanel } from './panel';

let goProcess: GoProcess | undefined;
let hydraPanel: HydraPanel | undefined;

export function activate(ctx: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('HydraGit: no workspace folder open.');
    return;
  }

  const platform = process.platform; // 'darwin', 'linux', 'win32'
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const binName = platform === 'win32'
    ? `hydragit-server-win32-x64.exe`
    : `hydragit-server-${platform}-${arch}`;
  const binaryPath = path.join(ctx.extensionPath, 'bin', binName);

  goProcess = new GoProcess(binaryPath, workspaceRoot);

  ctx.subscriptions.push(
    vscode.commands.registerCommand('hydragit.open', () => {
      if (!goProcess) { return; }
      if (hydraPanel) {
        hydraPanel.reveal();
      } else {
        hydraPanel = new HydraPanel(ctx, goProcess);
      }
    }),
  );
}

export function deactivate(): void {
  goProcess?.dispose();
  goProcess = undefined;
  hydraPanel = undefined;
}
