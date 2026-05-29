import * as vscode from 'vscode';
import * as path from 'path';
import { buildInfo } from './generated/buildInfo';
import { GoProcess } from './goProcess';
import { HydraBadgeTreeProvider, HydraSidebarProvider, HydraViewProvider } from './panel';
import { HistoryPanelManager } from './historyPanel';
import { HydraStatusService } from './HydraStatusService';
import { Logger } from './Logger';

let goProcess: GoProcess | undefined;

export function activate(ctx: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('HydraGit');
  ctx.subscriptions.push(output);

  // Logger must be initialised before anything else so GoProcess
  // and HydraStatusService can use it immediately.
  Logger.init(output);

  Logger.info('extension', `activating version=${buildInfo.version} commit=${buildInfo.commit} built=${buildInfo.buildTime} dirty=${buildInfo.dirty}`);

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

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    Logger.warn('extension', 'no workspace folder open — registering empty sidebar');
    const sidebarProvider = new HydraSidebarProvider(ctx, null as any, null as any);
    ctx.subscriptions.push(
      vscode.window.registerWebviewViewProvider('hydragit.sidebarView', sidebarProvider, {
        webviewOptions: { retainContextWhenHidden: true },
      })
    );
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

  const historyPanel = new HistoryPanelManager(ctx, goProcess);

  ctx.subscriptions.push(
    vscode.commands.registerCommand('hydragit.fileHistory', (uri?: vscode.Uri) => {
      // Explorer passes the resource uri; from the editor menu it's absent,
      // so fall back to the active editor's document.
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        vscode.window.showWarningMessage('HydraGit: no file to show history for.');
        return;
      }
      historyPanel.openFileHistory(target);
    }),

    vscode.commands.registerCommand('hydragit.selectionHistory', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('HydraGit: no active editor selection.');
        return;
      }
      // git line ranges are 1-based and inclusive.
      const start = editor.selection.start.line + 1;
      const end = editor.selection.end.line + 1;
      historyPanel.openSelectionHistory(editor.document.uri, start, end);
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

  Logger.info('extension', 'activated');
}

export function deactivate(): void {
  Logger.info('extension', 'deactivating');
  goProcess?.dispose();
  goProcess = undefined;
}
