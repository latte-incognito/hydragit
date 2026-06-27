// Branch-tree model for the branch pane: turns a flat branch list into a nested
// folder/leaf tree (branch names with "/" nest), with sort + open-state merge
// helpers. Pure (no Svelte) so the tree shaping is unit-tested in isolation; the
// BranchPane component owns the reactive $state/$effect that drives it.
import type { Branch, Worktree } from './types';

export interface FolderNode {
  kind: 'folder';
  label: string;
  children: TreeNode[];
  open: boolean;
}
export interface LeafNode {
  kind: 'leaf';
  branch: Branch;
  fullName?: string; // remote: full name for IPC calls e.g. "origin/feature-x"
  displayName?: string; // remote: short name for display e.g. "feature-x"
}
export type TreeNode = FolderNode | LeafNode;

export interface BranchItem {
  name: string;
  branch: Branch;
  fullName?: string;
  displayName?: string;
}

// Converts a flat list of {name, branch} into a nested FolderNode / LeafNode
// tree. Names with slashes are nested; top-level names become leaves directly.
export function buildTree(items: BranchItem[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const { name, branch, fullName, displayName } of items) {
    const parts = name.split('/');
    if (parts.length === 1) {
      root.push({ kind: 'leaf', branch, fullName, displayName });
      continue;
    }
    let children = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const label = parts[i];
      let folder = children.find((n): n is FolderNode => n.kind === 'folder' && n.label === label);
      if (!folder) {
        folder = { kind: 'folder', label, children: [], open: false };
        children.push(folder);
      }
      children = folder.children;
    }
    children.push({ kind: 'leaf', branch, fullName, displayName });
  }
  return root;
}

// Sort a tree level: folders first (alpha), then leaves (alpha by display name).
function sortLevel(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.kind === b.kind) {
      const aLabel = a.kind === 'folder' ? a.label : (a.displayName ?? a.branch.name.split('/').pop()!);
      const bLabel = b.kind === 'folder' ? b.label : (b.displayName ?? b.branch.name.split('/').pop()!);
      return aLabel.localeCompare(bLabel);
    }
    return a.kind === 'folder' ? -1 : 1;
  });
}

export function sortTree(nodes: TreeNode[]): TreeNode[] {
  return sortLevel(nodes).map((n) => (n.kind === 'folder' ? { ...n, children: sortTree(n.children) } : n));
}

// Preserve open/close state when data re-fetches (mutates `next` in place).
export function mergeOpen(old: TreeNode[], next: TreeNode[]): void {
  for (const node of next) {
    if (node.kind !== 'folder') continue;
    const prev = old.find((n): n is FolderNode => n.kind === 'folder' && n.label === node.label);
    if (prev) {
      node.open = prev.open;
      mergeOpen(prev.children, node.children);
    }
  }
}

// Force every folder open (used while filtering so matches are never hidden).
export function openAll(nodes: TreeNode[]): void {
  for (const n of nodes) {
    if (n.kind === 'folder') {
      n.open = true;
      openAll(n.children);
    }
  }
}

// Label for a worktree row: branch name, else a short detached hash, else the
// folder basename (covers bare/odd cases).
export function worktreeLabel(wt: Worktree): string {
  if (wt.bare) return '(bare)';
  if (wt.branch) return wt.branch;
  if (wt.detached && wt.head) return `${wt.head.slice(0, 7)} (detached)`;
  return wt.path.split(/[\\/]/).pop() ?? wt.path;
}
