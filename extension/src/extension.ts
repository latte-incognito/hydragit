import * as vscode from 'vscode';
import * as path from 'path';
import { buildInfo } from './generated/buildInfo';
import { GoProcess } from './goProcess';
import {
  HydraBadgeTreeProvider,
  HydraSidebarProvider,
  HydraViewProvider,
  setActiveRepoRoot,
  setKnownRepoRoots,
} from './panel';
import { HistoryPanelManager } from './historyPanel';
import { HydraStatusService } from './HydraStatusService';
import { RepoService } from './RepoService';
import { BlameController } from './blameAnnotation';
import { Logger } from './Logger';

let goProcess: GoProcess | undefined;

export function activate(ctx: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('HydraGit');
  ctx.subscriptions.push(output);

  // Logger must be initialised before anything else so GoProcess
  // and HydraStatusService can use it immediately.
  Logger.init(output);

  Logger.info(
    'extension',
    `activating version=${buildInfo.version} commit=${buildInfo.commit} built=${buildInfo.buildTime} dirty=${buildInfo.dirty}`
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
      await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(logDir));
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

  // Critical-error surfacing (#3): if the git backend dies, the panel can no
  // longer talk to git, so offer a one-click reload of the window (which
  // restarts the extension host and respawns the process).
  goProcess.onCrash = (reason: string) => {
    Logger.error('extension', `Go process crashed: ${reason}`);
    void vscode.window
      .showErrorMessage(`${reason} Reload to restart HydraGit.`, { modal: false }, 'Reload Window')
      .then((choice) => {
        if (choice === 'Reload Window') {
          void vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
      });
  };

  const statusService = new HydraStatusService(goProcess, 3000);
  ctx.subscriptions.push(statusService);

  const mainProvider = new HydraViewProvider(ctx, goProcess);
  const sidebarProvider = new HydraSidebarProvider(ctx, goProcess, statusService);
  const badgeTreeProvider = new HydraBadgeTreeProvider(statusService);

  ctx.subscriptions.push(
    vscode.commands.registerCommand('hydragit.revealAll', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.hydragit');
      await vscode.commands.executeCommand('hydragit.mainView.focus');
    }),
    vscode.commands.registerCommand('hydragit.forceRefresh', () => mainProvider.forceRefresh())
  );

  // ── Multi-repo ─────────────────────────────────────────────────────────────
  // RepoService owns "which repos exist" + "which is active". GoProcess stamps
  // the active root onto every request; the host path-helpers (panel.ts) resolve
  // against it. The status-bar item is the always-visible anchor (survives any
  // panel being closed) and only appears when there's more than one repo.
  const repoService = new RepoService(ctx);
  ctx.subscriptions.push(repoService);

  const repoStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  repoStatusItem.command = 'hydragit.selectRepo';
  ctx.subscriptions.push(repoStatusItem);

  const updateRepoStatusItem = () => {
    const repos = repoService.getRepos();
    const active = repoService.getActive();
    if (repos.length <= 1) {
      repoStatusItem.hide();
      return;
    }
    repoStatusItem.text = `$(repo) ${active?.name ?? '—'}`;
    repoStatusItem.tooltip = `HydraGit repository: ${active?.rootPath ?? 'none'} — click to switch`;
    repoStatusItem.show();
  };

  ctx.subscriptions.push(
    // Routed from the in-panel selector / breadcrumb (panel.ts repo.select).
    vscode.commands.registerCommand('hydragit.setActiveRepo', (rootPath?: string) => {
      if (rootPath) repoService.setActive(rootPath);
    }),
    // Initial repo state for a freshly-mounted webview (panel.ts repo.list).
    vscode.commands.registerCommand('hydragit.getRepoState', () => ({
      repos: repoService.getRepos(),
      active: repoService.getActiveRoot(),
    })),
    // Status-bar / palette repo switcher.
    vscode.commands.registerCommand('hydragit.selectRepo', async () => {
      const repos = repoService.getRepos();
      if (repos.length === 0) {
        vscode.window.showInformationMessage('HydraGit: no git repositories found.');
        return;
      }
      const active = repoService.getActiveRoot();
      const pick = await vscode.window.showQuickPick(
        repos.map((r) => ({
          label: r.name,
          description: r.rootPath === active ? '$(check) current' : r.rootPath,
          rootPath: r.rootPath,
        })),
        { placeHolder: 'Select active repository' }
      );
      if (pick) repoService.setActive((pick as { rootPath: string }).rootPath);
    })
  );

  // Fan-out on change. Cheap updates (status item, repo list → panels) run every
  // time; the heavy reload only fires when the *active* repo actually changes,
  // so the git API's open/close churn at startup doesn't thrash the panels.
  let lastActiveRoot: string | undefined;
  ctx.subscriptions.push(
    repoService.onDidChange(() => {
      const active = repoService.getActiveRoot();
      const repos = repoService.getRepos();
      // Refresh the allowlist BEFORE the webviews learn the repo list, so the
      // webview can never know a root the message gate doesn't.
      setKnownRepoRoots(repos.map((r) => r.rootPath));
      updateRepoStatusItem();
      mainProvider.postRepoState(repos, active);
      sidebarProvider.postRepoState(repos, active);
      if (active === lastActiveRoot) return;
      lastActiveRoot = active;
      goProcess!.setActiveRepo(active);
      setActiveRepoRoot(active);
      mainProvider.retargetWatcher(active);
      mainProvider.forceRefresh();
      sidebarProvider.forceRefresh();
      void statusService.refresh();
      // rerere: record conflict resolutions and reuse them on repeated
      // rebases/merges. Repo-local config, idempotent, best-effort.
      if (vscode.workspace.getConfiguration('hydragit').get<boolean>('rerere.enabled', true)) {
        for (const r of repos) {
          goProcess!.send('rerere.enable', {}, r.rootPath).catch(() => {
            /* non-fatal — e.g. a repo that vanished mid-flight */
          });
        }
      }
    })
  );

  void repoService.init();

  // Inline blame: faint trailing annotation on the active editor line + hover.
  const blameController = new BlameController(goProcess, workspaceRoot);
  ctx.subscriptions.push(
    blameController,
    vscode.commands.registerCommand('hydragit.toggleLineBlame', () => blameController.toggle()),
    vscode.commands.registerCommand('hydragit.copyCommitSha', async (sha?: string) => {
      if (!sha) return;
      await vscode.env.clipboard.writeText(sha);
      vscode.window.setStatusBarMessage(`Copied ${sha.slice(0, 8)}`, 2000);
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

    // "History Up to Here" from the main panel's file context menu: open File
    // History for an already repo-relative path, truncated to a revision.
    vscode.commands.registerCommand('hydragit.fileHistoryAt', (file?: string, ref?: string) => {
      if (!file) return;
      historyPanel.openFileHistoryRel(file, ref);
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
    }),

    // Invoked from the blame hover: open line history for one specific line.
    vscode.commands.registerCommand('hydragit.lineHistory', (uriString: string, line: number) => {
      historyPanel.openSelectionHistory(vscode.Uri.parse(uriString), line, line);
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
