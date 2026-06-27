import { describe, it, expect } from 'vitest';
import { parseResetMode } from './resetMode';

describe('parseResetMode', () => {
  it('accepts the three valid modes', () => {
    expect(parseResetMode('soft')).toBe('soft');
    expect(parseResetMode('mixed')).toBe('mixed');
    expect(parseResetMode('hard')).toBe('hard');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(parseResetMode('  HARD ')).toBe('hard');
    expect(parseResetMode('Mixed')).toBe('mixed');
  });

  it('returns null for anything else', () => {
    expect(parseResetMode('')).toBeNull();
    expect(parseResetMode('keep')).toBeNull();
    expect(parseResetMode('soft ish')).toBeNull();
  });
});
