// Search-scope model for the toolbar's token search (one input, Slack/Gmail
// style). Pure (no Svelte): the scope table, the prefix→chip detection, and the
// code-box geometry live here so they're unit-tested in isolation; the Toolbar
// component owns the reactive $state/$derived that drives the UI.

export type SearchMode = 'msg' | 'hash' | 'file' | 'author' | 'code';

export interface Scope {
  id: SearchMode;
  label: string;
  prefix: string;
  example: string;
  placeholder: string;
}

export const SCOPES: Scope[] = [
  { id: 'msg',    label: 'Message', prefix: '',        example: '',                placeholder: 'Search commits — or pick a scope…' },
  { id: 'author', label: 'Author',  prefix: 'author:', example: 'author: vlad',    placeholder: 'Author name or email…'            },
  { id: 'file',   label: 'File',    prefix: 'file:',   example: 'file: panel.ts',  placeholder: 'File name or path — Enter to search…' },
  { id: 'hash',   label: 'Hash',    prefix: 'hash:',   example: 'hash: a0c103',    placeholder: 'Hash prefix…'                     },
  { id: 'code',   label: 'Code',    prefix: 'code:',   example: 'code: render(',   placeholder: ''                                 },
];

// Scopes offered by the dropdown (everything except the implicit msg default).
export const pickableScopes = SCOPES.filter((s) => s.id !== 'msg');

// Look up a scope by id, falling back to the msg default.
export function scopeById(id: SearchMode): Scope {
  return SCOPES.find((s) => s.id === id) ?? SCOPES[0];
}

// Detect a scope from text typed while in plain message mode: a "author:" /
// "file:" / "hash:" / "code:" prefix becomes that scope (prefix stripped), and a
// leading "@" is a Slack-ism for author. Returns null when nothing converts —
// including a bare "msg:" prefix, which stays plain message search.
export function detectScope(value: string): { scope: SearchMode; rest: string } | null {
  const m = value.match(/^(author|file|hash|code|msg):\s*/i);
  if (m) {
    const scope = m[1].toLowerCase() as SearchMode;
    if (scope === 'msg') return null;
    return { scope, rest: value.slice(m[0].length) };
  }
  if (value.startsWith('@')) return { scope: 'author', rest: value.slice(1) };
  return null;
}

// Geometry + summary for the expanded code-search box from a (possibly
// multi-line) query: textarea row count (clamped 1–6) and the first non-blank
// line for the collapsed summary chip.
export function codeMeta(query: string): { lines: number; rows: number; firstLine: string } {
  const lines = query ? query.split('\n').length : 1;
  const rows = Math.min(6, Math.max(1, lines));
  const firstLine = (query.split('\n').find((l) => l.trim()) ?? '').trim();
  return { lines, rows, firstLine };
}
