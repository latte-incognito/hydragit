import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// THEME CONTRACT
//
// Every colour and font value that HydraGit *defines itself* is pinned here to
// its exact number. The point is value-stability across refactors: a migration
// (e.g. centralising accents into --hg-* vars) must NOT silently change a
// colour or a font size. If you change a value on purpose, update the expected
// constant in the same commit — the diff is the review.
//
// Out of scope by design: anything that is a *system* value — i.e. a
// `var(--vscode-*)` reference. Those resolve to the user's VS Code theme and are
// supposed to vary. We pin only the literals and tokens we control.
// ─────────────────────────────────────────────────────────────────────────────

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..'); // webview/src
const themeCss = readFileSync(join(srcDir, 'styles/vscode-theme.css'), 'utf8');

// ── 1. The --hg-* design tokens (fonts + brand colours) ──────────────────────
// Whitespace-normalised. Reference values are system (var(--vscode-*)); the
// token *definitions* are ours, so the wiring + fallbacks are pinned too.
const EXPECTED_TOKENS: Record<string, string> = {
  '--hg-font-family': "var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)",
  '--hg-font-size': 'var(--vscode-font-size, 13px)',
  '--hg-font-weight': 'var(--vscode-font-weight, 400)',
  '--hg-font-xxs': 'calc(var(--hg-font-size) - 2px)',
  '--hg-font-xs': 'calc(var(--hg-font-size) - 1px)',
  '--hg-font-sm': 'var(--hg-font-size)',
  '--hg-font-md': 'calc(var(--hg-font-size) + 2px)',
  '--hg-font-lg': 'calc(var(--hg-font-size) + 1px)',
  '--hg-editor-font-family': "var(--vscode-editor-font-family, Consolas, 'Courier New', monospace)",
  '--hg-editor-font-size': 'var(--vscode-editor-font-size, 12px)',
  '--hg-editor-font-weight': 'var(--vscode-editor-font-weight, 400)',
  '--hg-editor-line-height': 'var(--vscode-editor-line-height, 1.5)',
  '--hg-font-mono': 'var(--hg-editor-font-family)',
  '--hg-warn': '#e0a030',
  '--hg-info': '#56c8e8',
  '--hg-author': '#9a7ae8',
  '--hg-code': '#e8648a',
};

// ── 2. Bare non-system colour literals across the components ─────────────────
// Every hex / rgba that is NOT inside a var(...) call — i.e. a colour we hardcode
// (accent tints, the hydra gradient, flash sentinels, scope chip borders, …).
const EXPECTED_LITERALS: string[] = [
  '#1a1a1a', '#1a3a1a', '#1e8f8f', '#2a1a3a', '#2fbdb3', '#333', '#4a2230',
  '#4a3a1a', '#4a9cd6', '#4e8c4e', '#4ec94e', '#5a4a20', '#666', '#6cb6ff',
  '#999', '#a04a64', '#a33', '#b29bef', '#c0c8cc', '#c44', '#c8a020', '#e06a6a',
  '#e0a030', '#f07070', '#febc2e', '#fff', '#ffffff',
  'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.5)',
  'rgba(0,0,0,0.6)', 'rgba(154,122,232,0.12)', 'rgba(160,122,232,0.12)',
  'rgba(200,160,32,0.13)', 'rgba(200,160,32,0.4)', 'rgba(224,106,106,0.1)',
  'rgba(224,106,106,0.4)', 'rgba(224,160,48,0.08)', 'rgba(224,160,48,0.1)',
  'rgba(224,160,48,0.10)', 'rgba(224,160,48,0.12)', 'rgba(224,160,48,0.13)',
  'rgba(224,160,48,0.16)', 'rgba(224,160,48,0.3)', 'rgba(224,160,48,0.4)',
  'rgba(232,100,138,0.08)', 'rgba(232,100,138,0.12)', 'rgba(232,100,138,0.16)',
  'rgba(240,112,112,0.1)', 'rgba(240,112,112,0.12)', 'rgba(240,112,112,0.15)',
  'rgba(240,112,112,0.45)',
  'rgba(47,189,179,0.5)', 'rgba(47,189,179,0.65)', // hydra-bloom hover glow (Toolbar)
  'rgba(77,170,252,0.12)', 'rgba(77,170,252,0.4)',
  'rgba(78,140,78,0.15)', 'rgba(78,140,78,0.4)', 'rgba(78,201,78,0.1)',
  'rgba(78,201,78,0.12)', 'rgba(78,201,78,0.3)', 'rgba(86,200,232,0.1)',
  'rgba(86,200,232,0.12)', 'rgba(86,200,232,0.35)', 'rgba(86,200,232,0.4)',
  'rgba(86,200,232,0.45)',
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...svelteFiles(p));
    else if (e.name.endsWith('.svelte')) out.push(p);
  }
  return out;
}

