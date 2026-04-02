import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CommitArea from './CommitArea.svelte';

// ── hint text ─────────────────────────────────────────────────────────────────

describe('CommitArea — hint text', () => {
  it('shows no changed files when hasFiles is false', () => {
    const { getByText } = render(CommitArea, { hasFiles: false, stagedCount: 0 });
    expect(getByText('No changed files')).toBeTruthy();
  });

  it('shows no files staged warning when hasFiles but stagedCount is 0', () => {
    const { getByText } = render(CommitArea, { hasFiles: true, stagedCount: 0 });
    expect(getByText('No files staged — check files above to stage')).toBeTruthy();
  });

  it('shows staged count when files are staged', () => {
    const { getByText } = render(CommitArea, { hasFiles: true, stagedCount: 3 });
    expect(getByText('3 files staged')).toBeTruthy();
  });

  it('shows singular file when stagedCount is 1', () => {
    const { getByText } = render(CommitArea, { hasFiles: true, stagedCount: 1 });
    expect(getByText('1 file staged')).toBeTruthy();
  });
});

// ── button disabled state ─────────────────────────────────────────────────────

describe('CommitArea — button states', () => {
  it('commit button is disabled when no staged files', () => {
    const { getByText } = render(CommitArea, { hasFiles: true, stagedCount: 0 });
    expect((getByText('Commit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('commit button is disabled when message is empty even with staged files', async () => {
    const { getByText } = render(CommitArea, { hasFiles: true, stagedCount: 2 });
    expect((getByText('Commit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('textarea is disabled when hasFiles is false', () => {
    const { getByPlaceholderText } = render(CommitArea, { hasFiles: false, stagedCount: 0 });
    expect((getByPlaceholderText('Commit message') as HTMLTextAreaElement).disabled).toBe(true);
  });
});

// ── commit actions ────────────────────────────────────────────────────────────

describe('CommitArea — commit actions', () => {
  it('calls onCommit with message when commit button clicked', async () => {
    const onCommit = vi.fn();
    const { getByText, getByPlaceholderText } = render(CommitArea, {
      hasFiles: true,
      stagedCount: 1,
      onCommit,
    });

    await fireEvent.input(getByPlaceholderText('Commit message'), {
      target: { value: 'fix: my change' },
    });
    await fireEvent.click(getByText('Commit'));

    expect(onCommit).toHaveBeenCalledWith('fix: my change');
  });

  it('calls onCommitPush with message when commit & push clicked', async () => {
    const onCommitPush = vi.fn();
    const { getByText, getByPlaceholderText } = render(CommitArea, {
      hasFiles: true,
      stagedCount: 1,
      onCommitPush,
    });

    await fireEvent.input(getByPlaceholderText('Commit message'), {
      target: { value: 'feat: new thing' },
    });
    await fireEvent.click(getByText('Commit & Push'));

    expect(onCommitPush).toHaveBeenCalledWith('feat: new thing');
  });

  it('does not call onCommit when canCommit is false', async () => {
    const onCommit = vi.fn();
    const { getByText } = render(CommitArea, { hasFiles: true, stagedCount: 0, onCommit });

    await fireEvent.click(getByText('Commit'));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('trims whitespace from message before committing', async () => {
    const onCommit = vi.fn();
    const { getByText, getByPlaceholderText } = render(CommitArea, {
      hasFiles: true,
      stagedCount: 1,
      onCommit,
    });

    await fireEvent.input(getByPlaceholderText('Commit message'), {
      target: { value: '  fix: spaces  ' },
    });
    await fireEvent.click(getByText('Commit'));

    expect(onCommit).toHaveBeenCalledWith('fix: spaces');
  });
});
