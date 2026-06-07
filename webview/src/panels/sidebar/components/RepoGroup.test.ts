import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import RepoGroup from './RepoGroup.svelte';

const mockPostMessage = vi.hoisted(() => vi.fn());
vi.mock('$shared/vscode', () => ({ default: { postMessage: mockPostMessage } }));

const repo = { name: 'alpharius', rootPath: '/a' };

const postedCmds = () => mockPostMessage.mock.calls.map((c) => c[0] as Record<string, unknown>);

beforeEach(() => mockPostMessage.mockClear());

describe('RepoGroup', () => {
  it('scopes its status fetch to this repo root (never disturbs focus)', () => {
    render(RepoGroup, { repo });
    const statusCall = postedCmds().find((m) => m.cmd === 'status');
    expect(statusCall).toBeTruthy();
    expect(statusCall!.repo).toBe('/a');
  });

  it('renders the repo name in the header', () => {
    const { getByText } = render(RepoGroup, { repo });
    expect(getByText('alpharius')).toBeTruthy();
  });

  it('focuses the repo when the header is clicked', async () => {
    const onFocus = vi.fn();
    const { container } = render(RepoGroup, { repo, onFocus });
    await fireEvent.click(container.querySelector('.repo-header') as HTMLElement);
    expect(onFocus).toHaveBeenCalledWith('/a');
  });

  // Full header line toggles expand/collapse (not just the triangle).
  it('toggles expand/collapse on full header click', async () => {
    const { container } = render(RepoGroup, { repo, expanded: true });
    expect(container.querySelector('.chevron.open')).toBeTruthy();

    await fireEvent.click(container.querySelector('.repo-header') as HTMLElement);
    expect(container.querySelector('.chevron.open')).toBeNull();

    await fireEvent.click(container.querySelector('.repo-header') as HTMLElement);
    expect(container.querySelector('.chevron.open')).toBeTruthy();
  });
});
