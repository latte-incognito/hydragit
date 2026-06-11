import { describe, expect, it } from 'vitest';
import { fullDate, smartDate } from './dates';

// Fixed "now" so the today/yesterday/this-year buckets are deterministic.
const NOW = new Date(2026, 5, 10, 12, 0, 0); // Jun 10 2026, noon

describe('smartDate', () => {
  it('labels today and yesterday with a time', () => {
    expect(smartDate(new Date(2026, 5, 10, 9, 46).toISOString(), NOW)).toMatch(/^Today /);
    expect(smartDate(new Date(2026, 5, 9, 23, 1).toISOString(), NOW)).toMatch(/^Yesterday /);
  });

  it('drops the time for older dates — month + day this year, + year otherwise', () => {
    const thisYear = smartDate(new Date(2026, 1, 3).toISOString(), NOW);
    expect(thisYear).not.toMatch(/\d{4}/); // no year
    expect(thisYear).not.toMatch(/:/); // no time

    const older = smartDate(new Date(2025, 1, 3).toISOString(), NOW);
    expect(older).toMatch(/2025/);
    expect(older).not.toMatch(/:/);
  });

  it('passes through empty and unparseable input', () => {
    expect(smartDate('', NOW)).toBe('');
    expect(smartDate('not-a-date', NOW)).toBe('not-a-date');
  });
});

describe('fullDate', () => {
  it('renders a human timestamp, not ISO', () => {
    const out = fullDate('2026-06-07T04:45:33Z');
    expect(out).toMatch(/2026/);
    expect(out).not.toMatch(/T\d\d:/); // no ISO "T"
    expect(out).not.toMatch(/Z$/);
  });

  it('passes through relative git phrasing untouched', () => {
    expect(fullDate('2 days ago')).toBe('2 days ago');
    expect(fullDate('')).toBe('');
  });
});
