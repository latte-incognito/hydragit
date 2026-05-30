import * as vscode from 'vscode';
import * as path from 'path';
import { GoProcess } from './goProcess';
import { Logger } from './Logger';

/** Mirror of Go's git.BlameLine (internal/git/blame.go). */
export interface BlameLine {
  line: number;
  commit: string;
  author: string;
  authorEmail: string;
  authorTime: number; // unix epoch seconds
  summary: string;
  uncommitted: boolean;
}

const ZERO_SHA = '0000000000000000000000000000000000000000';

/**
 * formatRelative renders an epoch-seconds timestamp as a coarse, GitLens-style
 * relative string ("just now", "5 minutes ago", "3 days ago", "2 years ago").
 * nowMs is injected so the function stays pure and testable.
 */
export function formatRelative(epochSec: number, nowMs: number): string {
  const deltaSec = Math.max(0, Math.floor(nowMs / 1000) - epochSec);
  const units: [number, string][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.34524, 'week'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ];

  if (deltaSec < 45) return 'just now';

  let value = deltaSec;
  for (let i = 0; i < units.length; i++) {
    const [size, name] = units[i];
    if (value < size) {
      const n = Math.max(1, Math.round(value));
      return `${n} ${name}${n === 1 ? '' : 's'} ago`;
    }
    value = value / size;
  }
  return 'a long time ago';
}

/**
 * buildAnnotation produces the faint end-of-line text, e.g.
 * "You, 3 days ago • Fix null check" or "Not Committed Yet".
 * currentEmail enables the "You" label; pass "" to always show the author name.
 */
export function buildAnnotation(blame: BlameLine, currentEmail: string, nowMs: number): string {
  if (blame.uncommitted || blame.commit === ZERO_SHA) {
    return 'Not Committed Yet';
  }
  const who =
    currentEmail && blame.authorEmail.toLowerCase() === currentEmail.toLowerCase()
      ? 'You'
      : blame.author || 'Unknown';
  const when = formatRelative(blame.authorTime, nowMs);
  const summary = blame.summary ? ` • ${blame.summary}` : '';
  return `${who}, ${when}${summary}`;
}

/**
 * buildHoverMarkdown produces the markdown body of the hover card (sha, author,
 * absolute + relative time, full summary). Returned as a plain string so it is
 * pure and unit-testable; the controller wraps it in a vscode.MarkdownString and
 * appends command links.
 */
export function buildHoverMarkdown(blame: BlameLine, nowMs: number): string {
  if (blame.uncommitted || blame.commit === ZERO_SHA) {
    return '**Not Committed Yet**\n\nThis line has uncommitted changes.';
  }
  const shortSha = blame.commit.slice(0, 8);
  const when = formatRelative(blame.authorTime, nowMs);
  const absolute = new Date(blame.authorTime * 1000).toLocaleString();
  const lines = [
    `**${escapeMd(blame.summary || '(no message)')}**`,
    '',
    `${escapeMd(blame.author)} <${escapeMd(blame.authorEmail)}>`,
    `${when} — ${absolute}`,
    '',
    `\`${shortSha}\``,
  ];
  return lines.join('\n');
}

