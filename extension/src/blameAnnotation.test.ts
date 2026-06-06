// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  formatRelative,
  buildAnnotation,
  buildHoverMarkdown,
  resolveBlameTarget,
  hoverHitsAnnotation,
  type BlameLine,
} from './blameAnnotation';

// blameAnnotation imports 'vscode' (for the controller) and './Logger'. Only the
// pure helpers are exercised here, so a stub module is enough to let it load.
vi.mock('vscode', () => ({}));

const NOW = Date.UTC(2026, 4, 30, 12, 0, 0); // 2026-05-30T12:00:00Z, ms
const nowSec = Math.floor(NOW / 1000);

function line(over: Partial<BlameLine> = {}): BlameLine {
  return {
    line: 1,
    commit: 'a'.repeat(40),
    author: 'Alice',
    authorEmail: 'alice@example.com',
    authorTime: nowSec,
    summary: 'Fix null check',
    uncommitted: false,
    ...over,
  };
}

describe('formatRelative', () => {
  it('renders "just now" for very recent times', () => {
    expect(formatRelative(nowSec - 5, NOW)).toBe('just now');
  });

  it('renders singular and plural units', () => {
    expect(formatRelative(nowSec - 60, NOW)).toBe('1 minute ago');
    expect(formatRelative(nowSec - 3 * 60, NOW)).toBe('3 minutes ago');
    expect(formatRelative(nowSec - 2 * 3600, NOW)).toBe('2 hours ago');
    expect(formatRelative(nowSec - 3 * 86400, NOW)).toBe('3 days ago');
  });

  it('renders years for old commits', () => {
    expect(formatRelative(nowSec - 2 * 365 * 86400, NOW)).toBe('2 years ago');
  });

  it('never returns a negative/future delta', () => {
    expect(formatRelative(nowSec + 9999, NOW)).toBe('just now');
  });
});

describe('buildAnnotation', () => {
  it('shows "You" when the author email matches the current user (case-insensitive)', () => {
    const text = buildAnnotation(line(), 'ALICE@example.com', NOW);
    expect(text).toBe('You, just now • Fix null check');
  });

  it('shows the author name when the email differs', () => {
    const text = buildAnnotation(line(), 'bob@example.com', NOW);
    expect(text).toBe('Alice, just now • Fix null check');
  });

  it('omits the bullet when there is no summary', () => {
    expect(buildAnnotation(line({ summary: '' }), '', NOW)).toBe('Alice, just now');
  });

  it('renders uncommitted lines distinctly', () => {
    expect(buildAnnotation(line({ uncommitted: true }), '', NOW)).toBe('Not Committed Yet');
    expect(buildAnnotation(line({ commit: '0'.repeat(40) }), '', NOW)).toBe('Not Committed Yet');
  });
});

describe('buildHoverMarkdown', () => {
  it('includes summary, author, short sha for a committed line', () => {
    const md = buildHoverMarkdown(line({ authorTime: nowSec - 86400 }), NOW);
    expect(md).toContain('Fix null check');
    expect(md).toContain('alice@example.com');
    expect(md).toContain('1 day ago');
    expect(md).toContain('aaaaaaaa'); // short sha (first 8)
  });

  it('reports uncommitted lines without commit detail', () => {
    const md = buildHoverMarkdown(line({ uncommitted: true }), NOW);
    expect(md).toContain('Not Committed Yet');
    expect(md).not.toContain('aaaaaaaa');
  });

  it('escapes markdown-significant characters in the summary', () => {
    const md = buildHoverMarkdown(line({ summary: 'fix [a](b) *bold*' }), NOW);
    expect(md).not.toContain('[a](b)');
    expect(md).toContain('\\[a\\]');
  });
});

describe('hoverHitsAnnotation (BUG #22 — rich hover only over the inline blame)', () => {
  // Line "const x = 1;" has length 12; the annotation sits at/after column 12.
  const LEN = 12;
  const ACTIVE = 4;

  it('bites at end-of-line on the active line (over the annotation)', () => {
    expect(hoverHitsAnnotation(LEN, ACTIVE, LEN, ACTIVE)).toBe(true);
    expect(hoverHitsAnnotation(LEN, ACTIVE, LEN + 30, ACTIVE)).toBe(true); // deep in the margin
  });

  it('does NOT bite when hovering over the code itself', () => {
    expect(hoverHitsAnnotation(LEN, ACTIVE, 0, ACTIVE)).toBe(false);
    expect(hoverHitsAnnotation(LEN, ACTIVE, LEN - 1, ACTIVE)).toBe(false);
  });

  it('does NOT bite on any line other than the active one', () => {
    // even at end-of-line, a non-active line has no annotation to hover
    expect(hoverHitsAnnotation(LEN, ACTIVE + 1, LEN, ACTIVE)).toBe(false);
    expect(hoverHitsAnnotation(LEN, ACTIVE - 1, LEN + 5, ACTIVE)).toBe(false);
  });

  it('treats an empty active line as hoverable (annotation starts at column 0)', () => {
    expect(hoverHitsAnnotation(0, ACTIVE, 0, ACTIVE)).toBe(true);
  });
});

describe('resolveBlameTarget', () => {
  const ROOT = '/repo';

  it('maps a file: document to the working tree', () => {
    expect(resolveBlameTarget('file', '/repo/src/a.ts', '', ROOT)).toEqual({
      rel: 'src/a.ts',
      ref: '',
    });
  });

  it('rejects files outside the workspace', () => {
    expect(resolveBlameTarget('file', '/elsewhere/a.ts', '', ROOT)).toBeNull();
  });

  it('reads the ref from a git: diff URI query', () => {
    const query = JSON.stringify({ path: '/repo/src/a.ts', ref: 'abc1234' });
    expect(resolveBlameTarget('git', '/repo/src/a.ts', query, ROOT)).toEqual({
      rel: 'src/a.ts',
      ref: 'abc1234',
    });
  });

  it('decodes a URL-encoded git: query', () => {
    const query = encodeURIComponent(JSON.stringify({ path: '/repo/src/a.ts', ref: 'HEAD' }));
    expect(resolveBlameTarget('git', '/repo/src/a.ts', query, ROOT)).toEqual({
      rel: 'src/a.ts',
      ref: 'HEAD',
    });
  });

  it('treats the index ref "~" and empty ref as the working tree', () => {
    const tilde = JSON.stringify({ path: '/repo/a.ts', ref: '~' });
    const empty = JSON.stringify({ path: '/repo/a.ts', ref: '' });
    expect(resolveBlameTarget('git', '/repo/a.ts', tilde, ROOT)?.ref).toBe('');
    expect(resolveBlameTarget('git', '/repo/a.ts', empty, ROOT)?.ref).toBe('');
  });

  it('returns null for unknown schemes and malformed git queries', () => {
    expect(resolveBlameTarget('untitled', '/repo/a.ts', '', ROOT)).toBeNull();
    expect(resolveBlameTarget('git', '/repo/a.ts', 'not-json', ROOT)).toBeNull();
  });
});
