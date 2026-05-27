import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import FileTree from './FileTree.svelte';

const files = [
  { path: 'src/main.ts',              status: 'M' },
  { path: 'src/components/App.svelte', status: 'M' },
  { path: 'internal/git/log.go',      status: 'M' },
  { path: 'README.md',                status: 'A' },
  { path: 'deleted.txt',              status: 'D' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

// ── empty / loading states ────────────────────────────────────────────────────

describe('FileTree — empty states', () => {
  it('shows loading message when loading=true', () => {
    const { getByText } = render(FileTree, { files: [], loading: true });
    expect(getByText('Loading repository…')).toBeTruthy();
  });

  it('shows clean working tree message when files is empty', () => {
    const { getByText } = render(FileTree, { files: [], loading: false });
    expect(getByText('No changes · working tree clean')).toBeTruthy();
  });

  it('shows welcome view with Open Folder and Clone buttons when noRepo=true', () => {
    const { getByText } = render(FileTree, { files: [], loading: false, noRepo: true });
    expect(getByText('Open Folder')).toBeTruthy();
    expect(getByText('Clone Repository')).toBeTruthy();
    expect(getByText(/open a folder containing a Git repository/)).toBeTruthy();
  });

  it('does not show file tree when noRepo=true', () => {
    const { queryByText } = render(FileTree, { files, loading: false, noRepo: true });
    expect(queryByText('main.ts')).toBeFalsy();
  });

  it('noRepo takes priority over loading', () => {
    const { getByText, queryByText } = render(FileTree, { files: [], loading: true, noRepo: true });
    expect(getByText('Open Folder')).toBeTruthy();
    expect(queryByText('Loading repository…')).toBeFalsy();
  });
});

// ── tree rendering ────────────────────────────────────────────────────────────

describe('FileTree — tree structure', () => {
  it('renders file basenames not full paths', () => {
    const { getByText, queryByText } = render(FileTree, { files });
    expect(getByText('main.ts')).toBeTruthy();
    expect(getByText('App.svelte')).toBeTruthy();
    expect(getByText('log.go')).toBeTruthy();
    expect(getByText('README.md')).toBeTruthy();
    // full paths should not appear as text nodes
    expect(queryByText('src/main.ts')).toBeFalsy();
  });

  it('renders folder nodes for grouped files', () => {
    const { getByText } = render(FileTree, { files });
    // src and internal/git should be folder rows
    expect(getByText('src')).toBeTruthy();
    expect(getByText('internal/git')).toBeTruthy();
  });

  it('renders root-level files without a folder wrapper', () => {
    const { getByText } = render(FileTree, { files });
    expect(getByText('README.md')).toBeTruthy();
    expect(getByText('deleted.txt')).toBeTruthy();
  });

  it('renders status badges', () => {
    const { getAllByText } = render(FileTree, { files });
    expect(getAllByText('M').length).toBeGreaterThan(0);
    expect(getAllByText('A').length).toBeGreaterThan(0);
    expect(getAllByText('D').length).toBeGreaterThan(0);
  });

  it('shows file count on folder rows', () => {
    const { getAllByText } = render(FileTree, { files });
    // src folder has 2 files (main.ts + components/App.svelte after compression)
    // internal/git has 1 file
    const twos = getAllByText('2');
    expect(twos.length).toBeGreaterThan(0);
  });
});

// ── status colours ────────────────────────────────────────────────────────────

describe('FileTree — status classes', () => {
  it('applies fname-m class to modified files', () => {
    const { getByText } = render(FileTree, { files });
    const el = getByText('main.ts');
    expect(el.className).toContain('fname-m');
  });

  it('applies fname-a class to added files', () => {
    const { getByText } = render(FileTree, { files });
    const el = getByText('README.md');
    expect(el.className).toContain('fname-a');
  });

  it('applies fname-d class and strikethrough to deleted files', () => {
    const { getByText } = render(FileTree, { files });
    const el = getByText('deleted.txt');
    expect(el.className).toContain('fname-d');
  });
});

// ── staging — per file ────────────────────────────────────────────────────────

describe('FileTree — per-file staging', () => {
  it('renders unchecked checkboxes by default', () => {
    const { getAllByRole } = render(FileTree, { files, stagedPaths: new Set() });
    const checkboxes = getAllByRole('checkbox') as HTMLInputElement[];
    const fileCheckboxes = checkboxes.filter(cb => cb.getAttribute('aria-label')?.startsWith('Stage '));
    expect(fileCheckboxes.every(cb => !cb.checked)).toBe(true);
  });

  it('renders checked checkboxes for staged files', () => {
    const staged = new Set(['src/main.ts']);
    const { getAllByRole } = render(FileTree, { files, stagedPaths: staged });
    const checkboxes = getAllByRole('checkbox') as HTMLInputElement[];
    const staged_cb = checkboxes.find(cb => cb.getAttribute('aria-label') === 'Stage main.ts');
    expect(staged_cb?.checked).toBe(true);
  });

  it('calls onOpenDiff with file path when file row is clicked', async () => {
    const onOpenDiff = vi.fn();
    const { getByText } = render(FileTree, { files, onOpenDiff });

    await fireEvent.click(getByText('main.ts'));
    expect(onOpenDiff).toHaveBeenCalledWith('src/main.ts');
  });

  it('calls onToggleStage when checkbox is changed', async () => {
    const onToggleStage = vi.fn();
    const { getAllByRole } = render(FileTree, { files, onToggleStage });

    const checkboxes = getAllByRole('checkbox') as HTMLInputElement[];
    const cb = checkboxes.find(c => c.getAttribute('aria-label') === 'Stage main.ts');
    if (!cb) throw new Error('checkbox not found');

    await fireEvent.change(cb);
    expect(onToggleStage).toHaveBeenCalledWith('src/main.ts');
  });

  it('does not call onToggleStage when file row is clicked', async () => {
    const onToggleStage = vi.fn();
    const { getByText } = render(FileTree, { files, onToggleStage });

    await fireEvent.click(getByText('main.ts'));
    expect(onToggleStage).not.toHaveBeenCalled();
  });

  it('applies staged border class to staged file rows', () => {
    const staged = new Set(['README.md']);
    const { getByText } = render(FileTree, { files, stagedPaths: staged });
    // The file row is the parent of the fname span
    const fname = getByText('README.md');
    const row = fname.closest('.file-row');
    expect(row?.classList.contains('staged')).toBe(true);
  });
});

// ── staging — folder level ────────────────────────────────────────────────────

describe('FileTree — folder staging', () => {
  it('calls onStageFolder with all paths in folder when folder checkbox is checked', async () => {
    const onStageFolder = vi.fn();
    const { getAllByRole, getByText } = render(FileTree, { files, onStageFolder });

    // Find folder checkbox for 'src'
    const checkboxes = getAllByRole('checkbox') as HTMLInputElement[];
    const folderCb = checkboxes.find(cb =>
      cb.getAttribute('aria-label')?.includes('Stage all in src')
    );
    if (!folderCb) throw new Error('src folder checkbox not found');

    await fireEvent.change(folderCb, { target: { checked: true } });

    expect(onStageFolder).toHaveBeenCalledWith(
      expect.arrayContaining(['src/main.ts', 'src/components/App.svelte']),
      true
    );
  });

  it('calls onStageFolder with stage=false when folder checkbox is unchecked', async () => {
    const onStageFolder = vi.fn();
    const staged = new Set(['src/main.ts', 'src/components/App.svelte']);
    const { getAllByRole } = render(FileTree, { files, stagedPaths: staged, onStageFolder });

    const checkboxes = getAllByRole('checkbox') as HTMLInputElement[];
    const folderCb = checkboxes.find(cb =>
      cb.getAttribute('aria-label')?.includes('Stage all in src')
    );
    if (!folderCb) throw new Error('src folder checkbox not found');

    await fireEvent.change(folderCb, { target: { checked: false } });

    expect(onStageFolder).toHaveBeenCalledWith(
      expect.arrayContaining(['src/main.ts', 'src/components/App.svelte']),
      false
    );
  });

  it('folder checkbox is checked when all files in folder are staged', () => {
    const staged = new Set(['src/main.ts', 'src/components/App.svelte']);
    const { getAllByRole } = render(FileTree, { files, stagedPaths: staged });

    const checkboxes = getAllByRole('checkbox') as HTMLInputElement[];
    const folderCb = checkboxes.find(cb =>
      cb.getAttribute('aria-label')?.includes('Stage all in src')
    ) as HTMLInputElement | undefined;

    expect(folderCb?.checked).toBe(true);
  });

  it('folder checkbox is indeterminate when only some files are staged', () => {
    const staged = new Set(['src/main.ts']); // only one of the two src files
    const { getAllByRole } = render(FileTree, { files, stagedPaths: staged });

    const checkboxes = getAllByRole('checkbox') as HTMLInputElement[];
    const folderCb = checkboxes.find(cb =>
      cb.getAttribute('aria-label')?.includes('Stage all in src')
    ) as HTMLInputElement | undefined;

    expect(folderCb?.indeterminate).toBe(true);
  });
});

// ── collapse state ────────────────────────────────────────────────────────────

describe('FileTree — collapse state', () => {
  it('calls onToggleFolder when folder row is clicked', async () => {
    const onToggleFolder = vi.fn();
    const { getByText } = render(FileTree, { files, onToggleFolder });

    await fireEvent.click(getByText('src'));
    expect(onToggleFolder).toHaveBeenCalledWith(expect.stringContaining('src'));
  });

  it('hides files inside a collapsed folder', () => {
    const collapsed = new Set(['src']);
    const { queryByText } = render(FileTree, { files, collapsed });
    // Files inside src should not be visible
    expect(queryByText('main.ts')).toBeFalsy();
    expect(queryByText('App.svelte')).toBeFalsy();
    // Files outside src should still show
    expect(queryByText('README.md')).toBeTruthy();
  });

  it('shows files when folder is not in collapsed set', () => {
    const collapsed = new Set<string>();
    const { getByText } = render(FileTree, { files, collapsed });
    expect(getByText('main.ts')).toBeTruthy();
  });
});

// ── rename ────────────────────────────────────────────────────────────────────

describe('FileTree — renamed files', () => {
  it('renders old and new name for renamed files with oldPath', () => {
    const renamedFiles = [
      { path: 'new-name.ts', status: 'R', oldPath: 'old-name.ts' } as any,
    ];
    const { getByText } = render(FileTree, { files: renamedFiles });
    expect(getByText('old-name.ts')).toBeTruthy();
    expect(getByText('new-name.ts')).toBeTruthy();
    expect(getByText('→')).toBeTruthy();
  });
});