// Escape only the characters that carry markdown meaning or could inject a link
// into the hover — which matters because the hover MarkdownString is trusted, so
// an attacker-controlled commit summary must not be able to forge a
// `[x](command:…)` link. Dots, dashes, etc. are left intact so emails render cleanly.
function escapeMd(s: string): string {
  return s.replace(/[\\`*_[\]()<>]/g, (m) => '\\' + m);
}

interface CacheEntry {
  version: number;
  lines: BlameLine[];
}

/**
 * BlameController renders GitLens-style current-line blame in the text editor:
 * a faint trailing annotation on the active line plus a rich hover. All git
 * work is delegated to the Go binary via GoProcess; this class only formats and
 * paints. It is buffer-aware — dirty documents are blamed against their live
 * editor contents (Go runs `git blame --contents -`).
 */
export class BlameController implements vscode.Disposable {
  private readonly decoration: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly cache = new Map<string, CacheEntry>();
  private enabled: boolean;
  private currentEmail = '';
  private debounceTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly go: GoProcess,
    private readonly workspaceRoot: string
  ) {
    this.enabled = vscode.workspace
      .getConfiguration('hydragit')
      .get<boolean>('lineBlame.enabled', true);

    this.decoration = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 3em',
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        fontStyle: 'italic',
      },
    });

    // Best-effort: learn the repo identity once so we can label "You".
    this.go
      .send('user', {})
      .then((u) => {
        this.currentEmail = (u as { email?: string })?.email ?? '';
      })
      .catch((e) => Logger.warn('blame', `could not read git user: ${String(e)}`));

    this.disposables.push(
      this.decoration,
      vscode.window.onDidChangeActiveTextEditor(() => this.scheduleRefresh()),
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor === vscode.window.activeTextEditor) this.scheduleRefresh();
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        // Edits invalidate the cache (version bumps) — re-blame the buffer.
        if (e.document === vscode.window.activeTextEditor?.document) this.scheduleRefresh();
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => this.cache.delete(doc.uri.toString())),
      vscode.languages.registerHoverProvider(
        { scheme: 'file' },
        { provideHover: (doc, pos) => this.provideHover(doc, pos) }
      )
    );

    this.scheduleRefresh();
  }

  /** Toggle the annotation on/off (bound to hydragit.toggleLineBlame). */
  toggle(): void {
    this.enabled = !this.enabled;
    if (!this.enabled) this.clear();
    else this.scheduleRefresh();
    vscode.window.setStatusBarMessage(`HydraGit line blame ${this.enabled ? 'on' : 'off'}`, 2000);
  }

  private clear(): void {
    vscode.window.activeTextEditor?.setDecorations(this.decoration, []);
  }

  private scheduleRefresh(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.refresh(), 200);
  }

  /** repo-relative, forward-slashed path, or null if outside the workspace. */
  private relativePath(doc: vscode.TextDocument): string | null {
    if (doc.uri.scheme !== 'file') return null;
    const rel = path.relative(this.workspaceRoot, doc.uri.fsPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return rel.split(path.sep).join('/');
  }

  private async getBlame(doc: vscode.TextDocument): Promise<BlameLine[] | null> {
    const rel = this.relativePath(doc);
    if (!rel) return null;

    const key = doc.uri.toString();
    const cached = this.cache.get(key);
    if (cached && cached.version === doc.version) return cached.lines;

    const params = doc.isDirty
      ? { path: rel, contents: doc.getText(), dirty: true }
      : { path: rel };

    try {
      const lines = (await this.go.send('blame', params)) as BlameLine[];
      this.cache.set(key, { version: doc.version, lines });
      return lines;
    } catch (e) {
      // Untracked files and non-repo paths error from git — expected, stay quiet.
      Logger.info('blame', `blame failed for ${rel}: ${String(e)}`);
      return null;
    }
  }

  private async refresh(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    if (!this.enabled) {
      editor.setDecorations(this.decoration, []);
      return;
    }

    const doc = editor.document;
    const lineNo = editor.selection.active.line; // 0-based
    const lines = await this.getBlame(doc);

    // The editor may have changed while we awaited — bail if so.
    if (vscode.window.activeTextEditor !== editor) return;
    if (!lines) {
      editor.setDecorations(this.decoration, []);
      return;
    }

    const blame = lines[lineNo]; // blame lines are in file order, 0-based index
    if (!blame) {
      editor.setDecorations(this.decoration, []);
      return;
    }

    const text = buildAnnotation(blame, this.currentEmail, Date.now());
    const eol = doc.lineAt(lineNo).range.end;
    editor.setDecorations(this.decoration, [
      {
        range: new vscode.Range(eol, eol),
        renderOptions: { after: { contentText: text } },
      },
    ]);
  }

  private provideHover(
    doc: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    if (!this.enabled) return undefined;
    const cached = this.cache.get(doc.uri.toString());
    const blame = cached?.lines[position.line];
    if (!blame) return undefined;

    const md = new vscode.MarkdownString(buildHoverMarkdown(blame, Date.now()));
    md.isTrusted = true;
    if (!blame.uncommitted && blame.commit !== ZERO_SHA) {
      const copyArg = encodeURIComponent(JSON.stringify(blame.commit));
      // fileHistory with no args falls back to the active editor — i.e. this file.
      md.appendMarkdown(
        `\n\n[Copy SHA](command:hydragit.copyCommitSha?${copyArg}) · ` +
          `[File History](command:hydragit.fileHistory)`
      );
    }
    return new vscode.Hover(md, doc.lineAt(position.line).range);
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}
