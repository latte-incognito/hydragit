<script lang="ts">
  // The changed-files tree panel: folder/file tree with collapse, status badges,
  // diff-stats and per-file actions. Extracted from DetailPane (it was rendered
  // near-identically for both the commit and stash views). Presentational only —
  // selection, diff-open and context-menu intent are emitted to the parent,
  // which owns what those mean (commit vs stash, the context menu itself).
  import type { DiffFile } from '../types';
  import { buildTree, countFiles, type TreeFolder, type TreeNode } from '../fileTree';

  interface Props {
    files?: DiffFile[];
    selFile?: string | null;
    loading?: boolean;
    snippetFilter?: boolean;
    onSelectFile?: (path: string) => void;
    onOpenDiff?: (path: string, newTab?: boolean) => void;
    // file === null for folders / empty areas (parent ignores those).
    onContextMenu?: (e: MouseEvent, file?: string | null) => void;
  }

  let {
    files = [],
    selFile = null,
    loading = false,
    snippetFilter = false,
    onSelectFile = () => {},
    onOpenDiff = () => {},
    onContextMenu = () => {},
  }: Props = $props();

  let totalAdd = $derived(files.reduce((a, f) => a + (f.additions ?? 0), 0));
  let totalDel = $derived(files.reduce((a, f) => a + (f.deletions ?? 0), 0));
  let tree = $derived(buildTree(files));

  // ── Collapse state ──────────────────────────────────────────────────────
  let collapsed = $state(new Set<string>());

  function toggleFolder(key: string) {
    // Reassign a fresh Set — Svelte 5 $state doesn't proxy Set mutations.
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    collapsed = next;
  }
  function expandAll() {
    collapsed = new Set();
  }
  function collapseAll() {
    const keys = new Set<string>();
    function walk(node: TreeFolder) {
      if (node.fullPath !== '') keys.add(node.fullPath);
      for (const c of node.children) if (c.kind === 'folder') walk(c);
    }
    walk(tree);
    collapsed = keys;
  }

  // ── Status helpers ──────────────────────────────────────────────────────
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

  // Renamed files: Go supplies oldPath; falls back to "old -> new" path parsing.
  function parseRename(f: DiffFile): { oldName: string | null; newName: string } {
    if (f.oldPath) {
      return {
        oldName: f.oldPath.split('/').pop() ?? f.oldPath,
        newName: f.path.split('/').pop() ?? f.path,
      };
    }
    const arrow = f.path.indexOf(' -> ');
    if (arrow !== -1) {
      return {
        oldName: f.path.slice(0, arrow).split('/').pop() ?? f.path.slice(0, arrow),
        newName: f.path.slice(arrow + 4).split('/').pop() ?? f.path.slice(arrow + 4),
      };
    }
    return { oldName: null, newName: f.path.split('/').pop() ?? f.path };
  }

  // ── Tooltip (button hints) ──────────────────────────────────────────────
  let tipText = $state('');
  let tipX = $state(0);
  let tipY = $state(0);
  let tipVisible = $state(false);
  let tipTimer: ReturnType<typeof setTimeout>;
  function showTip(e: MouseEvent, text: string) {
    clearTimeout(tipTimer);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tipText = text;
    tipX = rect.left + rect.width / 2;
    tipY = rect.top - 6;
    tipTimer = setTimeout(() => {
      tipVisible = true;
    }, 400);
  }
  function hideTip() {
    clearTimeout(tipTimer);
    tipVisible = false;
  }
</script>

