import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

// FileTree mounts HunkView (which calls send) when a hunk row expands; mock the
// bus so those fetches resolve to an empty diff unless a test overrides it.
const sendMock = vi.hoisted(() => vi.fn());
vi.mock('$shared/messageBus', () => ({ send: sendMock, on: vi.fn(() => () => {}) }));

import FileTree from './FileTree.svelte';

// Real-index model: a file renders in the Changes section via workStatus and
// in Staged Changes via indexStatus (both set = both sections, the MM case).
const files = [
  { path: 'src/main.ts',              status: 'M', workStatus: 'M' },
  { path: 'src/components/App.svelte', status: 'M', workStatus: 'M' },
  { path: 'internal/git/log.go',      status: 'M', workStatus: 'M' },
  { path: 'README.md',                status: 'A', workStatus: 'A' },
  { path: 'deleted.txt',              status: 'D', workStatus: 'D' },
];

beforeEach(() => {
  vi.clearAllMocks();
  sendMock.mockResolvedValue([]);
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

// ── staging — per file (real index) ───────────────────────────────────────────

describe('FileTree — per-file staging', () => {
  it('renders unchecked checkboxes for working-tree changes', () => {
    const { getAllByRole } = render(FileTree, { files });
    const checkboxes = getAllByRole('checkbox') as HTMLInputElement[];
    const fileCheckboxes = checkboxes.filter(cb => cb.getAttribute('aria-label')?.startsWith('Stage '));
    expect(fileCheckboxes.length).toBeGreaterThan(0);
    expect(fileCheckboxes.every(cb => !cb.checked)).toBe(true);
  });

  it('renders a checked Unstage checkbox for files with index changes', () => {
    const staged = [{ path: 'src/main.ts', status: 'M', indexStatus: 'M' }];
    const { getAllByRole } = render(FileTree, { files: staged });
    const checkboxes = getAllByRole('checkbox') as HTMLInputElement[];
    const cb = checkboxes.find(c => c.getAttribute('aria-label') === 'Unstage main.ts');
    expect(cb?.checked).toBe(true);
  });

  it('calls onOpenDiff with file path when file row is clicked', async () => {
    const onOpenDiff = vi.fn();
    const { getByText } = render(FileTree, { files, onOpenDiff });

    await fireEvent.click(getByText('main.ts'));
    expect(onOpenDiff).toHaveBeenCalledWith('src/main.ts');
  });

  it('checking a changes-row checkbox asks to stage the file', async () => {
    const onToggleStage = vi.fn();
    const { getAllByRole } = render(FileTree, { files, onToggleStage });

    const checkboxes = getAllByRole('checkbox') as HTMLInputElement[];
    const cb = checkboxes.find(c => c.getAttribute('aria-label') === 'Stage main.ts');
    if (!cb) throw new Error('checkbox not found');

    await fireEvent.change(cb);
    expect(onToggleStage).toHaveBeenCalledWith('src/main.ts', true);
  });

  it('unchecking a staged-row checkbox asks to unstage the file', async () => {
    const onToggleStage = vi.fn();
    const staged = [{ path: 'src/main.ts', status: 'M', indexStatus: 'M' }];
    const { getAllByRole } = render(FileTree, { files: staged, onToggleStage });

    const checkboxes = getAllByRole('checkbox') as HTMLInputElement[];
    const cb = checkboxes.find(c => c.getAttribute('aria-label') === 'Unstage main.ts');
    if (!cb) throw new Error('checkbox not found');

    await fireEvent.change(cb);
    expect(onToggleStage).toHaveBeenCalledWith('src/main.ts', false);
  });

  it('does not call onToggleStage when file row is clicked', async () => {
    const onToggleStage = vi.fn();
    const { getByText } = render(FileTree, { files, onToggleStage });

    await fireEvent.click(getByText('main.ts'));
    expect(onToggleStage).not.toHaveBeenCalled();
  });

  it('applies staged border class to staged file rows', () => {
    const staged = [{ path: 'README.md', status: 'A', indexStatus: 'A' }];
    const { getByText } = render(FileTree, { files: staged });
    const row = getByText('README.md').closest('.file-row');
    expect(row?.classList.contains('staged')).toBe(true);
  });

  it('a file edited after staging (MM) appears in BOTH sections', () => {
    const mm = [{ path: 'src/main.ts', status: 'M', indexStatus: 'M', workStatus: 'M' }];
    const { getAllByText, getByText } = render(FileTree, { files: mm });

    expect(getByText('Staged Changes')).toBeTruthy();
    expect(getByText('Changes')).toBeTruthy();
    expect(getAllByText('main.ts')).toHaveLength(2);
  });

  it('conflicted rows have no stage checkbox (the banner owns resolution)', () => {
    const conflict = [{ path: 'clash.txt', status: '!', workStatus: '!' }];
    const { getByText } = render(FileTree, { files: conflict });
    const row = getByText('clash.txt').closest('.file-row') as HTMLElement;
    expect(row.querySelector('input[type="checkbox"]')).toBeNull();
  });
});

// ── staging — folder level ────────────────────────────────────────────────────

describe('FileTree — folder staging', () => {
  it('calls onStageFolder with all paths in folder when folder checkbox is checked', async () => {
    const onStageFolder = vi.fn();
    const { getAllByRole } = render(FileTree, { files, onStageFolder });

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

  it('calls onStageFolder with stage=false on a staged-section folder', async () => {
    const onStageFolder = vi.fn();
    const staged = [
      { path: 'src/main.ts', status: 'M', indexStatus: 'M' },
      { path: 'src/components/App.svelte', status: 'M', indexStatus: 'M' },
    ];
    const { getAllByRole } = render(FileTree, { files: staged, onStageFolder });

    const checkboxes = getAllByRole('checkbox') as HTMLInputElement[];
    const folderCb = checkboxes.find(cb =>
      cb.getAttribute('aria-label')?.includes('Unstage all in src')
    );
    if (!folderCb) throw new Error('src folder checkbox not found');

    await fireEvent.change(folderCb, { target: { checked: false } });

    expect(onStageFolder).toHaveBeenCalledWith(
      expect.arrayContaining(['src/main.ts', 'src/components/App.svelte']),
      false
    );
  });

  it('folder checkbox is checked in the staged section', () => {
    const staged = [
      { path: 'src/main.ts', status: 'M', indexStatus: 'M' },
      { path: 'src/components/App.svelte', status: 'M', indexStatus: 'M' },
    ];
    const { getAllByRole } = render(FileTree, { files: staged });

    const checkboxes = getAllByRole('checkbox') as HTMLInputElement[];
    const folderCb = checkboxes.find(cb =>
      cb.getAttribute('aria-label')?.includes('Unstage all in src')
    ) as HTMLInputElement | undefined;

    expect(folderCb?.checked).toBe(true);
  });

  it('splits index vs working-tree changes into Staged Changes and Changes', () => {
    const mixed = [
      { path: 'src/main.ts', status: 'M', indexStatus: 'M' },
      { path: 'README.md', status: 'M', workStatus: 'M' },
    ];
    const { getByText } = render(FileTree, { files: mixed });

    expect(getByText('Staged Changes')).toBeTruthy();
    expect(getByText('Changes')).toBeTruthy();
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

// ── hover actions (discard / open file) ──────────────────────────────────────

describe('FileTree — row hover actions', () => {
  it('discard button on a file row calls onDiscard with that path', async () => {
    const onDiscard = vi.fn();
    const { getByText } = render(FileTree, { files, onDiscard });

    const row = getByText('main.ts').closest('.file-row') as HTMLElement;
    const btn = row.querySelector('.row-act--discard') as HTMLElement;
    await fireEvent.click(btn);
    expect(onDiscard).toHaveBeenCalledWith(['src/main.ts']);
  });

  it('open-file button on a file row calls onOpenFile, not onOpenDiff', async () => {
    const onOpenFile = vi.fn();
    const onOpenDiff = vi.fn();
    const { getByText } = render(FileTree, { files, onOpenFile, onOpenDiff });

    const row = getByText('main.ts').closest('.file-row') as HTMLElement;
    const btn = row.querySelector('.row-act:not(.row-act--discard)') as HTMLElement;
    await fireEvent.click(btn);
    expect(onOpenFile).toHaveBeenCalledWith('src/main.ts');
    expect(onOpenDiff).not.toHaveBeenCalled();
  });

  it('deleted files keep discard (restores them) but lose open-file', () => {
    const { getByText } = render(FileTree, { files });
    const row = getByText('deleted.txt').closest('.file-row') as HTMLElement;
    expect(row.querySelector('.row-act--discard')).toBeTruthy();
    expect(row.querySelector('.row-act:not(.row-act--discard)')).toBeNull();
  });

  it('conflicted files get no hover actions at all', () => {
    const conflictFiles = [{ path: 'clash.txt', status: '!', workStatus: '!' }];
    const { getByText } = render(FileTree, { files: conflictFiles });
    const row = getByText('clash.txt').closest('.file-row') as HTMLElement;
    expect(row.querySelector('.row-act')).toBeNull();
  });

  it('folder discard button passes every file in the folder', async () => {
    const onDiscard = vi.fn();
    const { getByText } = render(FileTree, { files, onDiscard });

    const row = getByText('src').closest('.folder-row') as HTMLElement;
    await fireEvent.click(row.querySelector('.row-act--discard') as HTMLElement);
    expect(onDiscard).toHaveBeenCalledWith(
      expect.arrayContaining(['src/main.ts', 'src/components/App.svelte'])
    );
  });

  it('section "discard all" passes all paths but skips conflicted files', async () => {
    const onDiscard = vi.fn();
    const withConflict = [...files, { path: 'clash.txt', status: '!', workStatus: '!' }];
    const { getByLabelText } = render(FileTree, { files: withConflict, onDiscard });

    await fireEvent.click(getByLabelText('Discard all changes'));
    const paths = onDiscard.mock.calls[0][0] as string[];
    expect(paths).toContain('src/main.ts');
    expect(paths).not.toContain('clash.txt');
  });

  it('staged section gets its own discard-all scoped to staged files', async () => {
    const onDiscard = vi.fn();
    const mixed = [
      { path: 'src/main.ts', status: 'M', indexStatus: 'M' },
      { path: 'README.md', status: 'M', workStatus: 'M' },
    ];
    const { getByLabelText } = render(FileTree, { files: mixed, onDiscard });

    await fireEvent.click(getByLabelText('Discard all staged changes'));
    expect(onDiscard).toHaveBeenCalledWith(['src/main.ts']);
  });
});

// ── hunk expand toggle ────────────────────────────────────────────────────────

describe('FileTree — hunk toggle', () => {
  it('shows the toggle only when a repoRoot is provided', () => {
    const { container } = render(FileTree, { files });
    expect(container.querySelector('.hunk-toggle')).toBeNull(); // no repoRoot → no hunks

    const withRoot = render(FileTree, { files, repoRoot: '/a' });
    expect(withRoot.container.querySelector('.hunk-toggle')).toBeTruthy();
  });

  it('conflicted rows never get a hunk toggle', () => {
    const conflict = [{ path: 'clash.txt', status: '!', workStatus: '!' }];
    const { getByText } = render(FileTree, { files: conflict, repoRoot: '/a' });
    const row = getByText('clash.txt').closest('.file-row') as HTMLElement;
    expect(row.querySelector('.hunk-toggle')).toBeNull();
  });

  it('clicking the toggle expands the inline hunk view and does not open the diff', async () => {
    const onOpenDiff = vi.fn();
    const { getByText, container } = render(FileTree, { files, repoRoot: '/a', onOpenDiff });

    const row = getByText('main.ts').closest('.file-row') as HTMLElement;
    const toggle = row.querySelector('.hunk-toggle') as HTMLElement;
    await fireEvent.click(toggle);

    expect(onOpenDiff).not.toHaveBeenCalled();
    // HunkView mounts and issues its diff fetch.
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith('diff.working', { file: 'src/main.ts', cached: false }, '/a')
    );
  });
});

// ── context menu ──────────────────────────────────────────────────────────────

describe('FileTree — file context menu', () => {
  async function openCtx(fileLabel: string, props: Record<string, unknown> = {}) {
    const utils = render(FileTree, { files, ...props });
    const row = utils.getByText(fileLabel).closest('.file-row') as HTMLElement;
    await fireEvent.contextMenu(row);
    return utils;
  }

  it('right-click opens the menu with the expected items', async () => {
    const { getByText } = await openCtx('main.ts');
    expect(getByText('Show Diff')).toBeTruthy();
    expect(getByText('Open File')).toBeTruthy();
    expect(getByText('Copy Path')).toBeTruthy();
    expect(getByText('Discard Changes')).toBeTruthy();
  });

  it('"Show Diff" routes through onOpenDiff and closes the menu', async () => {
    const onOpenDiff = vi.fn();
    const { getByText, queryByText } = await openCtx('main.ts', { onOpenDiff });
    await fireEvent.click(getByText('Show Diff'));
    expect(onOpenDiff).toHaveBeenCalledWith('src/main.ts');
    expect(queryByText('Copy Path')).toBeNull();
  });

  it('"Discard Changes" routes through onDiscard', async () => {
    const onDiscard = vi.fn();
    const { getByText } = await openCtx('main.ts', { onDiscard });
    await fireEvent.click(getByText('Discard Changes'));
    expect(onDiscard).toHaveBeenCalledWith(['src/main.ts']);
  });

  it('"Copy Path" writes the full path to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // navigator.clipboard is getter-only in happy-dom — defineProperty, not assign.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { getByText } = await openCtx('main.ts');
    await fireEvent.click(getByText('Copy Path'));
    expect(writeText).toHaveBeenCalledWith('src/main.ts');
  });

  it('conflicted file: diff item becomes "Open Merge Editor" and discard is inert', async () => {
    const onDiscard = vi.fn();
    const conflictFiles = [{ path: 'clash.txt', status: '!', workStatus: '!' }];
    const utils = render(FileTree, { files: conflictFiles, onDiscard });
    const row = utils.getByText('clash.txt').closest('.file-row') as HTMLElement;
    await fireEvent.contextMenu(row);

    expect(utils.getByText('Open Merge Editor')).toBeTruthy();
    await fireEvent.click(utils.getByText('Discard Changes'));
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('deleted file has no "Open File" item', async () => {
    const { queryByText } = await openCtx('deleted.txt');
    expect(queryByText('Open File')).toBeNull();
  });
});

// ── rename ────────────────────────────────────────────────────────────────────

describe('FileTree — renamed files', () => {
  it('renders old and new name for renamed files with oldPath', () => {
    const renamedFiles = [
      { path: 'new-name.ts', status: 'R', indexStatus: 'R', oldPath: 'old-name.ts' } as any,
    ];
    const { getByText } = render(FileTree, { files: renamedFiles });
    expect(getByText('old-name.ts')).toBeTruthy();
    expect(getByText('new-name.ts')).toBeTruthy();
    expect(getByText('→')).toBeTruthy();
  });
});
