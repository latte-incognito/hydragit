<script lang="ts">
  export let hasFiles: boolean = false
  export let onCommit:     (msg: string) => void = () => {}
  export let onCommitPush: (msg: string) => void = () => {}

  let message = ''
  $: canCommit = message.trim().length > 0 && hasFiles
</script>

<div class="commit-area">
  <textarea
    class="commit-input"
    bind:value={message}
    placeholder="Commit message"
    rows={3}
  ></textarea>

  <div class="btn-row">
    <button
      class="btn btn-primary"
      disabled={!canCommit}
      on:click={() => onCommit(message.trim())}
    >
      Commit
    </button>
    <button
      class="btn btn-secondary"
      disabled={!canCommit}
      on:click={() => onCommitPush(message.trim())}
    >
      Commit &amp; Push
    </button>
  </div>
</div>

<style>
  .commit-area {
    flex-shrink: 0;
    border-top:  1px solid var(--vscode-sideBarSectionHeader-border, #3c3c3c);
    background:  var(--vscode-sideBar-background, #252526);
    padding:     8px;
    display:     flex;
    flex-direction: column;
    gap:         6px;
  }

  .commit-input {
    width:       100%;
    min-height:  52px;
    max-height:  100px;
    background:  var(--vscode-input-background, #3c3c3c);
    color:       var(--vscode-input-foreground, #cccccc);
    border:      1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    font-family: var(--hg-font-family);
    font-size:   var(--hg-font-sm);
    font-weight: var(--hg-font-weight);
    padding:     6px 8px;
    resize:      vertical;
    outline:     none;
    line-height: 1.5;
  }
  .commit-input::placeholder { color: var(--vscode-input-placeholderForeground, #8c8c8c); }
  .commit-input:focus        { border-color: var(--vscode-focusBorder, #007fd4); }

  .btn-row {
    display: flex;
    gap:     6px;
  }

  .btn {
    flex:        1;
    height:      26px;
    border-radius: 2px;
    font-size:   var(--hg-font-sm);
    font-family: var(--hg-font-family);
    font-weight: var(--hg-font-weight);
    cursor:      pointer;
    border:      1px solid transparent;
    display:     flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    transition:  background 0.1s, opacity 0.1s;
  }
  .btn:disabled { opacity: 0.4; cursor: default; }

  .btn-primary {
    background:  var(--vscode-button-background, #0e639c);
    color:       var(--vscode-button-foreground, #ffffff);
    border-color: var(--vscode-button-background, #0e639c);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }

  .btn-secondary {
    background:  var(--vscode-button-secondaryBackground, #3a3d41);
    color:       var(--vscode-button-secondaryForeground, #cccccc);
    border-color: var(--vscode-button-secondaryBackground, #3a3d41);
    font-size:   var(--hg-font-xs);
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground, #44474a);
  }
</style>