// Remove balanced var(...) spans so system tokens AND their fallbacks drop out.
function stripVar(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; ) {
    if (s.startsWith('var(', i)) {
      let depth = 0, j = i + 3;
      for (; j < s.length; j++) {
        if (s[j] === '(') depth++;
        else if (s[j] === ')' && --depth === 0) { j++; break; }
      }
      i = j;
    } else out += s[i++];
  }
  return out;
}

const files = svelteFiles(srcDir);
const norm = (v: string) =>
  v
    .replace(/\/\*[^]*?\*\//g, '') // strip CSS comments
    .replace(/\s+/g, ' ')          // collapse whitespace/newlines
    .replace(/\(\s+/g, '(')        // no space after "(" (multiline var() lists)
    .replace(/\s+\)/g, ')')        // no space before ")"
    .trim();

// ── Tests ────────────────────────────────────────────────────────────────────
describe('theme contract — design tokens (--hg-*)', () => {
  const actual: Record<string, string> = {};
  for (const m of themeCss.matchAll(/(--hg-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    actual[m[1]] = norm(m[2]);
  }

  it('every --hg-* token holds its contracted value (no silent drift)', () => {
    expect(actual).toEqual(EXPECTED_TOKENS);
  });
});

describe('theme contract — bare non-system colour literals', () => {
  const found = new Set<string>();
  for (const f of files) {
    for (const m of stripVar(readFileSync(f, 'utf8')).matchAll(
      /#[0-9a-fA-F]{3,8}\b|rgba?\([0-9.,\s]*\)/g,
    )) {
      found.add(m[0].replace(/\s+/g, '').toLowerCase());
    }
  }

  it('the set of hardcoded colours is exactly the contract (none added/changed)', () => {
    expect([...found].sort()).toEqual([...EXPECTED_LITERALS].sort());
  });
});

describe('theme contract — icons stay theme-driven', () => {
  // Every SVG fill/stroke must follow the theme: currentColor, none, a gradient
  // reference (url(#...)), or a var() token. A hardcoded colour in an icon would
  // ignore the user's theme — the same thing the colour contract forbids. (The
  // hydra gradient's own stops are literals, already pinned by the bare-literal
  // contract above.)
  const ALLOWED = /^(currentColor|none|url\(#[\w-]+\)|var\(--[\w-]+(,[^)]*)?\))$/;

  it('no SVG fill/stroke hardcodes a colour', () => {
    const offenders: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/(?:fill|stroke)="([^"]*)"/g)) {
          if (!ALLOWED.test(m[1])) offenders.push(`${relative(srcDir, f)}:${i + 1}  ${m[0]}`);
        }
      });
    }
    expect(
      offenders,
      `icons must use currentColor / none / url(#grad) / var(): \n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

describe('theme contract — completeness', () => {
  const defined = new Set(
    [...themeCss.matchAll(/(--hg-[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
  );
  const refs = new Map<string, string>(); // name -> first place referenced
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/var\(\s*(--hg-[a-z0-9-]+)/g)) {
        if (!refs.has(m[1])) refs.set(m[1], `${relative(srcDir, f)}:${i + 1}`);
      }
    });
  }

  it('every --hg-* a component references is defined in vscode-theme.css', () => {
    const undef = [...refs].filter(([name]) => !defined.has(name));
    expect(
      undef,
      `--hg-* referenced but undefined:\n` +
        undef.map(([n, w]) => `  ${w}  ${n}`).join('\n'),
    ).toEqual([]);
  });
});
