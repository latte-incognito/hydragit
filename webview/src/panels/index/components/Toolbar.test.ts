import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Toolbar from './Toolbar.svelte';

const branches = [
  { name: 'develop', isRemote: false, isCurrent: true },
  { name: 'feature/x', isRemote: false, isCurrent: false },
] as any[];

function searchInput(): HTMLInputElement {
  return document.querySelector('.search-inner input') as HTMLInputElement;
}

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

  it('shows "All branches" in the pill when allBranches is on', () => {
    const { getByText } = render(Toolbar, { activeBranch: 'develop', allBranches: true });
    expect(getByText('All branches')).toBeTruthy();
  });

  it('renders the single search input with the unscoped placeholder', () => {
    const { getByPlaceholderText } = render(Toolbar, {});
    expect(getByPlaceholderText('Search commits — or pick a scope…')).toBeTruthy();
  });

  it('renders no scope chip while unscoped', () => {
    render(Toolbar, {});
    expect(document.querySelector('.scope-chip')).toBeNull();
  });
});

// ── hydra bloom logo ──────────────────────────────────────────────────────────

describe('Toolbar — hydra bloom logo', () => {
  it('renders the head + full bloom imgs when head/icon URIs are provided', () => {
    render(Toolbar, { headUri: 'head.png', iconUri: 'full.png' });

    const bloom = document.querySelector('.hydra-bloom');
    expect(bloom).toBeTruthy();
    expect((bloom!.querySelector('.hb-head') as HTMLImageElement).src).toContain('head.png');
    expect((bloom!.querySelector('.hb-full') as HTMLImageElement).src).toContain('full.png');
    // the inline-SVG fallback is not rendered when we have a head asset
    expect(document.querySelector('.st-logo')).toBeNull();
  });

  it('falls back to the inline-SVG glyph when no head URI is present', () => {
    render(Toolbar, {});
    expect(document.querySelector('.hydra-bloom')).toBeNull();
    expect(document.querySelector('.st-logo')).toBeTruthy();
  });
});

// ── scope dropdown ────────────────────────────────────────────────────────────

describe('Toolbar — scope dropdown', () => {
  it('opens on focus while unscoped and lists the four scopes', async () => {
    const { getByText } = render(Toolbar, {});
    await fireEvent.focus(searchInput());

    expect(document.querySelector('.scope-dropdown')).toBeTruthy();
    expect(getByText('Author')).toBeTruthy();
    expect(getByText('File')).toBeTruthy();
    expect(getByText('Hash')).toBeTruthy();
    expect(getByText('Code')).toBeTruthy();
  });

  it('clicking a scope activates it as a chip and calls onModeChange', async () => {
    const onModeChange = vi.fn();
    const { getByText } = render(Toolbar, { onModeChange });

    await fireEvent.focus(searchInput());
    await fireEvent.mouseDown(getByText('Author'));

    expect(onModeChange).toHaveBeenCalledWith('author');
    expect(document.querySelector('.scope-chip-author')).toBeTruthy();
    expect(document.querySelector('.scope-dropdown')).toBeNull();
  });

  it('ArrowDown + Enter selects the highlighted scope', async () => {
    const onModeChange = vi.fn();
    render(Toolbar, { onModeChange });

    const input = searchInput();
    await fireEvent.focus(input);
    await fireEvent.keyDown(input, { key: 'ArrowDown' }); // → Author (first pickable)
    await fireEvent.keyDown(input, { key: 'Enter' });

    expect(onModeChange).toHaveBeenCalledWith('author');
  });

  it('Escape closes the dropdown', async () => {
    render(Toolbar, {});
    const input = searchInput();
    await fireEvent.focus(input);
    await fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.querySelector('.scope-dropdown')).toBeNull();
  });
});

// ── prefix → chip conversion ──────────────────────────────────────────────────

