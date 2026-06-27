import { describe, it, expect } from 'vitest';
import { shortBranchName, splitRemoteRef } from './refName';

describe('shortBranchName', () => {
  it('strips the remote prefix', () => {
    expect(shortBranchName('origin/feature')).toBe('feature');
  });

  it('removes only the remote, keeping nested branch paths', () => {
    expect(shortBranchName('origin/feat/x')).toBe('feat/x');
  });

  it('returns a bare name unchanged', () => {
    expect(shortBranchName('feature')).toBe('feature');
  });
});

describe('splitRemoteRef', () => {
  it('splits remote and branch', () => {
    expect(splitRemoteRef('upstream/main')).toEqual({ remote: 'upstream', branch: 'main' });
  });

  it('keeps a nested branch under its remote', () => {
    expect(splitRemoteRef('origin/feat/x')).toEqual({ remote: 'origin', branch: 'feat/x' });
  });

  it('defaults a bare name to origin', () => {
    expect(splitRemoteRef('feature')).toEqual({ remote: 'origin', branch: 'feature' });
  });
});
