import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import BlameCard, { relativeTime, avatarChain } from './BlameCard.svelte';
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
    avatar: {
      github: 'https://avatars.example/u/1',
      gravatar: 'https://gravatar.example/h',
      initials: 'AL',
      color: '#1f6feb',
      initialsSvg: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    },
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

describe('avatarChain', () => {
  it('orders github → gravatar → initialsSvg, dropping missing entries', () => {
    expect(avatarChain(line())).toEqual([
      'https://avatars.example/u/1',
      'https://gravatar.example/h',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    ]);
    const noGithub = line({ avatar: { ...line().avatar!, github: undefined } });
    expect(avatarChain(noGithub)[0]).toBe('https://gravatar.example/h');
  });

  it('is empty when there is no avatar', () => {
    expect(avatarChain(line({ avatar: undefined }))).toEqual([]);
  });
});

describe('BlameCard', () => {
  it('renders author, summary and short sha', () => {
    const { getByText } = render(BlameCard, { blame: line() });
    expect(getByText('Fix null check')).toBeTruthy();
    expect(getByText('Alice')).toBeTruthy();
    expect(getByText('abcdef12')).toBeTruthy(); // short sha
  });

  it('starts the avatar at the github url and falls back on error', async () => {
    const { container } = render(BlameCard, { blame: line() });
    const img = container.querySelector('img.bc-avatar') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://avatars.example/u/1');
    await fireEvent.error(img);
    expect(img.getAttribute('src')).toBe('https://gravatar.example/h');
    await fireEvent.error(img);
    expect(img.getAttribute('src')).toContain('data:image/svg+xml');
  });

  it('renders an uncommitted line distinctly', () => {
    const { getByText } = render(BlameCard, { blame: line({ uncommitted: true }) });
    expect(getByText('Not Committed Yet')).toBeTruthy();
  });
});
