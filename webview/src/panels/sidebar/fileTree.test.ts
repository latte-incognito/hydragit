import { describe, it, expect } from 'vitest';
import {
  buildTree,
  allFilesInFolder,
  countFiles,
  cfg,
  parseRename,
  isConflict,
  isDeleted,
  ROOT_PATH,
  type TreeFolder,
} from './fileTree';
import type { GitFile } from './types';

const f = (path: string, status = 'M', extra: Partial<GitFile> = {}): GitFile =>
  ({ path, status, ...extra }) as GitFile;
const folder = (node: TreeFolder, label: string): TreeFolder =>
  node.children.find((c): c is TreeFolder => c.kind === 'folder' && c.label === label)!;

describe('buildTree', () => {
  it('puts top-level files directly under root', () => {
    const t = buildTree([f('a.txt'), f('b.txt')]);
    expect(t.fullPath).toBe(ROOT_PATH);
    expect(t.children.every((c) => c.kind === 'file')).toBe(true);
    expect(t.children).toHaveLength(2);
  });

  it('nests files under folders by path', () => {
    const t = buildTree([f('src/a.ts'), f('src/b.ts')]);
    const src = folder(t, 'src');
    expect(countFiles(src)).toBe(2);
  });

  it('compresses single-child folder chains into one row', () => {
    const t = buildTree([f('a/b/c/file.ts')]);
    const merged = t.children.find((c): c is TreeFolder => c.kind === 'folder')!;
    expect(merged.label).toBe('a/b/c');
  });

  it('sorts folders before files, each alphabetically', () => {
    const t = buildTree([f('z.txt'), f('a.txt'), f('lib/x.ts')]);
    expect(t.children[0].kind).toBe('folder'); // lib/ first
    const files = t.children.filter((c) => c.kind === 'file') as { file: GitFile }[];
    expect(files.map((c) => c.file.path)).toEqual(['a.txt', 'z.txt']);
  });
});

describe('allFilesInFolder / countFiles', () => {
  it('collects every nested path', () => {
    const t = buildTree([f('src/a.ts'), f('src/deep/b.ts'), f('root.ts')]);
    const src = folder(t, 'src');
    expect(allFilesInFolder(src).sort()).toEqual(['src/a.ts', 'src/deep/b.ts']);
    expect(countFiles(t)).toBe(3);
  });
});

describe('cfg', () => {
  it('maps a status letter to its badge/name classes', () => {
    expect(cfg('A').badgeClass).toBe('badge-a');
    expect(cfg('!').nameClass).toBe('fname-conflict');
  });
  it('uses only the first letter and defaults unknown to M', () => {
    expect(cfg('MM').label).toBe('M');
    expect(cfg('x').label).toBe('M');
  });
});

describe('parseRename', () => {
  it('prefers the oldPath field', () => {
    expect(parseRename(f('dir/new.ts', 'R', { oldPath: 'dir/old.ts' }))).toEqual({
      oldName: 'old.ts',
      newName: 'new.ts',
    });
  });
  it('falls back to the arrow form', () => {
    expect(parseRename(f('a/old.ts -> a/new.ts', 'R'))).toEqual({
      oldName: 'old.ts',
      newName: 'new.ts',
    });
  });
  it('returns a null oldName for a non-rename', () => {
    expect(parseRename(f('a/b.ts'))).toEqual({ oldName: null, newName: 'b.ts' });
  });
});

describe('isConflict / isDeleted', () => {
  it('detects conflict and deletion', () => {
    expect(isConflict(f('x', '!'))).toBe(true);
    expect(isConflict(f('x', 'M'))).toBe(false);
    expect(isDeleted(f('x', 'D'))).toBe(true);
    expect(isDeleted(f('x', 'd'))).toBe(true);
    expect(isDeleted(f('x', 'M'))).toBe(false);
  });
});
