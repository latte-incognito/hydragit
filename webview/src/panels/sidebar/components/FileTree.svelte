<script lang="ts">
  import { send } from '$shared/messageBus';
  import type { GitFile } from '../types';


  interface Props {
    files?: GitFile[];
    loading?: boolean;
    noRepo?: boolean;
    collapsed?: Set<string>; // persisted by parent
    onToggleStage?: (path: string, stage: boolean) => void;
    onToggleFolder?: (key: string) => void;
    onStageFolder?: (paths: string[], stage: boolean) => void;
    onOpenDiff?: (path: string) => void;
    onOpenFile?: (path: string) => void;
    onDiscard?: (paths: string[]) => void;
  }

  let {
    files = [],
    loading = false,
    noRepo = false,
    collapsed = new Set(),
    onToggleStage = () => {},
    onToggleFolder = () => {},
    onStageFolder = () => {},
    onOpenDiff = () => {},
    onOpenFile = () => {},
    onDiscard = () => {}
  }: Props = $props();

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

    // Compress single-child folder chains — creates new objects to avoid
    // mutating nodes that are still referenced by folderMap keys
    function compress(node: TreeFolder): void {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.kind !== 'folder') continue;
        compress(child);
        // Merge downward while there is exactly one folder child and no files
        let cur = child;
        while (cur.children.length === 1 && cur.children[0].kind === 'folder') {
          const only = cur.children[0] as TreeFolder;
          // Replace in parent's children array with a fresh merged node
          const merged: TreeFolder = {
            kind:     'folder',
            label:    cur.label + '/' + only.label,
            fullPath: only.fullPath,
            children: only.children,
          };
          node.children[i] = merged;
          cur = merged;
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

  // Real-index model (VS Code SCM semantics): the sections come from git's own
  // index/worktree split, not a client-side set. A file edited after staging
  // ("MM") appears in BOTH trees — the staged row shows the frozen snapshot's
  // letter, the changes row the newer edits'. Each copy carries its side's
  // letter as `status` so badges/colors render per-section.
  let stagedFiles  = $derived(files.filter((f) => f.indexStatus).map((f) => ({ ...f, status: f.indexStatus! })));
  let changesFiles = $derived(files.filter((f) => f.workStatus).map((f) => ({ ...f, status: f.workStatus! })));
  let stagedTree   = $derived(buildTree(stagedFiles));
  let changesTree  = $derived(buildTree(changesFiles));

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
    '!': { label: '!', nameClass: 'fname-conflict', badgeClass: 'badge-conflict' },
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

  // ── Context menu (right-click on a file row) ──────────────────────────────
  let ctxVisible = $state(false);
  let ctxX = $state(0);
  let ctxY = $state(0);
  let ctxFile: GitFile | null = $state(null);

  function showCtx(e: MouseEvent, file: GitFile) {
    e.preventDefault();
    e.stopPropagation();
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
    });
  }

  function ctxShowDiff() {
    closeCtx();
    if (ctxFile) onOpenDiff(ctxFile.path);
  }

  function ctxOpenFile() {
    closeCtx();
    if (ctxFile) onOpenFile(ctxFile.path);
  }

  function ctxCopyPath() {
    closeCtx();
    if (ctxFile) navigator.clipboard?.writeText(ctxFile.path);
  }

  function ctxDiscard() {
    closeCtx();
    if (ctxFile && !isConflict(ctxFile)) onDiscard([ctxFile.path]);
  }

  function isConflict(f: GitFile): boolean {
    return f.status === '!';
  }

  // Bulk discards skip conflicted files — the backend refuses a batch that
  // contains one, and conflicts have their own resolution flow (the banner).
  let fileByPath = $derived(new Map(files.map((f) => [f.path, f])));
  function discardable(paths: string[]): string[] {
    return paths.filter((p) => fileByPath.get(p)?.status !== '!');
  }

  // A deleted file has no working-tree copy to open or edit.
  function isDeleted(f: GitFile): boolean {
    return f.status?.toUpperCase() === 'D';
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') closeCtx(); }} />

{#if ctxVisible && ctxFile}
  {@const conflicted = isConflict(ctxFile)}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="ctx-overlay" onclick={closeCtx} oncontextmenu={(e) => { e.preventDefault(); closeCtx(); }}></div>
  <div class="ctx-menu" style="left:{ctxX}px;top:{ctxY}px" use:fitMenu>
    <div class="ctx-item" onclick={ctxShowDiff}>
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M3 4 L 7 4 M7 4 L 5 2 M7 4 L 5 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 10 L 7 10 M7 10 L 5 8 M7 10 L 5 12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="ci-text">{conflicted ? 'Open Merge Editor' : 'Show Diff'}</span>
    </div>
    {#if !isDeleted(ctxFile)}
      <div class="ctx-item" onclick={ctxOpenFile}>
        <span class="ci-icon">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M2 12 L 5 11 L 11 5 L 9 3 L 3 9 Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" fill="none"/>
            <line x1="8" y1="4" x2="10" y2="6" stroke="currentColor" stroke-width="1.1"/>
          </svg>
        </span>
        <span class="ci-text">Open File</span>
      </div>
    {/if}
    <div class="ctx-item" onclick={ctxCopyPath}>
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <rect x="4.5" y="4.5" width="7" height="8" rx="1" stroke="currentColor" stroke-width="1.1"/>
          <path d="M9.5 4.5 V 3 a 1 1 0 0 0 -1 -1 H 3.5 a 1 1 0 0 0 -1 1 v 6.5 a 1 1 0 0 0 1 1 H 4.5" stroke="currentColor" stroke-width="1.1"/>
        </svg>
      </span>
      <span class="ci-text">Copy Path</span>
    </div>
    <div class="ctx-divider"></div>
    <div class="ctx-item" class:ctx-item--dim={conflicted} onclick={ctxDiscard}
         title={conflicted ? 'Resolve or abort the conflict instead' : ''}>
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M3 6 L 6 3 M3 6 L 6 9 M3 6 H 9 a 3 3 0 0 1 0 6 H 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="ci-text">Discard Changes</span>
    </div>
  </div>
{/if}

<div class="tree-wrap" role="listbox" aria-label="Changed files">
  {#if noRepo}
    <div class="welcome-view">
      <p class="welcome-text">In order to use Git features, you can open a folder containing a Git repository or clone from a URL.</p>
      <button class="welcome-btn" onclick={() => send('vscode.openFolder')}>Open Folder</button>
      <button class="welcome-btn" onclick={() => send('vscode.cloneRepo')}>Clone Repository</button>
    </div>
  {:else if loading}
    <div class="welcome-view">
      <p class="welcome-text">Loading repository…</p>
    </div>
  {:else if files.length === 0}
    <div class="welcome-view">
      <p class="welcome-text">No changes · working tree clean</p>
    </div>
  {:else}

    {#snippet renderFolder(node: TreeFolder, depth: number, inStaged: boolean)}
      {#if node.fullPath !== '__root__'}
        {@const folderPaths = allFilesInFolder(node)}

        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="folder-row"
          style="padding-left:{8 + depth * 14}px"
          onclick={() => onToggleFolder(node.fullPath)}
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
          <button
            class="row-act row-act--discard"
            title="Discard all changes in {node.label} (snapshot saved first)"
            aria-label="Discard all in {node.label}"
            onclick={(e) => { e.stopPropagation(); onDiscard(discardable(folderPaths)); }}
          >
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M3 6 L 6 3 M3 6 L 6 9 M3 6 H 9 a 3 3 0 0 1 0 6 H 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <!-- Folder checkbox: stages/unstages all files in folder -->
          <input
            type="checkbox"
            class="hg-checkbox"
            checked={inStaged}
            aria-label="{inStaged ? 'Unstage' : 'Stage'} all in {node.label}"
            onchange={(e) => {
              e.stopPropagation();
              onStageFolder(folderPaths, !inStaged);
            }}
            onclick={(e) => e.stopPropagation()}
          />
        </div>
      {/if}

      {#if node.fullPath === '__root__' || !collapsed.has(node.fullPath)}
        {#each node.children as child}
          {#if child.kind === 'folder'}
            {@render renderFolder(child, node.fullPath === '__root__' ? 0 : depth + 1, inStaged)}
          {:else}
            {@const f = child.file}
            {@const s = cfg(f.status)}
            {@const isRename = f.status?.toUpperCase() === 'R'}
            {@const parsed = isRename ? parseRename(f) : null}
            {@const fname = f.path.split('/').pop() ?? f.path}
            {@const staged = inStaged}
            {@const indent = 8 + (node.fullPath === '__root__' ? 0 : depth + 1) * 14}

            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="file-row"
              class:staged
              style="padding-left:{indent}px"
              onclick={() => onOpenDiff(f.path)}
              oncontextmenu={(e) => showCtx(e, f)}
              role="option"
              aria-selected={staged}
              data-status={f.status}
              data-path={f.path}
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

              {#if !isConflict(f)}
                {#if !isDeleted(f)}
                  <button
                    class="row-act"
                    title="Open file"
                    aria-label="Open {fname}"
                    onclick={(e) => { e.stopPropagation(); onOpenFile(f.path); }}
                  >
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                      <path d="M2 12 L 5 11 L 11 5 L 9 3 L 3 9 Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" fill="none"/>
                      <line x1="8" y1="4" x2="10" y2="6" stroke="currentColor" stroke-width="1.1"/>
                    </svg>
                  </button>
                {/if}
                <button
                  class="row-act row-act--discard"
                  title="Discard changes (snapshot saved first)"
                  aria-label="Discard changes in {fname}"
                  onclick={(e) => { e.stopPropagation(); onDiscard([f.path]); }}
                >
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                    <path d="M3 6 L 6 3 M3 6 L 6 9 M3 6 H 9 a 3 3 0 0 1 0 6 H 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              {/if}

              {#if !isConflict(f)}
                <input
                  type="checkbox"
                  class="hg-checkbox"
                  checked={staged}
                  aria-label="{staged ? 'Unstage' : 'Stage'} {fname}"
                  onchange={(e) => { e.stopPropagation(); onToggleStage(f.path, !staged); }}
                  onclick={(e) => e.stopPropagation()}
                />
              {/if}
            </div>
          {/if}
        {/each}
      {/if}
    {/snippet}

    {#if stagedFiles.length > 0}
      <div class="group-header">
        <span class="group-label">Staged Changes</span>
        <button
          class="group-action group-action--discard"
          title="Discard all staged changes (snapshot saved first)"
          aria-label="Discard all staged changes"
          onclick={() => onDiscard(discardable(stagedFiles.map((f) => f.path)))}
        >
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
            <path d="M3 6 L 6 3 M3 6 L 6 9 M3 6 H 9 a 3 3 0 0 1 0 6 H 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button
          class="group-action"
          title="Unstage all"
          onclick={() => onStageFolder(stagedFiles.map((f) => f.path), false)}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2.2 6h7.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      {@render renderFolder(stagedTree, 0, true)}
    {/if}

    {#if changesFiles.length > 0}
      <div class="group-header">
        <span class="group-label">Changes</span>
        <button
          class="group-action group-action--discard"
          title="Discard all changes (snapshot saved first)"
          aria-label="Discard all changes"
          onclick={() => onDiscard(discardable(changesFiles.map((f) => f.path)))}
        >
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
            <path d="M3 6 L 6 3 M3 6 L 6 9 M3 6 H 9 a 3 3 0 0 1 0 6 H 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button
          class="group-action"
          title="Stage all"
          onclick={() => onStageFolder(changesFiles.map((f) => f.path), true)}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M6 2.2v7.6M2.2 6h7.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      {@render renderFolder(changesTree, 0, false)}
    {/if}
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

  /* ── Welcome view (matches VS Code Source Control style) ── */
  .welcome-view {
    padding: 20px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .welcome-text {
    font-size: var(--hg-font-sm, 12px);
    color: var(--vscode-descriptionForeground, #8c8c8c);
    text-align: center;
    line-height: 1.5;
    margin: 0;
  }
  .welcome-btn {
    width: 100%;
    padding: 6px 14px;
    border-radius: 2px;
    border: none;
    font-size: var(--hg-font-sm, 12px);
    font-family: var(--hg-font-family);
    cursor: pointer;
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
  }
  .welcome-btn:hover {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }

  /* ── Section group header (Staged Changes / Changes) ── */
  .group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px 3px;
    font-size: var(--hg-font-xxs, 10px);
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    user-select: none;
  }
  /* Same visual size/treatment as the file checkboxes, with a bold +/- glyph. */
  .group-action {
    margin-left: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    min-width: 14px;
    padding: 0;
    border: 1px solid var(--vscode-checkbox-border, #6b6b6b);
    border-radius: 3px;
    background: var(--vscode-checkbox-background, #3c3c3c);
    color: var(--vscode-foreground, #cccccc);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.1s, background 0.1s, border-color 0.1s;
  }
  .group-header:hover .group-action,
  .group-action:focus-visible {
    opacity: 1;
  }
  .group-action:hover {
    background: var(--vscode-checkbox-selectBackground, #0078d4);
    border-color: var(--vscode-checkbox-selectBackground, #0078d4);
    color: #ffffff;
  }

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
    min-width: 0;
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
  .badge-conflict { background: rgba(224,72,72,0.15); color: #e04848; border: 0.5px solid rgba(224,72,72,0.4); }

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
  .fname-conflict { color: #e04848; }
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

  /* ── Row hover actions (discard / open file) ── */
  .row-act {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    min-width: 16px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--vscode-descriptionForeground, #999);
    cursor: pointer;
    opacity: 0;
    flex-shrink: 0;
    transition: opacity 0.1s, background 0.1s, color 0.1s;
  }
  .file-row:hover .row-act,
  .folder-row:hover .row-act,
  .row-act:focus-visible {
    opacity: 1;
  }
  .row-act:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.25));
    color: var(--vscode-foreground, #ccc);
  }
  .row-act--discard:hover {
    color: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39);
  }

  .group-action--discard:hover {
    background: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39);
    border-color: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39);
    color: #ffffff;
  }

  /* ── Context menu (same look as the detail pane's) ── */
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
    min-width: 200px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
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
  .ctx-divider {
    height: 0.5px;
    background: var(--vscode-panel-border, #3a3a3a);
    margin: 4px 0;
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
  .hg-checkbox:checked {
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
  .hg-checkbox:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: 1px;
  }
</style>
