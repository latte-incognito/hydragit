import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import DetailPane from './DetailPane.svelte';

const mockPostMessage = vi.hoisted(() => vi.fn());
vi.mock('$shared/vscode', () => ({ default: { postMessage: mockPostMessage } }));

const commit = {
  hash: 'abc1234def5678',
  message: 'fix: update readme',
  author: 'Ada',
  date: '2026-01-01T00:00:00Z',
  parents: ['parent123'],
  refs: [],
};

const files = [
  { path: 'src/main.ts', status: 'M', additions: 3, deletions: 1 },
  { path: 'README.md', status: 'A', additions: 10, deletions: 0 },
];

beforeEach(() => mockPostMessage.mockClear());

// ── empty state ───────────────────────────────────────────────────────────────

describe('DetailPane — no commit', () => {
  it('shows select a commit prompt when commit is null', () => {
    const { getByText } = render(DetailPane, { commit: null });
    expect(getByText('Select a commit')).toBeTruthy();
  });
});

// ── commit meta ───────────────────────────────────────────────────────────────

describe('DetailPane — commit meta', () => {
  it('renders short hash (8 chars)', () => {
    const { getByText } = render(DetailPane, { commit, files: [] });
    expect(getByText('abc1234d')).toBeTruthy();
  });

  it('renders commit message', () => {
    const { getByText } = render(DetailPane, { commit, files: [] });
    expect(getByText('fix: update readme')).toBeTruthy();
  });

  it('renders author', () => {
    const { getByText } = render(DetailPane, { commit, files: [] });
    expect(getByText('Ada')).toBeTruthy();
  });
});

// ── file list ─────────────────────────────────────────────────────────────────

describe('DetailPane — file list', () => {
  it('shows loading state', () => {
    const { getAllByText } = render(DetailPane, { commit, files: [], loading: true });
    expect(getAllByText('Loading…').length).toBeGreaterThan(0);
  });

  it('shows no file changes when files is empty', () => {
    const { getByText } = render(DetailPane, { commit, files: [], loading: false });
    expect(getByText('No file changes')).toBeTruthy();
  });

  it('renders file names', () => {
    const { getByText } = render(DetailPane, { commit, files });
    expect(getByText('main.ts')).toBeTruthy();
    expect(getByText('README.md')).toBeTruthy();
  });

  it('renders file status badges', () => {
    const { getAllByText } = render(DetailPane, { commit, files });
    expect(getAllByText('M').length).toBeGreaterThan(0);
    expect(getAllByText('A').length).toBeGreaterThan(0);
  });

  it('single click selects the file and opens its diff in preview (BUG #3)', async () => {
    const onSelectFile = vi.fn();
    const { getByText } = render(DetailPane, { commit, files, onSelectFile });

    await fireEvent.click(getByText('main.ts'));
    expect(onSelectFile).toHaveBeenCalledWith('src/main.ts');
    // #3: clicking must actually surface the diff (preview tab, newTab: false).
    expect(mockPostMessage).toHaveBeenCalledWith({
      cmd: 'openDiff',
      params: {
        commit: commit.hash,
        parent: 'parent123',
        file: 'src/main.ts',
        newTab: false,
      },
    });
  });

  it('sends openDiff (new persistent tab) on double click', async () => {
    const { getByText } = render(DetailPane, { commit, files });

    await fireEvent.dblClick(getByText('main.ts'));

    expect(mockPostMessage).toHaveBeenCalledWith({
      cmd: 'openDiff',
      params: {
        commit: commit.hash,
        parent: 'parent123',
        file: 'src/main.ts',
        newTab: true,
      },
    });
  });

  it('does not send openDiff when commit is null', async () => {
    const { getByText } = render(DetailPane, { commit: null, files: [] });
    // no file rows to click — just verify empty state renders without error
    expect(getByText('Select a commit')).toBeTruthy();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });
});

// ── stats ─────────────────────────────────────────────────────────────────────

describe('DetailPane — stats', () => {
  it('shows correct totals for additions and deletions', () => {
    const { getByText, getAllByText } = render(DetailPane, { commit, files });
    expect(getByText('+13')).toBeTruthy(); // 3 + 10
    // -1 appears in both file row and totals — verify at least one exists
    expect(getAllByText('-1').length).toBeGreaterThan(0);
  });

  it('shows correct file count', () => {
    const { getByText } = render(DetailPane, { commit, files });
    expect(getByText('2 files')).toBeTruthy();
  });

  it('shows singular file count', () => {
    const { getByText } = render(DetailPane, { commit, files: [files[0]] });
    expect(getByText('1 file')).toBeTruthy();
  });
});

// ── actions ───────────────────────────────────────────────────────────────────

describe('DetailPane — action buttons', () => {
  it('calls onCommitAction with cherry-pick', async () => {
    const onCommitAction = vi.fn();
    const { getByText } = render(DetailPane, { commit, files, onCommitAction });

    await fireEvent.click(getByText('Cherry-pick'));
    expect(onCommitAction).toHaveBeenCalledWith('cherry-pick', commit.hash);
  });

  it('calls onCommitAction with revert', async () => {
    const onCommitAction = vi.fn();
    const { getByText } = render(DetailPane, { commit, files, onCommitAction });

    await fireEvent.click(getByText('Revert'));
    expect(onCommitAction).toHaveBeenCalledWith('revert', commit.hash);
  });

  it('calls onCommitAction with copy', async () => {
    const onCommitAction = vi.fn();
    const { getByText } = render(DetailPane, { commit, files, onCommitAction });

    await fireEvent.click(getByText('Copy hash'));
    expect(onCommitAction).toHaveBeenCalledWith('copy', commit.hash);
  });
});
