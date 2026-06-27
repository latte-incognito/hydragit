import { describe, it, expect } from 'vitest';
import { SCOPES, pickableScopes, scopeById, detectScope, codeMeta } from './searchScope';

describe('SCOPES / pickableScopes', () => {
  it('msg is the implicit default and is excluded from the picker', () => {
    expect(SCOPES[0].id).toBe('msg');
    expect(pickableScopes.some((s) => s.id === 'msg')).toBe(false);
    expect(pickableScopes.map((s) => s.id)).toEqual(['author', 'file', 'hash', 'code']);
  });
});

describe('scopeById', () => {
  it('returns the matching scope', () => {
    expect(scopeById('author').label).toBe('Author');
  });
  it('falls back to msg for an unknown id', () => {
    expect(scopeById('nope' as never).id).toBe('msg');
  });
});

describe('detectScope', () => {
  it('converts a prefix into its scope and strips it', () => {
    expect(detectScope('author: vlad')).toEqual({ scope: 'author', rest: 'vlad' });
    expect(detectScope('file:panel.ts')).toEqual({ scope: 'file', rest: 'panel.ts' });
  });
  it('is case-insensitive on the prefix', () => {
    expect(detectScope('HASH: a0c1')).toEqual({ scope: 'hash', rest: 'a0c1' });
  });
  it('treats a leading @ as author shorthand', () => {
    expect(detectScope('@vlad')).toEqual({ scope: 'author', rest: 'vlad' });
  });
  it('leaves plain text and a bare msg: prefix as message search', () => {
    expect(detectScope('just searching')).toBeNull();
    expect(detectScope('msg: hello')).toBeNull();
  });
});

describe('codeMeta', () => {
  it('treats empty as a single row', () => {
    expect(codeMeta('')).toEqual({ lines: 1, rows: 1, firstLine: '' });
  });
  it('counts lines, clamps rows to 6, and finds the first non-blank line', () => {
    const q = '\n\n  render(\nmore\n';
    const m = codeMeta(q);
    expect(m.lines).toBe(5);
    expect(m.firstLine).toBe('render(');
  });
  it('clamps a very tall query to 6 rows', () => {
    expect(codeMeta('a\nb\nc\nd\ne\nf\ng\nh').rows).toBe(6);
  });
});
