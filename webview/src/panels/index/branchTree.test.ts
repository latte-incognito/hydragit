import { describe, it, expect } from 'vitest';
import {
  buildTree,
  sortTree,
  mergeOpen,
  openAll,
  worktreeLabel,
  type FolderNode,
  type TreeNode,
} from './branchTree';
import type { Branch, Worktree } from './types';

const b = (name: string): Branch => ({ name }) as Branch;
const item = (name: string) => ({ name, branch: b(name) });
const labels = (nodes: TreeNode[]) =>
  nodes.map((n) => (n.kind === 'folder' ? n.label + '/' : (n.branch.name.split('/').pop() ?? '')));
const folder = (nodes: TreeNode[], label: string) =>
  nodes.find((n): n is FolderNode => n.kind === 'folder' && n.label === label)!;

describe('buildTree', () => {
  it('keeps single-segment names as top-level leaves', () => {
    const t = buildTree([item('main'), item('dev')]);
    expect(t.every((n) => n.kind === 'leaf')).toBe(true);
  });

  it('nests slash-separated names under folders', () => {
    const t = buildTree([item('feature/login'), item('feature/logout')]);
    const feat = folder(t, 'feature');
    expect(feat.kind).toBe('folder');
    expect(labels(feat.children).sort()).toEqual(['login', 'logout']);
  });
});

describe('sortTree', () => {
  it('orders folders before leaves, each alphabetically', () => {
    const t = sortTree(buildTree([item('zzz'), item('aaa'), item('team/x'), item('lib/y')]));
    expect(labels(t)).toEqual(['lib/', 'team/', 'aaa', 'zzz']);
  });
});

describe('mergeOpen', () => {
  it('carries the previous open state onto a freshly built tree', () => {
    const oldT = sortTree(buildTree([item('feature/a')]));
    folder(oldT, 'feature').open = true;
    const next = sortTree(buildTree([item('feature/a'), item('feature/b')]));
    expect(folder(next, 'feature').open).toBe(false); // fresh build defaults closed
    mergeOpen(oldT, next);
    expect(folder(next, 'feature').open).toBe(true); // ...then inherits old state
  });
});

describe('openAll', () => {
  it('forces every folder open', () => {
    const t = sortTree(buildTree([item('a/b/c')]));
    openAll(t);
    const walk = (nodes: TreeNode[]): boolean =>
      nodes.every((n) => n.kind !== 'folder' || (n.open && walk(n.children)));
    expect(walk(t)).toBe(true);
  });
});

describe('worktreeLabel', () => {
  it('prefers branch, then detached hash, then folder basename, then (bare)', () => {
    expect(worktreeLabel({ branch: 'feat' } as Worktree)).toBe('feat');
    expect(worktreeLabel({ detached: true, head: 'abcdef1234' } as Worktree)).toBe('abcdef1 (detached)');
    expect(worktreeLabel({ path: '/a/b/wt-x' } as Worktree)).toBe('wt-x');
    expect(worktreeLabel({ bare: true } as Worktree)).toBe('(bare)');
  });
});
