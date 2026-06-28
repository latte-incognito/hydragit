<script lang="ts">
  import { send } from '$shared/messageBus';
  import type { Commit, DiffFile, DiffHunk } from '../types';
  import ChangedFiles from './ChangedFiles.svelte';
  import CommitMeta from './CommitMeta.svelte';

  // Active ref/range comparison header (branch/tag/commit "Compare…"); when set,
  

  interface Props {
    commit?: Commit | null;
    stash?: any;
    // the pane shows the compared file list instead of a commit/stash.
    compare?: { title: string } | null;
    files?: DiffFile[];
    hunks?: DiffHunk[];
    selFile?: string | null;
    loading?: boolean;
    iconUri?: string;
    // Code search active: files is restricted to the pickaxe-matching subset.
    snippetFilter?: boolean;
    // The active code-search snippet — highlighted in opened diff editors.
    searchSnippet?: string;
    onSelectFile?: (path: string) => void;
    // Routes to the same handler as the log's right-click menu — one source of
    // behaviour for every commit action, two doors.
    onCommitMenuAction?: (action: string, commit: Commit) => void;
    onStashAction?: (action: string) => void;
  }

  let {
    commit = null,
    stash = null,
    compare = null,
    files = [],
    hunks = [],
    selFile = null,
    loading = false,
    iconUri = '',
    snippetFilter = false,
    searchSnippet = '',
    onSelectFile = () => {},
    onCommitMenuAction = () => {},
    onStashAction = () => {}
  }: Props = $props();

  let isStash = $derived(!commit && stash !== null);

  // ── Diff / selection ──────────────────────────────────────────────────────
  // newTab=true opens a persistent (non-preview) editor tab; otherwise the diff
  // opens in the shared preview tab, replacing the previous one.
  function openDiff(filePath: string, newTab = false) {
    if (isStash && stash) {
      const ref = `stash@{${stash.index ?? 0}}`;
      send('openDiff', { commit: ref, parent: ref + '^', file: filePath, newTab });
      return;
    }
    if (!commit) return;
    send('openDiff', {
      commit: commit.hash,
      parent: (commit.parents ?? [])[0] ?? '',
      file: filePath,
      newTab,
      // Always sent (empty clears stale highlights when the preview tab is
      // reused after the code search ends).
      snippet: searchSnippet,
    });
  }

  // ── Context menu ──────────────────────────────────────────────────────────
  let ctxVisible = $state(false);
  let ctxX = $state(0);
  let ctxY = $state(0);
  let ctxFile: string | null = null;

  function showCtx(e: MouseEvent, file: string | null = null) {
    e.preventDefault();
    e.stopPropagation();
    if (!file) return;
    ctxFile = file;
    ctxX = e.clientX;
    ctxY = e.clientY;
    ctxVisible = true;
  }

  function closeCtx() {
    ctxVisible = false;
  }

  function fitMenu(node: HTMLElement) {
    requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      if (rect.right > vw) node.style.left = Math.max(0, vw - rect.width - 4) + 'px';
      if (rect.bottom > vh) node.style.top = Math.max(0, parseFloat(node.style.top) - (rect.bottom - vh) - 4) + 'px';
      const updated = node.getBoundingClientRect();
      if (updated.height > vh - 8) {
        node.style.top = '4px';
        node.style.maxHeight = (vh - 8) + 'px';
        node.style.overflowY = 'auto';
      }
    });
  }

  function ctxShowDiff() {
    closeCtx();
    if (ctxFile) {
      onSelectFile(ctxFile);
      openDiff(ctxFile);
    }
  }

  function ctxShowDiffNewTab() {
    closeCtx();
    if (ctxFile) openDiff(ctxFile, true);
  }

  function ctxEditSource() {
    closeCtx();
    if (ctxFile) send('openFile', { file: ctxFile });
  }

  // Open the file's content as committed at this revision (read-only). Uses the
  // commit hash, or the stash ref when viewing a stash.
  function ctxOpenRepoVersion() {
    closeCtx();
    if (!ctxFile) return;
    const ref = isStash && stash ? `stash@{${stash.index ?? 0}}` : commit?.hash;
    if (!ref) return;
    send('openFile', { file: ctxFile, ref });
  }

  // Compare the file's committed version (or the parent's, for "Before") against
  // the current working-tree copy, in a VS Code diff editor.
  function ctxCompareWithLocal() {
    closeCtx();
    if (!ctxFile) return;
    const ref = isStash && stash ? `stash@{${stash.index ?? 0}}` : commit?.hash;
    if (!ref) return;
    send('openWorkingDiff', { file: ctxFile, ref });
  }

  function ctxCompareBeforeWithLocal() {
    closeCtx();
    if (!ctxFile) return;
    const ref = isStash && stash
      ? `stash@{${stash.index ?? 0}}^`
      : (commit?.parents ?? [])[0];
    if (!ref) return;
    send('openWorkingDiff', { file: ctxFile, ref, label: 'before' });
  }

  // Revert / cherry-pick operate at commit granularity (the changes this commit
  // introduced) — the same ops as the detail action row, routed through the
  // shared commit-menu handler. File-granular selection is not supported by
  // the backend yet.
  function ctxRevert() {
    closeCtx();
    if (commit) onCommitMenuAction('revert', commit);
  }

  function ctxCherryPick() {
    closeCtx();
    if (commit) onCommitMenuAction('cherry-pick', commit);
  }

  // Open File History for this file *as of the selected revision* — the list is
  // truncated to this commit and everything older (git log <ref> --follow). The
  // host opens the dedicated history panel; the ref is the commit (or stash).
  function ctxHistoryHere() {
    closeCtx();
    if (!ctxFile) return;
    const ref = isStash && stash ? `stash@{${stash.index ?? 0}}` : commit?.hash;
    if (!ref) return;
    send('openFileHistory', { file: ctxFile, ref });
  }

  // Diff this file against the commit's parent(s). For an ordinary commit that's
  // a single diff (vs the first parent); for a merge it opens one diff per
  // parent so you can see what each side contributed. newTab keeps them from
  // replacing one another in the shared preview tab.
  function ctxShowChangesToParents() {
    closeCtx();
    if (!ctxFile) return;
    if (isStash && stash) {
      const ref = `stash@{${stash.index ?? 0}}`;
      send('openDiff', { commit: ref, parent: ref + '^', file: ctxFile, newTab: true });
      return;
    }
    if (!commit) return;
    const parents = commit.parents ?? [];
    if (parents.length <= 1) {
      send('openDiff', { commit: commit.hash, parent: parents[0] ?? '', file: ctxFile, newTab: true });
      return;
    }
    for (const p of parents) {
      send('openDiff', { commit: commit.hash, parent: p, file: ctxFile, newTab: true });
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeCtx();
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<!-- Context menu overlay -->
{#if ctxVisible}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="ctx-overlay" onclick={closeCtx}></div>
  <div class="ctx-menu" style="left:{ctxX}px;top:{ctxY}px" use:fitMenu>
    <div class="ctx-item" onclick={ctxShowDiff}>
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M3 4 L 7 4 M7 4 L 5 2 M7 4 L 5 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 10 L 7 10 M7 10 L 5 8 M7 10 L 5 12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="ci-text">Show Diff</span>
      <span class="ci-shortcut">⌘D</span>
    </div>
    <div class="ctx-item" onclick={ctxShowDiffNewTab}>
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M3 4 L 7 4 M7 4 L 5 2 M7 4 L 5 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 10 L 7 10 M7 10 L 5 8 M7 10 L 5 12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="ci-text">Show Diff in a New Tab</span>
    </div>
    <div class="ctx-item" onclick={ctxCompareWithLocal}><span class="ci-icon"></span><span class="ci-text">Compare with Local</span></div>
    <div class="ctx-item" onclick={ctxCompareBeforeWithLocal}><span class="ci-icon"></span><span class="ci-text">Compare Before with Local</span></div>
    <div class="ctx-item" onclick={ctxEditSource}>
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M2 12 L 5 11 L 11 5 L 9 3 L 3 9 Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" fill="none"/>
          <line x1="8" y1="4" x2="10" y2="6" stroke="currentColor" stroke-width="1.1"/>
        </svg>
      </span>
      <span class="ci-text">Edit Source</span>
      <span class="ci-shortcut">⌘↓</span>
    </div>
    <div class="ctx-item" onclick={ctxOpenRepoVersion}><span class="ci-icon"></span><span class="ci-text">Open Repository Version</span></div>

    <div class="ctx-divider"></div>

    <div class="ctx-item" onclick={ctxRevert}>
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M3 7 L 6 4 M3 7 L 6 10 M3 7 H 9 a 3 3 0 0 1 0 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </span>
      <span class="ci-text">Revert Selected Changes</span>
    </div>
    <div class="ctx-item" onclick={ctxCherryPick}><span class="ci-icon"></span><span class="ci-text">Cherry-Pick Selected Changes</span></div>
    <div class="ctx-item ctx-item--dim"><span class="ci-icon"></span><span class="ci-text">Extract Selected Changes to Separate Commit…</span></div>
    <div class="ctx-item ctx-item--dim"><span class="ci-icon"></span><span class="ci-text">Drop Selected Changes</span></div>
    <div class="ctx-item">
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <line x1="7" y1="3" x2="7" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          <line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          <line x1="3" y1="12" x2="11" y2="12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="ci-text">Create Patch…</span>
    </div>
    <div class="ctx-item">
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M7 2 V 9 M4 6 L 7 9 L 10 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <line x1="3" y1="12" x2="11" y2="12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="ci-text">Get from Revision</span>
    </div>
    <div class="ctx-item" onclick={ctxHistoryHere}>
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.1"/>
          <path d="M7 4 V 7 L 9 8.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="ci-text">History Up to Here</span>
    </div>
    <div class="ctx-item" onclick={ctxShowChangesToParents}><span class="ci-icon"></span><span class="ci-text">Show Changes to Parents</span></div>
  </div>
{/if}

<div class="pane-detail">
  {#if isStash}
    <!-- ── Stash view (same layout as commit) ── -->
    <div class="detail-content">

      <ChangedFiles
        {files}
        {selFile}
        {onSelectFile}
        onOpenDiff={openDiff}
        onContextMenu={showCtx}
      />

      <CommitMeta {commit} {stash} {compare} {files} {loading} {onCommitMenuAction} {onStashAction} />

    </div>

  {:else if !commit && !compare}
    <!-- ── Empty state ── -->
    <div class="detail-empty">
      {#if iconUri}<img class="detail-empty-icon" src={iconUri} alt="" />{/if}
      <span>Select a commit</span>
    </div>

  {:else}
    <div class="detail-content">

      <ChangedFiles
        {files}
        {selFile}
        {loading}
        {snippetFilter}
        {onSelectFile}
        onOpenDiff={openDiff}
        onContextMenu={showCtx}
      />

      <CommitMeta {commit} {stash} {compare} {files} {loading} {onCommitMenuAction} {onStashAction} />

    </div>
  {/if}
</div>

<style>
  /* ── Layout ── */
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

  .detail-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  /* ── Empty state ── */
  .stash-diff {
    flex: 1;
    overflow-y: auto;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--hg-font-xs);
  }
  .hunk-header {
    padding: 2px 8px;
    background: var(--vscode-editorGroupHeader-tabsBackground, #1a2535);
    color: var(--hg-info, #56c8e8);
    white-space: pre;
  }
  .hunk-line { padding: 0 8px; white-space: pre; }
  .hunk-line--add { background: var(--vscode-diffEditor-insertedLineBackground, rgba(78,201,78,0.12)); color: var(--vscode-gitDecoration-addedResourceForeground, #4ec94e); }
  .hunk-line--del { background: var(--vscode-diffEditor-removedLineBackground, rgba(240,112,112,0.12)); color: var(--vscode-gitDecoration-deletedResourceForeground, #f07070); }
  .hunk-line--ctx { color: var(--vscode-descriptionForeground, #888); }

  .detail-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--vscode-disabledForeground, #555);
    font-size: var(--hg-font-sm);
    gap: 8px;
  }
  .detail-empty-icon {
    width: 36px;
    height: 36px;
    object-fit: contain;
    opacity: 0.78;
  }

  /* ── Context menu ── */
  .ctx-overlay {
    position: fixed;
    inset: 0;
    z-index: 99;
  }
  .ctx-menu {
    position: fixed;
    z-index: 100;
    background: var(--vscode-menu-background, #252526);
    border: 0.5px solid var(--vscode-menu-border, #3a3a3a);
    border-radius: 5px;
    padding: 4px 0;
    min-width: 320px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.5);
    font-family: var(--hg-font-family);
    font-size: var(--hg-font-xs);
  }
  .ctx-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 14px 5px 10px;
    cursor: default;
    color: var(--vscode-menu-foreground, #ccc);
    white-space: nowrap;
  }
  .ctx-item:hover {
    background: var(--vscode-menu-selectionBackground, #094771);
    color: var(--vscode-menu-selectionForeground, #fff);
  }
  .ctx-item--dim {
    color: var(--vscode-disabledForeground, #555);
  }
  .ctx-item--dim:hover {
    background: transparent;
    color: var(--vscode-disabledForeground, #555);
  }
  .ci-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: currentColor;
  }
  .ci-text {
    flex: 1;
  }
  .ci-shortcut {
    color: var(--vscode-descriptionForeground, #888);
    font-size: var(--hg-font-xxs);
    margin-left: 24px;
  }
  .ctx-item:hover .ci-shortcut {
    color: var(--vscode-menu-selectionForeground, #ddd);
  }
  .ctx-divider {
    height: 0.5px;
    background: var(--vscode-panel-border, #3a3a3a);
    margin: 4px 0;
  }
</style>