describe('Toolbar — prefix tokens', () => {
  it('typing "author:" converts to an author chip, keeping the rest as query', async () => {
    const onModeChange = vi.fn();
    const onSearch = vi.fn();
    render(Toolbar, { onModeChange, onSearch });

    await fireEvent.input(searchInput(), { target: { value: 'author:vlad' } });

    expect(onModeChange).toHaveBeenCalledWith('author');
    expect(onSearch).toHaveBeenCalledWith('vlad');
    expect(document.querySelector('.scope-chip-author')).toBeTruthy();
  });

  it('typing "@" at the start is an author shortcut', async () => {
    const onModeChange = vi.fn();
    render(Toolbar, { onModeChange });

    await fireEvent.input(searchInput(), { target: { value: '@' } });

    expect(onModeChange).toHaveBeenCalledWith('author');
  });

  it('typing "file:" activates the file scope', async () => {
    const onModeChange = vi.fn();
    render(Toolbar, { onModeChange });

    await fireEvent.input(searchInput(), { target: { value: 'file:panel.ts' } });

    expect(onModeChange).toHaveBeenCalledWith('file');
  });

  it('typing "code:" opens the snippet box', async () => {
    const onModeChange = vi.fn();
    render(Toolbar, { onModeChange });

    await fireEvent.input(searchInput(), { target: { value: 'code:' } });

    expect(onModeChange).toHaveBeenCalledWith('code');
    expect(document.querySelector('textarea.code-box')).toBeTruthy();
  });

  it('prefixes do not convert while already scoped', async () => {
    const onModeChange = vi.fn();
    render(Toolbar, { searchMode: 'author', onModeChange });

    await fireEvent.input(searchInput(), { target: { value: 'file:x' } });

    expect(onModeChange).not.toHaveBeenCalled();
  });
});

// ── chip removal ──────────────────────────────────────────────────────────────

describe('Toolbar — chip removal', () => {
  it('chip × returns to message search and clears the query', async () => {
    const onModeChange = vi.fn();
    const onSearch = vi.fn();
    render(Toolbar, { searchMode: 'author', searchQuery: 'vlad', onModeChange, onSearch });

    await fireEvent.click(document.querySelector('.chip-x')!);

    expect(onModeChange).toHaveBeenCalledWith('msg');
    expect(onSearch).toHaveBeenCalledWith('');
    expect(document.querySelector('.scope-chip')).toBeNull();
  });

  it('Backspace on an empty scoped input removes the chip', async () => {
    const onModeChange = vi.fn();
    render(Toolbar, { searchMode: 'file', searchQuery: '', onModeChange });

    await fireEvent.keyDown(searchInput(), { key: 'Backspace' });

    expect(onModeChange).toHaveBeenCalledWith('msg');
  });

  it('Backspace with text in the input does not remove the chip', async () => {
    const onModeChange = vi.fn();
    render(Toolbar, { searchMode: 'file', searchQuery: 'pan', onModeChange });

    await fireEvent.keyDown(searchInput(), { key: 'Backspace' });

    expect(onModeChange).not.toHaveBeenCalled();
  });
});

// ── search input ──────────────────────────────────────────────────────────────

describe('Toolbar — search input', () => {
  it('calls onSearch with typed value in message scope', async () => {
    const onSearch = vi.fn();
    render(Toolbar, { onSearch });

    await fireEvent.input(searchInput(), { target: { value: 'fix:' } });

    // "fix:" is not a scope prefix — plain message search
    expect(onSearch).toHaveBeenCalledWith('fix:');
  });

  it('calls onSearch with empty string when cleared', async () => {
    const onSearch = vi.fn();
    render(Toolbar, { searchQuery: 'something', onSearch });

    await fireEvent.input(searchInput(), { target: { value: '' } });

    expect(onSearch).toHaveBeenCalledWith('');
  });
});

// ── code search (pickaxe) ─────────────────────────────────────────────────────

