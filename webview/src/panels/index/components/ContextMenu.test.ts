import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ContextMenu from './ContextMenu.svelte';

// ── Branch context menu ──────────────────────────────────────────────────────

describe('ContextMenu — branch', () => {
  const baseBranchMenu = {
    visible: true, x: 100, y: 100,
    branch: 'feature/auth', isCurrent: false, current: 'main',
  };

  it('renders all branch menu items', () => {
    const { getByText } = render(ContextMenu, { branchMenu: baseBranchMenu });
    expect(getByText('Checkout')).toBeTruthy();
    expect(getByText("New Branch from 'feature/auth'…")).toBeTruthy();
    expect(getByText("Checkout and Rebase onto 'main'")).toBeTruthy();
    expect(getByText("Compare with 'main'")).toBeTruthy();
    expect(getByText('Show Diff with Working Tree')).toBeTruthy();
    expect(getByText("Rebase 'main' onto 'feature/auth'")).toBeTruthy();
    expect(getByText("Merge 'feature/auth' into 'main'")).toBeTruthy();
    expect(getByText("Pull into 'main' Using Rebase")).toBeTruthy();
    expect(getByText("Pull into 'main' Using Merge")).toBeTruthy();
    expect(getByText('Delete')).toBeTruthy();
  });

  it('calls onBranchAction with checkout', async () => {
    const onBranchAction = vi.fn();
    const { getByText } = render(ContextMenu, { branchMenu: baseBranchMenu, onBranchAction });
    await fireEvent.click(getByText('Checkout'));
    expect(onBranchAction).toHaveBeenCalledWith('checkout');
  });

  it('calls onBranchAction with merge', async () => {
    const onBranchAction = vi.fn();
    const { getByText } = render(ContextMenu, { branchMenu: baseBranchMenu, onBranchAction });
    await fireEvent.click(getByText("Merge 'feature/auth' into 'main'"));
    expect(onBranchAction).toHaveBeenCalledWith('merge');
  });

  it('calls onBranchAction with delete', async () => {
    const onBranchAction = vi.fn();
    const { getByText } = render(ContextMenu, { branchMenu: baseBranchMenu, onBranchAction });
    await fireEvent.click(getByText('Delete'));
    expect(onBranchAction).toHaveBeenCalledWith('delete');
  });

  it('disables checkout/rebase/merge/delete when isCurrent', () => {
    const menu = { ...baseBranchMenu, isCurrent: true };
    const { getByText } = render(ContextMenu, { branchMenu: menu });
    expect(getByText('Checkout').classList.contains('disabled')).toBe(true);
    expect(getByText('Delete').classList.contains('disabled')).toBe(true);
    expect(getByText("Checkout and Rebase onto 'main'").classList.contains('disabled')).toBe(true);
    expect(getByText("Rebase 'main' onto 'feature/auth'").classList.contains('disabled')).toBe(true);
    expect(getByText("Merge 'feature/auth' into 'main'").classList.contains('disabled')).toBe(true);
  });

  it('does not render when visible is false', () => {
    const menu = { ...baseBranchMenu, visible: false };
    const { queryByText } = render(ContextMenu, { branchMenu: menu });
    expect(queryByText('Checkout')).toBeFalsy();
  });
});

// ── Stash context menu ───────────────────────────────────────────────────────

