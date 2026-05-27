<script lang="ts">
  export let hasFiles: boolean = false;
  export let stagedCount: number = 0;
  export let error: string = '';

  export let onCommit: (msg: string) => void = () => {};
  export let onCommitPush: (msg: string) => void = () => {};

  let message = '';

  $: canCommit = message.trim().length > 0 && stagedCount > 0;
  $: hintText = !hasFiles
    ? 'No changed files'
    : stagedCount === 0
      ? 'No files staged — check files above to stage'
      : `${stagedCount} file${stagedCount === 1 ? '' : 's'} staged`;

  function handleCommit() {
    const msg = message.trim();
    if (!canCommit) return;
    onCommit(msg);
  }

  function handleCommitPush() {
    const msg = message.trim();
    if (!canCommit) return;
    onCommitPush(msg);
  }
</script>

<div class="commit-area">
  <div class="hint" class:warn={hasFiles && stagedCount === 0}>
    {hintText}
  </div>

  {#if error}
    <div class="error-msg">{error}</div>
  {/if}

  <textarea
    class="commit-input"
    bind:value={message}
    placeholder="Commit message"
    rows={3}
    disabled={!hasFiles}
  ></textarea>

  <div class="btn-row">
    <button class="btn btn-primary" disabled={!canCommit} on:click={handleCommit}> Commit </button>
    <button class="btn btn-secondary" disabled={!canCommit} on:click={handleCommitPush}>
      Commit &amp; Push
    </button>
  </div>
</div>

<style>
  .commit-area {
    flex-shrink: 0;
    border-top: 1px solid var(--vscode-sideBarSectionHeader-border, #3c3c3c);
    background: var(--vscode-sideBar-background, #252526);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Staged file hint line */
  .hint {
    font-size: var(--hg-font-xxs, 10px);
    color: var(--vscode-descriptionForeground, #8c8c8c);
    padding: 0 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .error-msg {
    font-size: var(--hg-font-xxs, 10px);
    color: var(--vscode-errorForeground, #f48771);
    padding: 0 2px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .hint.warn {
    color: var(--vscode-editorWarning-foreground, #cca700);
  }

  .commit-input {
    width: 100%;
    min-height: 52px;
    max-height: 120px;
    background: var(--vscode-input-background, #3c3c3c);
    color: var(--vscode-input-foreground, #cccccc);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    font-family: var(--hg-font-family);
    font-size: var(--hg-font-sm, 12px);
    font-weight: var(--hg-font-weight);
    padding: 6px 8px;
    resize: vertical;
    outline: none;
    line-height: 1.5;
    box-sizing: border-box;
  }
  .commit-input::placeholder {
    color: var(--vscode-input-placeholderForeground, #8c8c8c);
  }
  .commit-input:focus {
    border-color: var(--vscode-focusBorder, #007fd4);
  }
  .commit-input:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .btn-row {
    display: flex;
    gap: 6px;
  }

  .btn {
    flex: 1;
    height: 26px;
    border-radius: 2px;
    font-size: var(--hg-font-sm, 12px);
    font-family: var(--hg-font-family);
    font-weight: var(--hg-font-weight);
    cursor: pointer;
    border: 1px solid transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    transition:
      background 0.1s,
      opacity 0.1s;
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .btn-primary {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
    border-color: var(--vscode-button-background, #0e639c);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }

  .btn-secondary {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
    border-color: var(--vscode-button-background, #0e639c);
    font-size: var(--hg-font-xs, 11px);
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }
</style>
