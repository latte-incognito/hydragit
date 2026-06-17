<script lang="ts">
  import { send } from '$shared/messageBus';
  import { fullDate, smartDate } from '$shared/dates';
  import type { Commit, DiffFile, DiffHunk } from '../types';

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

  // ── Commit card helpers ─────────────────────────────────────────────────────
  let hashCopied = $state(false);
  let hashCopyTimer: ReturnType<typeof setTimeout>;
  async function copyHash() {
    if (!commit?.hash) return;
    await navigator.clipboard.writeText(commit.hash);
    hashCopied = true;
    clearTimeout(hashCopyTimer);
    hashCopyTimer = setTimeout(() => (hashCopied = false), 1200);
  }

  // "HEAD -> develop" becomes two pills; "tag: v1.0" keeps its tag styling.
  function refPills(refs: string[]): { label: string; kind: 'head' | 'tag' | 'branch' }[] {
    return refs.flatMap((r) =>
      r.split(' -> ').map((part) => {
        const p = part.trim();
        if (p === 'HEAD') return { label: 'HEAD', kind: 'head' as const };
        if (p.startsWith('tag: ')) return { label: p.slice(5), kind: 'tag' as const };
        return { label: p, kind: 'branch' as const };
      })
    );
  }

  // ⋯ overflow — the rarer/destructive actions, same handler as the log menu.
  // The dropdown is position:fixed and anchored to the button's viewport rect:
  // .detail-meta scrolls (overflow-y:auto), which clips absolutely-positioned
  // children, so an absolute dropdown would render cut off under the pane.
  let moreOpen = $state(false);
  let moreRight = $state(0);
  let moreBottom = $state(0);
  function toggleMore(e: MouseEvent) {
    hideTip();
    if (!moreOpen) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      moreRight = window.innerWidth - r.right;
      moreBottom = window.innerHeight - r.top + 4;
    }
    moreOpen = !moreOpen;
  }
  const MORE_ITEMS: { id: string; label: string; danger?: boolean }[] = [
    { id: 'checkout',     label: 'Checkout at commit (detached)' },
    { id: 'copy-message', label: 'Copy commit message' },
    { id: 'create-patch', label: 'Save as patch…' },
    { id: 'revert',       label: 'Revert commit', danger: true },
  ];
  function runMore(id: string) {
    moreOpen = false;
    if (commit) onCommitMenuAction(id, commit);
  }

  let isStash = $derived(!commit && stash !== null);

  // ── Derived totals ────────────────────────────────────────────────────────
  let totalAdd = $derived(files.reduce((a, f) => a + (f.additions ?? 0), 0));
  let totalDel = $derived(files.reduce((a, f) => a + (f.deletions ?? 0), 0));

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

  let tree = $derived(buildTree(files));

  // ── Collapse state ────────────────────────────────────────────────────────
  let collapsed = $state(new Set<string>());

  function toggleFolder(key: string) {
    // Reassign a fresh Set — Svelte 5 $state doesn't proxy Set mutations, and
    // self-assignment is dropped by the equality check, so .add/.delete alone
    // never re-renders (folder clicks silently did nothing).
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

  // ── Tooltip ───────────────────────────────────────────────────────────────
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
    tipTimer = setTimeout(() => { tipVisible = true; }, 400);
  }

  function hideTip() {
    clearTimeout(tipTimer);
    tipVisible = false;
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

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeCtx();
  }
</script>

<svelte:window
  onkeydown={onKeyDown}
  onclick={(e) => {
    if (moreOpen && !(e.target as HTMLElement).closest('.dm-more-wrap')) moreOpen = false;
  }}
/>