describe('ContextMenu — stash', () => {
  const baseStashMenu = { visible: true, x: 100, y: 100, label: 'stash@{0}' };

  it('renders all stash menu items', () => {
    const { getByText } = render(ContextMenu, { stashMenu: baseStashMenu });
    expect(getByText('Pop')).toBeTruthy();
    expect(getByText('Apply')).toBeTruthy();
    expect(getByText('Unstash…')).toBeTruthy();
    expect(getByText('Drop')).toBeTruthy();
    expect(getByText('Clear')).toBeTruthy();
    expect(getByText('Show Diff')).toBeTruthy();
    expect(getByText('Show Diff in a New Tab')).toBeTruthy();
  });

  it('calls onStashAction with pop', async () => {
    const onStashAction = vi.fn();
    const { getByText } = render(ContextMenu, { stashMenu: baseStashMenu, onStashAction });
    await fireEvent.click(getByText('Pop'));
    expect(onStashAction).toHaveBeenCalledWith('pop');
  });

  it('calls onStashAction with apply', async () => {
    const onStashAction = vi.fn();
    const { getByText } = render(ContextMenu, { stashMenu: baseStashMenu, onStashAction });
    await fireEvent.click(getByText('Apply'));
    expect(onStashAction).toHaveBeenCalledWith('apply');
  });

  it('calls onStashAction with drop', async () => {
    const onStashAction = vi.fn();
    const { getByText } = render(ContextMenu, { stashMenu: baseStashMenu, onStashAction });
    await fireEvent.click(getByText('Drop'));
    expect(onStashAction).toHaveBeenCalledWith('drop');
  });

  it('calls onStashAction with clear', async () => {
    const onStashAction = vi.fn();
    const { getByText } = render(ContextMenu, { stashMenu: baseStashMenu, onStashAction });
    await fireEvent.click(getByText('Clear'));
    expect(onStashAction).toHaveBeenCalledWith('clear');
  });

  it('calls onStashAction with show-diff', async () => {
    const onStashAction = vi.fn();
    const { getByText } = render(ContextMenu, { stashMenu: baseStashMenu, onStashAction });
    await fireEvent.click(getByText('Show Diff'));
    expect(onStashAction).toHaveBeenCalledWith('show-diff');
  });

  it('does not render when visible is false', () => {
    const menu = { ...baseStashMenu, visible: false };
    const { queryByText } = render(ContextMenu, { stashMenu: menu });
    expect(queryByText('Pop')).toBeFalsy();
  });
});

// ── Tag context menu ─────────────────────────────────────────────────────────

describe('ContextMenu — tag', () => {
  const baseTagMenu = { visible: true, x: 100, y: 100, name: 'v1.0.0', current: 'main' };

  it('renders all tag menu items', () => {
    const { getByText } = render(ContextMenu, { tagMenu: baseTagMenu });
    expect(getByText('Checkout')).toBeTruthy();
    expect(getByText('Show Diff with Working Tree')).toBeTruthy();
    expect(getByText("Merge 'v1.0.0' into 'main'")).toBeTruthy();
    expect(getByText('Push to origin')).toBeTruthy();
    expect(getByText('Delete')).toBeTruthy();
  });

  it('calls onTagAction with checkout', async () => {
    const onTagAction = vi.fn();
    const { getByText } = render(ContextMenu, { tagMenu: baseTagMenu, onTagAction });
    await fireEvent.click(getByText('Checkout'));
    expect(onTagAction).toHaveBeenCalledWith('checkout');
  });

  it('calls onTagAction with merge', async () => {
    const onTagAction = vi.fn();
    const { getByText } = render(ContextMenu, { tagMenu: baseTagMenu, onTagAction });
    await fireEvent.click(getByText("Merge 'v1.0.0' into 'main'"));
    expect(onTagAction).toHaveBeenCalledWith('merge');
  });

  it('calls onTagAction with push', async () => {
    const onTagAction = vi.fn();
    const { getByText } = render(ContextMenu, { tagMenu: baseTagMenu, onTagAction });
    await fireEvent.click(getByText('Push to origin'));
    expect(onTagAction).toHaveBeenCalledWith('push');
  });

  it('calls onTagAction with delete', async () => {
    const onTagAction = vi.fn();
    const { getByText } = render(ContextMenu, { tagMenu: baseTagMenu, onTagAction });
    await fireEvent.click(getByText('Delete'));
    expect(onTagAction).toHaveBeenCalledWith('delete');
  });

  it('shows dynamic branch name in merge label', () => {
    const menu = { ...baseTagMenu, current: 'develop' };
    const { getByText } = render(ContextMenu, { tagMenu: menu });
    expect(getByText("Merge 'v1.0.0' into 'develop'")).toBeTruthy();
  });

  it('does not render when visible is false', () => {
    const menu = { ...baseTagMenu, visible: false };
    const { queryByText } = render(ContextMenu, { tagMenu: menu });
    expect(queryByText('Checkout')).toBeFalsy();
  });
});
