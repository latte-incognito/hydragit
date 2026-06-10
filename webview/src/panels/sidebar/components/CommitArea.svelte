<script lang="ts">
  import { send } from '$shared/messageBus';


  interface Props {
    hasFiles?: boolean;
    stagedCount?: number;
    hasUpstream?: boolean;
    branch?: string;
    error?: string;
    onCommit?: (msg: string) => void;
    onCommitPush?: (msg: string) => void;
    onAmend?: (msg: string) => void;
  }

  let {
    hasFiles = false,
    stagedCount = 0,
    hasUpstream = false,
    branch = '',
    error = '',
    onCommit = () => {},
    onCommitPush = () => {},
    onAmend = () => {}
  }: Props = $props();

  let message = $state('');
  // Amend mode rewrites HEAD: edit its message and/or fold staged changes in.
  let amend = $state(false);

  // In amend mode you can commit with just a message (staging is optional).
  let canCommit = $derived(message.trim().length > 0 && (amend || stagedCount > 0));
  let reason = $derived(!hasFiles
    ? 'No changes'
    : stagedCount === 0
      ? 'Stage files to commit'
      : `${stagedCount} file${stagedCount === 1 ? '' : 's'} staged`);

  async function toggleAmend() {
    amend = !amend;
    // Prefill the input with HEAD's message so the user can edit it.
    if (amend && !message.trim()) {
      try {
        message = ((await send<string>('commit.lastMessage')) ?? '').trim();
      } catch { /* non-fatal */ }
    }
  }

  function handleCommit() {
    const msg = message.trim();
    if (!canCommit) return;
    if (amend) onAmend(msg);
    else onCommit(msg);
  }

  function handleCommitPush() {
    const msg = message.trim();
    if (!canCommit) return;
    onCommitPush(msg);
  }

  export function clearMessage() { message = ''; amend = false; }
</script>

<div class="commit-area">
  {#if error}
    <div class="error-msg">{error}</div>
  {/if}

  <textarea
    class="commit-input"
    bind:value={message}
    placeholder={amend ? 'Amend commit message' : 'Message'}
    rows={3}
    disabled={!hasFiles && !amend}
  ></textarea>

  <label class="amend-toggle" title="Rewrite the last commit (edit its message and/or fold in staged changes) instead of creating a new one">
    <input type="checkbox" checked={amend} onchange={toggleAmend} />
    <span>Amend last commit</span>
  </label>

  <div class="meta-row">
    <span class="branch-chip" title="Committing to {branch || 'HEAD'}">
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
        <circle cx="3.5" cy="3" r="1.6" stroke="currentColor" stroke-width="1.1"/>
        <circle cx="3.5" cy="11" r="1.6" stroke="currentColor" stroke-width="1.1"/>
        <circle cx="10.5" cy="3" r="1.6" stroke="currentColor" stroke-width="1.1"/>
        <path d="M3.5 4.6v4.8M10.5 4.6v1.2a3 3 0 0 1-3 3H5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>
      <span class="branch-name">{branch || 'HEAD'}</span>
    </span>
    <span class="staged-note" class:active={stagedCount > 0}>{reason}</span>
  </div>

  <div class="btn-row">
    <button class="btn btn-primary" disabled={!canCommit} onclick={handleCommit}>
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
        <path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>{amend ? 'Amend' : `Commit${stagedCount > 0 ? ` ${stagedCount}` : ''}`}</span>
    </button>
    {#if hasUpstream && !amend}
      <button class="btn btn-secondary" disabled={!canCommit} onclick={handleCommitPush} title="Commit &amp; Push">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M7 11V3.5M7 3.5L4 6.5M7 3.5l3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Push</span>
      </button>
    {/if}
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

  .error-msg {
    font-size: var(--hg-font-xxs, 10px);
    color: var(--vscode-errorForeground, #f48771);
    padding: 0 2px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .commit-input {
    width: 100%;
    min-height: 52px;
    max-height: 120px;
    background: var(--vscode-input-background, #3c3c3c);
    color: var(--vscode-input-foreground, #cccccc);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    font-family: var(--hg-font-family);
    font-size: var(--hg-font-sm, 12px);
    font-weight: var(--hg-font-weight);
    padding: 6px 8px;
    resize: none;
    overflow-y: auto;
    outline: none;
    line-height: 1.5;
    box-sizing: border-box;
  }
  .commit-input::placeholder { color: var(--vscode-input-placeholderForeground, #8c8c8c); }
  .commit-input:focus { border-color: var(--vscode-focusBorder, #007fd4); }
  .commit-input:disabled { opacity: 0.4; cursor: default; }

  /* Branch chip + staged note */
  .meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 1px;
    min-width: 0;
  }
  .branch-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 55%;
    padding: 1px 7px 1px 5px;
    border-radius: 9px;
    background: var(--vscode-badge-background, #2a3a44);
    color: var(--vscode-badge-foreground, #9fd0e0);
    font-size: var(--hg-font-xxs, 10px);
    flex-shrink: 0;
  }
  .branch-chip svg { flex-shrink: 0; opacity: 0.85; }
  .branch-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--hg-font-family);
  }
  .staged-note {
    margin-left: auto;
    font-size: var(--hg-font-xxs, 10px);
    color: var(--vscode-descriptionForeground, #8c8c8c);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .staged-note.active { color: #4ec94e; }

  .amend-toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: var(--hg-font-xxs, 10px);
    color: var(--vscode-descriptionForeground, #8c8c8c);
    cursor: pointer;
    padding: 0 1px;
    user-select: none;
  }
  .amend-toggle input { margin: 0; cursor: pointer; }

  .btn-row { display: flex; gap: 6px; }

  .btn {
    height: 28px;
    border-radius: 3px;
    font-size: var(--hg-font-sm, 12px);
    font-family: var(--hg-font-family);
    font-weight: var(--hg-font-weight);
    cursor: pointer;
    border: 1px solid transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    white-space: nowrap;
    transition: background 0.1s, opacity 0.1s;
  }
  .btn:disabled { opacity: 0.4; cursor: default; }
  .btn svg { flex-shrink: 0; }

  .btn-primary {
    flex: 1;
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
  }
  .btn-primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground, #1177bb); }

  .btn-secondary {
    flex: 0 0 auto;
    padding: 0 12px;
    background: var(--vscode-button-secondaryBackground, #313b41);
    color: var(--vscode-button-secondaryForeground, #cccccc);
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground, #3c474e);
  }
</style>
