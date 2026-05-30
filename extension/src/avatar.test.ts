// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolveAvatar, bestAvatarUrl } from './avatar';

describe('resolveAvatar', () => {
  it('derives a GitHub avatar from a noreply email', () => {
    const a = resolveAvatar('Octo Cat', '12345+octocat@users.noreply.github.com');
    expect(a.github).toBe('https://avatars.githubusercontent.com/u/12345?s=40&v=4');
    expect(bestAvatarUrl(a)).toBe(a.github);
  });

  it('falls back to Gravatar when there is no GitHub id', () => {
    const a = resolveAvatar('Alice', 'alice@example.com');
    expect(a.github).toBeUndefined();
    // md5("alice@example.com") is stable.
    expect(a.gravatar).toContain('https://www.gravatar.com/avatar/');
    expect(a.gravatar).toContain('d=identicon');
    expect(bestAvatarUrl(a)).toBe(a.gravatar);
  });

  it('hashes email case-insensitively for a stable gravatar', () => {
    const lower = resolveAvatar('A', 'Alice@Example.com').gravatar;
    const exact = resolveAvatar('A', 'alice@example.com').gravatar;
    expect(lower).toBe(exact);
  });

  it('derives initials from first+last name, single name, or email', () => {
    expect(resolveAvatar('Alice Smith', 'a@b.com').initials).toBe('AS');
    expect(resolveAvatar('alice', 'a@b.com').initials).toBe('AL');
    expect(resolveAvatar('', 'bob@b.com').initials).toBe('BO');
  });

  it('produces a deterministic color and a rectangular SVG data URI', () => {
    const a1 = resolveAvatar('Alice', 'alice@example.com');
    const a2 = resolveAvatar('Alice', 'alice@example.com');
    expect(a1.color).toBe(a2.color);
    expect(a1.initialsSvg).toMatch(/^data:image\/svg\+xml;base64,/);
    const svg = Buffer.from(a1.initialsSvg.split(',')[1], 'base64').toString();
    expect(svg).toContain('<rect');
    expect(svg).toContain('AL');
  });
});
