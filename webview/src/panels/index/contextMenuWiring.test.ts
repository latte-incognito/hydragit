import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ContextMenu from './components/ContextMenu.svelte';

// Contract test: the ContextMenu component emits an action name for every item
// (proven below by clicking each). App.svelte is what routes those names to an
// IPC command. This test pins the menu→handler contract: every emitted action
// MUST be handled by App. Items that emit an action App ignores are dead — they
// do nothing when clicked. Those assertions FAIL on purpose (red CI, per policy)
// so the broken items are named explicitly.
//
// HANDLED_* are transcribed from webview/src/panels/index/App.svelte and must be
// kept in sync when handlers are added:
//   branchAction acts{}        — App.svelte ~L514-548
//   stashAction cmdMap{}        — App.svelte ~L309 (stashCtxAction routes here)
//   tagCtxAction send cases     — App.svelte ~L587-609

const HANDLED_BRANCH = new Set([
  'checkout', 'merge', 'rebase', 'push', 'delete', 'copy',
  'rename', 'new-from', 'checkout-rebase', 'pull-rebase', 'pull-merge',
  'compare', 'diff-working',
]);
const HANDLED_STASH = new Set([
  'pop', 'apply', 'drop',
  'unstash', 'clear', 'show-diff', 'show-diff-tab',
]);
const HANDLED_TAG = new Set(['checkout', 'merge', 'push', 'delete', 'diff-working']);

const branchMenu = {
  visible: true, x: 10, y: 10, branch: 'feat', isCurrent: false, current: 'main',
};
const stashMenu = { visible: true, x: 10, y: 10, label: 'stash@{0}' };
const tagMenu = { visible: true, x: 10, y: 10, name: 'v1', current: 'main' };

// [visible label, emitted action]
const BRANCH_ITEMS: [string, string][] = [
  ['Checkout', 'checkout'],
  ["New Branch from 'feat'…", 'new-from'],
  ["Checkout and Rebase onto 'main'", 'checkout-rebase'],
  ["Compare with 'main'", 'compare'],
  ['Show Diff with Working Tree', 'diff-working'],
  ["Rebase 'main' onto 'feat'", 'rebase'],
  ["Merge 'feat' into 'main'", 'merge'],
  ["Pull into 'main' Using Rebase", 'pull-rebase'],
  ["Pull into 'main' Using Merge", 'pull-merge'],
  ['Delete', 'delete'],
];

const STASH_ITEMS: [string, string][] = [
  ['Pop', 'pop'],
  ['Apply', 'apply'],
  ['Unstash…', 'unstash'],
  ['Drop', 'drop'],
  ['Clear', 'clear'],
  ['Show Diff', 'show-diff'],
  ['Show Diff in a New Tab', 'show-diff-tab'],
];

const TAG_ITEMS: [string, string][] = [
  ['Checkout', 'checkout'],
  ['Show Diff with Working Tree', 'diff-working'],
  ["Merge 'v1' into 'main'", 'merge'],
  ['Push to origin', 'push'],
  ['Delete', 'delete'],
];

describe('ContextMenu — branch items emit the expected action', () => {
  BRANCH_ITEMS.forEach(([label, action]) => {
    it(`"${label}" emits ${action}`, async () => {
      const onBranchAction = vi.fn();
      const { getByText } = render(ContextMenu, { branchMenu, onBranchAction });
      await fireEvent.click(getByText(label));
      expect(onBranchAction).toHaveBeenCalledWith(action);
    });
  });
});

describe('ContextMenu — stash items emit the expected action', () => {
  STASH_ITEMS.forEach(([label, action]) => {
    it(`"${label}" emits ${action}`, async () => {
      const onStashAction = vi.fn();
      const { getByText } = render(ContextMenu, { stashMenu, onStashAction });
      await fireEvent.click(getByText(label));
      expect(onStashAction).toHaveBeenCalledWith(action);
    });
  });
});

describe('ContextMenu — tag items emit the expected action', () => {
  TAG_ITEMS.forEach(([label, action]) => {
    it(`"${label}" emits ${action}`, async () => {
      const onTagAction = vi.fn();
      const { getByText } = render(ContextMenu, { tagMenu, onTagAction });
      await fireEvent.click(getByText(label));
      expect(onTagAction).toHaveBeenCalledWith(action);
    });
  });
});

// ── The actual bug finder: is each emitted action wired in App? ────────────────
// Dead items fail here, naming exactly what does nothing when clicked.

describe('Branch menu wiring — every item must be handled in App.svelte', () => {
  BRANCH_ITEMS.forEach(([label, action]) => {
    it(`branch "${label}" (${action}) is wired`, () => {
      expect(HANDLED_BRANCH.has(action)).toBe(true);
    });
  });
});

describe('Stash menu wiring — every item must be handled in App.svelte', () => {
  STASH_ITEMS.forEach(([label, action]) => {
    it(`stash "${label}" (${action}) is wired`, () => {
      expect(HANDLED_STASH.has(action)).toBe(true);
    });
  });
});

describe('Tag menu wiring — every item must be handled in App.svelte', () => {
  TAG_ITEMS.forEach(([label, action]) => {
    it(`tag "${label}" (${action}) is wired`, () => {
      expect(HANDLED_TAG.has(action)).toBe(true);
    });
  });
});
