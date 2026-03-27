import * as vscode from 'vscode';
import * as path from 'path';
import { buildInfo } from './generated/buildInfo';
import { GoProcess } from './goProcess';
import { HydraSidebarProvider, HydraViewProvider } from './panel';

let goProcess: GoProcess | undefined;
let output: vscode.OutputChannel;

export function activate(ctx: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('HydraGit');
  output.appendLine(
    `[HydraGit] version=${buildInfo.version} commit=${buildInfo.commit} built=${buildInfo.buildTime} dirty=${buildInfo.dirty}`
  );

  const disposable = vscode.commands.registerCommand('hydragit.showVersionInfo', async () => {
    const message =
      `HydraGit ${buildInfo.version}\n` +
      `commit: ${buildInfo.commit}\n` +
      `built: ${buildInfo.buildTime}\n` +
      `dirty: ${buildInfo.dirty}`;

    output.show(true);
    output.appendLine(message);
    await vscode.window.showInformationMessage(`HydraGit ${buildInfo.version} (${buildInfo.commit})`);
  });

  ctx.subscriptions.push(output, disposable);

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('HydraGit: no workspace folder open.');
    return;
  }

  const platform = process.platform;
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const binName = platform === 'win32'
    ? `hydragit-server-win32-x64.exe`
    : `hydragit-server-${platform}-${arch}`;
  const binaryPath = path.join(ctx.extensionPath, 'bin', binName);

  goProcess = new GoProcess(binaryPath, workspaceRoot);

  const mainProvider = new HydraViewProvider(ctx, goProcess);
  const sidebarProvider = new HydraSidebarProvider(ctx, goProcess);

  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider('hydragit.mainView', mainProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider('hydragit.sidebarView', sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('hydragit.open', () => {
      return vscode.commands.executeCommand('hydragit.mainView.focus');
    }),
  );
}

export function deactivate(): void {
  goProcess?.dispose();
  goProcess = undefined;
}