{#if tipVisible}
  <div class="hg-tooltip" style="left:{tipX}px;top:{tipY}px">{tipText}</div>
{/if}

<div class="detail-files">
  {#if loading}
    <div class="df-msg">Loading…</div>
  {:else if files.length === 0}
    <div class="df-msg df-msg--empty">No file changes</div>
  {:else}
    <div class="tree-toolbar" oncontextmenu={(e) => onContextMenu(e, null)}>
      <span class="tree-count">
        {files.length} file{files.length !== 1 ? 's' : ''} changed
        {#if snippetFilter}
          <span
            class="tree-count-pickaxe"
            title="Only files where the searched snippet was added or removed — that's why this commit matched"
          >
            · snippet matches
          </span>
        {/if}
      </span>
      <span class="tree-totals">
        <span class="stat-add">+{totalAdd}</span>
        <span class="stat-del">-{totalDel}</span>
      </span>
      <div class="tt-wrap">
        <button
          class="tt-btn"
          aria-label="Expand all"
          onclick={expandAll}
          onmouseenter={(e) => showTip(e, 'Expand all')}
          onmouseleave={hideTip}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 3h8M2 6h8M2 9h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>
      <div class="tt-wrap">
        <button
          class="tt-btn"
          aria-label="Collapse all"
          onclick={collapseAll}
          onmouseenter={(e) => showTip(e, 'Collapse all')}
          onmouseleave={hideTip}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>

    <div class="tree-body" oncontextmenu={(e) => onContextMenu(e, null)}>
      {#snippet renderNodes(children: TreeNode[], depth: number)}
        {#each children as child}
          {#if child.kind === 'folder'}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="tree-row tree-row--folder"
              style="padding-left:{8 + depth * 14}px"
              onclick={() => toggleFolder(child.fullPath)}
              oncontextmenu={(e) => onContextMenu(e, null)}
            >
              <svg class="chevron" class:open={!collapsed.has(child.fullPath)} width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <svg class="folder-icon" width="13" height="12" viewBox="0 0 14 13" fill="none">
                <path d="M1 4a1 1 0 011-1h3l1 1.5H12a1 1 0 011 1v5a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" stroke="currentColor" stroke-width="1.1" />
              </svg>
              <span class="folder-label">{child.label}</span>
              <span class="folder-count">{countFiles(child)}</span>
            </div>
            {#if !collapsed.has(child.fullPath)}
              {@render renderNodes(child.children, depth + 1)}
            {/if}
          {:else}
            {@const f = child.file}
            {@const s = cfg(f.status)}
            {@const isRename = f.status === 'R'}
            {@const parsed = isRename ? parseRename(f) : null}
            {@const fname = f.path.split('/').pop() ?? f.path}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="tree-row tree-row--file"
              class:selected={selFile === f.path}
              style="padding-left:{8 + depth * 14}px"
              onclick={() => {
                onSelectFile(f.path);
                onOpenDiff(f.path);
              }}
              ondblclick={() => onOpenDiff(f.path, true)}
              oncontextmenu={(e) => onContextMenu(e, f.path)}
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
      {/snippet}
      {@render renderNodes(tree.children, 0)}
    </div>
  {/if}
</div>

<style>
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
  .tree-count-pickaxe {
    color: var(--hg-code, #e8648a);
  }
  .tree-totals {
    display: flex;
    gap: 6px;
    font-size: var(--hg-font-xxs);
    font-family: var(--hg-editor-font-family);
    flex-shrink: 0;
    margin-right: 2px;
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
    width: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .badge-m {
    color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d);
  }
  .badge-a,
  .badge-u {
    color: var(--vscode-gitDecoration-addedResourceForeground, #81b88b);
  }
  .badge-d {
    color: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39);
  }
  .badge-r,
  .badge-c {
    color: var(--vscode-gitDecoration-renamedResourceForeground, #73c991);
  }

  /* ── File name ── */
  .fname {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--hg-font-family);
    font-size: var(--hg-font-xs);
  }
  .fname-m {
    color: var(--vscode-gitDecoration-modifiedResourceForeground, #4a9cd6);
  }
  .fname-a,
  .fname-u {
    color: var(--vscode-gitDecoration-addedResourceForeground, #4ec94e);
  }
  .fname-d {
    color: var(--vscode-descriptionForeground, #888);
    text-decoration: line-through;
  }
  .fname-d-strike {
    text-decoration: line-through;
  }
  .fname-r {
    color: var(--vscode-gitDecoration-renamedResourceForeground, #4a9cd6);
  }
  .fname-c {
    color: var(--vscode-gitDecoration-renamedResourceForeground, #e0a030);
  }
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
  .stat-add {
    color: #4ec94e;
  }
  .stat-del {
    color: #f07070;
  }
</style>
