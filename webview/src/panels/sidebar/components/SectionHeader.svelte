<script lang="ts">
  interface Props {
    title: string;
    count?: number | null;
    open?: boolean;
    allStaged?: boolean;
    someStaged?: boolean;
    onToggle?: () => void;
    onRefresh?: (e: MouseEvent) => void;
    onToggleAll?: (stage: boolean) => void;
    onExpandAll?: () => void;
    onCollapseAll?: () => void;
  }

  let {
    title,
    count = null,
    open = true,
    allStaged = false,
    someStaged = false,
    onToggle = () => {},
    onRefresh = () => {},
    onToggleAll = () => {},
    onExpandAll = () => {},
    onCollapseAll = () => {}
  }: Props = $props();

  let indeterminate = $derived(someStaged && !allStaged);

  function handleCheckbox(e: Event) {
    e.stopPropagation();
    onToggleAll((e.target as HTMLInputElement).checked);
  }

  // bind:indeterminate via action (Svelte 5 compatible)
  function indeterminateAction(node: HTMLInputElement, value: boolean) {
    node.indeterminate = value;
    return { update(v: boolean) { node.indeterminate = v; } };
  }
</script>

<div
  class="section-header"
  onclick={onToggle}
  role="button"
  tabindex="0"
  onkeydown={(e) => e.key === 'Enter' && onToggle()}
>
  <span class="arrow" class:collapsed={!open}>▾</span>
  <span class="title">{title}</span>

  {#if count !== null}
    <span class="count">{count}</span>
  {/if}

  <!-- Expand / collapse all tree folders -->
  {#if count !== null && count > 0}
    <span
      class="action"
      title="Expand all"
      role="button"
      tabindex="0"
      onclick={(e) => { e.stopPropagation(); onExpandAll(); }}
      onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') onExpandAll(); }}
    >
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
        <path d="M2 3h8M2 6h8M2 9h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    </span>
    <span
      class="action"
      title="Collapse all"
      role="button"
      tabindex="0"
      onclick={(e) => { e.stopPropagation(); onCollapseAll(); }}
      onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') onCollapseAll(); }}
    >
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
        <path d="M2 6h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    </span>
  {/if}

  <!-- Master stage checkbox -->
  {#if count !== null && count > 0}
    <input
      type="checkbox"
      class="hg-checkbox"
      checked={allStaged}
      use:indeterminateAction={indeterminate}
      aria-label="Stage all files"
      onchange={handleCheckbox}
      onclick={(e) => e.stopPropagation()}
    />
  {/if}

  <span
    class="action"
    title="Refresh"
    onclick={onRefresh}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === 'Enter' && onRefresh(e as unknown as MouseEvent)}
  >↺</span>
</div>

<style>
  .section-header {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    gap: 4px;
    height: 22px;
    font-size: var(--hg-font-xs, 11px);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--vscode-sideBarSectionHeader-foreground, #bbbbbe);
    background: var(--vscode-sideBarSectionHeader-background, #252526);
    border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, transparent);
    flex-shrink: 0;
    cursor: pointer;
    user-select: none;
  }
  .section-header:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }

  .arrow {
    font-size: var(--hg-font-xxs, 10px);
    color: var(--vscode-foreground, #cccccc);
    transition: transform 0.15s;
    flex-shrink: 0;
  }
  .arrow.collapsed { transform: rotate(-90deg); }

  .count {
    font-size: var(--hg-font-xxs, 10px);
    font-weight: 400;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    letter-spacing: 0;
    text-transform: none;
    margin-right: auto;
  }

  .action {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--hg-font-lg, 14px);
    color: var(--vscode-descriptionForeground, #8c8c8c);
    cursor: pointer;
    padding: 2px 3px;
    border-radius: 3px;
    line-height: 1;
    flex-shrink: 0;
  }
  .action:hover {
    color: var(--vscode-foreground, #cccccc);
    background: var(--vscode-toolbar-hoverBackground, #3a3a3a);
  }

  .hg-checkbox {
    appearance: none;
    -webkit-appearance: none;
    width: 13px; height: 13px; min-width: 13px;
    border: 1px solid var(--vscode-checkbox-border, #6b6b6b);
    border-radius: 2px;
    background: var(--vscode-checkbox-background, #3c3c3c);
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.1s, border-color 0.1s;
  }
  .hg-checkbox:checked,
  .hg-checkbox:indeterminate {
    background: var(--vscode-checkbox-selectBackground, #0078d4);
    border-color: var(--vscode-checkbox-selectBackground, #0078d4);
  }
  .hg-checkbox:checked::after {
    content: '';
    position: absolute;
    left: 2px; top: 1px;
    width: 5px; height: 8px;
    border: 1.5px solid #fff;
    border-top: none; border-left: none;
    transform: rotate(45deg) scaleY(0.85);
  }
  .hg-checkbox:indeterminate::after {
    content: '';
    position: absolute;
    left: 2px; top: 5px;
    width: 7px; height: 1.5px;
    background: #fff;
    border: none; transform: none;
  }
  .hg-checkbox:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: 1px;
  }
</style>
