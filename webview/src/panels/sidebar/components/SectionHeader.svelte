<script lang="ts">
  export let title: string;
  export let count: number | null = null;
  export let open: boolean = true;

  // Master checkbox state — passed in from parent which owns stagedPaths
  export let allStaged: boolean = false;
  export let someStaged: boolean = false;

  export let onToggle: () => void = () => {};
  export let onRefresh: (e: MouseEvent) => void = () => {};
  export let onToggleAll: (stage: boolean) => void = () => {};

  $: indeterminate = someStaged && !allStaged;

  function handleCheckbox(e: Event) {
    e.stopPropagation();
    const checked = (e.target as HTMLInputElement).checked;
    onToggleAll(checked);
  }

  function handleCheckboxClick(e: MouseEvent) {
    e.stopPropagation();
  }
</script>

<div
  class="section-header"
  on:click={onToggle}
  role="button"
  tabindex="0"
  on:keydown={(e) => e.key === 'Enter' && onToggle()}
>
  <span class="arrow" class:collapsed={!open}>▾</span>
  <span class="title">{title}</span>

  {#if count !== null}
    <span class="count">{count}</span>
  {/if}

  <!-- Master checkbox: stage / unstage all -->
  {#if count !== null && count > 0}
    <input
      type="checkbox"
      class="hg-checkbox"
      checked={allStaged}
      bind:indeterminate
      aria-label="Stage all files"
      on:change={handleCheckbox}
      on:click={handleCheckboxClick}
    />
  {/if}

  <span
    class="action"
    title="Refresh"
    on:click={onRefresh}
    role="button"
    tabindex="0"
    on:keydown={(e) => e.key === 'Enter' && onRefresh(e as unknown as MouseEvent)}>↺</span
  >
</div>

<style>
  .section-header {
    display: flex;
    align-items: center;
    padding: 6px 8px 6px 8px;
    gap: 6px;
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
  .section-header:hover {
    background: var(--vscode-list-hoverBackground, #2a2d2e);
  }

  .arrow {
    font-size: var(--hg-font-xxs, 10px);
    color: var(--vscode-foreground, #cccccc);
    transition: transform 0.15s;
    flex-shrink: 0;
  }
  .arrow.collapsed {
    transform: rotate(-90deg);
  }

  .title {
    /* inherits section-header styles */
  }

  .count {
    margin-left: auto;
    font-size: var(--hg-font-xxs, 10px);
    font-weight: 400;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    letter-spacing: 0;
    text-transform: none;
  }

  /* Push checkbox+refresh to the right when there's no count */
  .hg-checkbox {
    margin-left: auto;
  }
  .count + .hg-checkbox {
    margin-left: 0;
  }

  .hg-checkbox {
    appearance: none;
    -webkit-appearance: none;
    width: 13px;
    height: 13px;
    min-width: 13px;
    border: 1px solid var(--vscode-checkbox-border, #6b6b6b);
    border-radius: 2px;
    background: var(--vscode-checkbox-background, #3c3c3c);
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background 0.1s,
      border-color 0.1s;
  }

  .hg-checkbox:checked,
  .hg-checkbox:indeterminate {
    background: var(--vscode-checkbox-selectBackground, #0078d4);
    border-color: var(--vscode-checkbox-selectBackground, #0078d4);
  }

  .hg-checkbox:checked::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 1px;
    width: 5px;
    height: 8px;
    border: 1.5px solid #fff;
    border-top: none;
    border-left: none;
    transform: rotate(45deg) scaleY(0.85);
  }

  .hg-checkbox:indeterminate::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 5px;
    width: 7px;
    height: 1.5px;
    background: #fff;
    border: none;
    transform: none;
  }

  .hg-checkbox:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: 1px;
  }

  .action {
    font-size: var(--hg-font-lg, 14px);
    color: var(--vscode-descriptionForeground, #8c8c8c);
    cursor: pointer;
    padding: 0 2px;
    border-radius: 3px;
    line-height: 1;
  }
  .action:hover {
    color: var(--vscode-foreground, #cccccc);
    background: var(--vscode-toolbar-hoverBackground, #3a3a3a);
  }
</style>