<!-- Fixed tooltip -->
{#if tipVisible}
  <div class="hg-tooltip" style="left:{tipX}px;top:{tipY}px">{tipText}</div>
{/if}

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
    <div class="ctx-item">
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.1"/>
          <path d="M7 4 V 7 L 9 8.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="ci-text">History Up to Here</span>
    </div>
    <div class="ctx-item"><span class="ci-icon"></span><span class="ci-text">Show Changes to Parents</span></div>
  </div>
{/if}

<div class="pane-detail">
  {#if isStash}
    <!-- ── Stash view (same layout as commit) ── -->
    <div class="detail-content">

      <div class="detail-files">
        {#if files.length === 0}
          <div class="df-msg df-msg--empty">No file changes</div>
        {:else}
          <div class="tree-toolbar">
            <span class="tree-count">
              {files.length} file{files.length !== 1 ? 's' : ''} changed
            </span>
            <div class="tt-wrap">
              <button class="tt-btn" aria-label="Expand all" onclick={expandAll}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2 3h8M2 6h8M2 9h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <div class="tt-wrap">
              <button class="tt-btn" aria-label="Collapse all" onclick={collapseAll}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          <div class="tree-body" oncontextmenu={showCtx}>
            {#snippet renderStashNodes(children: TreeNode[], depth: number)}
              {#each children as child}
                {#if child.kind === 'folder'}
                  <div
                    class="tree-row tree-row--folder"
                    style="padding-left:{8 + depth * 14}px"
                    onclick={() => toggleFolder(child.fullPath)}
                    oncontextmenu={showCtx}
                  >
                    <svg class="chevron" class:open={!collapsed.has(child.fullPath)} width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <svg class="folder-icon" width="13" height="12" viewBox="0 0 14 13" fill="none">
                      <path d="M1 4a1 1 0 011-1h3l1 1.5H12a1 1 0 011 1v5a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" stroke="currentColor" stroke-width="1.1"/>
                    </svg>
                    <span class="folder-label">{child.label}</span>
                    <span class="folder-count">{countFiles(child)}</span>
                  </div>
                  {#if !collapsed.has(child.fullPath)}
                    {@render renderStashNodes(child.children, depth + 1)}
                  {/if}
                {:else}
                  {@const f = child.file}
                  {@const s = cfg(f.status)}
                  {@const fname = f.path.split('/').pop() ?? f.path}
                  <div
                    class="tree-row tree-row--file"
                    class:selected={selFile === f.path}
                    style="padding-left:{8 + depth * 14}px"
                    onclick={() => { onSelectFile(f.path); openDiff(f.path); }}
                    ondblclick={() => openDiff(f.path, true)}
                    oncontextmenu={(e) => showCtx(e, f.path)}
                    role="option"
                    aria-selected={selFile === f.path}
                    tabindex="0"
                  >
                    <span class="badge {s.badgeClass}" title={f.status}>{s.label}</span>
                    <span class="fname {s.nameClass}" title={f.path}>{fname}</span>
                    <span class="file-stats">
                      {#if f.additions}<span class="stat-add">+{f.additions}</span>{/if}
                      {#if f.deletions}<span class="stat-del">-{f.deletions}</span>{/if}
                    </span>
                  </div>
                {/if}
              {/each}
            {/snippet}
            {@render renderStashNodes(tree.children, 0)}
          </div>
        {/if}
      </div>

      <div class="detail-meta">
        <div class="dm-msg">{stash.msg ?? stash.message ?? ''}</div>
        <div class="dm-row"><span class="dm-label">Ref</span>stash@{'{'}{stash.index ?? 0}{'}'}</div>
        {#if stash.time ?? stash.date}
          <div class="dm-row"><span class="dm-label">Date</span>{fullDate(stash.time ?? stash.date ?? '')}</div>
        {/if}
        <div class="dm-stats">
          <span class="stat-add">+{totalAdd}</span>
          <span class="stat-del">-{totalDel}</span>
          <span class="dm-stat-dim">{files.length} file{files.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="dm-actions">
          <button class="action-btn" onclick={() => onStashAction('pop')}>Pop</button>
          <button class="action-btn" onclick={() => onStashAction('apply')}>Apply</button>
          <button class="action-btn action-btn--danger" onclick={() => onStashAction('drop')}>Drop</button>
        </div>
      </div>

    </div>

  {:else if !commit && !compare}
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
          <div class="tree-toolbar" oncontextmenu={showCtx}>
            <span class="tree-count">
              {files.length} file{files.length !== 1 ? 's' : ''} changed
              {#if snippetFilter}
                <span class="tree-count-pickaxe"
                      title="Only files where the searched snippet was added or removed — that's why this commit matched">
                  · snippet matches
                </span>
              {/if}
            </span>
            {#if !loading}
              <span class="tree-totals">
                <span class="stat-add">+{totalAdd}</span>
                <span class="stat-del">-{totalDel}</span>
              </span>
            {/if}
            <div class="tt-wrap">
              <button
                class="tt-btn"
                aria-label="Expand all"
                onclick={expandAll}
                onmouseenter={e => showTip(e, 'Expand all')}
                onmouseleave={hideTip}
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
                onclick={collapseAll}
                onmouseenter={e => showTip(e, 'Collapse all')}
                onmouseleave={hideTip}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Tree — the synthetic repo-root node is not rendered: it was always
               there, always expanded, and cost one indent level for every row. -->
          <div class="tree-body" oncontextmenu={showCtx}>
            {#snippet renderNodes(children: TreeNode[], depth: number)}
              {#each children as child}
                {#if child.kind === 'folder'}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="tree-row tree-row--folder"
                    style="padding-left:{8 + depth * 14}px"
                    onclick={() => toggleFolder(child.fullPath)}
                    oncontextmenu={showCtx}
                  >
                    <svg class="chevron" class:open={!collapsed.has(child.fullPath)} width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <svg class="folder-icon" width="13" height="12" viewBox="0 0 14 13" fill="none">
                      <path d="M1 4a1 1 0 011-1h3l1 1.5H12a1 1 0 011 1v5a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" stroke="currentColor" stroke-width="1.1"/>
                    </svg>
                    <span class="folder-label">{child.label}</span>
                    <span class="folder-count">{countFiles(child)}</span>
                  </div>
                  {#if !collapsed.has(child.fullPath)}
                    {@render renderNodes(child.children, depth + 1)}
                  {/if}
                {:else}
                  <!-- File row -->
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
                    onclick={() => { onSelectFile(f.path); openDiff(f.path); }}
                    ondblclick={() => openDiff(f.path, true)}
                    oncontextmenu={(e) => showCtx(e, f.path)}
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

      <!-- ── Meta: compare header or commit detail ── -->
      <div class="detail-meta">
        {#if compare}
          <div class="dm-msg">{compare.title}</div>
          {#if loading}
            <div class="dm-stats"><span class="dm-stat-dim">Loading…</span></div>
          {:else}
            <div class="dm-stats">
              <span class="stat-add">+{totalAdd}</span>
              <span class="stat-del">-{totalDel}</span>
              <span class="dm-stat-dim">{files.length} file{files.length !== 1 ? 's' : ''}</span>
            </div>
          {/if}
        {:else if commit}
          <!-- Hash copies itself on click (GitHub style) — no Copy-hash button. -->
          <button
            class="dm-hash"
            title={hashCopied ? 'Copied!' : `${commit.hash} — click to copy`}
            onclick={copyHash}
          >
            {(commit.hash ?? '').slice(0, 8)}
            {#if hashCopied}
              <span class="dm-hash-copied">✓ copied</span>
            {:else}
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" class="dm-hash-copy">
                <rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.1"/>
                <path d="M8 4V3a1 1 0 00-1-1H3a1 1 0 00-1 1v4a1 1 0 001 1h1" stroke="currentColor" stroke-width="1.1"/>
              </svg>
            {/if}
          </button>
          <div class="dm-msg">{commit.message ?? commit.msg ?? ''}</div>
          <div class="dm-byline">
            <span class="dm-author">{commit.author ?? ''}</span>
            <span class="dm-byline-sep">·</span>
            <span title={fullDate(commit.date ?? '')}>{smartDate(commit.date ?? '')}</span>
          </div>
          {#if (commit.refs ?? []).length}
            <div class="dm-refs">
              {#each refPills(commit.refs ?? []) as pill}
                <span class="dm-pill dm-pill--{pill.kind}">{pill.label}</span>
              {/each}
            </div>
          {/if}
          <div class="dm-actions">
            <button class="action-btn"
                    onmouseenter={e => showTip(e, 'Apply this commit onto the current branch')}
                    onmouseleave={hideTip}
                    onclick={() => commit && onCommitMenuAction('cherry-pick', commit)}>Cherry-pick</button>
            <button class="action-btn"
                    onmouseenter={e => showTip(e, 'Create a new branch at this commit')}
                    onmouseleave={hideTip}
                    onclick={() => commit && onCommitMenuAction('new-branch', commit)}>Branch here</button>
            <button class="action-btn"
                    onmouseenter={e => showTip(e, 'Create a tag at this commit')}
                    onmouseleave={hideTip}
                    onclick={() => commit && onCommitMenuAction('new-tag', commit)}>Tag</button>
            {#if !commit.unpushed}
              <!-- Only for pushed commits — a local-only commit has no remote URL. -->
              <button class="action-btn" aria-label="View on remote"
                      onmouseenter={e => showTip(e, 'View this commit on the remote (GitHub, GitLab…)')}
                      onmouseleave={hideTip}
                      onclick={() => commit && onCommitMenuAction('view-in-browser', commit)}>↗</button>
            {/if}
            <span class="dm-more-wrap">
              <button class="action-btn" aria-label="More actions" aria-haspopup="menu" aria-expanded={moreOpen}
                      onmouseenter={e => showTip(e, 'More actions')}
                      onmouseleave={hideTip}
                      onclick={toggleMore}>⋯</button>
              {#if moreOpen}
                <div class="dm-more" role="menu" style="right:{moreRight}px;bottom:{moreBottom}px">
                  {#each MORE_ITEMS as item}
                    {#if item.danger}<div class="dm-more-sep"></div>{/if}
                    <button class="dm-more-item" class:danger={item.danger} role="menuitem"
                            onclick={() => runMore(item.id)}>{item.label}</button>
                  {/each}
                </div>
              {/if}
            </span>
          </div>
        {/if}
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
  .tree-count-pickaxe { color: var(--hg-code, #e8648a); }
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
  /* Bare colored status letters, VS Code SCM palette — the boxy chips around
     identical Ms were noise; color is the signal, and these tokens are muscle
     memory for anyone using VS Code's own source control view. */
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
  .badge-m { color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d); }
  .badge-a, .badge-u { color: var(--vscode-gitDecoration-addedResourceForeground, #81b88b); }
  .badge-d { color: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39); }
  .badge-r, .badge-c { color: var(--vscode-gitDecoration-renamedResourceForeground, #73c991); }

  /* ── File name ── */
  .fname {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--hg-font-family);
    font-size: var(--hg-font-xs);
  }
  .fname-m { color: var(--vscode-gitDecoration-modifiedResourceForeground, #4a9cd6); }
  .fname-a, .fname-u { color: var(--vscode-gitDecoration-addedResourceForeground, #4ec94e); }
  .fname-d { color: var(--vscode-descriptionForeground, #888); text-decoration: line-through; }
  .fname-d-strike { text-decoration: line-through; }
  .fname-r { color: var(--vscode-gitDecoration-renamedResourceForeground, #4a9cd6); }
  .fname-c { color: var(--vscode-gitDecoration-renamedResourceForeground, #e0a030); }
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
  /* Hash is the copy affordance — click copies the full hash. */
  .dm-hash {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--hg-editor-font-family);
    font-size: var(--hg-editor-font-size);
    color: #4a9cd6;
    margin-bottom: 4px;
    opacity: 0.85;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .dm-hash:hover { opacity: 1; }
  .dm-hash-copy { opacity: 0; transition: opacity 0.12s; }
  .dm-hash:hover .dm-hash-copy { opacity: 0.7; }
  .dm-hash-copied {
    font-size: var(--hg-font-xxs);
    color: #4ec94e;
    font-family: var(--hg-font-family);
  }
  .dm-msg {
    font-size: var(--hg-font-sm);
    color: var(--vscode-foreground, #eee);
    line-height: 1.4;
    margin-bottom: 6px;
  }
  .dm-byline {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: var(--hg-font-xs);
    color: var(--vscode-descriptionForeground, #888);
    margin-bottom: 4px;
  }
  .dm-byline-sep { color: var(--vscode-disabledForeground, #555); }
  .dm-refs {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin: 2px 0 4px;
  }
  .dm-pill {
    font-size: var(--hg-font-xxs);
    font-family: var(--hg-font-family);
    padding: 0px 6px;
    border-radius: 7px;
    line-height: 1.5;
    white-space: nowrap;
  }
  .dm-pill--head   { color: var(--hg-info, #56c8e8); background: rgba(86,200,232,0.12);  border: 0.5px solid rgba(86,200,232,0.35); }
  .dm-pill--branch { color: #4ec94e; background: rgba(78,201,78,0.1);    border: 0.5px solid rgba(78,201,78,0.3); }
  .dm-pill--tag    { color: var(--hg-warn, #e0a030); background: rgba(224,160,48,0.1);   border: 0.5px solid rgba(224,160,48,0.3); }
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
  .action-btn--danger:hover {
    color: #f07070;
  }

  /* ── ⋯ overflow menu (same handler as the log's right-click menu) ── */
  .dm-more-wrap { position: relative; }
  /* Fixed, viewport-anchored (right/bottom set inline from the button rect):
     .detail-meta's overflow-y clips absolutely-positioned descendants. */
  .dm-more {
    position: fixed;
    z-index: 120;
    min-width: 200px;
    background: var(--vscode-menu-background, #252526);
    border: 0.5px solid var(--vscode-menu-border, #3a3a3a);
    border-radius: 4px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    padding: 4px 0;
    display: flex;
    flex-direction: column;
  }
  .dm-more-item {
    background: none;
    border: none;
    text-align: left;
    padding: 4px 12px;
    font-size: var(--hg-font-xs);
    font-family: var(--hg-font-family);
    color: var(--vscode-menu-foreground, #ccc);
    cursor: pointer;
    white-space: nowrap;
  }
  .dm-more-item:hover {
    background: var(--vscode-menu-selectionBackground, #094771);
    color: var(--vscode-menu-selectionForeground, #fff);
  }
  .dm-more-item.danger { color: #f07070; }
  .dm-more-item.danger:hover { background: rgba(240,112,112,0.12); color: #f07070; }
  .dm-more-sep {
    height: 0.5px;
    background: var(--vscode-menu-separatorBackground, #3a3a3a);
    margin: 4px 0;
  }

  /* Totals in the tree toolbar (moved up from the commit card) */
  .tree-totals {
    display: flex;
    gap: 6px;
    font-size: var(--hg-font-xxs);
    font-family: var(--hg-editor-font-family);
    flex-shrink: 0;
    margin-right: 2px;
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
