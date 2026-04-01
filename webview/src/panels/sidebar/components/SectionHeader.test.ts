import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SectionHeader from './SectionHeader.svelte';

// ── rendering ─────────────────────────────────────────────────────────────────

describe('SectionHeader — rendering', () => {
  it('renders title', () => {
    const { getByText } = render(SectionHeader, { title: 'Changes' });
    expect(getByText('Changes')).toBeTruthy();
  });

  it('renders count when provided', () => {
    const { getByText } = render(SectionHeader, { title: 'Changes', count: 4 });
    expect(getByText('4')).toBeTruthy();
  });

  it('does not render count when null', () => {
    const { queryByText } = render(SectionHeader, { title: 'Changes', count: null });
    expect(queryByText('0')).toBeNull();
  });

  it('shows checkbox when count > 0', () => {
    const { getByLabelText } = render(SectionHeader, { title: 'Changes', count: 2 });
    expect(getByLabelText('Stage all files')).toBeTruthy();
  });

  it('does not show checkbox when count is 0', () => {
    const { queryByLabelText } = render(SectionHeader, { title: 'Changes', count: 0 });
    expect(queryByLabelText('Stage all files')).toBeNull();
  });

  it('renders refresh button', () => {
    const { getByText } = render(SectionHeader, { title: 'Changes' });
    expect(getByText('↺')).toBeTruthy();
  });
});

// ── toggle ────────────────────────────────────────────────────────────────────

describe('SectionHeader — toggle', () => {
  it('calls onToggle when header is clicked', async () => {
    const onToggle = vi.fn();
    const { getByText } = render(SectionHeader, { title: 'Changes', onToggle });

    await fireEvent.click(getByText('Changes'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('calls onToggle on Enter keydown', async () => {
    const onToggle = vi.fn();
    const { getByText } = render(SectionHeader, { title: 'Changes', onToggle });

    await fireEvent.keyDown(getByText('Changes').closest('[role="button"]')!, { key: 'Enter' });
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

// ── checkbox ──────────────────────────────────────────────────────────────────

describe('SectionHeader — master checkbox', () => {
  it('calls onToggleAll with true when checked', async () => {
    const onToggleAll = vi.fn();
    const { getByLabelText } = render(SectionHeader, {
      title: 'Changes',
      count: 3,
      allStaged: false,
      onToggleAll,
    });

    await fireEvent.change(getByLabelText('Stage all files'), { target: { checked: true } });
    expect(onToggleAll).toHaveBeenCalledWith(true);
  });

  it('calls onToggleAll with false when unchecked', async () => {
    const onToggleAll = vi.fn();
    const { getByLabelText } = render(SectionHeader, {
      title: 'Changes',
      count: 3,
      allStaged: true,
      onToggleAll,
    });

    await fireEvent.change(getByLabelText('Stage all files'), { target: { checked: false } });
    expect(onToggleAll).toHaveBeenCalledWith(false);
  });
});

// ── refresh ───────────────────────────────────────────────────────────────────

describe('SectionHeader — refresh', () => {
  it('calls onRefresh when refresh button clicked', async () => {
    const onRefresh = vi.fn();
    const { getByText } = render(SectionHeader, { title: 'Changes', onRefresh });

    await fireEvent.click(getByText('↺'));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
