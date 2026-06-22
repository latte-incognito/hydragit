import { describe, it, expect } from 'vitest';
import {
  isRebasePlanInvalid,
  buildRebasePlan,
  REBASE_ACTIONS,
  type RebaseRow,
} from './interactiveRebasePlan';

// Exhaustive coverage of the interactive-rebase decision logic (the part the
// Svelte editor runs on its working copy). Mirrors the Go RunInteractiveRebase
// guard — "the first kept commit must be 'pick'" — so the webview can't offer to
// start a plan git would reject.

const rows = (...spec: [string, string][]): RebaseRow[] =>
  spec.map(([sha, action]) => ({ sha, action }));

describe('isRebasePlanInvalid — first kept must be pick', () => {
  it('a leading pick is valid', () => {
    expect(isRebasePlanInvalid(rows(['a', 'pick'], ['b', 'pick']))).toBe(false);
  });

  it('a leading squash is invalid (nothing above to fold into)', () => {
    expect(isRebasePlanInvalid(rows(['a', 'squash'], ['b', 'pick']))).toBe(true);
  });

  it('a leading fixup is invalid for the same reason', () => {
    expect(isRebasePlanInvalid(rows(['a', 'fixup'], ['b', 'pick']))).toBe(true);
  });

  it('dropping the first commit defers the rule to the next kept one', () => {
    // first kept is b (pick) → valid
    expect(isRebasePlanInvalid(rows(['a', 'drop'], ['b', 'pick'], ['c', 'squash']))).toBe(false);
    // first kept is b (squash) → invalid
    expect(isRebasePlanInvalid(rows(['a', 'drop'], ['b', 'squash']))).toBe(true);
  });

  it('is invalid when every commit is dropped (nothing kept)', () => {
    expect(isRebasePlanInvalid(rows(['a', 'drop'], ['b', 'drop']))).toBe(true);
  });

  it('is invalid for an empty plan', () => {
    expect(isRebasePlanInvalid([])).toBe(true);
  });

  it('a squash/fixup after a leading pick is fine', () => {
    expect(isRebasePlanInvalid(rows(['a', 'pick'], ['b', 'squash'], ['c', 'fixup']))).toBe(false);
  });
});

describe('buildRebasePlan — emitted todo', () => {
  it('preserves order and maps to {sha, action}', () => {
    expect(buildRebasePlan(rows(['a', 'pick'], ['b', 'drop'], ['c', 'fixup']))).toEqual([
      { sha: 'a', action: 'pick' },
      { sha: 'b', action: 'drop' },
      { sha: 'c', action: 'fixup' },
    ]);
  });

  it('keeps drops in the plan (the backend needs to know what to drop)', () => {
    const plan = buildRebasePlan(rows(['a', 'pick'], ['b', 'drop']));
    expect(plan.map((p) => p.action)).toEqual(['pick', 'drop']);
  });

  it('an empty plan is an empty array, never throws', () => {
    expect(buildRebasePlan([])).toEqual([]);
  });
});

describe('REBASE_ACTIONS', () => {
  it('offers exactly the four git todo verbs', () => {
    expect([...REBASE_ACTIONS]).toEqual(['pick', 'squash', 'fixup', 'drop']);
  });
});
