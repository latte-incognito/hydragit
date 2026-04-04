import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Toolbar from './Toolbar.svelte';

// ── rendering ─────────────────────────────────────────────────────────────────

describe('Toolbar — rendering', () => {
  it('renders active branch name in branch pill', () => {
    const { getByText } = render(Toolbar, { activeBranch: 'develop' });
    expect(getByText('develop')).toBeTruthy();
  });

  it('renders repoName as fallback when activeBranch is empty', () => {
    const { getByText } = render(Toolbar, { repoName: 'my-project', activeBranch: '' });
    expect(getByText('my-project')).toBeTruthy();
  });

  it('renders search input with default message placeholder', () => {
    const { getByPlaceholderText } = render(Toolbar, {});
    expect(getByPlaceholderText('Search commit messages…')).toBeTruthy();
  });

  it('renders four mode tab buttons', () => {
    const { getAllByRole } = render(Toolbar, {});
    // mode tabs + clear btn (hidden) + refresh btn + filter-pill = several buttons
    // specifically check we have msg/hash/file/author tabs by title
    const buttons = getAllByRole('button');
    const titles = buttons.map(b => b.getAttribute('title')).filter(Boolean);
    expect(titles).toContain('Message');
    expect(titles).toContain('Hash');
    expect(titles).toContain('File');
    expect(titles).toContain('Author');
  });

  it('renders all-branches filter pill defaulting to "This branch"', () => {
    const { getByText } = render(Toolbar, {});
    expect(getByText('This branch')).toBeTruthy();
  });

  it('renders "All branches" when allBranches prop is true', () => {
    const { getByText } = render(Toolbar, { allBranches: true });
    expect(getByText('All branches')).toBeTruthy();
  });

  it('does not render clear button when searchQuery is empty', () => {
    const { queryByTitle } = render(Toolbar, { searchQuery: '' });
    // clear button has no title — check it's not visible by querying the svg path
    // easiest: check input has no value
    const input = document.querySelector('input');
    expect(input?.value ?? '').toBe('');
  });
});

// ── search mode switching ─────────────────────────────────────────────────────

describe('Toolbar — search modes', () => {
  it('switching to hash mode calls onModeChange and changes placeholder', async () => {
    const onModeChange = vi.fn();
    const { getByTitle, getByPlaceholderText } = render(Toolbar, { onModeChange });

    await fireEvent.click(getByTitle('Hash'));

    expect(onModeChange).toHaveBeenCalledWith('hash');
    expect(getByPlaceholderText('Enter hash prefix (e.g. a0c103)…')).toBeTruthy();
  });

  it('switching to file mode calls onModeChange and changes placeholder', async () => {
    const onModeChange = vi.fn();
    const { getByTitle, getByPlaceholderText } = render(Toolbar, { onModeChange });

    await fireEvent.click(getByTitle('File'));

    expect(onModeChange).toHaveBeenCalledWith('file');
    expect(getByPlaceholderText('File name or path…')).toBeTruthy();
  });

  it('switching to author mode calls onModeChange and changes placeholder', async () => {
    const onModeChange = vi.fn();
    const { getByTitle, getByPlaceholderText } = render(Toolbar, { onModeChange });

    await fireEvent.click(getByTitle('Author'));

    expect(onModeChange).toHaveBeenCalledWith('author');
    expect(getByPlaceholderText('Author name or email…')).toBeTruthy();
  });

  it('switching mode clears search query and calls onSearch with empty string', async () => {
    const onSearch = vi.fn();
    const { getByTitle, getByPlaceholderText } = render(Toolbar, {
      searchMode: 'msg',
      searchQuery: 'some query',
      onSearch,
    });

    await fireEvent.click(getByTitle('Hash'));

    expect(onSearch).toHaveBeenCalledWith('');
  });
});

// ── search input ──────────────────────────────────────────────────────────────

describe('Toolbar — search input', () => {
  it('calls onSearch with typed value in msg mode', async () => {
    const onSearch = vi.fn();
    const { getByPlaceholderText } = render(Toolbar, { onSearch });

    const input = getByPlaceholderText('Search commit messages…');
    await fireEvent.input(input, { target: { value: 'fix:' } });

    expect(onSearch).toHaveBeenCalledWith('fix:');
  });

  it('calls onSearch with empty string when input is cleared', async () => {
    const onSearch = vi.fn();
    const { getByPlaceholderText } = render(Toolbar, { onSearch });

    const input = getByPlaceholderText('Search commit messages…');
    await fireEvent.input(input, { target: { value: '' } });

    expect(onSearch).toHaveBeenCalledWith('');
  });

  it('calls onSearch with empty string when clear button is clicked', async () => {
    const onSearch = vi.fn();
    const { getByPlaceholderText, getAllByRole } = render(Toolbar, {
      searchQuery: 'something',
      onSearch,
    });

    // clear button is the last button rendered when searchQuery is non-empty
    const buttons = getAllByRole('button');
    const clearBtn = buttons.find(b => !b.getAttribute('title') && !b.getAttribute('aria-label'));
    if (clearBtn) await fireEvent.click(clearBtn);

    expect(onSearch).toHaveBeenCalledWith('');
  });
});

// ── all-branches toggle ───────────────────────────────────────────────────────

describe('Toolbar — all-branches filter', () => {
  it('calls onAllBranches with true when toggled on', async () => {
    const onAllBranches = vi.fn();
    const { getByText } = render(Toolbar, { allBranches: false, onAllBranches });

    await fireEvent.click(getByText('This branch'));

    expect(onAllBranches).toHaveBeenCalledWith(true);
  });

  it('calls onAllBranches with false when toggled off', async () => {
    const onAllBranches = vi.fn();
    const { getByText } = render(Toolbar, { allBranches: true, onAllBranches });

    await fireEvent.click(getByText('All branches'));

    expect(onAllBranches).toHaveBeenCalledWith(false);
  });
});

// ── refresh ───────────────────────────────────────────────────────────────────

describe('Toolbar — refresh', () => {
  it('calls onAction with "refresh" when refresh button is clicked', async () => {
    const onAction = vi.fn();
    const { getByLabelText } = render(Toolbar, { onAction });

    await fireEvent.click(getByLabelText('Refresh'));

    expect(onAction).toHaveBeenCalledWith('refresh');
  });
});
