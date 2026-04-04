<script lang="ts">
  import { send } from '$shared/messageBus';
  import type { Commit, DiffFile } from '../types';

  export let commit: Commit | null = null;
  export let files: DiffFile[] = [];
  export let selFile: string | null = null;
  export let loading: boolean = false;
  export let iconUri: string = '';

  export let onSelectFile: (path: string) => void = () => {};
  export let onCommitAction: (action: string, hash: string) => void = () => {};

  // ── Derived totals ────────────────────────────────────────────────────────
  $: totalAdd = files.reduce((a, f) => a + (f.additions ?? 0), 0);
  $: totalDel = files.reduce((a, f) => a + (f.deletions ?? 0), 0);

  // ── Tree building ─────────────────────────────────────────────────────────
  interface TreeFolder {
    kind: 'folder';
    label: string;       // compressed path segment e.g. "internal/git"
    fullPath: string;    // unique key
    children: TreeNode[];
  }
  interface TreeFile {
    kind: 'file';
    file: DiffFile;
  }
  type TreeNode = TreeFolder | TreeFile;

  function buildTree(files: DiffFile[]): TreeFolder {
    const root: TreeFolder = { kind: 'folder', label: 'HydraGit', fullPath: '__root__', children: [] };
    const folderMap = new Map<string, TreeFolder>();

    for (const f of files) {
      const parts = f.path.split('/');
      if (parts.length === 1) {
        root.children.push({ kind: 'file', file: f });
        continue;
      }
      const dirParts = parts.slice(0, -1);
      let parent = root;
      let accumulated = '';
      for (let i = 0; i < dirParts.length; i++) {
        accumulated = accumulated ? accumulated + '/' + dirParts[i] : dirParts[i];
        if (!folderMap.has(accumulated)) {
          const label = dirParts[i];
          const folder: TreeFolder = {
            kind: 'folder',
            label,
            fullPath: accumulated,
            children: [],
          };
          folderMap.set(accumulated, folder);
          parent.children.push(folder);
        }
        parent = folderMap.get(accumulated)!;
      }
      parent.children.push({ kind: 'file', file: f });
    }

    // Compress folders that have exactly one folder child and no file children
    function compress(node: TreeFolder): void {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.kind === 'folder') {
          compress(child);
          // If child has only one folder child and no files, merge
          while (
            child.children.length === 1 &&
            child.children[0].kind === 'folder'
          ) {
            const only = child.children[0] as TreeFolder;
            child.label = child.label + '/' + only.label;
            child.fullPath = only.fullPath;
            child.children = only.children;
          }
        }
      }
    }
    compress(root);

    // Sort every folder: sub-folders first (alpha), then files (alpha)
    function sortChildren(node: TreeFolder): void {
      node.children.sort((a, b) => {
        const aIsFolder = a.kind === 'folder';
        const bIsFolder = b.kind === 'folder';
        if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
        const aName = a.kind === 'folder' ? a.label : a.file.path.split('/').pop() ?? a.file.path;
        const bName = b.kind === 'folder' ? b.label : b.file.path.split('/').pop() ?? b.file.path;
        return aName.localeCompare(bName);
      });
      for (const c of node.children) {
        if (c.kind === 'folder') sortChildren(c);
      }
    }
    sortChildren(root);

    return root;
  }

  $: tree = buildTree(files);

  // ── Collapse state ────────────────────────────────────────────────────────
  let collapsed = new Set<string>();

  function toggleFolder(key: string) {
    if (collapsed.has(key)) collapsed.delete(key);
    else collapsed.add(key);
    collapsed = collapsed; // trigger reactivity
  }

  function expandAll() {
    collapsed = new Set();
  }

  function collapseAll() {
    const keys = new Set<string>();
    function walk(node: TreeFolder) {
      if (node.fullPath !== '') keys.add(node.fullPath); // add every folder including root
      for (const c of node.children) {
        if (c.kind === 'folder') walk(c);
      }
    }
    walk(tree);
    collapsed = keys;
  }

  function countFiles(node: TreeFolder): number {
    let n = 0;
    for (const c of node.children) {
      if (c.kind === 'file') n++;
      else n += countFiles(c);
    }
    return n;
  }

  // ── Status helpers ────────────────────────────────────────────────────────
  // Map git status letter → display config
  const STATUS_CFG: Record<string, { label: string; nameClass: string; badgeClass: string }> = {
    M: { label: 'M', nameClass: 'fname-m', badgeClass: 'badge-m' },
    A: { label: 'A', nameClass: 'fname-a', badgeClass: 'badge-a' },
    U: { label: 'U', nameClass: 'fname-u', badgeClass: 'badge-u' },
    D: { label: 'D', nameClass: 'fname-d', badgeClass: 'badge-d' },
    R: { label: 'R', nameClass: 'fname-r', badgeClass: 'badge-r' },
    C: { label: 'C', nameClass: 'fname-c', badgeClass: 'badge-c' },
  };

  function cfg(status: string) {
    return STATUS_CFG[status] ?? STATUS_CFG['M'];
  }

  // Renamed files: Go now supplies oldPath as a separate field.
  // Falls back to path string parsing for safety.
  function parseRename(f: DiffFile): { oldName: string | null; newName: string } {
    if (f.oldPath) {
      return {
        oldName: f.oldPath.split('/').pop() ?? f.oldPath,
        newName: f.path.split('/').pop() ?? f.path,
      };
    }
    // Legacy fallback: "old -> new" in path string
    const arrow = f.path.indexOf(' -> ');
    if (arrow !== -1) {
      return {
        oldName: f.path.slice(0, arrow).split('/').pop() ?? f.path.slice(0, arrow),
        newName: f.path.slice(arrow + 4).split('/').pop() ?? f.path.slice(arrow + 4),
      };
    }
    return { oldName: null, newName: f.path.split('/').pop() ?? f.path };
  }

  // ── Diff / selection ──────────────────────────────────────────────────────
  function openDiff(filePath: string) {
    if (!commit) return;
    send('openDiff', {
      commit: commit.hash,
      parent: (commit.parents ?? [])[0] ?? '',
      file: filePath,
    });
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────
  let tipText = '';
  let tipX = 0;
  let tipY = 0;
  let tipVisible = false;
  let tipTimer: ReturnType<typeof setTimeout>;

  function showTip(e: MouseEvent, text: string) {
    clearTimeout(tipTimer);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tipText = text;
    tipX = rect.left + rect.width / 2;
    tipY = rect.top - 6;
    tipTimer = setTimeout(() => { tipVisible = true; }, 400);
  }

  function hideTip() {
    clearTimeout(tipTimer);
    tipVisible = false;
  }

  // ── Context menu ──────────────────────────────────────────────────────────
  let ctxVisible = false;
  let ctxX = 0;
  let ctxY = 0;

  function showCtx(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    ctxX = e.clientX;
    ctxY = e.clientY;
    ctxVisible = true;
  }

  function closeCtx() {
    ctxVisible = false;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeCtx();
  }
</script>

<svelte:window on:keydown={onKeyDown} />

<!-- Fixed tooltip -->
{#if tipVisible}
  <div class="hg-tooltip" style="left:{tipX}px;top:{tipY}px">{tipText}</div>
{/if}

<!-- Context menu overlay -->
{#if ctxVisible}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="ctx-overlay" on:click={closeCtx}></div>
  <div class="ctx-menu" style="left:{ctxX}px;top:{ctxY}px">
    <div class="ctx-header">
      <span class="ctx-icon">🚧</span>
      <span class="ctx-label">Under construction</span>
    </div>
    <div class="ctx-item ctx-item--dim">Open diff</div>
    <div class="ctx-item ctx-item--dim">Copy path</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item ctx-item--dim">More actions…</div>
  </div>
{/if}

<div class="pane-detail">
  {#if !commit}
    <!-- ── Empty state ── -->
    <div class="detail-empty">
      {#if iconUri}<img class="detail-empty-icon" src={iconUri} alt="" />{/if}
      <span>Select a commit</span>
    </div>

  {:else}
    <div class="detail-content">

      <!-- ── File tree ── -->
      <div class="detail-files">
        {#if loading}
          <div class="df-msg">Loading…</div>

        {:else if files.length === 0}
          <div class="df-msg df-msg--empty">No file changes</div>

        {:else}
          <!-- Toolbar -->
          <div class="tree-toolbar" on:contextmenu={showCtx}>
            <span class="tree-count">
              {files.length} file{files.length !== 1 ? 's' : ''} changed
            </span>
            <div class="tt-wrap">
              <button
                class="tt-btn"
                aria-label="Expand all"
                on:click={expandAll}
                on:mouseenter={e => showTip(e, 'Expand all')}
                on:mouseleave={hideTip}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2 3h8M2 6h8M2 9h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <div class="tt-wrap">
              <button
                class="tt-btn"
                aria-label="Collapse all"
                on:click={collapseAll}
                on:mouseenter={e => showTip(e, 'Collapse all')}
                on:mouseleave={hideTip}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Tree -->
          <div class="tree-body" on:contextmenu={showCtx}>
            {#snippet renderFolder(node, depth)}
              <!-- Folder row — always render, including root -->
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="tree-row tree-row--folder"
                class:tree-row--root={node.fullPath === '__root__'}
                style="padding-left:{8 + depth * 14}px"
                on:click={() => toggleFolder(node.fullPath)}
                on:contextmenu={showCtx}
              >
                <svg class="chevron" class:open={!collapsed.has(node.fullPath)} width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <svg class="folder-icon" width="13" height="12" viewBox="0 0 14 13" fill="none">
                  <path d="M1 4a1 1 0 011-1h3l1 1.5H12a1 1 0 011 1v5a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" stroke="currentColor" stroke-width="1.1"/>
                </svg>
                <span class="folder-label">{node.label}</span>
                <span class="folder-count">{countFiles(node)}</span>
              </div>

              {#if !collapsed.has(node.fullPath)}
                {#each node.children as child}
                  {#if child.kind === 'folder'}
                    {@render renderFolder(child, depth + 1)}
                  {:else}
                    <!-- File row -->
                    {@const f = child.file}
                    {@const s = cfg(f.status)}
                    {@const isRename = f.status === 'R'}
                    {@const parsed = isRename ? parseRename(f) : null}
                    {@const fname = f.path.split('/').pop() ?? f.path}
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div
                      class="tree-row tree-row--file"
                      class:selected={selFile === f.path}
                      style="padding-left:{8 + (depth + 1) * 14}px"
                      on:click={() => onSelectFile(f.path)}
                      on:dblclick={() => openDiff(f.path)}
                      on:contextmenu={showCtx}
                      role="option"
                      aria-selected={selFile === f.path}
                      tabindex="0"
                    >
                      <span class="badge {s.badgeClass}" title={f.status}>{s.label}</span>

                      {#if isRename && parsed?.oldName}
                        <span class="fname fname-old">{parsed.oldName}</span>
                        <span class="rename-arrow">→</span>
                        <span class="fname {s.nameClass}">{parsed.newName}</span>
                      {:else}
                        <span class="fname {s.nameClass}" class:fname-d-strike={f.status === 'D'} title={f.path}>{fname}</span>
                      {/if}

                      <span class="file-stats">
                        {#if f.additions}<span class="stat-add">+{f.additions}</span>{/if}
                        {#if f.deletions}<span class="stat-del">-{f.deletions}</span>{/if}
                      </span>
                    </div>
                  {/if}
                {/each}
              {/if}
            {/snippet}

            {@render renderFolder(tree, 0)}
          </div>
        {/if}
      </div>

      <!-- ── Commit meta ── -->
      <div class="detail-meta">
        <div class="dm-hash">{(commit.hash ?? '').slice(0, 8)}</div>
        <div class="dm-msg">{commit.message ?? commit.msg ?? ''}</div>
        <div class="dm-row"><span class="dm-label">Author</span>{commit.author ?? ''}</div>
        <div class="dm-row"><span class="dm-label">Date</span>{commit.date ?? ''}</div>
        {#if (commit.refs ?? []).length}
          <div class="dm-row"><span class="dm-label">Refs</span>{(commit.refs ?? []).join(', ')}</div>
        {/if}
        {#if loading}
          <div class="dm-stats"><span class="dm-stat-dim">Loading…</span></div>
        {:else}
          <div class="dm-stats">
            <span class="stat-add">+{totalAdd}</span>
            <span class="stat-del">-{totalDel}</span>
            <span class="dm-stat-dim">{files.length} file{files.length !== 1 ? 's' : ''}</span>
          </div>
        {/if}
        <div class="dm-actions">
          <button class="action-btn" on:click={() => onCommitAction('cherry-pick', commit?.hash ?? '')}>Cherry-pick</button>
          <button class="action-btn" on:click={() => onCommitAction('revert', commit?.hash ?? '')}>Revert</button>
          <button class="action-btn" on:click={() => onCommitAction('copy', commit?.hash ?? '')}>Copy hash</button>
        </div>
      </div>

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

  /* ── File tree panel ── */
  .detail-files {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    border-bottom: 0.5px solid var(--vscode-panel-border, #2a2a2a);
    display: flex;
    flex-direction: column;
  }

  .df-msg {
    padding: 10px 12px;
    color: var(--vscode-disabledForeground, #555);
    font-size: var(--hg-font-xs);
  }
  .df-msg--empty {
    font-style: italic;
  }

  /* ── Tree toolbar ── */
  .tree-toolbar {
    display: flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border-bottom: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    background: var(--vscode-sideBarSectionHeader-background, #222);
    flex-shrink: 0;
    gap: 2px;
  }
  .tree-count {
    flex: 1;
    font-size: var(--hg-font-xxs);
    color: var(--vscode-disabledForeground, #3a3a3a);
    font-family: var(--hg-font-family);
  }
  .tt-wrap {
    display: flex;
    align-items: center;
  }
  .hg-tooltip {
    position: fixed;
    transform: translate(-50%, -100%);
    background: var(--vscode-editorHoverWidget-background, #252526);
    border: 0.5px solid var(--vscode-editorHoverWidget-border, #454545);
    color: var(--vscode-editorHoverWidget-foreground, #ccc);
    font-size: var(--hg-font-xxs);
    font-family: var(--hg-font-family);
    white-space: nowrap;
    padding: 3px 7px;
    border-radius: 3px;
    pointer-events: none;
    z-index: 200;
  }
  .tt-btn {
    background: none;
    border: none;
    padding: 2px 4px;
    border-radius: 3px;
    cursor: pointer;
    color: var(--vscode-disabledForeground, #3a3a3a);
    display: flex;
    align-items: center;
    line-height: 1;
  }
  .tt-btn:hover {
    background: var(--vscode-list-hoverBackground, #2a2d2e);
    color: var(--vscode-foreground, #ccc);
  }

  /* ── Tree body ── */
  .tree-body {
    flex: 1;
    overflow-y: auto;
  }

  .tree-row {
    display: flex;
    align-items: center;
    gap: 5px;
    min-height: 22px;
    cursor: pointer;
    user-select: none;
    font-size: var(--hg-font-xs);
    padding-right: 8px;
  }
  .tree-row:hover {
    background: var(--vscode-list-hoverBackground, #2a2d2e);
  }
  .tree-row--file {
    border-left: 2px solid transparent;
  }
  .tree-row--file.selected {
    background: var(--vscode-list-activeSelectionBackground, #094771);
    color: var(--vscode-list-activeSelectionForeground, #fff);
    border-left-color: var(--vscode-focusBorder, #007fd4);
  }

  /* ── Folder row elements ── */
  .chevron {
    color: var(--vscode-descriptionForeground, #888);
    flex-shrink: 0;
    transform: rotate(0deg);
    transition: transform 0.12s ease;
  }
  .chevron.open {
    transform: rotate(90deg);
  }
  .folder-icon {
    color: var(--vscode-descriptionForeground, #888);
    flex-shrink: 0;
  }
  .folder-label {
    flex: 1;
    font-size: var(--hg-font-xs);
    color: var(--vscode-foreground, #ccc);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--hg-font-family);
  }
  .folder-count {
    font-size: var(--hg-font-xxs);
    color: var(--vscode-descriptionForeground, #666);
    font-family: var(--hg-font-family);
    flex-shrink: 0;
  }

  /* ── Badge ── */
  .badge {
    font-size: var(--hg-font-xxs);
    font-family: var(--hg-font-family);
    font-weight: 600;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  /* Modified — blue */
  .badge-m { background: var(--vscode-gitDecoration-modifiedResourceForeground, #4a9cd6) 18%;
              color: var(--vscode-gitDecoration-modifiedResourceForeground, #4a9cd6); }
  .badge-m { background: rgba(74,156,214,0.15); color: #4a9cd6; border: 0.5px solid rgba(74,156,214,0.35); }
  /* Added / Untracked — green */
  .badge-a, .badge-u { background: rgba(78,201,78,0.13); color: #4ec94e; border: 0.5px solid rgba(78,201,78,0.3); }
  /* Deleted — muted */
  .badge-d { background: rgba(160,160,160,0.1); color: #888; border: 0.5px solid rgba(160,160,160,0.25); }
  /* Renamed — blue (same family as M) */
  .badge-r { background: rgba(74,156,214,0.15); color: #4a9cd6; border: 0.5px solid rgba(74,156,214,0.35); }
  /* Copied — amber */
  .badge-c { background: rgba(224,160,48,0.13); color: #e0a030; border: 0.5px solid rgba(224,160,48,0.3); }

  /* ── File name ── */
  .fname {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--hg-font-family);
    font-size: var(--hg-font-xs);
  }
  .fname-m { color: #4a9cd6; }
  .fname-a, .fname-u { color: #4ec94e; }
  .fname-d { color: var(--vscode-descriptionForeground, #888); text-decoration: line-through; }
  .fname-d-strike { text-decoration: line-through; }
  .fname-r { color: #4a9cd6; }
  .fname-c { color: #e0a030; }
  .fname-old {
    color: var(--vscode-descriptionForeground, #888);
    font-family: var(--hg-font-family);
    font-size: var(--hg-font-xs);
    flex-shrink: 0;
    max-width: 100px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rename-arrow {
    color: var(--vscode-descriptionForeground, #666);
    font-size: var(--hg-font-xxs);
    flex-shrink: 0;
  }

  /* ── Diff stats ── */
  .file-stats {
    margin-left: auto;
    display: flex;
    gap: 4px;
    flex-shrink: 0;
    padding-left: 6px;
    font-family: var(--hg-editor-font-family);
    font-size: var(--hg-font-xxs);
  }
  .stat-add { color: #4ec94e; }
  .stat-del { color: #f07070; }

  /* ── Meta panel ── */
  .detail-meta {
    flex-shrink: 0;
    padding: 10px 12px;
    background: var(--vscode-sideBar-background, #252526);
    overflow-y: auto;
    max-height: 40%;
  }
  .dm-hash {
    font-family: var(--hg-editor-font-family);
    font-size: var(--hg-editor-font-size);
    color: #4a9cd6;
    margin-bottom: 4px;
    opacity: 0.85;
  }
  .dm-msg {
    font-size: var(--hg-font-sm);
    color: var(--vscode-foreground, #eee);
    line-height: 1.4;
    margin-bottom: 6px;
  }
  .dm-row {
    display: flex;
    gap: 6px;
    font-size: var(--hg-font-xs);
    color: var(--vscode-descriptionForeground, #888);
    margin-bottom: 2px;
  }
  .dm-label {
    color: var(--vscode-disabledForeground, #555);
    min-width: 48px;
    flex-shrink: 0;
  }
  .dm-stats {
    display: flex;
    gap: 8px;
    font-size: var(--hg-font-xs);
    margin-top: 6px;
    font-family: var(--hg-editor-font-family);
  }
  .dm-stat-dim { color: var(--vscode-disabledForeground, #555); }
  .dm-actions {
    display: flex;
    gap: 4px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .action-btn {
    font-size: var(--hg-font-xxs);
    padding: 2px 7px;
    border-radius: 3px;
    border: 0.5px solid var(--vscode-widget-border, #3a3a3a);
    background: transparent;
    color: var(--vscode-descriptionForeground, #888);
    cursor: pointer;
    font-family: var(--hg-font-family);
    transition: color 0.1s;
  }
  .action-btn:hover {
    color: var(--vscode-foreground, #ccc);
    background: var(--vscode-list-hoverBackground, #2a2d2e);
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
    border-radius: 4px;
    padding: 4px 0;
    min-width: 180px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.35);
    font-family: var(--hg-font-family);
    font-size: var(--hg-font-xs);
  }
  .ctx-header {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 12px 5px;
    border-bottom: 0.5px solid var(--vscode-panel-border, #2a2a2a);
    margin-bottom: 3px;
  }
  .ctx-icon { font-size: 14px; line-height: 1; }
  .ctx-label {
    font-size: var(--hg-font-xxs);
    color: var(--vscode-descriptionForeground, #888);
  }
  .ctx-item {
    padding: 5px 12px;
    cursor: default;
    color: var(--vscode-foreground, #ccc);
  }
  .ctx-item--dim {
    color: var(--vscode-disabledForeground, #555);
  }
  .ctx-divider {
    height: 0.5px;
    background: var(--vscode-panel-border, #2a2a2a);
    margin: 3px 0;
  }
</style>
