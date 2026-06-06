import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

// CommitArea fetches the last commit message (for amend prefill) via the bus.
const sendMock = vi.hoisted(() => vi.fn());
vi.mock('$shared/messageBus', () => ({ send: sendMock, on: vi.fn() }));

import CommitArea from './CommitArea.svelte';

// Helpers — find controls by role/placeholder so copy tweaks don't break tests.
const commitBtn = (q: any) => q.getByRole('button', { name: /^commit/i }) as HTMLButtonElement;
const pushBtn   = (q: any) => q.getByRole('button', { name: 'Push' }) as HTMLButtonElement;
const msgBox    = (q: any) => q.getByPlaceholderText('Message') as HTMLTextAreaElement;

// ── meta line (branch chip + staged note) ─────────────────────────────────────

describe('CommitArea — meta text', () => {
  it('shows "No changes" when hasFiles is false', () => {
    const { getByText } = render(CommitArea, { hasFiles: false, stagedCount: 0 });
    expect(getByText('No changes')).toBeTruthy();
  });

  it('prompts to stage when files exist but none staged', () => {
    const { getByText } = render(CommitArea, { hasFiles: true, stagedCount: 0 });
    expect(getByText('Stage files to commit')).toBeTruthy();
  });

  it('shows staged count when files are staged', () => {
    const { getByText } = render(CommitArea, { hasFiles: true, stagedCount: 3 });
    expect(getByText('3 files staged')).toBeTruthy();
  });

  it('shows singular file when stagedCount is 1', () => {
    const { getByText } = render(CommitArea, { hasFiles: true, stagedCount: 1 });
    expect(getByText('1 file staged')).toBeTruthy();
  });

  it('shows the branch name in the chip', () => {
    const { getByText } = render(CommitArea, { hasFiles: true, stagedCount: 1, branch: 'develop' });
    expect(getByText('develop')).toBeTruthy();
  });
});

// ── button disabled state ─────────────────────────────────────────────────────

describe('CommitArea — button states', () => {
  it('commit button is disabled when no staged files', () => {
    const q = render(CommitArea, { hasFiles: true, stagedCount: 0 });
    expect(commitBtn(q).disabled).toBe(true);
  });

  it('commit button is disabled when message is empty even with staged files', () => {
    const q = render(CommitArea, { hasFiles: true, stagedCount: 2 });
    expect(commitBtn(q).disabled).toBe(true);
  });

  it('textarea is disabled when hasFiles is false', () => {
    const q = render(CommitArea, { hasFiles: false, stagedCount: 0 });
    expect(msgBox(q).disabled).toBe(true);
  });
});

// ── commit actions ────────────────────────────────────────────────────────────

describe('CommitArea — commit actions', () => {
  it('calls onCommit with message when commit button clicked', async () => {
    const onCommit = vi.fn();
    const q = render(CommitArea, { hasFiles: true, stagedCount: 1, onCommit });
    await fireEvent.input(msgBox(q), { target: { value: 'fix: my change' } });
    await fireEvent.click(commitBtn(q));
    expect(onCommit).toHaveBeenCalledWith('fix: my change');
  });

  it('calls onCommitPush with message when push clicked', async () => {
    const onCommitPush = vi.fn();
    const q = render(CommitArea, {
      hasFiles: true, stagedCount: 1, hasUpstream: true, onCommitPush,
    });
    await fireEvent.input(msgBox(q), { target: { value: 'feat: new thing' } });
    await fireEvent.click(pushBtn(q));
    expect(onCommitPush).toHaveBeenCalledWith('feat: new thing');
  });

  it('does not call onCommit when canCommit is false', async () => {
    const onCommit = vi.fn();
    const q = render(CommitArea, { hasFiles: true, stagedCount: 0, onCommit });
    await fireEvent.click(commitBtn(q));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('trims whitespace from message before committing', async () => {
    const onCommit = vi.fn();
    const q = render(CommitArea, { hasFiles: true, stagedCount: 1, onCommit });
    await fireEvent.input(msgBox(q), { target: { value: '  fix: spaces  ' } });
    await fireEvent.click(commitBtn(q));
    expect(onCommit).toHaveBeenCalledWith('fix: spaces');
  });
});

// ── bug #20: message not cleared eagerly (cleared by parent on success) ──────

describe('CommitArea — message preservation (bug #20/#22)', () => {
  it('bug-20: message stays after commit (parent clears via clearMessage)', async () => {
    const onCommit = vi.fn();
    const q = render(CommitArea, { hasFiles: true, stagedCount: 1, onCommit });
    const textarea = msgBox(q);
    await fireEvent.input(textarea, { target: { value: 'my commit' } });
    await fireEvent.click(commitBtn(q));
    expect(textarea.value).toBe('my commit');
  });

  it('bug-20: clearMessage() resets the textarea', async () => {
    const q = render(CommitArea, { hasFiles: true, stagedCount: 1 });
    const textarea = msgBox(q);
    await fireEvent.input(textarea, { target: { value: 'my commit' } });
    expect(textarea.value).toBe('my commit');
    (q.component as any).clearMessage();
    await tick();
    expect(textarea.value).toBe('');
  });
});

// ── bug #21: hide Push when no upstream ───────────────────────────────────────

describe('CommitArea — upstream visibility (bug #21)', () => {
  it('bug-21: hides Push button when hasUpstream is false', () => {
    const { queryByRole } = render(CommitArea, {
      hasFiles: true, stagedCount: 1, hasUpstream: false,
    });
    expect(queryByRole('button', { name: 'Push' })).toBeFalsy();
  });

  it('bug-21: shows Push button when hasUpstream is true', () => {
    const q = render(CommitArea, { hasFiles: true, stagedCount: 1, hasUpstream: true });
    expect(pushBtn(q)).toBeTruthy();
  });

  it('bug-21: always shows Commit button regardless of upstream', () => {
    const q = render(CommitArea, { hasFiles: true, stagedCount: 1, hasUpstream: false });
    expect(commitBtn(q)).toBeTruthy();
  });
});

// ── amend mode ────────────────────────────────────────────────────────────────

describe('CommitArea — amend', () => {
  it('toggling Amend prefills the last commit message and switches the button', async () => {
    sendMock.mockReset();
    sendMock.mockResolvedValue('previous subject');
    const onAmend = vi.fn();
    const onCommit = vi.fn();
    const q = render(CommitArea, { hasFiles: false, stagedCount: 0, onAmend, onCommit });

    await fireEvent.click(q.getByText('Amend last commit'));
    await tick();
    await tick();

    // prefilled from commit.lastMessage, even with nothing staged
    const box = q.getByPlaceholderText('Amend commit message') as HTMLTextAreaElement;
    expect(box.value).toBe('previous subject');
    expect(sendMock).toHaveBeenCalledWith('commit.lastMessage');

    // primary button now amends (not commits)
    const amendBtn = q.getByRole('button', { name: 'Amend' }) as HTMLButtonElement;
    expect(amendBtn.disabled).toBe(false);
    await fireEvent.click(amendBtn);
    expect(onAmend).toHaveBeenCalledWith('previous subject');
    expect(onCommit).not.toHaveBeenCalled();
  });
});
