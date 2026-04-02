<script lang="ts">
  export let repoName: string = 'HydraGit';
  export let iconUri: string = '';
  export let onAction: (a: string) => void = () => {};
  export let onSearch: (q: string) => void = () => {};
</script>

<div class="toolbar">
  {#if iconUri}
    <img class="tb-logo" src={iconUri} alt="HydraGit" />
  {/if}
  <span class="tb-title">{repoName}</span>
  <div class="tb-sep"></div>
  <button class="tb-btn" on:click={() => onAction('fetch')}>↓ Fetch</button>
  <button class="tb-btn primary" on:click={() => onAction('pull')}>⇣ Pull</button>
  <button class="tb-btn" on:click={() => onAction('push')}>⇡ Push</button>
  <input
    class="tb-search"
    type="text"
    placeholder="Search commits…"
    on:input={(e) => onSearch((e.target as HTMLInputElement).value)}
  />
</div>

<style>
  .toolbar {
    background: var(--vscode-editorGroupHeader-tabsBackground, #2d2d2d);
    height: 34px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    gap: 6px;
    border-bottom: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    flex-shrink: 0;
  }
  .tb-logo {
    width: 15px;
    height: 15px;
    border-radius: 2px;
    object-fit: cover;
  }
  .tb-sep {
    width: 0.5px;
    height: 16px;
    background: var(--vscode-widget-border, #3a3a3a);
    margin: 0 2px;
  }
  .tb-title {
    font-size: var(--hg-font-sm);
    color: var(--vscode-descriptionForeground, #555);
    margin-left: 4px;
  }

  .tb-btn {
    font-size: var(--hg-font-xs);
    padding: 2px 8px;
    border-radius: 3px;
    border: 0.5px solid var(--vscode-widget-border, #3a3a3a);
    background: var(--vscode-sideBar-background, #252526);
    color: var(--vscode-descriptionForeground, #888);
    cursor: pointer;
    white-space: nowrap;
    font-family: var(--hg-font-family);
  }
  .tb-btn:hover {
    background: var(--vscode-list-hoverBackground, #2a2a2a);
    color: var(--vscode-foreground, #ccc);
  }
  .tb-btn.primary {
    background: #0e5a7c;
    border-color: #1a8ab0;
    color: #56c8e8;
  }
  .tb-btn.primary:hover {
    background: #1a6a8c;
  }

  .tb-search {
    flex: 1;
    max-width: 200px;
    background: var(--vscode-input-background, #1a1a1a);
    border: 0.5px solid var(--vscode-input-border, #333);
    border-radius: 3px;
    color: var(--vscode-input-foreground, #ccc);
    font-size: var(--hg-font-xs);
    padding: 2px 7px;
    outline: none;
    margin-left: auto;
    font-family: var(--hg-font-family);
  }
  .tb-search:focus {
    border-color: #56c8e8;
  }
</style>
