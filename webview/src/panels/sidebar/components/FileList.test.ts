import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import FileList from './FileList.svelte';

const files = [
  { path: 'src/main.ts', status: 'M' },
  { path: 'README.md', status: 'A' },
  { path: 'src/utils/helper.ts', status: 'D' },
];

// ── empty / loading states ────────────────────────────────────────────────────

describe('FileList — states', () => {
  it('shows loading state', () => {
    const { getByText } = render(FileList, { files: [], loading: true });
    expect(getByText(/Loading/)).toBeTruthy();
  });

  it('shows empty state when no files', () => {
    const { getByText } = render(FileList, { files: [], loading: false });
    expect(getByText('No changes · working tree clean')).toBeTruthy();
  });
});

// ── file rendering ────────────────────────────────────────────────────────────

describe('FileList — rendering', () => {
  it('renders file basenames', () => {
    const { getByText } = render(FileList, { files, loading: false, stagedPaths: new Set() });
    expect(getByText('main.ts')).toBeTruthy();
    expect(getByText('README.md')).toBeTruthy();
    expect(getByText('helper.ts')).toBeTruthy();
  });

  it('renders directory paths', () => {
    const { getByText } = render(FileList, { files, loading: false, stagedPaths: new Set() });
    expect(getByText('src')).toBeTruthy();
    expect(getByText('src/utils')).toBeTruthy();
  });

  it('renders status badges', () => {
    const { getByText } = render(FileList, { files, loading: false, stagedPaths: new Set() });
    expect(getByText('M')).toBeTruthy();
    expect(getByText('A')).toBeTruthy();
    expect(getByText('D')).toBeTruthy();
  });

  it('renders a checkbox per file', () => {
    const { getAllByRole } = render(FileList, { files, loading: false, stagedPaths: new Set() });
    const checkboxes = getAllByRole('checkbox');
    expect(checkboxes.length).toBe(files.length);
  });
});

// ── selection ─────────────────────────────────────────────────────────────────

describe('FileList — selection', () => {
  it('calls onSelect with index when file row clicked', async () => {
    const onSelect = vi.fn();
    const { getByText } = render(FileList, {
      files,
      loading: false,
      stagedPaths: new Set(),
      onSelect,
    });

    await fireEvent.click(getByText('main.ts'));
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it('calls onSelect on Enter keydown', async () => {
    const onSelect = vi.fn();
    const { getAllByRole } = render(FileList, {
      files,
      loading: false,
      stagedPaths: new Set(),
      onSelect,
    });

    const rows = getAllByRole('option');
    await fireEvent.keyDown(rows[1], { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});

// ── staging ───────────────────────────────────────────────────────────────────

describe('FileList — staging', () => {
  it('calls onToggleStage with path when checkbox changed', async () => {
    const onToggleStage = vi.fn();
    const { getAllByRole } = render(FileList, {
      files,
      loading: false,
      stagedPaths: new Set(),
      onToggleStage,
    });

    const checkboxes = getAllByRole('checkbox');
    await fireEvent.change(checkboxes[0]);
    expect(onToggleStage).toHaveBeenCalledWith('src/main.ts');
  });

  it('checkbox is checked when file path is in stagedPaths', () => {
    const { getAllByRole } = render(FileList, {
      files,
      loading: false,
      stagedPaths: new Set(['src/main.ts']),
    });

    const checkboxes = getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
  });

  it('checkbox click does not trigger row selection', async () => {
    const onSelect = vi.fn();
    const { getAllByRole } = render(FileList, {
      files,
      loading: false,
      stagedPaths: new Set(),
      onSelect,
    });

    const checkboxes = getAllByRole('checkbox');
    await fireEvent.click(checkboxes[0]);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
