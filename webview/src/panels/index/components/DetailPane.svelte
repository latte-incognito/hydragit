<script lang="ts">
  import type { Commit, DiffFile, DiffHunk } from '../types';

  export let commit: Commit | null = null;
  export let files: DiffFile[] = [];
  export let hunks: DiffHunk[] = [];
  export let selFile: string | null = null;
  export let loading: boolean = false;
  export let iconUri: string = '';

  export let onSelectFile: (path: string) => void = () => {};
  export let onCommitAction: (action: string, hash: string) => void = () => {};

  const badges: Record<string, string> = { M: '#e3b341', A: '#4ec94e', D: '#f07070' };
  const bgB: Record<string, string> = { M: '#1c1000', A: '#0a2510', D: '#2e0d0d' };
  const brB: Record<string, string> = { M: '#6a4000', A: '#1a5a1a', D: '#6a1a1a' };

  $: additions = files.reduce((a, f) => a + (f.additions ?? 0), 0);
  $: deletions = files.reduce((a, f) => a + (f.deletions ?? 0), 0);
</script>

<div class="pane-detail">
  {#if !commit}
    <div class="detail-empty">
      {#if iconUri}<img class="detail-empty-icon" src={iconUri} alt="" />{/if}
      <span>Select a commit</span>
    </div>
  {:else}
    <div class="detail-content">
      <!-- files: fixed max-height, own scroll -->
      <div class="detail-files">
        {#if loading}
          <div class="df-msg">Loading…</div>
        {:else if files.length === 0}
          <div class="df-msg" style="font-style:italic">No file changes</div>
        {:else}
          {#each files as f}
            <div
              class="dfile"
              class:on={selFile === f.path}
              on:click={() => onSelectFile(f.path)}
              role="option"
              aria-selected={selFile === f.path}
              tabindex="0"
            >
              <span
                class="dfile-badge"
                style="background:{bgB[f.status] ?? '#1a1a1a'};color:{badges[f.status] ??
                  '#888'};border:0.5px solid {brB[f.status] ?? '#333'}"
              >
                {f.status ?? 'M'}
              </span>
              <span class="dfile-name" title={f.path}>{f.path.split('/').pop()}</span>
              <span class="dfile-stats">
                {#if f.additions}<span style="color:#4ec94e">+{f.additions}</span>{/if}
                {#if f.deletions}<span style="color:#f07070">-{f.deletions}</span>{/if}
              </span>
            </div>
          {/each}
        {/if}
      </div>

      <!-- meta: fixed, no scroll -->
      <div class="detail-meta">
        <div class="dm-hash">{(commit.hash ?? '').slice(0, 8)}</div>
        <div class="dm-msg">{commit.message ?? commit.msg ?? ''}</div>
        <div class="dm-row"><span>Author</span>{commit.author ?? ''}</div>
        <div class="dm-row"><span>Date</span>{commit.date ?? ''}</div>
        {#if (commit.refs ?? []).length}
          <div class="dm-row"><span>Refs</span>{(commit.refs ?? []).join(', ')}</div>
        {/if}
        {#if loading}
          <div class="dm-stats"><span style="color:#555">Loading…</span></div>
        {:else}
          <div class="dm-stats">
            <span style="color:#4ec94e">+{additions}</span>
            <span style="color:#f07070">-{deletions}</span>
            <span style="color:#555">{files.length} file{files.length !== 1 ? 's' : ''}</span>
          </div>
        {/if}
        <div class="dm-actions">
          <button class="tb-btn" on:click={() => onCommitAction('cherry-pick', commit?.hash ?? '')}
            >Cherry-pick</button
          >
          <button class="tb-btn" on:click={() => onCommitAction('revert', commit?.hash ?? '')}
            >Revert</button
          >
          <button class="tb-btn" on:click={() => onCommitAction('copy', commit?.hash ?? '')}
            >Copy hash</button
          >
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .pane-detail {
    width: 280px;
    min-width: 160px;
    max-width: 500px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
    background: var(--vscode-editor-background, #1e1e1e);
    height: 100%;
  }

  .detail-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--vscode-disabledForeground, #2a2a2a);
    font-size: var(--hg-font-sm);
    gap: 8px;
  }
  .detail-empty-icon {
    width: 36px;
    height: 36px;
    object-fit: contain;
    opacity: 0.78;
  }

  /* detail-content fills the pane, stacks meta/files/diff vertically */
  .detail-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  /* ── Meta ── */
  .detail-meta {
    flex: 1;
    min-height: 0;
    padding: 10px 12px;
    overflow-y: auto;
    background: var(--vscode-sideBar-background, #252526);
  }
  .dm-hash {
    font-family: var(--vscode-editor-font-family, Consolas, monospace) !important;
    font-size: var(--vscode-editor-font-size, 12px) !important;
    font-weight: var(--vscode-editor-font-weight, 400) !important;
    line-height: var(--vscode-editor-line-height, 1.5) !important;
    color: #3e6aa0;
    margin-bottom: 4px;
  }
  .dm-msg {
    font-size: var(--hg-font-sm);
    color: var(--vscode-foreground, #eee);
    line-height: 1.4;
    margin-bottom: 6px;
  }
  .dm-row {
    font-size: var(--hg-font-xs);
    color: var(--vscode-descriptionForeground, #666);
    display: flex;
    gap: 6px;
    margin-bottom: 2px;
  }
  .dm-row span {
    color: var(--vscode-disabledForeground, #555);
    min-width: 52px;
    flex-shrink: 0;
  }
  .dm-stats {
    display: flex;
    gap: 8px;
    font-size: var(--hg-font-xs);
    margin-top: 4px;
  }
  .dm-actions {
    display: flex;
    gap: 4px;
    margin-top: 6px;
    flex-wrap: wrap;
  }

  .tb-btn {
    font-size: var(--hg-font-xxs);
    padding: 2px 6px;
    border-radius: 3px;
    border: 0.5px solid var(--vscode-widget-border, #3a3a3a);
    background: var(--vscode-sideBar-background, #252526);
    color: var(--vscode-descriptionForeground, #888);
    cursor: pointer;
    font-family: var(--hg-font-family);
  }
  .tb-btn:hover {
    color: var(--vscode-foreground, #ccc);
  }

  /* ── Files ── max-height cap, own scroll */
  .detail-files {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    border-bottom: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    max-height: none; /* remove the old 160px cap */
  }
  .df-msg {
    padding: 10px;
    color: #333;
    font-size: var(--hg-font-xs);
  }

  .dfile {
    display: flex;
    align-items: center;
    padding: 3px 10px;
    gap: 5px;
    cursor: pointer;
    font-size: var(--hg-font-xs);
    color: var(--vscode-descriptionForeground, #888);
    border-left: 2px solid transparent;
  }
  .dfile:hover {
    background: var(--vscode-list-hoverBackground, #2a2a2a);
    color: var(--vscode-foreground, #ccc);
  }
  .dfile.on {
    background: #0e2030;
    color: var(--vscode-foreground, #ccc);
    border-left-color: #56c8e8;
  }
  .dfile-badge {
    font-size: var(--hg-font-xxs);
    padding: 1px 3px;
    border-radius: 2px;
    font-weight: 600;
    min-width: 12px;
    text-align: center;
    flex-shrink: 0;
  }
  .dfile-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dfile-stats {
    margin-left: auto;
    font-size: var(--hg-font-xxs);
    flex-shrink: 0;
  }
</style>
