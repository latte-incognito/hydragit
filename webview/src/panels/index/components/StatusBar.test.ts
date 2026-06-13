import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import StatusBar from './StatusBar.svelte';

describe('StatusBar — unpublished branch', () => {
  it('shows the Publish pill when the branch has no upstream', () => {
    const { getByText } = render(StatusBar, { branch: 'feature', noUpstream: true });
    expect(getByText('Publish')).toBeTruthy();
  });

  it('clicking Publish fires onPublish (push + set upstream)', async () => {
    const onPublish = vi.fn();
    const { getByText } = render(StatusBar, { branch: 'feature', noUpstream: true, onPublish });
    await fireEvent.click(getByText('Publish'));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('no-upstream wins: no Push/Pull/Sync pills even if counts are passed', () => {
    const { getByText, queryByText } = render(StatusBar, {
      branch: 'feature', noUpstream: true, ahead: 3, behind: 2,
    });
    expect(getByText('Publish')).toBeTruthy();
    expect(queryByText('Sync')).toBeNull();
  });
});

describe('StatusBar — ahead/behind pills', () => {
  it('ahead only → a Push pill with the count, no Pull or Sync', async () => {
    const onPush = vi.fn();
    const { getByText, queryByText, getByTitle } = render(StatusBar, {
      branch: 'feature', ahead: 2, behind: 0, onPush,
    });
    expect(getByText('2')).toBeTruthy();
    expect(getByTitle(/to push/i)).toBeTruthy();
    expect(queryByText('Sync')).toBeNull();
    await fireEvent.click(getByTitle(/to push/i));
    expect(onPush).toHaveBeenCalledTimes(1);
  });

  it('behind only → a Pull pill with the count, no Sync', async () => {
    const onPull = vi.fn();
    const { getByText, queryByText, getByTitle } = render(StatusBar, {
      branch: 'feature', ahead: 0, behind: 3, onPull,
    });
    expect(getByText('3')).toBeTruthy();
    expect(getByTitle(/to pull/i)).toBeTruthy();
    expect(queryByText('Sync')).toBeNull();
    await fireEvent.click(getByTitle(/to pull/i));
    expect(onPull).toHaveBeenCalledTimes(1);
  });

  it('diverged (ahead AND behind) → Push, Pull, and a Sync pill', async () => {
    const onSync = vi.fn();
    const { getByText, getByTitle } = render(StatusBar, {
      branch: 'feature', ahead: 1, behind: 2, onSync,
    });
    expect(getByTitle(/to push/i)).toBeTruthy();
    expect(getByTitle(/to pull/i)).toBeTruthy();
    expect(getByText('Sync')).toBeTruthy();
    await fireEvent.click(getByText('Sync'));
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it('in sync (0/0) → no action pills at all', () => {
    const { queryByText, queryByTitle } = render(StatusBar, { branch: 'feature', ahead: 0, behind: 0 });
    expect(queryByText('Sync')).toBeNull();
    expect(queryByText('Publish')).toBeNull();
    expect(queryByTitle(/to push/i)).toBeNull();
    expect(queryByTitle(/to pull/i)).toBeNull();
  });
});
