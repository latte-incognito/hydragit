import { describe, it, expect } from 'vitest';
import { planSync } from './syncPlan';

// The Smart Sync decision tree. Pure function → exhaustive over the meaningful
// (ahead, behind, dirty) states, including the destabilising ones (divergence,
// dirty tree) that must NOT run unattended.

describe('planSync', () => {
  it('even + clean → noop, nothing runs', () => {
    expect(planSync(0, 0, false)).toMatchObject({ kind: 'noop', pull: 'none', push: false, stash: false });
  });

  it('even + dirty → still noop (nothing to integrate or push)', () => {
    expect(planSync(0, 0, true).kind).toBe('noop');
  });

  it('behind only + clean → silent fast-forward pull (undoable, no prompt)', () => {
    const p = planSync(0, 4, false);
    expect(p).toMatchObject({ kind: 'silent', pull: 'ff', push: false, stash: false });
    expect(p.steps).toEqual([]);
  });

  it('ahead only + clean → confirm (a push is never silent)', () => {
    const p = planSync(2, 0, false);
    expect(p.kind).toBe('confirm');
    expect(p.pull).toBe('none');
    expect(p.push).toBe(true);
    expect(p.stash).toBe(false);
    expect(p.steps).toEqual(['push your 2 commits']);
  });

  it('diverged + clean → confirm: rebase then push', () => {
    const p = planSync(1, 4, false);
    expect(p.kind).toBe('confirm');
    expect(p.pull).toBe('rebase');
    expect(p.push).toBe(true);
    expect(p.stash).toBe(false);
    expect(p.steps).toEqual([
      'rebase your 1 commit onto the 4 incoming changes',
      'push your 1 commit',
    ]);
  });

  it('behind only + dirty → confirm with stash/restore around the pull (no push)', () => {
    const p = planSync(0, 3, true);
    expect(p.kind).toBe('confirm');
    expect(p.stash).toBe(true);
    expect(p.pull).toBe('ff');
    expect(p.push).toBe(false);
    expect(p.steps).toEqual([
      'stash your uncommitted changes',
      'pull the 3 incoming changes',
      'restore your changes',
    ]);
  });

  it('diverged + dirty → confirm: stash, rebase, push, restore', () => {
    const p = planSync(2, 5, true);
    expect(p).toMatchObject({ kind: 'confirm', stash: true, pull: 'rebase', push: true });
    expect(p.steps).toEqual([
      'stash your uncommitted changes',
      'rebase your 2 commits onto the 5 incoming changes',
      'push your 2 commits',
      'restore your changes',
    ]);
  });

  it('ahead only + dirty → confirm push, but NO stash (a push never touches the tree)', () => {
    const p = planSync(1, 0, true);
    expect(p.kind).toBe('confirm');
    expect(p.stash).toBe(false);
    expect(p.pull).toBe('none');
    expect(p.push).toBe(true);
    expect(p.steps).toEqual(['push your 1 commit']);
  });

  it('singular vs plural wording', () => {
    expect(planSync(1, 1, false).steps[0]).toBe('rebase your 1 commit onto the 1 incoming change');
    expect(planSync(3, 2, false).steps[0]).toBe('rebase your 3 commits onto the 2 incoming changes');
  });

  // ── rewrite divergence (amend/rebase of pushed commits) — ROADMAP §4.2 ──
  describe('rewrite divergence → force-with-lease, never rebase', () => {
    it('diverged + rewrite → confirm: force-push with lease, no pull, no stash', () => {
      const p = planSync(1, 1, false, true);
      expect(p).toMatchObject({ kind: 'confirm', pull: 'none', push: true, force: true, stash: false });
      expect(p.steps[0]).toBe('force-push your 1 rewritten commit with lease, replacing the old version on the remote');
    });

    it('rewrite forces even when dirty — a force-push never touches the tree, so no stash', () => {
      const p = planSync(2, 3, true, true);
      expect(p).toMatchObject({ force: true, pull: 'none', stash: false, push: true });
    });

    it('the rewrite flag only matters when diverged — purely ahead ignores it', () => {
      const p = planSync(2, 0, false, true);
      expect(p.force).toBe(false);
      expect(p.push).toBe(true);
      expect(p.steps).toEqual(['push your 2 commits']);
    });

    it('behind-only + rewrite flag → still a plain ff pull (no divergence to force past)', () => {
      const p = planSync(0, 3, false, true);
      expect(p).toMatchObject({ kind: 'silent', pull: 'ff', force: false });
    });

    it('without the rewrite flag, divergence still rebases (genuine collab case)', () => {
      const p = planSync(1, 1, false, false);
      expect(p.pull).toBe('rebase');
      expect(p.force).toBe(false);
    });
  });
});
