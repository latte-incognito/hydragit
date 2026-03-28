<script lang="ts">
  export let title: string
  export let count: number | null = null
  export let open: boolean = true

  export let onToggle: () => void = () => {}
  export let onRefresh: (e: MouseEvent) => void = () => {}
</script>

<div class="section-header" on:click={onToggle} role="button" tabindex="0"
  on:keydown={e => e.key === 'Enter' && onToggle()}>

  <span class="arrow" class:collapsed={!open}>▾</span>
  <span class="title">{title}</span>

  {#if count !== null}
    <span class="count">{count}</span>
  {/if}

  <span
    class="action"
    title="Refresh"
    on:click={onRefresh}
    role="button"
    tabindex="0"
    on:keydown={e => e.key === 'Enter' && onRefresh(e as unknown as MouseEvent)}
  >↺</span>
</div>

<style>
  .section-header {
    display: flex;
    align-items: center;
    padding: 6px 12px 6px 8px;
    gap: 6px;
    font-size: var(--hg-font-xs);
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
    font-size: var(--hg-font-xxs);
    color: var(--vscode-foreground, #cccccc);
    transition: transform 0.15s;
    flex-shrink: 0;
  }
  .arrow.collapsed { transform: rotate(-90deg); }

  .title { /* inherits section-header styles */ }

  .count {
    margin-left: auto;
    font-size: var(--hg-font-xxs);
    font-weight: 400;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    letter-spacing: 0;
    text-transform: none;
  }

  .action {
    font-size: var(--hg-font-lg);
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