describe('Toolbar — code search', () => {
  async function enterCodeScope() {
    await fireEvent.input(searchInput(), { target: { value: 'code:' } });
    return document.querySelector('textarea.code-box')!;
  }

  it('Enter submits the snippet: onSearch with value, then onSearchSubmit', async () => {
    const onSearch = vi.fn();
    const onSearchSubmit = vi.fn();
    render(Toolbar, { onSearch, onSearchSubmit });

    const box = await enterCodeScope();
    onSearch.mockClear();

    await fireEvent.input(box, { target: { value: 'const x = 1;' } });
    expect(onSearch).not.toHaveBeenCalled(); // no live search while typing

    await fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSearch).toHaveBeenCalledWith('const x = 1;');
    expect(onSearchSubmit).toHaveBeenCalledOnce();
  });

  it('Shift+Enter does not submit (newline instead)', async () => {
    const onSearchSubmit = vi.fn();
    render(Toolbar, { onSearchSubmit });

    const box = await enterCodeScope();
    await fireEvent.input(box, { target: { value: 'line one' } });
    await fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });

    expect(onSearchSubmit).not.toHaveBeenCalled();
  });

  it('Enter on an empty box does not submit', async () => {
    const onSearchSubmit = vi.fn();
    render(Toolbar, { onSearchSubmit });

    const box = await enterCodeScope();
    await fireEvent.keyDown(box, { key: 'Enter' });

    expect(onSearchSubmit).not.toHaveBeenCalled();
  });

  it('clearing the box calls onSearch with empty string (restores the log)', async () => {
    const onSearch = vi.fn();
    render(Toolbar, { onSearch });

    const box = await enterCodeScope();
    await fireEvent.input(box, { target: { value: 'snippet' } });
    onSearch.mockClear();

    await fireEvent.input(box, { target: { value: '' } });
    expect(onSearch).toHaveBeenCalledWith('');
  });

  it('Search button is disabled while the box is empty', async () => {
    const { getByText } = render(Toolbar, {});

    const box = await enterCodeScope();
    const run = getByText('Search') as HTMLButtonElement;
    expect(run.disabled).toBe(true);

    await fireEvent.input(box, { target: { value: 'x' } });
    expect(run.disabled).toBe(false);
  });
});

// ── branch view picker (All branches folded in) ───────────────────────────────

describe('Toolbar — branch view picker', () => {
  it('dropdown offers "All branches" as the pinned first entry', async () => {
    const { getByTitle, getByText } = render(Toolbar, { activeBranch: 'develop', branches });

    await fireEvent.click(getByTitle('Choose which branches the log shows'));

    expect(document.querySelector('.bd-item--all')).toBeTruthy();
    expect(getByText('All branches')).toBeTruthy();
  });

  it('clicking "All branches" calls onAllBranches(true)', async () => {
    const onAllBranches = vi.fn();
    const { getByTitle, getByText } = render(Toolbar, { activeBranch: 'develop', branches, onAllBranches });

    await fireEvent.click(getByTitle('Choose which branches the log shows'));
    await fireEvent.click(getByText('All branches'));

    expect(onAllBranches).toHaveBeenCalledWith(true);
  });

  it('clicking a branch calls onSelectBranch (and not onAllBranches)', async () => {
    const onSelectBranch = vi.fn();
    const onAllBranches = vi.fn();
    const { getByTitle, getByText } = render(Toolbar, {
      activeBranch: 'develop', branches, allBranches: true, onSelectBranch, onAllBranches,
    });

    await fireEvent.click(getByTitle('Choose which branches the log shows'));
    await fireEvent.click(getByText('feature/x'));

    expect(onSelectBranch).toHaveBeenCalledWith('feature/x', false);
    expect(onAllBranches).not.toHaveBeenCalled();
  });
});

// ── contextual undo ───────────────────────────────────────────────────────────

describe('Toolbar — contextual undo', () => {
  it('is hidden when there is nothing to undo', () => {
    const { queryByText } = render(Toolbar, { undoLabel: '' });
    expect(queryByText(/Undo/)).toBeNull();
  });

  it('shows the op it would undo and fires onAction("undo")', async () => {
    const onAction = vi.fn();
    const { getByText } = render(Toolbar, { undoLabel: 'merge', onAction });

    const btn = getByText('Undo merge');
    await fireEvent.click(btn);

    expect(onAction).toHaveBeenCalledWith('undo');
  });
});

// Refresh moved out of the toolbar to the `HydraGit: Force Refresh` command
// (extension host), so there's no toolbar refresh button to test here.

// ── status bar toggle ────────────────────────────────────────────────────────

describe('Toolbar — status toggle', () => {
  it('calls onToggleStatus when the status icon is clicked', async () => {
    const onToggleStatus = vi.fn();
    const { getByTitle } = render(Toolbar, { statusOpen: false, onToggleStatus });

    await fireEvent.click(getByTitle('Show repository status'));
    expect(onToggleStatus).toHaveBeenCalledOnce();
  });

  it('reflects open state in title and aria-expanded', () => {
    const { getByTitle } = render(Toolbar, { statusOpen: true });

    const btn = getByTitle('Hide repository status');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });
});
