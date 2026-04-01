import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Toolbar from './Toolbar.svelte';

// ── rendering ─────────────────────────────────────────────────────────────────

describe('Toolbar — rendering', () => {
  it('renders repo name', () => {
    const { getByText } = render(Toolbar, { repoName: 'my-project' });
    expect(getByText('my-project')).toBeTruthy();
  });

  it('renders fetch, pull, push buttons', () => {
    const { getByText } = render(Toolbar, { repoName: 'repo' });
    expect(getByText('↓ Fetch')).toBeTruthy();
    expect(getByText('⇣ Pull')).toBeTruthy();
    expect(getByText('⇡ Push')).toBeTruthy();
  });

  it('renders search input', () => {
    const { getByPlaceholderText } = render(Toolbar, { repoName: 'repo' });
    expect(getByPlaceholderText('Search commits…')).toBeTruthy();
  });
});

// ── actions ───────────────────────────────────────────────────────────────────

describe('Toolbar — button actions', () => {
  it('calls onAction with fetch', async () => {
    const onAction = vi.fn();
    const { getByText } = render(Toolbar, { repoName: 'repo', onAction });

    await fireEvent.click(getByText('↓ Fetch'));
    expect(onAction).toHaveBeenCalledWith('fetch');
  });

  it('calls onAction with pull', async () => {
    const onAction = vi.fn();
    const { getByText } = render(Toolbar, { repoName: 'repo', onAction });

    await fireEvent.click(getByText('⇣ Pull'));
    expect(onAction).toHaveBeenCalledWith('pull');
  });

  it('calls onAction with push', async () => {
    const onAction = vi.fn();
    const { getByText } = render(Toolbar, { repoName: 'repo', onAction });

    await fireEvent.click(getByText('⇡ Push'));
    expect(onAction).toHaveBeenCalledWith('push');
  });
});

// ── search ────────────────────────────────────────────────────────────────────

describe('Toolbar — search', () => {
  it('calls onSearch with input value', async () => {
    const onSearch = vi.fn();
    const { getByPlaceholderText } = render(Toolbar, { repoName: 'repo', onSearch });

    const input = getByPlaceholderText('Search commits…');
    await fireEvent.input(input, { target: { value: 'fix:' } });

    expect(onSearch).toHaveBeenCalledWith('fix:');
  });

  it('calls onSearch with empty string when cleared', async () => {
    const onSearch = vi.fn();
    const { getByPlaceholderText } = render(Toolbar, { repoName: 'repo', onSearch });

    const input = getByPlaceholderText('Search commits…');
    await fireEvent.input(input, { target: { value: '' } });

    expect(onSearch).toHaveBeenCalledWith('');
  });
});
