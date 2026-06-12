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
        snippet: '',
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
        snippet: '',
      },
    });
  });

  it('includes the active code-search snippet in openDiff', async () => {
    const { getByText } = render(DetailPane, { commit, files, searchSnippet: 'const x = 1;' });

    await fireEvent.click(getByText('main.ts'));

    expect(mockPostMessage).toHaveBeenCalledWith({
      cmd: 'openDiff',
      params: {
        commit: commit.hash,
        parent: 'parent123',
        file: 'src/main.ts',
        newTab: false,
        snippet: 'const x = 1;',
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

  it('shows file count in the tree toolbar', () => {
    const { getByText } = render(DetailPane, { commit, files });
    expect(getByText(/2 files changed/)).toBeTruthy();
  });

  it('shows singular file count', () => {
    const { getByText } = render(DetailPane, { commit, files: [files[0]] });
    expect(getByText(/1 file changed/)).toBeTruthy();
  });
});

// ── actions ───────────────────────────────────────────────────────────────────

describe('DetailPane — action row', () => {
  it('visible chips route through onCommitMenuAction with the commit', async () => {
    const onCommitMenuAction = vi.fn();
    const { getByText } = render(DetailPane, { commit, files, onCommitMenuAction });

    await fireEvent.click(getByText('Cherry-pick'));
    expect(onCommitMenuAction).toHaveBeenCalledWith('cherry-pick', commit);

    await fireEvent.click(getByText('Branch here'));
    expect(onCommitMenuAction).toHaveBeenCalledWith('new-branch', commit);

    await fireEvent.click(getByText('Tag'));
    expect(onCommitMenuAction).toHaveBeenCalledWith('new-tag', commit);

    await fireEvent.click(getByText('↗'));
    expect(onCommitMenuAction).toHaveBeenCalledWith('view-in-browser', commit);
  });

  it('Revert lives in the ⋯ overflow, separated from the visible chips', async () => {
    const onCommitMenuAction = vi.fn();
    const { getByText, queryByText } = render(DetailPane, { commit, files, onCommitMenuAction });

    // not visible until the overflow opens
    expect(queryByText('Revert commit')).toBeNull();

    await fireEvent.click(getByText('⋯'));
    expect(getByText('Checkout at commit (detached)')).toBeTruthy();
    expect(getByText('Copy commit message')).toBeTruthy();

    await fireEvent.click(getByText('Revert commit'));
    expect(onCommitMenuAction).toHaveBeenCalledWith('revert', commit);
    // menu closes after running an action
    expect(queryByText('Revert commit')).toBeNull();
  });

  it('clicking the hash copies the full hash', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // navigator.clipboard is getter-only in happy-dom — defineProperty, not assign.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { getByTitle, findByText } = render(DetailPane, { commit, files });

    await fireEvent.click(getByTitle(`${commit.hash} — click to copy`));

    expect(writeText).toHaveBeenCalledWith(commit.hash);
    expect(await findByText('✓ copied')).toBeTruthy();
  });

  it('there is no separate Copy hash button anymore', () => {
    const { queryByText } = render(DetailPane, { commit, files });
    expect(queryByText('Copy hash')).toBeNull();
  });
});

// ── file tree root ────────────────────────────────────────────────────────────

describe('DetailPane — tree has no synthetic root node', () => {
  it('does not render a repo-root folder row', () => {
    const { queryByText, container } = render(DetailPane, { commit, files });
    expect(queryByText('HydraGit')).toBeNull();
    // top-level folder starts at depth 0 (8px padding), not one level in
    const firstFolder = container.querySelector('.tree-row--folder') as HTMLElement | null;
    if (firstFolder) expect(firstFolder.style.paddingLeft).toBe('8px');
  });
});

// ── refs pills ────────────────────────────────────────────────────────────────

describe('DetailPane — ref pills', () => {
  it('splits "HEAD -> branch" into separate pills', () => {
    const withRefs = { ...commit, refs: ['HEAD -> develop', 'tag: v1.0', 'origin/develop'] };
    const { getByText, container } = render(DetailPane, { commit: withRefs, files });

    expect(container.querySelector('.dm-pill--head')?.textContent?.trim()).toBe('HEAD');
    expect(getByText('develop').classList.contains('dm-pill')).toBe(true);
    expect(container.querySelector('.dm-pill--tag')?.textContent?.trim()).toBe('v1.0');
  });
});
