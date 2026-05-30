import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import BlameCard, { relativeTime } from './BlameCard.svelte';
import type { BlameLine } from './types';

const NOW = Date.UTC(2026, 4, 30, 12, 0, 0);
const nowSec = Math.floor(NOW / 1000);

function line(over: Partial<BlameLine> = {}): BlameLine {
  return {
    line: 1,
    commit: 'abcdef1234567890',
    author: 'Alice',
    authorEmail: 'alice@example.com',
    authorTime: nowSec - 86400,
    summary: 'Fix null check',
    uncommitted: false,
    ...over,
  };
}

describe('relativeTime', () => {
  it('formats coarse buckets', () => {
    expect(relativeTime(nowSec - 5, NOW)).toBe('just now');
    expect(relativeTime(nowSec - 86400, NOW)).toBe('1 day ago');
    expect(relativeTime(nowSec - 3 * 86400, NOW)).toBe('3 days ago');
  });
});

describe('BlameCard', () => {
  it('renders author, summary and short sha', () => {
    const { getByText } = render(BlameCard, { blame: line() });
    expect(getByText('Fix null check')).toBeTruthy();
    expect(getByText('Alice')).toBeTruthy();
    expect(getByText('abcdef12')).toBeTruthy(); // short sha
  });

  it('renders an uncommitted line distinctly', () => {
    const { getByText } = render(BlameCard, { blame: line({ uncommitted: true }) });
    expect(getByText('Not Committed Yet')).toBeTruthy();
  });
});
