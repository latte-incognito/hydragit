import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GoProcess } from './goProcess';
import { HydraStatusService, HydraStatusSnapshot } from './HydraStatusService';
import { RepoInfo } from './RepoService';

// ── Active repo root (multi-repo) ─────────────────────────────────────────────
// Host-side helpers resolve file paths against the active repo, not blindly
// against the first workspace folder. extension.ts updates this on every repo
// switch. When unset, it falls back to the first folder → single-repo behaviour
// is unchanged.
let activeRepoRoot: string | undefined;
export function setActiveRepoRoot(root: string | undefined): void {
  activeRepoRoot = root;
}
function repoRoot(): string {
  return activeRepoRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
}

// ── Webview-boundary hardening ────────────────────────────────────────────────
// The webview stamps `repo` onto requests; without a check it could point git
// at ANY directory on disk (read a foreign repo via log/diff, or destroy one
// via reset/stash.clear). Only roots RepoService has discovered are allowed.
// extension.ts refreshes this set on every RepoService change.
let knownRepoRoots = new Set<string>();
export function setKnownRepoRoots(roots: string[]): void {
  knownRepoRoots = new Set(roots);
}
function repoAllowed(repo: unknown): boolean {
  if (repo === undefined || repo === null) return true; // falls back to active/spawn default
  return typeof repo === 'string' && knownRepoRoots.has(repo);
}

// Destructive-op gate: don't trust `force: true` (or force-class commands)
// from the webview alone — they only forward if a native host-side ui.confirm
// was answered Yes recently. The confirmation isn't bound to the specific op
// (the webview drives its own flows), but it guarantees a real user clicked a
// real native dialog moments before anything irreversible runs.
const FORCE_GATED_CMDS = new Set(['push.force', 'stash.clear']);
const CONFIRM_WINDOW_MS = 30_000;
let lastConfirmedAt = 0;
export function recordConfirmation(): void {
  lastConfirmedAt = Date.now();
}
function destructiveOpBlocked(cmd: string, params: unknown): boolean {
  const forced = typeof params === 'object' && params !== null && (params as { force?: unknown }).force === true;
  if (!FORCE_GATED_CMDS.has(cmd) && !forced) return false;
  return Date.now() - lastConfirmedAt > CONFIRM_WINDOW_MS;
}

// Pre-commit safety checks read their toggles from user settings — resolved
// host-side so neither the webview nor Go needs config plumbing of its own.
const SAFETY_CHECKS = ['secretFile', 'secretContent', 'conflictMarker', 'largeFile', 'protectedBranch'];
function enabledSafetyChecks(): string[] {
  const cfg = vscode.workspace.getConfiguration('hydragit.safety');
  return SAFETY_CHECKS.filter((c) => cfg.get<boolean>(c, true));
}
// Which branches the protectedBranch check guards. Sanitized here so a
// malformed user setting (non-array, empty strings) degrades to the default
// instead of silently disarming the check Go-side.
function protectedBranchList(): string[] {
  const cfg = vscode.workspace.getConfiguration('hydragit.safety');
  const raw = cfg.get<unknown>('protectedBranches', ['main', 'master']);
  const list = Array.isArray(raw)
    ? raw.filter((b): b is string => typeof b === 'string' && b.trim() !== '').map((b) => b.trim())
    : [];
  return list.length > 0 ? list : ['main', 'master'];
}

// ── Shared diff helpers ───────────────────────────────────────────────────────

// One of two host-side git calls outside the Go binary's run() chokepoint
// (the other is openCommitUrl). Both are local-only reads, but they're still
// bounded by a timeout so a pathological repo can't hang the host the way
// unbounded network git once hung Go (BUGS.md #5).
const HOST_GIT_TIMEOUT_MS = 5000;

