// File-tree model for the sidebar staging view: turns a flat GitFile list into a
// nested folder/file tree (compressed single-child chains, folders-first sort),
// with folder helpers and the per-status badge config. Pure (no Svelte) so the
// tree shaping + status parsing are unit-tested in isolation; the FileTree
// component owns the reactive $derived/$state that drives it.
import type { GitFile } from './types';

export interface TreeFolder {
  kind: 'folder';
  label: string;
  fullPath: string;
  children: TreeNode[];
}
export interface TreeFile {
  kind: 'file';
  file: GitFile;
}
export type TreeNode = TreeFolder | TreeFile;

export const ROOT_PATH = '__root__';

// Build a nested tree from a flat file list. Folders are created on demand;
// single-child folder chains are then compressed ("a/b/c" → one row) and every
// level is sorted folders-first, each group alphabetical.
export function buildTree(files: GitFile[]): TreeFolder {
  const root: TreeFolder = { kind: 'folder', label: 'Changes', fullPath: ROOT_PATH, children: [] };
  const folderMap = new Map<string, TreeFolder>();

  for (const f of files) {
    const parts = f.path.split('/');
    if (parts.length === 1) {
      root.children.push({ kind: 'file', file: f });
      continue;
    }
    const dirParts = parts.slice(0, -1);
    let parent = root;
    let accumulated = '';
    for (let i = 0; i < dirParts.length; i++) {
      accumulated = accumulated ? accumulated + '/' + dirParts[i] : dirParts[i];
      if (!folderMap.has(accumulated)) {
        const folder: TreeFolder = {
          kind: 'folder',
          label: dirParts[i],
          fullPath: accumulated,
          children: [],
        };
        folderMap.set(accumulated, folder);
        parent.children.push(folder);
      }
      parent = folderMap.get(accumulated)!;
    }
    parent.children.push({ kind: 'file', file: f });
  }

  // Compress single-child folder chains — creates new objects to avoid
  // mutating nodes that are still referenced by folderMap keys.
  function compress(node: TreeFolder): void {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.kind !== 'folder') continue;
      compress(child);
      // Merge downward while there is exactly one folder child and no files.
      let cur = child;
      while (cur.children.length === 1 && cur.children[0].kind === 'folder') {
        const only = cur.children[0] as TreeFolder;
        const merged: TreeFolder = {
          kind: 'folder',
          label: cur.label + '/' + only.label,
          fullPath: only.fullPath,
          children: only.children,
        };
        node.children[i] = merged;
        cur = merged;
      }
    }
  }
  compress(root);

  // Sort: folders first (alpha), then files (alpha).
  function sortChildren(node: TreeFolder): void {
    node.children.sort((a, b) => {
      const af = a.kind === 'folder';
      const bf = b.kind === 'folder';
      if (af !== bf) return af ? -1 : 1;
      const an = a.kind === 'folder' ? a.label : (a.file.path.split('/').pop() ?? '');
      const bn = b.kind === 'folder' ? b.label : (b.file.path.split('/').pop() ?? '');
      return an.localeCompare(bn);
    });
    for (const c of node.children) if (c.kind === 'folder') sortChildren(c);
  }
  sortChildren(root);

  return root;
}

// Every file path beneath a folder (recursive), for bulk stage/discard actions.
export function allFilesInFolder(node: TreeFolder): string[] {
  const paths: string[] = [];
  function walk(n: TreeFolder) {
    for (const c of n.children) {
      if (c.kind === 'file') paths.push(c.file.path);
      else walk(c);
    }
  }
  walk(node);
  return paths;
}

// File count beneath a folder (recursive) for the row's count badge.
export function countFiles(node: TreeFolder): number {
  let n = 0;
  for (const c of node.children) {
    if (c.kind === 'file') n++;
    else n += countFiles(c);
  }
  return n;
}

// ── Status config (matches the detail pane exactly) ──────────────────────────
export interface StatusCfg {
  label: string;
  nameClass: string;
  badgeClass: string;
}
export const STATUS_CFG: Record<string, StatusCfg> = {
  M: { label: 'M', nameClass: 'fname-m', badgeClass: 'badge-m' },
  A: { label: 'A', nameClass: 'fname-a', badgeClass: 'badge-a' },
  U: { label: 'U', nameClass: 'fname-u', badgeClass: 'badge-u' },
  D: { label: 'D', nameClass: 'fname-d', badgeClass: 'badge-d' },
  R: { label: 'R', nameClass: 'fname-r', badgeClass: 'badge-r' },
  C: { label: 'C', nameClass: 'fname-c', badgeClass: 'badge-c' },
  '!': { label: '!', nameClass: 'fname-conflict', badgeClass: 'badge-conflict' },
};
export function cfg(status: string): StatusCfg {
  return STATUS_CFG[status?.toUpperCase()?.[0] ?? 'M'] ?? STATUS_CFG['M'];
}

// Split a rename's old/new basenames, from either the oldPath field or the
// "old -> new" arrow form git emits.
export function parseRename(file: GitFile): { oldName: string | null; newName: string } {
  if (file.oldPath) {
    return {
      oldName: file.oldPath.split('/').pop() ?? file.oldPath,
      newName: file.path.split('/').pop() ?? file.path,
    };
  }
  const arrow = file.path.indexOf(' -> ');
  if (arrow !== -1) {
    return {
      oldName: file.path.slice(0, arrow).split('/').pop() ?? file.path.slice(0, arrow),
      newName: file.path.slice(arrow + 4).split('/').pop() ?? file.path.slice(arrow + 4),
    };
  }
  return { oldName: null, newName: file.path.split('/').pop() ?? file.path };
}

export function isConflict(f: GitFile): boolean {
  return f.status === '!';
}

// A deleted file has no working-tree copy to open or edit.
export function isDeleted(f: GitFile): boolean {
  return f.status?.toUpperCase() === 'D';
}
