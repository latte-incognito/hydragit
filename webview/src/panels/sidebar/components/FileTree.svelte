<script lang="ts">
  import type { GitFile } from '../types';

  export let files: GitFile[] = [];
  export let stagedPaths: Set<string> = new Set();
  export let loading: boolean = false;
  export let collapsed: Set<string> = new Set();   // persisted by parent

  export let onToggleStage:     (path: string) => void          = () => {};
  export let onToggleFolder:    (key: string) => void            = () => {};
  export let onStageFolder:     (paths: string[], stage: boolean) => void = () => {};

  // ── Types ─────────────────────────────────────────────────────────────────
  interface TreeFolder {
    kind: 'folder';
    label: string;
    fullPath: string;
    children: TreeNode[];
  }
  interface TreeFile {
    kind: 'file';
    file: GitFile;
  }
  type TreeNode = TreeFolder | TreeFile;

  // ── Tree building ─────────────────────────────────────────────────────────
  function buildTree(files: GitFile[]): TreeFolder {
    const root: TreeFolder = { kind: 'folder', label: 'Changes', fullPath: '__root__', children: [] };
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
          const folder: TreeFolder = {
            kind: 'folder',
            label: dirParts[i],
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

    // Compress single-child folder chains
    function compress(node: TreeFolder): void {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.kind === 'folder') {
          compress(child);
          while (child.children.length === 1 && child.children[0].kind === 'folder') {
            const only = child.children[0] as TreeFolder;
            child.label    = child.label + '/' + only.label;
            child.fullPath = only.fullPath;
            child.children = only.children;
          }
        }
      }
    }
    compress(root);

    // Sort: folders first (alpha), then files (alpha)
    function sortChildren(node: TreeFolder): void {
      node.children.sort((a, b) => {
        const af = a.kind === 'folder', bf = b.kind === 'folder';
        if (af !== bf) return af ? -1 : 1;
        const an = a.kind === 'folder' ? a.label : (a.file.path.split('/').pop() ?? '');
        const bn = b.kind === 'folder' ? b.label : (b.file.path.split('/').pop() ?? '');
        return an.localeCompare(bn);
      });
      for (const c of node.children) if (c.kind === 'folder') sortChildren(c);
    }
    sortChildren(root);

    return root;
  }

  $: tree = buildTree(files);

  // ── Folder helpers ────────────────────────────────────────────────────────
  function allFilesInFolder(node: TreeFolder): string[] {
    const paths: string[] = [];
    function walk(n: TreeFolder) {
      for (const c of n.children) {
        if (c.kind === 'file') paths.push(c.file.path);
        else walk(c);
      }
    }
    walk(node);
    return paths;
  }

  function folderStagedState(node: TreeFolder): 'all' | 'some' | 'none' {
    const paths = allFilesInFolder(node);
    const stagedCount = paths.filter(p => stagedPaths.has(p)).length;
    if (stagedCount === 0) return 'none';
    if (stagedCount === paths.length) return 'all';
    return 'some';
  }

  function countFiles(node: TreeFolder): number {
    let n = 0;
    for (const c of node.children) {
      if (c.kind === 'file') n++;
      else n += countFiles(c);
    }
    return n;
  }

  // ── Status config (matches DetailPane exactly) ────────────────────────────
  const STATUS_CFG: Record<string, { label: string; nameClass: string; badgeClass: string }> = {
    M: { label: 'M', nameClass: 'fname-m', badgeClass: 'badge-m' },
    A: { label: 'A', nameClass: 'fname-a', badgeClass: 'badge-a' },
    U: { label: 'U', nameClass: 'fname-u', badgeClass: 'badge-u' },
    D: { label: 'D', nameClass: 'fname-d', badgeClass: 'badge-d' },
    R: { label: 'R', nameClass: 'fname-r', badgeClass: 'badge-r' },
    C: { label: 'C', nameClass: 'fname-c', badgeClass: 'badge-c' },
  };
  function cfg(status: string) {
    return STATUS_CFG[status?.toUpperCase()?.[0] ?? 'M'] ?? STATUS_CFG['M'];
  }

  function parseRename(file: GitFile): { oldName: string | null; newName: string } {
    if ((file as any).oldPath) {
      return {
        oldName: (file as any).oldPath.split('/').pop() ?? (file as any).oldPath,
        newName: file.path.split('/').pop() ?? file.path,
      };
    }
    const arrow = file.path.indexOf(' -> ');
    if (arrow !== -1) {
      return {
        oldName: file.path.slice(0, arrow).split('/').pop() ?? file.path.slice(0, arrow),
        newName: file.path.slice(arrow + 4).split('/').pop() ?? file.path.slice(arrow + 4),
      };
    }
    return { oldName: null, newName: file.path.split('/').pop() ?? file.path };
  }

  // ── Checkbox bind:indeterminate helper via action ─────────────────────────
  function indeterminateAction(node: HTMLInputElement, value: boolean) {
    node.indeterminate = value;
    return {
      update(v: boolean) { node.indeterminate = v; }
    };
  }
