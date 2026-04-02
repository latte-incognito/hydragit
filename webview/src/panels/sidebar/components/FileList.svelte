<script lang="ts">
  import type { GitFile } from '../types';

  export let files: GitFile[] = [];
  export let stagedPaths: Set<string> = new Set();
  export let selectedIndex: number | null = null;
  export let loading: boolean = false;

  export let onSelect: (i: number) => void = () => {};
  export let onToggleStage: (path: string) => void = () => {};

  $: allStaged = files.length > 0 && files.every((f) => stagedPaths.has(f.path));
  $: someStaged = files.some((f) => stagedPaths.has(f.path));
  $: indeterminate = someStaged && !allStaged;

  function baseName(path: string): string {
    return path.split('/').pop() ?? path;
  }
  function dirName(path: string): string {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/');
  }
</script>

<div class="file-list" role="listbox" aria-label="Changed files">
  {#if loading}
    <div class="state-msg">
      <span class="spinner" aria-hidden="true"></span>Loading…
    </div>
  {:else if files.length === 0}
    <div class="state-msg empty">No changes · working tree clean</div>
  {:else}
    <!-- File rows -->
    {#each files as file, i}
      {@const st = (file.status ?? 'M').toUpperCase().charAt(0)}
      {@const name = baseName(file.path)}
      {@const dir = dirName(file.path)}
      {@const staged = stagedPaths.has(file.path)}

      <div
        class="file-row"
        class:selected={selectedIndex === i}
        on:click={() => onSelect(i)}
        role="option"
        aria-selected={selectedIndex === i}
        tabindex="0"
        on:keydown={(e) => e.key === 'Enter' && onSelect(i)}
      >
        <!-- Checkbox -->
        <input
          type="checkbox"
          class="hg-checkbox"
          checked={staged}
          aria-label="Stage {name}"
          on:change|stopPropagation={() => onToggleStage(file.path)}
          on:click|stopPropagation
        />

        <!-- Status badge -->
        <span class="file-status st-{st}" aria-label="Status: {st}">{st}</span>

        <!-- Filename — baseName only, never sliced -->
        <span class="file-name st-{st}">{name}</span>

        <!-- Directory suffix -->
        {#if dir}
          <span class="file-dir">{dir}</span>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .file-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
  }

  /* ── Checkbox ─────────────────────────────────────── */
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

  .hg-checkbox:checked {
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

  /* indeterminate dash */
  .hg-checkbox:indeterminate {
    background: var(--vscode-checkbox-selectBackground, #0078d4);
    border-color: var(--vscode-checkbox-selectBackground, #0078d4);
  }
  .hg-checkbox:indeterminate::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 5px;
    width: 7px;
    height: 1.5px;
    background: #fff;
    transform: none;
    border: none;
  }

  .hg-checkbox:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: 1px;
  }

  /* ── File row ─────────────────────────────────────── */
  .file-row {
    display: flex;
    align-items: center;
    height: 22px;
    padding: 0 8px 0 8px;
    gap: 6px;
    cursor: pointer;
    font-size: var(--hg-font-sm, 12px);
    color: var(--vscode-foreground, #cccccc);
    white-space: nowrap;
    overflow: hidden;
  }

  .file-row:hover {
    background: var(--vscode-list-hoverBackground, #2a2d2e);
  }

  .file-row.selected {
    background: var(--vscode-list-activeSelectionBackground, #094771);
    color: var(--vscode-list-activeSelectionForeground, #ffffff);
  }

  /* ── Status letter ────────────────────────────────── */
  .file-status {
    font-size: var(--hg-font-xxs, 10px);
    font-weight: 700;
    width: 12px;
    text-align: center;
    flex-shrink: 0;
  }

  .st-M {
    color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d);
  }
  .st-A {
    color: var(--vscode-gitDecoration-addedResourceForeground, #81b88b);
  }
  .st-D {
    color: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39);
  }
  .st-U {
    color: var(--vscode-gitDecoration-untrackedResourceForeground, #73c991);
  }
  .st-R {
    color: var(--vscode-gitDecoration-renamedResourceForeground, #73c991);
  }
  .st-C {
    color: #73c991;
  }
  .st-T {
    color: #e2c08d;
  }

  /* ── Filename ─────────────────────────────────────── */
  .file-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: var(--hg-font-sm, 12px);
  }

  /* Inherit git color on filename too */
  .file-name.st-M {
    color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d);
  }
  .file-name.st-A {
    color: var(--vscode-gitDecoration-addedResourceForeground, #81b88b);
  }
  .file-name.st-D {
    color: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39);
  }
  .file-name.st-U {
    color: var(--vscode-gitDecoration-untrackedResourceForeground, #73c991);
  }

  /* ── Directory ────────────────────────────────────── */
  .file-dir {
    font-size: var(--hg-font-xxs, 10px);
    color: var(--vscode-descriptionForeground, #8c8c8c);
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
  }

  /* ── States ───────────────────────────────────────── */
  .state-msg {
    padding: 20px 16px;
    font-size: var(--hg-font-sm, 12px);
    color: var(--vscode-descriptionForeground, #8c8c8c);
    text-align: center;
  }
  .state-msg.empty {
    font-size: var(--hg-font-xs, 11px);
  }

  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1.5px solid var(--vscode-descriptionForeground, #8c8c8c);
    border-top-color: transparent;
    border-radius: 50%;
    animation: hg-spin 0.6s linear infinite;
    vertical-align: middle;
    margin-right: 6px;
  }

  @keyframes hg-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
