// Folder/file tree model for the changed-files view, built from a flat DiffFile
// list. Pure (no Svelte) so the compress/sort logic is unit-tested in isolation;
// the ChangedFiles component renders the result and owns collapse state.
import type { DiffFile } from './types';

export interface TreeFolder {
  kind: 'folder';
  label: string; // compressed path segment e.g. "internal/git"
  fullPath: string; // unique key
  children: TreeNode[];
}
export interface TreeFile {
  kind: 'file';
  file: DiffFile;
}
export type TreeNode = TreeFolder | TreeFile;

export function buildTree(files: DiffFile[]): TreeFolder {
  const root: TreeFolder = { kind: 'folder', label: 'HydraGit', fullPath: '__root__', children: [] };
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
        const label = dirParts[i];
        const folder: TreeFolder = {
          kind: 'folder',
          label,
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

  // Compress folders that have exactly one folder child and no file children.
  function compress(node: TreeFolder): void {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.kind === 'folder') {
        compress(child);
        while (child.children.length === 1 && child.children[0].kind === 'folder') {
          const only = child.children[0] as TreeFolder;
          child.label = child.label + '/' + only.label;
          child.fullPath = only.fullPath;
          child.children = only.children;
        }
      }
    }
  }
  compress(root);

  // Sort every folder: sub-folders first (alpha), then files (alpha).
  function sortChildren(node: TreeFolder): void {
    node.children.sort((a, b) => {
      const aIsFolder = a.kind === 'folder';
      const bIsFolder = b.kind === 'folder';
      if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
      const aName = a.kind === 'folder' ? a.label : (a.file.path.split('/').pop() ?? a.file.path);
      const bName = b.kind === 'folder' ? b.label : (b.file.path.split('/').pop() ?? b.file.path);
      return aName.localeCompare(bName);
    });
    for (const c of node.children) {
      if (c.kind === 'folder') sortChildren(c);
    }
  }
  sortChildren(root);

  return root;
}

export function countFiles(node: TreeFolder): number {
  let n = 0;
  for (const c of node.children) {
    if (c.kind === 'file') n++;
    else n += countFiles(c);
  }
  return n;
}
