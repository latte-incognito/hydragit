import * as vscode from 'vscode';
import * as path from 'path';
import { buildInfo } from './generated/buildInfo';
import { GoProcess } from './goProcess';
import { HydraBadgeTreeProvider, HydraSidebarProvider, HydraViewProvider } from './panel';
import { HydraStatusService } from './HydraStatusService';

let goProcess: GoProcess | undefined;
let output: vscode.OutputChannel;

export function activate(ctx: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('HydraGit');
  output.appendLine(
    `[HydraGit] version=${buildInfo.version} commit=${buildInfo.commit} built=${buildInfo.buildTime} dirty=${buildInfo.dirty}`
  );

  const logDir = ctx.logUri.fsPath;

  ctx.subscriptions.push(
    vscode.commands.registerCommand('hydragit.showVersionInfo', async () => {
      const message =
        `HydraGit ${buildInfo.version}\n` +
        `commit: ${buildInfo.commit}\n` +
        `built: ${buildInfo.buildTime}\n` +
        `dirty: ${buildInfo.dirty}`;

      output.show(true);
      output.appendLine(message);
      await vscode.window.showInformationMessage(
        `HydraGit ${buildInfo.version} (${buildInfo.commit})`
      );
    }),

    vscode.commands.registerCommand('hydragit.openLogs', async () => {
      await vscode.commands.executeCommand(
        'revealFileInOS',
        vscode.Uri.file(logDir)
      );
    })
  );

  ctx.subscriptions.push(output);

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('HydraGit: no workspace folder open.');
    return;
  }

  const platform = process.platform;
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const binName =
    platform === 'win32' ? `hydragit-server-win32-x64.exe` : `hydragit-server-${platform}-${arch}`;
  const binaryPath = path.join(ctx.extensionPath, 'bin', binName);

  goProcess = new GoProcess(binaryPath, workspaceRoot, logDir);

  const statusService = new HydraStatusService(goProcess, 3000);
  ctx.subscriptions.push(statusService);

  const mainProvider = new HydraViewProvider(ctx, goProcess);
  const sidebarProvider = new HydraSidebarProvider(ctx, goProcess, statusService);
  const badgeTreeProvider = new HydraBadgeTreeProvider(statusService);

  ctx.subscriptions.push(
    vscode.commands.registerCommand('hydragit.revealAll', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.hydragit');
      await vscode.commands.executeCommand('hydragit.mainView.focus');
    })
  );

  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider('hydragit.mainView', mainProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider('hydragit.sidebarView', sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  const badgeTree = vscode.window.createTreeView('hydragit.badgeCarrier', {
    treeDataProvider: badgeTreeProvider,
    showCollapseAll: false,
  });
  ctx.subscriptions.push(badgeTree);

  const updateBadge = () => {
    const snapshot = statusService.getSnapshot();
    const count = snapshot.files?.length ?? 0;

    badgeTree.badge =
      count > 0
        ? {
            value: count,
            tooltip: count === 1 ? '1 changed file' : `${count} changed files`,
          }
        : undefined;
  };

  ctx.subscriptions.push(
    statusService.onDidChange(() => {
      updateBadge();
      badgeTreeProvider.refresh();
    })
  );

  statusService.start();
  updateBadge();
}

export function deactivate(): void {
  goProcess?.dispose();
  goProcess = undefined;
}
