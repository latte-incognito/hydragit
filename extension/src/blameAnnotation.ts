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

  return [
    `**${escapeMd(blame.summary || '(no message)')}**`,
    '',
    `${escapeMd(blame.author)} <${escapeMd(blame.authorEmail)}>`,
    `${when} — ${absolute}`,
    '',
    `\`${shortSha}\``,
  ].join('\n');
}

/**
 * hoverHitsAnnotation decides whether a hover at the given position should
 * surface the rich blame card. The inline annotation only renders on the active
 * line, trailing the code as an `after` decoration past end-of-line — and VS Code
 * clamps a hover over that decoration to the end-of-line position. So we only
 * bite when the hover is on the active line AND at/after the end of the line's
 * text, i.e. directly over our annotation and never over the code itself (which
 * is what made the popup feel like it appeared everywhere). Kept pure for tests.
 */
export function hoverHitsAnnotation(
  lineTextLength: number,
  hoverLine: number,
  hoverCharacter: number,
  activeLine: number
): boolean {
  if (hoverLine !== activeLine) return false;
  return hoverCharacter >= lineTextLength;
}

// Escape only the characters that carry markdown meaning or could inject a link
// into the hover — which matters because the hover MarkdownString is trusted, so
// an attacker-controlled commit summary must not be able to forge a
// `[x](command:…)` link. Dots, dashes, etc. are left intact so emails render cleanly.
function escapeMd(s: string): string {
  return s.replace(/[\\`*_[\]()<>]/g, (m) => '\\' + m);
}

/**
 * sleep resolves true after `ms`, or false the moment `token` is cancelled
 * (i.e. the user moved the mouse off the annotation). Used to delay the blame
 * hover so it only appears after the cursor has rested on the inline annotation.
 */
function sleep(ms: number, token: vscode.CancellationToken): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (token.isCancellationRequested) {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      sub.dispose();
      resolve(true);
    }, ms);
    const sub = token.onCancellationRequested(() => {
      clearTimeout(timer);
      sub.dispose();
      resolve(false);
    });
  });
}

/** What to blame: a repo-relative path plus the ref ("" = working tree). */
export interface BlameTarget {
  rel: string;
  ref: string;
}

/**
 * resolveBlameTarget maps an editor document to a blame target, or null when the
 * document can't/shouldn't be blamed (outside the workspace, unknown scheme).
 *
 * - `file:` documents → the working tree (ref "").
 * - `git:` documents (a diff pane / opened revision) → the ref encoded in the
 *   built-in Git extension's URI query (`{"path","ref"}`), so each side of a
 *   diff is attributed at its own revision. The index ref "~" and empty refs
 *   fall back to the working tree.
 *
 * Kept pure (no vscode import) so the URI/ref parsing is unit-testable.
 */
export function resolveBlameTarget(
  scheme: string,
  fsPath: string,
  query: string,
  workspaceRoot: string
): BlameTarget | null {
  const relTo = (abs: string): string | null => {
    const rel = path.relative(workspaceRoot, abs);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return rel.split(path.sep).join('/');
  };

  if (scheme === 'file') {
    const rel = relTo(fsPath);
    return rel ? { rel, ref: '' } : null;
  }

  if (scheme === 'git') {
    const parsed = parseGitQuery(query);
    if (!parsed) return null;
    const rel = relTo(parsed.path);
    if (!rel) return null;
    // "~" is the staged/index version; treat it (and empty) as the working tree.
    const ref = !parsed.ref || parsed.ref === '~' ? '' : parsed.ref;
    return { rel, ref };
  }

  return null;
}

function parseGitQuery(query: string): { path: string; ref: string } | null {
  if (!query) return null;
  for (const candidate of [query, safeDecode(query)]) {
    try {
      const obj = JSON.parse(candidate);
      if (obj && typeof obj.path === 'string') {
        return { path: obj.path, ref: typeof obj.ref === 'string' ? obj.ref : '' };
      }
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
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
  private hoverDelayMs: number;

  constructor(
    private readonly go: GoProcess,
    private readonly workspaceRoot: string
  ) {
    const cfg = vscode.workspace.getConfiguration('hydragit');
    this.enabled = cfg.get<boolean>('lineBlame.enabled', true);
    this.hoverDelayMs = cfg.get<number>('lineBlame.hoverDelay', 5000);

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
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('hydragit.lineBlame.hoverDelay')) {
          this.hoverDelayMs = vscode.workspace
            .getConfiguration('hydragit')
            .get<number>('lineBlame.hoverDelay', 5000);
        }
      }),
      vscode.languages.registerHoverProvider([{ scheme: 'file' }, { scheme: 'git' }], {
        provideHover: (doc, pos, token) => this.provideHover(doc, pos, token),
      })
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

  private async getBlame(doc: vscode.TextDocument): Promise<BlameLine[] | null> {
    const target = resolveBlameTarget(
      doc.uri.scheme,
      doc.uri.fsPath,
      doc.uri.query,
      this.workspaceRoot
    );
    if (!target) return null;

    // The cache key includes the URI query, so each diff revision caches apart.
    const key = doc.uri.toString();
    const cached = this.cache.get(key);
    if (cached && cached.version === doc.version) return cached.lines;

    const params: { path: string; ref?: string; contents?: string; dirty?: boolean } = {
      path: target.rel,
    };
    if (target.ref) params.ref = target.ref;
    // Buffer-aware blame only applies to the editable working-tree file.
    if (doc.uri.scheme === 'file' && doc.isDirty) {
      params.contents = doc.getText();
      params.dirty = true;
    }

    try {
      const lines = (await this.go.send('blame', params)) as BlameLine[];
      this.cache.set(key, { version: doc.version, lines });
      return lines;
    } catch (e) {
      // Untracked files and non-repo paths error from git — expected, stay quiet.
      Logger.info('blame', `blame failed for ${target.rel}@${target.ref || 'work'}: ${String(e)}`);
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

  private async provideHover(
    doc: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    if (!this.enabled) return undefined;

    // Only surface the rich card when the cursor is actually over our inline
    // blame — the trailing annotation on the active line — never over the code.
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== doc) return undefined;
    const lineLen = doc.lineAt(position.line).text.length;
    if (
      !hoverHitsAnnotation(lineLen, position.line, position.character, editor.selection.active.line)
    ) {
      return undefined;
    }

    const cached = this.cache.get(doc.uri.toString());
    const blame = cached?.lines[position.line];
    if (!blame) return undefined;

    // Hold off until the cursor has rested on the annotation; bail the instant
    // VS Code cancels (the mouse moved) so nothing flashes up. This is what keeps
    // the popup from being distracting.
    if (!(await sleep(this.hoverDelayMs, token))) return undefined;

    const md = new vscode.MarkdownString(buildHoverMarkdown(blame, Date.now()));
    md.isTrusted = true;
    if (!blame.uncommitted && blame.commit !== ZERO_SHA) {
      const copyArg = encodeURIComponent(JSON.stringify(blame.commit));
      // fileHistory with no args falls back to the active editor — i.e. this file.
      // lineHistory needs the file + the hovered line (1-based for git).
      const lineArg = encodeURIComponent(JSON.stringify([doc.uri.toString(), position.line + 1]));
      md.appendMarkdown(
        `\n\n[Copy SHA](command:hydragit.copyCommitSha?${copyArg}) · ` +
          `[File History](command:hydragit.fileHistory) · ` +
          `[Line History](command:hydragit.lineHistory?${lineArg})`
      );
    }
    // Anchor the card to the end-of-line (where the annotation sits) rather than
    // the whole line, so it points at the blame text it describes.
    const eol = doc.lineAt(position.line).range.end;
    return new vscode.Hover(md, new vscode.Range(eol, eol));
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}