</script>

<div class="tree-wrap" role="listbox" aria-label="Changed files">
  {#if loading}
    <div class="state-msg">
      <span class="spinner" aria-hidden="true"></span>Loading…
    </div>
  {:else if files.length === 0}
    <div class="state-msg empty">No changes · working tree clean</div>
  {:else}

    {#snippet renderFolder(node, depth)}
      {#if node.fullPath !== '__root__'}
        {@const state = folderStagedState(node)}
        {@const isIndeterminate = state === 'some'}
        {@const isChecked = state === 'all'}
        {@const folderPaths = allFilesInFolder(node)}

        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="folder-row"
          style="padding-left:{8 + depth * 14}px"
          on:click={() => onToggleFolder(node.fullPath)}
        >
          <svg class="chevron" class:open={!collapsed.has(node.fullPath)}
               width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.3"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <svg class="folder-icon" width="13" height="12" viewBox="0 0 14 13" fill="none">
            <path d="M1 4.5a1 1 0 011-1h3l1 1.5H12a1 1 0 011 1v4a1 1 0 01-1 1H2a1 1 0 01-1-1v-5.5z"
                  stroke="currentColor" stroke-width="1.1"/>
          </svg>
          <span class="folder-label">{node.label}</span>
          <span class="folder-count">{countFiles(node)}</span>
          <!-- Folder checkbox: stages/unstages all files in folder -->
          <input
            type="checkbox"
            class="hg-checkbox"
            checked={isChecked}
            use:indeterminateAction={isIndeterminate}
            aria-label="Stage all in {node.label}"
            on:change|stopPropagation={(e) =>
              onStageFolder(folderPaths, (e.target as HTMLInputElement).checked)}
            on:click|stopPropagation
          />
        </div>
      {/if}

      {#if node.fullPath === '__root__' || !collapsed.has(node.fullPath)}
        {#each node.children as child}
          {#if child.kind === 'folder'}
            {@render renderFolder(child, node.fullPath === '__root__' ? 0 : depth + 1)}
          {:else}
            {@const f = child.file}
            {@const s = cfg(f.status)}
            {@const isRename = f.status?.toUpperCase() === 'R'}
            {@const parsed = isRename ? parseRename(f) : null}
            {@const fname = f.path.split('/').pop() ?? f.path}
            {@const staged = stagedPaths.has(f.path)}
            {@const indent = 8 + (node.fullPath === '__root__' ? 0 : depth + 1) * 14}

            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="file-row"
              class:staged
              style="padding-left:{indent}px"
              on:click|stopPropagation={() => onToggleStage(f.path)}
              role="option"
              aria-selected={staged}
              tabindex="0"
            >
              <span class="badge {s.badgeClass}" title={s.label}>{s.label}</span>

              {#if isRename && parsed?.oldName}
                <span class="fname fname-old">{parsed.oldName}</span>
                <span class="rename-arrow">→</span>
                <span class="fname {s.nameClass}">{parsed.newName}</span>
              {:else}
                <span class="fname {s.nameClass}"
                      class:fname-d-strike={f.status?.toUpperCase() === 'D'}
                      title={f.path}>{fname}</span>
              {/if}

              <input
                type="checkbox"
                class="hg-checkbox"
                checked={staged}
                aria-label="Stage {fname}"
                on:change|stopPropagation={() => onToggleStage(f.path)}
                on:click|stopPropagation
              />
            </div>
          {/if}
        {/each}
      {/if}
    {/snippet}

    {@render renderFolder(tree, 0)}
  {/if}
</div>

<style>
  .tree-wrap {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    padding: 3px 0;
  }

  /* ── States ── */
  .state-msg {
    padding: 20px 16px;
    font-size: var(--hg-font-sm, 12px);
    color: var(--vscode-descriptionForeground, #8c8c8c);
    text-align: center;
  }
  .state-msg.empty { font-size: var(--hg-font-xs, 11px); }
  .spinner {
    display: inline-block;
    width: 12px; height: 12px;
    border: 1.5px solid var(--vscode-descriptionForeground, #8c8c8c);
    border-top-color: transparent;
    border-radius: 50%;
    animation: hg-spin 0.6s linear infinite;
    vertical-align: middle;
    margin-right: 6px;
  }
  @keyframes hg-spin { to { transform: rotate(360deg); } }

  /* ── Folder row ── */
  .folder-row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 22px;
    cursor: pointer;
    user-select: none;
    padding-right: 8px;
  }
  .folder-row:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }

  .chevron {
    color: var(--vscode-descriptionForeground, #888);
    flex-shrink: 0;
    transform: rotate(0deg);
    transition: transform 0.12s ease;
  }
  .chevron.open { transform: rotate(90deg); }

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

  /* ── File row ── */
  .file-row {
    display: flex;
    align-items: center;
    gap: 5px;
    min-height: 22px;
    cursor: pointer;
    border-left: 2px solid transparent;
    padding-right: 8px;
    font-size: var(--hg-font-xs);
  }
  .file-row:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }
  .file-row.staged {
    border-left-color: var(--vscode-focusBorder, #007fd4);
    background: var(--vscode-list-inactiveSelectionBackground, #37373d22);
  }

  /* ── Badge ── */
  .badge {
    font-size: var(--hg-font-xxs);
    font-family: var(--hg-font-family);
    font-weight: 600;
    width: 14px; height: 14px;
    border-radius: 3px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .badge-m { background: rgba(74,156,214,0.15); color: #4a9cd6; border: 0.5px solid rgba(74,156,214,0.35); }
  .badge-a, .badge-u { background: rgba(78,201,78,0.13); color: #4ec94e; border: 0.5px solid rgba(78,201,78,0.3); }
  .badge-d { background: rgba(160,160,160,0.1); color: #888; border: 0.5px solid rgba(160,160,160,0.25); }
  .badge-r { background: rgba(74,156,214,0.15); color: #4a9cd6; border: 0.5px solid rgba(74,156,214,0.35); }
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
    max-width: 90px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rename-arrow {
    color: var(--vscode-descriptionForeground, #666);
    font-size: var(--hg-font-xxs);
    flex-shrink: 0;
  }

  /* ── Checkbox ── */
  .hg-checkbox {
    appearance: none;
    -webkit-appearance: none;
    width: 13px; height: 13px; min-width: 13px;
    border: 1px solid var(--vscode-checkbox-border, #6b6b6b);
    border-radius: 2px;
    background: var(--vscode-checkbox-background, #3c3c3c);
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.1s, border-color 0.1s;
    margin-left: auto;
  }
  .hg-checkbox:checked,
  .hg-checkbox:indeterminate {
    background: var(--vscode-checkbox-selectBackground, #0078d4);
    border-color: var(--vscode-checkbox-selectBackground, #0078d4);
  }
  .hg-checkbox:checked::after {
    content: '';
    position: absolute;
    left: 2px; top: 1px;
    width: 5px; height: 8px;
    border: 1.5px solid #fff;
    border-top: none; border-left: none;
    transform: rotate(45deg) scaleY(0.85);
  }
  .hg-checkbox:indeterminate::after {
    content: '';
    position: absolute;
    left: 2px; top: 5px;
    width: 7px; height: 1.5px;
    background: #fff;
    border: none; transform: none;
  }
  .hg-checkbox:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: 1px;
  }
</style>
