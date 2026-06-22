import { describe, it, expect } from 'vitest';
import { stashRedirectTarget } from './stashRedirect';

const branches = ['main', 'develop', 'feature'];

describe('stashRedirectTarget', () => {
  it('redirects to the stash\'s origin branch when it exists and differs', () => {
    expect(stashRedirectTarget('On feature: my WIP', 'main', branches)).toBe('feature');
    expect(stashRedirectTarget('WIP on develop: abc123 subject', 'main', branches)).toBe('develop');
  });

  it('does not redirect when already on the stash\'s branch', () => {
    expect(stashRedirectTarget('On feature: my WIP', 'feature', branches)).toBeNull();
  });

  it('does not redirect when the branch was deleted (the bug fix)', () => {
    // The stash still labels itself "On gone-branch" but that branch is no
    // longer in the list — opening the stash must not try to navigate to it.
    expect(stashRedirectTarget('On gone-branch: leftover work', 'main', branches)).toBeNull();
  });

  it('does not redirect when the message has no branch label', () => {
    expect(stashRedirectTarget('some hand-written stash message', 'main', branches)).toBeNull();
    expect(stashRedirectTarget('', 'main', branches)).toBeNull();
  });

  it('handles branch names containing colons and spaces (matches up to the first ": ")', () => {
    // git uses the short branch name; a slashy name like feature/x is preserved.
    expect(stashRedirectTarget('On feature/x: work', 'main', ['main', 'feature/x'])).toBe('feature/x');
  });

  it('is case-tolerant on the "On"/"WIP on" prefix', () => {
    expect(stashRedirectTarget('on develop: lowercase prefix', 'main', branches)).toBe('develop');
  });
});
