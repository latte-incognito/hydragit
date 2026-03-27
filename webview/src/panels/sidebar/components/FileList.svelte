<script lang="ts">
  import type { GitFile } from '../types'

  export let files: GitFile[] = []
  export let selectedIndex: number | null = null
  export let loading: boolean = false

  export let onSelect: (i: number) => void = () => {}

  function baseName(path: string) {
    return path.split('/').pop() ?? path
  }
  function dirName(path: string) {
    const parts = path.split('/')
    parts.pop()
    return parts.join('/')
  }
</script>

<div class="file-list">
  {#if loading}
    <div class="loading">
      <span class="spinner" aria-hidden="true"></span>Loading…
    </div>

  {:else if files.length === 0}
    <div class="empty-state">
      No changes<br />
      <span>Working tree clean</span>
    </div>

  {:else}
    {#each files as file, i}
      {@const st = (file.status ?? 'M').toUpperCase()}
      {@const name = baseName(file.path)}
      {@const dir = dirName(file.path)}

      <div
        class="file-row"
        class:selected={selectedIndex === i}
        on:click={() => onSelect(i)}
        role="option"
        aria-selected={selectedIndex === i}
        tabindex="0"
        on:keydown={e => e.key === 'Enter' && onSelect(i)}
      >
        <span class="file-status {st}">{st}</span>
        <span class="file-name {st}">{name}</span>
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
    min-height: 40px;
  }

  .file-row {
    display: flex;
    align-items: center;
    height: 22px;
    padding: 0 8px 0 28px;
    gap: 6px;
    cursor: pointer;
    font-size: var(--hg-font-sm);
    color: var(--vscode-foreground, #cccccc);
    white-space: nowrap;
    overflow: hidden;
  }
  .file-row:hover    { background: var(--vscode-list-hoverBackground, #2a2d2e); }
  .file-row.selected {
    background: var(--vscode-list-activeSelectionBackground, #094771);
    color:      var(--vscode-list-activeSelectionForeground, #ffffff);
  }

  .file-status {
    font-size:   var(--hg-font-xxs);
    font-weight: 700;
    width:       14px;
    text-align:  center;
    flex-shrink: 0;
    letter-spacing: 0;
  }
  .file-status.M { color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d); }
  .file-status.A { color: var(--vscode-gitDecoration-addedResourceForeground,    #81b88b); }
  .file-status.D { color: var(--vscode-gitDecoration-deletedResourceForeground,  #c74e39); }
  .file-status.U { color: var(--vscode-gitDecoration-untrackedResourceForeground,#73c991); }
  .file-status.R { color: var(--vscode-gitDecoration-renamedResourceForeground,  #73c991); }
  .file-status.C { color: #73c991; }
  .file-status.T { color: #e2c08d; }

  .file-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: var(--hg-font-sm);
  }
  .file-name.M { color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d); }
  .file-name.A { color: var(--vscode-gitDecoration-addedResourceForeground,    #81b88b); }
  .file-name.D { color: var(--vscode-gitDecoration-deletedResourceForeground,  #c74e39); }
  .file-name.U { color: var(--vscode-gitDecoration-untrackedResourceForeground,#73c991); }

  .file-dir {
    font-size:     var(--hg-font-xxs);
    color:         var(--vscode-descriptionForeground, #8c8c8c);
    overflow:      hidden;
    text-overflow: ellipsis;
    flex-shrink:   1;
    min-width:     0;
  }

  .empty-state {
    padding:     20px 16px;
    font-size:   var(--hg-font-sm);
    color:       var(--vscode-descriptionForeground, #8c8c8c);
    text-align:  center;
    line-height: 1.6;
  }
  .empty-state span { font-size: var(--hg-font-xxs); }

  .loading {
    padding:    16px;
    font-size:  var(--hg-font-xs);
    color:      var(--vscode-descriptionForeground, #8c8c8c);
    text-align: center;
  }
  .spinner {
    display:       inline-block;
    width:         12px;
    height:        12px;
    border:        1.5px solid var(--vscode-descriptionForeground, #8c8c8c);
    border-top-color: transparent;
    border-radius: 50%;
    animation:     hg-spin 0.6s linear infinite;
    vertical-align: middle;
    margin-right:  6px;
  }
</style>