async function fileExistsAtRef(absPath: string, ref: string, root?: string): Promise<boolean> {
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execFile);
    const workspaceRoot = root ?? repoRoot();
    const relPath = path.relative(workspaceRoot, absPath);
    await exec('git', ['cat-file', '-e', `${ref}:${relPath}`], {
      cwd: workspaceRoot,
      timeout: HOST_GIT_TIMEOUT_MS,
    });
    return true;
  } catch {
    // "Missing at this ref" is an expected answer here, not an error.
    return false;
  }
}

export async function openFile(params: { file: string; ref?: string }, root?: string): Promise<void> {
  const workspaceRoot = root ?? repoRoot();
  const absPath = path.join(workspaceRoot, params.file);
  // With a ref, open the file's content as it was at that revision (read-only),
  // via the built-in Git extension's `git:` scheme — "Open Repository Version".
  if (params.ref) {
    const uri = vscode.Uri.parse(`git:${absPath}`).with({
      query: JSON.stringify({ path: absPath, ref: params.ref }),
    });
    await vscode.commands.executeCommand('vscode.open', uri);
    return;
  }
  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(absPath));
}

// openWorkingDiff opens a diff editor comparing a file at a given revision (left)
// against the current working-tree copy (right) — "Compare with Local". The ref
// side is read-only via the built-in Git extension's `git:` scheme.
export async function openWorkingDiff(
  params: {
    file: string;
    ref: string;
    label?: string;
  },
  root?: string
): Promise<void> {
  const workspaceRoot = root ?? repoRoot();
  const absPath = path.join(workspaceRoot, params.file);
  const refUri = vscode.Uri.parse(`git:${absPath}`).with({
    query: JSON.stringify({ path: absPath, ref: params.ref }),
  });
  const workingUri = vscode.Uri.file(absPath);
  const label = params.label ?? params.ref.slice(0, 7);
  const title = `${path.basename(params.file)} (${label} ↔ working tree)`;
  await vscode.commands.executeCommand('vscode.diff', refUri, workingUri, title, { preview: true });
}

// savePatch prompts for a destination with a native save dialog and writes the
// patch text there — the IntelliJ "Create Patch…" flow. Fire-and-forget from the
// webview; feedback is shown natively.
export async function savePatch(params: { content: string; name?: string }, root?: string): Promise<void> {
  const workspaceRoot = root ?? repoRoot();
  const defaultUri = vscode.Uri.file(path.join(workspaceRoot, params.name ?? 'changes.patch'));
  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { Patch: ['patch', 'diff'], 'All files': ['*'] },
  });
  if (!target) return; // user cancelled
  // Ensure a trailing newline (run() trims it) so `git am` is happy.
  const body = params.content.endsWith('\n') ? params.content : params.content + '\n';
  await vscode.workspace.fs.writeFile(target, Buffer.from(body, 'utf8'));
  vscode.window.showInformationMessage(`Patch saved to ${path.basename(target.fsPath)}`);
}

