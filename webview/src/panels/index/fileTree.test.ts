import { describe, it, expect } from 'vitest';
import { buildTree, countFiles, type TreeFolder, type TreeNode } from './fileTree';
import type { DiffFile } from './types';

const f = (path: string): DiffFile => ({ path, status: 'M' }) as DiffFile;

// Helper: find a folder child by its (possibly compressed) label.
function folder(node: TreeFolder, label: string): TreeFolder {
  const c = node.children.find((n): n is TreeFolder => n.kind === 'folder' && n.label === label);
  if (!c) throw new Error(`no folder "${label}"`);
  return c;
}
const names = (nodes: TreeNode[]) =>
  nodes.map((n) => (n.kind === 'folder' ? n.label + '/' : (n.file.path.split('/').pop() ?? '')));

describe('buildTree', () => {
  it('puts root-level files directly under root (sorted)', () => {
    const t = buildTree([f('main.ts'), f('app.ts')]);
    expect(t.children.every((n) => n.kind === 'file')).toBe(true);
    expect(names(t.children)).toEqual(['app.ts', 'main.ts']);
  });

  it('nests files under their folders', () => {
    const t = buildTree([f('src/a.ts'), f('src/b.ts')]);
    expect(names(t.children)).toEqual(['src/']);
    expect(names(folder(t, 'src').children)).toEqual(['a.ts', 'b.ts']);
  });

  it('compresses single-child folder chains into one node', () => {
    const t = buildTree([f('internal/git/repo.go')]);
    // internal -> git collapses to a single "internal/git" node.
    expect(names(t.children)).toEqual(['internal/git/']);
    expect(folder(t, 'internal/git').fullPath).toBe('internal/git');
  });

  it('sorts folders before files, each alphabetically', () => {
    const t = buildTree([f('z.txt'), f('a.txt'), f('src/x.ts'), f('lib/y.ts')]);
    expect(names(t.children)).toEqual(['lib/', 'src/', 'a.txt', 'z.txt']);
  });
});

describe('countFiles', () => {
  it('counts files recursively across folders', () => {
    const t = buildTree([f('a.txt'), f('src/b.ts'), f('src/deep/c.ts')]);
    expect(countFiles(t)).toBe(3);
    expect(countFiles(folder(t, 'src'))).toBe(2);
  });
});