// Normalize a remote URL to its web (HTTPS) form. Supports the SSH and
// scp-like shorthand used by GitHub/GitLab/Bitbucket; passes through HTTPS.
function remoteUrlToWeb(raw: string): string | null {
  let url = raw.trim();
  if (!url) return null;
  if (url.endsWith('.git')) url = url.slice(0, -4);
  // ssh://git@host/owner/repo
  const ssh = url.match(/^ssh:\/\/[^@]+@([^/:]+)(?::\d+)?\/(.+)$/);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  // scp-like: git@host:owner/repo
  const scp = url.match(/^[^@]+@([^:]+):(.+)$/);
  if (scp) return `https://${scp[1]}/${scp[2]}`;
  // http(s) already
  if (/^https?:\/\//.test(url)) return url;
  return null;
}

async function openCommitUrl(params: { commit: string }, root?: string): Promise<void> {
  const { commit } = params;
  if (!commit) return;
  const workspaceRoot = root ?? repoRoot();
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execFile);
    const { stdout } = await exec('git', ['config', '--get', 'remote.origin.url'], {
      cwd: workspaceRoot,
      timeout: HOST_GIT_TIMEOUT_MS,
    });
    const web = remoteUrlToWeb(stdout);
    if (!web) {
      vscode.window.showWarningMessage(`Could not parse remote URL: ${stdout.trim()}`);
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(`${web}/commit/${commit}`));
  } catch (err) {
    vscode.window.showWarningMessage(
      `No remote.origin.url configured: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ── Code-search snippet highlighting ────────────────────────────────────────
// Diffs open in VS Code's native diff editor, where the webview can't paint
// anything — so during a code search (`git log -S`) the host decorates every
// occurrence of the searched snippet in the opened diff, find-match style.
let snippetDeco: vscode.TextEditorDecorationType | undefined;

function snippetDecoType(): vscode.TextEditorDecorationType {
  if (!snippetDeco) {
    snippetDeco = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Center,
    });
  }
  return snippetDeco;
}

function snippetRanges(doc: vscode.TextDocument, snippet: string): vscode.Range[] {
  const scan = (needle: string): vscode.Range[] => {
    const text = doc.getText();
    const ranges: vscode.Range[] = [];
    let i = 0;
    while ((i = text.indexOf(needle, i)) !== -1) {
      ranges.push(new vscode.Range(doc.positionAt(i), doc.positionAt(i + needle.length)));
      i += needle.length;
    }
    return ranges;
  };
  let ranges = scan(snippet);
  // Multi-line snippets come from the webview with \n; the document may be CRLF.
  if (ranges.length === 0 && snippet.includes('\n')) {
    ranges = scan(snippet.replace(/\n/g, '\r\n'));
  }
  return ranges;
}

function highlightSnippet(uris: vscode.Uri[], snippet: string | undefined): void {
  const keys = new Set(uris.map((u) => u.toString()));
  const apply = () => {
    for (const ed of vscode.window.visibleTextEditors) {
      if (!keys.has(ed.document.uri.toString())) continue;
      ed.setDecorations(snippetDecoType(), snippet ? snippetRanges(ed.document, snippet) : []);
    }
  };
  apply();
  // git: virtual documents fill in asynchronously — re-apply once they settle
  // (second pass for large files that take longer to materialize).
  if (snippet) {
    setTimeout(apply, 400);
    setTimeout(apply, 1500);
  }
}

export async function openDiff(
  params: { commit: string; parent: string; file: string; newTab?: boolean; snippet?: string },
  opts?: { viewColumn?: vscode.ViewColumn; preserveFocus?: boolean; root?: string }
): Promise<void> {
  const { commit, parent, file } = params;

  // Target a specific editor group (history panels) or the active one (default).
  // preview:true so successive selections replace the diff in place; newTab opens
  // a persistent tab instead (double-click / "Show Diff in a New Tab").
  const show: vscode.TextDocumentShowOptions = {
    preview: !params.newTab,
    viewColumn: opts?.viewColumn,
    preserveFocus: opts?.preserveFocus,
  };

  const workspaceRoot = opts?.root ?? repoRoot();
  const absPath = path.join(workspaceRoot, file);

  // ── Working tree diff (sidebar) ──────────────────────────────────────────
  if (commit === 'HEAD' && !parent) {
    const title = `${path.basename(file)} (working tree)`;
    const workingTreeUri = vscode.Uri.file(absPath);
    const headExists = await fileExistsAtRef(absPath, 'HEAD', workspaceRoot);

    if (!headExists) {
      await vscode.commands.executeCommand('vscode.open', workingTreeUri, show, title);
      return;
    }

    const headUri = vscode.Uri.parse(`git:${absPath}`).with({
      query: JSON.stringify({ path: absPath, ref: 'HEAD' }),
    });
    await vscode.commands.executeCommand('vscode.diff', headUri, workingTreeUri, title, show);
    return;
  }

  // ── Commit diff (main panel) ─────────────────────────────────────────────
  const title = `${path.basename(file)} (${commit.slice(0, 7)})`;

  const gitUri = (ref: string) =>
    vscode.Uri.parse(`git:${absPath}`).with({
      query: JSON.stringify({ path: absPath, ref }),
    });

  const [existsInParent, existsInCommit] = await Promise.all([
    parent ? fileExistsAtRef(absPath, parent, workspaceRoot) : Promise.resolve(false),
    fileExistsAtRef(absPath, commit, workspaceRoot),
  ]);

  if (!existsInParent && !existsInCommit) {
    vscode.window.showWarningMessage(`Cannot show diff: file not found at either ref.`);
    return;
  }

  if (!existsInParent) {
    await vscode.commands.executeCommand('vscode.open', gitUri(commit), show, title);
    highlightSnippet([gitUri(commit)], params.snippet);
    return;
  }

  if (!existsInCommit) {
    await vscode.commands.executeCommand('vscode.open', gitUri(parent), show, `${title} (deleted)`);
    highlightSnippet([gitUri(parent)], params.snippet);
    return;
  }

  await vscode.commands.executeCommand('vscode.diff', gitUri(parent), gitUri(commit), title, show);
  highlightSnippet([gitUri(parent), gitUri(commit)], params.snippet);
}

// openMergeEditor opens VS Code's built-in 3-way merge resolver for a conflicted
// file. Falls back to opening the file (with inline conflict-marker CodeLens) if
// the git extension's merge-editor command isn't available.
export async function openMergeEditor(params: { file: string }, root?: string): Promise<void> {
  const workspaceRoot = root ?? repoRoot();
  const uri = vscode.Uri.file(path.join(workspaceRoot, params.file));
  try {
    await vscode.commands.executeCommand('git.openMergeEditor', uri);
  } catch {
    await vscode.commands.executeCommand('vscode.open', uri);
  }
}

export class HydraViewProvider implements vscode.WebviewViewProvider {
  private watcher: vscode.FileSystemWatcher | undefined;
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly goProcess: GoProcess
  ) {}

  /** Reload the whole main panel — bound to `hydragit.forceRefresh`. */
  forceRefresh(): void {
    this.view?.webview.postMessage({ type: 'refresh' });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.ctx.extensionPath, 'webview')),
        vscode.Uri.file(path.join(this.ctx.extensionPath, 'images')),
      ],
    };

    // Colored mark on transparent — this <img> renders un-tinted in the webview
    // (DetailPane empty state), so it must stay visible on light *and* dark
    // themes. The activity-bar container icon stays icon-tight.png (white
    // silhouette), which VS Code tints itself.
    const iconUri = webviewView.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.ctx.extensionPath, 'images', 'icon-fat-transparent.png'))
    );
    // Single hydra head — the toolbar's resting brand mark; on hover it blooms
    // into the full three-head logo (iconUri). Same source art, so the morph is
    // seamless. Both are colored-on-transparent → visible on light + dark.
    const headUri = webviewView.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.ctx.extensionPath, 'images', 'icon-head.png'))
    );
    webviewView.webview.html = this.getHtml(webviewView.webview, iconUri, headUri);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      // Reject any repo root the host hasn't discovered (see repoAllowed).
      if (msg?.repo !== undefined && !repoAllowed(msg.repo)) {
        webviewView.webview.postMessage({
          id: msg?.id, ok: false,
          error: `unknown repository: ${String(msg.repo)}`,
        });
        return;
      }
      // openDiff is handled entirely in the extension host — no Go call needed.
      // msg.repo (when present) scopes path resolution to that repo's root, so
      // diffs opened from a non-focused sidebar group target the right files.
      if (msg.cmd === 'openDiff') {
        await openDiff(msg.params, { root: msg.repo });
        return;
      }
      if (msg.cmd === 'openFile') {
        await openFile(msg.params, msg.repo);
        return;
      }
      if (msg.cmd === 'openWorkingDiff') {
        await openWorkingDiff(msg.params, msg.repo);
        return;
      }
      // "History Up to Here" — open the dedicated File History panel for this
      // file, truncated to the given revision. Routed through a command so the
      // panel needn't hold a HistoryPanelManager reference.
      if (msg.cmd === 'openFileHistory') {
        await vscode.commands.executeCommand(
          'hydragit.fileHistoryAt',
          msg.params?.file,
          msg.params?.ref
        );
        return;
      }
      if (msg.cmd === 'savePatch') {
        await savePatch(msg.params, msg.repo);
        return;
      }
      if (msg.cmd === 'openCommitUrl') {
        await openCommitUrl(msg.params, msg.repo);
        return;
      }
      // Repo switch requested from the in-panel selector / breadcrumb. Routed
      // through a command so the panel needn't know about RepoService.
      if (msg.cmd === 'repo.select') {
        await vscode.commands.executeCommand('hydragit.setActiveRepo', msg.params?.rootPath);
        return;
      }
      // Initial repo state on webview mount (the push may have fired before the
      // view resolved). Answered by the host so the panel needn't hold state.
      // Tolerates a workspace-less window where the command isn't registered —
      // returns an empty state so the webview resolves rather than hanging.
      if (msg.cmd === 'repo.list') {
        let state: unknown = { repos: [], active: undefined };
        try {
          state = await vscode.commands.executeCommand('hydragit.getRepoState');
        } catch {
          /* multi-repo not wired (no workspace) */
        }
        webviewView.webview.postMessage({ id: msg.id, ok: true, data: state });
        return;
      }
      // Breadcrumb click → open the native repo quickpick (same as status bar).
      if (msg.cmd === 'repo.pick') {
        await vscode.commands.executeCommand('hydragit.selectRepo');
        return;
      }
      // Open a worktree's folder in a new VS Code window (the primary worktree
      // action — keeps the current window's context). Host-only: not a Go cmd.
      // Only paths git itself reports as worktrees may be opened — the webview
      // must not be able to point a new window (and its workspace trust) at an
      // arbitrary directory.
      if (msg.cmd === 'worktree.open') {
        const wtPath = msg.params?.path;
        if (!wtPath) return;
        try {
          const wts = (await this.goProcess.send('worktree.list', {}, msg.repo)) as
            | { path: string }[]
            | undefined;
          if (wts?.some((w) => w.path === wtPath)) {
            await vscode.commands.executeCommand(
              'vscode.openFolder',
              vscode.Uri.file(wtPath),
              { forceNewWindow: true }
            );
          } else {
            void vscode.window.showWarningMessage(`HydraGit: ${wtPath} is not a known worktree.`);
          }
        } catch {
          /* worktree list unavailable — refuse to open */
        }
        return;
      }
      // Dialog seam: the webview asks the host to show native prompt/confirm UI
      // and awaits the result over the same id-based bus (see webview dialogs.ts).
      if (msg.cmd === 'ui.prompt') {
        const value = await vscode.window.showInputBox({
          prompt: msg.params?.message,
          value: msg.params?.value ?? '',
        });
        webviewView.webview.postMessage({ id: msg.id, ok: true, data: value ?? null });
        return;
      }
      if (msg.cmd === 'ui.confirm') {
        const pick = await vscode.window.showWarningMessage(
          msg.params?.message ?? 'Are you sure?',
          { modal: true },
          'Yes'
        );
        // A native Yes arms the destructive-op gate (see destructiveOpBlocked).
        if (pick === 'Yes') recordConfirmation();
        webviewView.webview.postMessage({ id: msg.id, ok: true, data: pick === 'Yes' });
        return;
      }
      if (msg.cmd === 'ui.notify') {
        // Non-modal, persistent toast (fire-and-forget). Errors use the red
        // variant — the in-panel status bar is collapsible, so it can't be
        // the only place a failure shows up.
        const text = msg.params?.message ?? '';
        if (msg.params?.severity === 'error') {
          void vscode.window.showErrorMessage(text);
        } else {
          void vscode.window.showInformationMessage(text);
        }
        return;
      }
      if (msg.cmd === 'ui.pick') {
        const choice = await vscode.window.showQuickPick(msg.params?.items ?? [], {
          placeHolder: msg.params?.placeholder ?? '',
          matchOnDescription: true,
        });
        // Items may be plain strings or {label, description} rows — resolve both
        // to the chosen label so callers always get a string back.
        const value =
          choice == null ? null : typeof choice === 'string' ? choice : (choice as vscode.QuickPickItem).label;
        webviewView.webview.postMessage({ id: msg.id, ok: true, data: value });
        return;
      }

      if (destructiveOpBlocked(msg.cmd, msg.params)) {
        webviewView.webview.postMessage({
          id: msg.id,
          ok: false,
          error: 'Destructive operation blocked: no recent confirmation.',
        });
        return;
      }

      try {
        const data = await this.goProcess.send(msg.cmd, msg.params ?? {}, msg.repo);
        webviewView.webview.postMessage({ id: msg.id, ok: true, data });
      } catch (err) {
        webviewView.webview.postMessage({
          id: msg.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    // Watch the active repo's .git for changes → refresh. Re-pointed whenever
    // the active repo switches (see retargetWatcher).
    this.retargetWatcher(repoRoot());

    webviewView.onDidDispose(() => this.watcher?.dispose());
  }

  /**
   * Point the .git watcher at `root` (defaults to the active repo). Called on
   * every repo switch so external git activity in the *current* repo refreshes
   * the panel. logs/HEAD is the reflog — watched so the undo timeline updates.
   */
  retargetWatcher(root: string | undefined = repoRoot()): void {
    this.watcher?.dispose();
    this.watcher = undefined;
    const view = this.view;
    if (!root || !view) return;
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(root, '.git/{HEAD,refs/**,COMMIT_EDITMSG,logs/HEAD,worktrees/**}')
    );
    const refresh = () => view.webview.postMessage({ type: 'refresh' });
    this.watcher.onDidChange(refresh);
    this.watcher.onDidCreate(refresh);
    this.watcher.onDidDelete(refresh);
  }

  /** Push the repo list + active root to the webview (selector / breadcrumb). */
  postRepoState(repos: RepoInfo[], active: string | undefined): void {
    this.view?.webview.postMessage({ type: 'repoState', data: { repos, active } });
  }

  focus(): void {
    vscode.commands.executeCommand('hydragit.mainView.focus');
  }

  private getHtml(webview: vscode.Webview, iconUri: vscode.Uri, headUri: vscode.Uri): string {
    const htmlPath = path.join(this.ctx.extensionPath, 'webview', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, 'webview', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, 'webview', 'index.css')
    );

    // No remote images are loaded anywhere (the only <img> is the bundled
    // icon), so img-src deliberately omits https: — with default-src 'none'
    // and connect-src 'none' the webview has zero network egress, closing the
    // image-URL exfiltration channel.
    const csp = [
      `default-src 'none'`,
      `script-src ${webview.cspSource}`,
      `style-src  ${webview.cspSource} 'unsafe-inline'`,
      `img-src data: blob: ${webview.cspSource}`,
      `font-src data:`,
      `connect-src 'none'`,
    ].join('; ');

    html = html.replace(
      /<head>/i,
      `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`
    );
    html = html.replace('./index.js', scriptUri.toString());
    html = html.replace('</head>', `<link rel="stylesheet" href="${styleUri}"></head>`);
    html = html.replace(
      '<body>',
      `<body data-icon-uri="${iconUri.toString()}" data-head-uri="${headUri.toString()}">`
    );
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
      // Reject any repo root the host hasn't discovered (see repoAllowed).
      if (msg?.repo !== undefined && !repoAllowed(msg.repo)) {
        webviewView.webview.postMessage({
          id: msg?.id, ok: false,
          error: `unknown repository: ${String(msg.repo)}`,
        });
        return;
      }
      if (msg.cmd === 'vscode.openFolder') {
        await vscode.commands.executeCommand('vscode.openFolder');
        return;
      }
      if (msg.cmd === 'vscode.cloneRepo') {
        await vscode.commands.executeCommand('git.clone');
        return;
      }
      // Repo switch from the sidebar selector — routed via command, same as main.
      if (msg.cmd === 'repo.select') {
        await vscode.commands.executeCommand('hydragit.setActiveRepo', msg.params?.rootPath);
        return;
      }
      // Initial repo state on mount — see main panel handler (fault-tolerant).
      if (msg.cmd === 'repo.list') {
        let state: unknown = { repos: [], active: undefined };
        try {
          state = await vscode.commands.executeCommand('hydragit.getRepoState');
        } catch {
          /* multi-repo not wired (no workspace) */
        }
        webviewView.webview.postMessage({ id: msg.id, ok: true, data: state });
        return;
      }
      // Native confirm — same seam as the main panel (used by the pre-commit
      // safety checks). A Yes also arms the destructive-op gate.
      if (msg.cmd === 'ui.confirm') {
        const pick = await vscode.window.showWarningMessage(
          msg.params?.message ?? 'Are you sure?',
          { modal: true },
          'Yes'
        );
        if (pick === 'Yes') recordConfirmation();
        webviewView.webview.postMessage({ id: msg.id, ok: true, data: pick === 'Yes' });
        return;
      }

      if (!this.goProcess) {
        webviewView.webview.postMessage({
          id: msg?.id, ok: false,
          error: 'fatal: not a git repository (no workspace folder open)',
        });
        return;
      }

      // openDiff is handled in the extension host — same as main panel. msg.repo
      // scopes path resolution to the group's repo (grouped sidebar).
      if (msg.cmd === 'openDiff') {
        await openDiff(msg.params, { root: msg.repo });
        return;
      }

      // Conflicted files route to VS Code's 3-way merge resolver.
      if (msg.cmd === 'openMergeEditor') {
        await openMergeEditor(msg.params, msg.repo);
        return;
      }

      // Inject the enabled safety checks from settings. All checks disabled →
      // answer "no warnings" directly (Go treats an empty set as "all").
      if (msg.cmd === 'commit.precheck') {
        const checks = enabledSafetyChecks();
        if (checks.length === 0) {
          webviewView.webview.postMessage({ id: msg.id, ok: true, data: [] });
          return;
        }
        msg.params = { ...(msg.params ?? {}), checks, protectedBranches: protectedBranchList() };
      }

      try {
        const data = await this.goProcess.send(msg.cmd, msg.params ?? {}, msg.repo);
        webviewView.webview.postMessage({ id: msg.id, ok: true, data });
      } catch (err) {
        webviewView.webview.postMessage({
          id: msg?.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    if (this.statusService) {
      this.statusSub?.dispose();
      this.statusSub = this.statusService.onDidChange((snapshot) => {
        this.postStatus(snapshot);
      });
      this.postStatus(this.statusService.getSnapshot());
    }

    if (this.goProcess) {
      vscode.commands.executeCommand('hydragit.revealAll');
    }
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        vscode.commands.executeCommand('hydragit.revealAll');
      }
    });
  }

  /** Reload the sidebar webview — used on repo switch. */
  forceRefresh(): void {
    this.view?.webview.postMessage({ type: 'refresh' });
  }

  /** Push the repo list + active root to the sidebar (selector). */
  postRepoState(repos: RepoInfo[], active: string | undefined): void {
    this.view?.webview.postMessage({ type: 'repoState', data: { repos, active } });
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

    // Same locked-down CSP as the main panel — the sidebar previously shipped
    // with none at all (SECURITY.md "Sidebar panel has no CSP meta tag").
    const csp = [
      `default-src 'none'`,
      `script-src ${webview.cspSource}`,
      `style-src  ${webview.cspSource} 'unsafe-inline'`,
      `img-src data: blob: ${webview.cspSource}`,
      `font-src data:`,
      `connect-src 'none'`,
    ].join('; ');

    html = html.replace(
      /<head>/i,
      `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`
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
