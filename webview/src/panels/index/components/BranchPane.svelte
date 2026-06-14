<script lang="ts">
  import type { Branch, Snapshot, Stash, Worktree } from '../types';
  import { smartDate } from '$shared/dates';


  interface Props {
    branches?: Branch[];
    stashes?: Stash[];
    tags?: { name: string; hash: string; date?: string }[];
    worktrees?: Worktree[];
    activeBranch?: string;
    selStashIdx?: number | null;
    onSelectBranch?: (name: string, remote: boolean) => void;
    onHead?: () => void;
    headActive?: boolean;
    onFolderCtx?: (e: MouseEvent, prefix: string) => void;
    onSelectStash?: (i: number) => void;
    onStashAction?: (a: string) => void;
    onNewBranch?: () => void;
    onNewTag?: () => void;
    onNewStash?: () => void;
    onNewWorktree?: () => void;
    onNewSnapshot?: () => void;
    onBranchCtx?: (e: MouseEvent, name: string, isCurrent: boolean) => void;
    onStashCtx?: (e: MouseEvent, i: number) => void;
    onTagCtx?: (e: MouseEvent, name: string) => void;
    onTagSelect?: (hash: string) => void;
    onSelectWorktree?: (path: string) => void;
    onWorktreeCtx?: (e: MouseEvent, wt: Worktree) => void;
    snapshots?: Snapshot[];
    onSnapshotSelect?: (s: Snapshot) => void;
    onSnapshotAction?: (a: string, s: Snapshot) => void;
  }

  let {
    branches = [],
    stashes = [],
    tags = [],
    worktrees = [],
    activeBranch = '',
    selStashIdx = null,
    onSelectBranch = () => {},
    onHead = () => {},
    headActive = false,
    onFolderCtx = () => {},
    onSelectStash = () => {},
    onStashAction = () => {},
    onNewBranch = () => {},
    onNewTag = () => {},
    onNewStash = () => {},
    onNewWorktree = () => {},
    onNewSnapshot = () => {},
    onBranchCtx = () => {},
    onStashCtx = () => {},
    onTagCtx = () => {},
    onTagSelect = () => {},
    onSelectWorktree = () => {},
    onWorktreeCtx = () => {},
    snapshots = [],
    onSnapshotSelect = () => {},
    onSnapshotAction = () => {}
  }: Props = $props();

  let snapshotsOpen = $state(false);

  // ── Types ────────────────────────────────────────────────────────────────────

  interface FolderNode {
    kind: 'folder';
    label: string;
    children: TreeNode[];
    open: boolean;
  }
  interface LeafNode {
    kind: 'leaf';
    branch: Branch;
    fullName?: string;   // remote: full name for IPC calls e.g. "origin/feature-x"
    displayName?: string; // remote: short name for display e.g. "feature-x"
  }
  type TreeNode = FolderNode | LeafNode;

  // ── Filter ────────────────────────────────────────────────────────────────────
  // Type-to-filter across every section. While filtering, sections render open
  // and branch folders auto-expand so matches are never hidden.
  let filterOpen = $state(false);
  let filterText = $state('');
  let filterInputEl: HTMLInputElement = $state();
  let filtering = $derived(filterText.trim().length > 0);

  function matches(s: string): boolean {
    return s.toLowerCase().includes(filterText.trim().toLowerCase());
  }

  function openFilter() {
    filterOpen = true;
    setTimeout(() => filterInputEl?.focus(), 10);
  }
  function closeFilter() {
    filterOpen = false;
    filterText = '';
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  let local = $derived(branches.filter((b) => !b.isRemote && (!filtering || matches(b.name))));
  let remote = $derived(branches.filter((b) => b.isRemote && (!filtering || matches(b.name))));

  let filteredTags      = $derived(filtering ? tags.filter((t) => matches(t.name)) : tags);
  let filteredStashes   = $derived(filtering ? stashes.filter((s) => matches(s.msg ?? s.message ?? '')) : stashes);
  let filteredWorktrees = $derived(filtering ? worktrees.filter((w) => matches(worktreeLabel(w))) : worktrees);
  let filteredSnapshots = $derived(filtering ? snapshots.filter((s) => matches(s.label)) : snapshots);

  // The default branch (shield marker) comes from origin/HEAD via the Go side
  // (Branch.isDefault) — never guessed from names like "master"/"main".

  // Remote: group by first path segment (the remote name, e.g. "origin")
  let remoteByOrigin = $derived(remote.reduce(
    (acc, b) => {
      const slash = b.name.indexOf('/');
      const origin = slash === -1 ? b.name : b.name.slice(0, slash);
      const short = slash === -1 ? b.name : b.name.slice(slash + 1);
      acc[origin] = acc[origin] ?? [];
      acc[origin].push({ branch: b, short });
      return acc;
    },
    {} as Record<string, { branch: Branch; short: string }[]>
  ));

  // ── Tree builder ──────────────────────────────────────────────────────────────
  //
  // Converts a flat list of {name, branch} into a nested FolderNode / LeafNode
  // tree. Names with slashes are nested; top-level names become leaves directly.

  function buildTree(items: { name: string; branch: Branch; fullName?: string; displayName?: string }[]): TreeNode[] {
    const root: TreeNode[] = [];
    for (const { name, branch, fullName, displayName } of items) {
      const parts = name.split('/');
      if (parts.length === 1) {
        root.push({ kind: 'leaf', branch, fullName, displayName });
        continue;
      }
      let children = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const label = parts[i];
        let folder = children.find(
          (n): n is FolderNode => n.kind === 'folder' && n.label === label
        );
        if (!folder) {
          folder = { kind: 'folder', label, children: [], open: false };
          children.push(folder);
        }
        children = folder.children;
      }
      children.push({ kind: 'leaf', branch, fullName, displayName });
    }
    return root;
  }

  // Sort a tree level: folders first (alpha), then leaves (alpha by display name)
  function sortLevel(nodes: TreeNode[]): TreeNode[] {
    return [...nodes].sort((a, b) => {
      if (a.kind === b.kind) {
        const aLabel = a.kind === 'folder' ? a.label : (a.displayName ?? a.branch.name.split('/').pop()!);
        const bLabel = b.kind === 'folder' ? b.label : (b.displayName ?? b.branch.name.split('/').pop()!);
        return aLabel.localeCompare(bLabel);
      }
      return a.kind === 'folder' ? -1 : 1;
    });
  }

  function sortTree(nodes: TreeNode[]): TreeNode[] {
    return sortLevel(nodes).map((n) =>
      n.kind === 'folder' ? { ...n, children: sortTree(n.children) } : n
    );
  }

  // Preserve open/close state when data re-fetches
  function mergeOpen(old: TreeNode[], next: TreeNode[]) {
    for (const node of next) {
      if (node.kind !== 'folder') continue;
      const prev = old.find((n): n is FolderNode => n.kind === 'folder' && n.label === node.label);
      if (prev) {
        node.open = prev.open;
        mergeOpen(prev.children, node.children);
      }
    }
  }

  // openState caches are deliberately NOT $state — the effects below both read
  // and write them; making them reactive would retrigger the effects forever.
  let localOpenCache:  TreeNode[] = [];
  let remoteOpenCache: Record<string, TreeNode[]> = {};

  let localTree:   TreeNode[] = $state([]);
  let remoteTrees: Record<string, TreeNode[]> = $state({});

  // While filtering, every folder is forced open so matches are visible.
  function openAll(nodes: TreeNode[]) {
    for (const n of nodes) {
      if (n.kind === 'folder') {
        n.open = true;
        openAll(n.children);
      }
    }
  }

  // $effect.pre so the trees are computed before paint (no empty-tree flash).
  $effect.pre(() => {
    const next = sortTree(buildTree(local.map((b) => ({ name: b.name, branch: b }))));
    mergeOpen(localOpenCache, next);
    if (filtering) openAll(next);
    localOpenCache = next;
    localTree = next;
  });

  $effect.pre(() => {
    const next: Record<string, TreeNode[]> = {};
    for (const [origin, items] of Object.entries(remoteByOrigin)) {
      const treeItems = items.map(({ branch, short }) => ({
        name: short,
        branch,
        fullName: branch.name,                  // "origin/feat/develop" — used for IPC calls
        displayName: short.split('/').pop(),     // last segment only — used for display
      }));
      const built = sortTree(buildTree(treeItems));
      if (remoteOpenCache[origin]) mergeOpen(remoteOpenCache[origin], built);
      if (filtering) openAll(built);
      next[origin] = built;
    }
    remoteOpenCache = next;
    remoteTrees = next;
  });

  // ── Toggle helpers ────────────────────────────────────────────────────────────

  function toggleLocal(node: FolderNode) {
    node.open = !node.open;
    localTree = localTree;
  }
  function toggleRemote(_origin: string, node: FolderNode) {
    node.open = !node.open;
    remoteTrees = remoteTrees;
  }

  // ── Section open state ────────────────────────────────────────────────────────

  let localOpen = $state(true);
  let remoteOpen = $state(true);
  let remoteOriginOpen: Record<string, boolean> = $state({});
  let tagsOpen = $state(false);
  let stashOpen = $state(false);
  let worktreesOpen = $state(false);

  // Label for a worktree row: branch name, else a short detached hash, else the
  // folder basename (covers bare/odd cases).
  function worktreeLabel(wt: Worktree): string {
    if (wt.bare) return '(bare)';
    if (wt.branch) return wt.branch;
    if (wt.detached && wt.head) return `${wt.head.slice(0, 7)} (detached)`;
    return wt.path.split(/[\\/]/).pop() ?? wt.path;
  }

  function isOriginOpen(o: string) { return remoteOriginOpen[o] ?? true; }
  function toggleOrigin(o: string) {
    remoteOriginOpen[o] = !isOriginOpen(o);
  }
</script>

{#snippet branchIcon(current: boolean)}
  <!-- One hydra head = one branch. Gradient head for the checked-out branch. -->
  <svg class="bicon" width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path d="M4.2 12.5C4.2 8.6 9.3 9.2 9.3 5.4"
          stroke={current ? 'url(#hydra-head-grad)' : 'currentColor'}
          stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <circle cx="9.3" cy="3.4" r="1.7" fill={current ? 'url(#hydra-head-grad)' : 'currentColor'}/>
  </svg>
{/snippet}

{#snippet defaultMark()}
  <span class="shield-wrap" title="Default branch (origin/HEAD)">
    <svg width="9" height="10" viewBox="0 0 10 11" fill="none">
      <path d="M5 .8 9 2.2v3.1c0 2.6-1.7 4.2-4 5-2.3-.8-4-2.4-4-5V2.2L5 .8z"
            stroke="currentColor" stroke-width="1"/>
    </svg>
  </span>
{/snippet}

{#snippet trackBadge(b: import('../types').Branch)}
  {#if b.gone}
    <span class="track gone">gone</span>
  {:else if b.ahead || b.behind}
    <span class="tkwrap">
      {#if b.ahead}<span class="tk tk-ahead">↑{b.ahead}</span>{/if}
      {#if b.behind}<span class="tk tk-behind">↓{b.behind}</span>{/if}
    </span>
  {/if}
{/snippet}

{#snippet sectionHdr(label: string, count: number, open: boolean, toggle: () => void, add: (() => void) | null, addTitle: string)}
  <div class="tgroup-hdr" onclick={toggle} role="button" tabindex="0">
    <span class="tgroup-arrow" class:closed={!open && !filtering}>▾</span>
    <span class="tgroup-label">{label}</span>
    <span class="tgroup-count">{count}</span>
    {#if add}
      <button class="tgroup-add" title={addTitle}
              onclick={(e) => { e.stopPropagation(); add(); }}>+</button>
    {/if}
  </div>
{/snippet}

<div class="pane-branches">
  <!-- Gradient shared by every current-branch hydra head below -->
  <svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <defs>
      <linearGradient id="hydra-head-grad" x1="0" y1="0" x2="14" y2="14" gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stop-color="#2fbdb3"/>
        <stop offset="55%"  stop-color="#1e8f8f"/>
        <stop offset="100%" stop-color="#c0c8cc"/>
      </linearGradient>
    </defs>
  </svg>

  <div class="pane-hdr">
    {#if filterOpen}
      <input
        bind:this={filterInputEl}
        class="pane-filter"
        placeholder="Filter refs…"
        bind:value={filterText}
        onkeydown={(e) => e.key === 'Escape' && closeFilter()}
      />
      <button class="pane-hdr-btn" title="Close filter" onclick={closeFilter}>×</button>
    {:else}
      <span>Branches</span>
      <button class="pane-hdr-btn" title="Filter branches, tags, stashes…" onclick={openFilter}>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <circle cx="5" cy="5" r="3.5" stroke="currentColor" stroke-width="1.2"/>
          <path d="M8 8l2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </button>
    {/if}
  </div>

  <div class="tree-scroll">

    <!-- Undo timeline — the door to reflog mode. Labelled by function: it is a
         mode switch, not a branch (it used to masquerade as "HEAD · branch"). -->
    <div
      class="titem timeline"
      class:active={headActive}
      onclick={onHead}
      title="Browse HEAD history — reset to any point"
      role="option"
      aria-selected={headActive}
      tabindex="0"
    >
      <svg class="timeline-icon" width="12" height="12" viewBox="0 0 13 13" fill="none">
        <path d="M4 3L1.5 5.5 4 8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M1.5 5.5H8a3.5 3.5 0 010 7H5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
      <span class="titem-name">Undo timeline</span>
    </div>

    <!-- ── LOCAL ──────────────────────────────────────────────────────────── -->
    {@render sectionHdr('Local', local.length, localOpen, () => (localOpen = !localOpen), onNewBranch, 'New branch')}
    {#if localOpen || filtering}
      {#each localTree as node}
        {#if node.kind === 'folder'}
          <div
            class="titem folder-row"
            style="padding-left:22px"
            onclick={() => toggleLocal(node)}
            oncontextmenu={(e) => onFolderCtx(e, node.label)}
            title="Right-click to rename this folder of branches"
            role="button" tabindex="0"
          >
            <span class="folder-arrow" class:open={node.open}>▾</span>
            <span class="folder-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 3.5A1 1 0 0 1 2.5 2.5H6l1.5 1.5H13.5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V3.5z" fill="currentColor" opacity="0.75"/></svg></span>
            <span class="titem-name">{node.label}</span>
          </div>
          {#if node.open}
            {#each node.children as child}
              {#if child.kind === 'folder'}
                <!-- depth-2 folder -->
                <div
                  class="titem folder-row"
                  style="padding-left:36px"
                  onclick={() => toggleLocal(child)}
                  oncontextmenu={(e) => onFolderCtx(e, `${node.label}/${child.label}`)}
                  title="Right-click to rename this folder of branches"
                  role="button" tabindex="0"
                >
                  <span class="folder-arrow" class:open={child.open}>▾</span>
                  <span class="folder-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 3.5A1 1 0 0 1 2.5 2.5H6l1.5 1.5H13.5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V3.5z" fill="currentColor" opacity="0.75"/></svg></span>
                  <span class="titem-name">{child.label}</span>
                </div>
                {#if child.open}
                  {#each child.children as gc}
                    {#if gc.kind === 'leaf'}
                      {@const b = gc.branch}
                      <div
                        class="titem"
                        class:current={b.isCurrent}
                        class:active={b.name === activeBranch}
                        class:gone={b.gone}
                        style="padding-left:50px"
                        onclick={() => onSelectBranch(b.name, false)}
                        oncontextmenu={(e) => onBranchCtx(e, b.name, b.isCurrent)}
                        role="option" aria-selected={b.name === activeBranch} tabindex="0"
                      >
                        <span class="titem-icon">{@render branchIcon(b.isCurrent)}</span>
                        <span class="titem-name">{b.name.split('/').pop()}</span>
                        {#if b.isDefault}{@render defaultMark()}{/if}
                        {@render trackBadge(b)}
                      </div>
                    {/if}
                  {/each}
                {/if}
              {:else}
                <!-- depth-1 leaf -->
                {@const b = child.branch}
                <div
                  class="titem"
                  class:current={b.isCurrent}
                  class:active={b.name === activeBranch}
                  class:gone={b.gone}
                  style="padding-left:36px"
                  onclick={() => onSelectBranch(b.name, false)}
                  oncontextmenu={(e) => onBranchCtx(e, b.name, b.isCurrent)}
                  role="option" aria-selected={b.name === activeBranch} tabindex="0"
                >
                  <span class="titem-icon">{@render branchIcon(b.isCurrent)}</span>
                  <span class="titem-name">{b.name.split('/').pop()}</span>
                  {#if b.isDefault}{@render defaultMark()}{/if}
                  {@render trackBadge(b)}
                </div>
              {/if}
            {/each}
          {/if}
        {:else}
          <!-- top-level local leaf -->
          {@const b = node.branch}
          <div
            class="titem"
            class:current={b.isCurrent}
            class:active={b.name === activeBranch}
            class:gone={b.gone}
            onclick={() => onSelectBranch(b.name, false)}
            oncontextmenu={(e) => onBranchCtx(e, b.name, b.isCurrent)}
            role="option" aria-selected={b.name === activeBranch} tabindex="0"
          >
            <span class="titem-icon">{@render branchIcon(b.isCurrent)}</span>
            <span class="titem-name">{b.name}</span>
            {#if b.isDefault}{@render defaultMark()}{/if}
            {@render trackBadge(b)}
          </div>
        {/if}
      {/each}
    {/if}

    <!-- ── REMOTE ───────────────────────────────────────────────────────────── -->
    {@render sectionHdr('Remote', remote.length, remoteOpen, () => (remoteOpen = !remoteOpen), null, '')}
    {#if remoteOpen || filtering}
      {#each Object.entries(remoteByOrigin) as [origin]}
        <!-- Origin subgroup header -->
        <div
          class="tsubgroup-hdr"
          role="button" tabindex="0"
          onclick={() => toggleOrigin(origin)}
        >
          <span class="tgroup-arrow" class:closed={!isOriginOpen(origin)}>▾</span>
          <span>{origin}</span>
        </div>
        {#if isOriginOpen(origin)}
          {#each (remoteTrees[origin] ?? []) as node}
            {#if node.kind === 'folder'}
              <div
                class="titem folder-row remote"
                style="padding-left:36px"
                onclick={() => toggleRemote(origin, node)}
                role="button" tabindex="0"
              >
                <span class="folder-arrow" class:open={node.open}>▾</span>
                <span class="folder-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 3.5A1 1 0 0 1 2.5 2.5H6l1.5 1.5H13.5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V3.5z" fill="currentColor" opacity="0.75"/></svg></span>
                <span class="titem-name">{node.label}</span>
              </div>
              {#if node.open}
                {#each node.children as child}
                  {#if child.kind === 'leaf'}
                    {@const full = child.fullName ?? child.branch.name}
                    <div
                      class="titem remote"
                      class:active={full === activeBranch}
                      class:gone={child.branch.gone}
                      style="padding-left:50px"
                      onclick={() => onSelectBranch(full, true)}
                      oncontextmenu={(e) => onBranchCtx(e, full, false)}
                      role="option" aria-selected={full === activeBranch} tabindex="0"
                    >
                      <span class="titem-icon">{@render branchIcon(false)}</span>
                      <span class="titem-name">{child.displayName ?? child.branch.name.split('/').pop()}</span>
                      {#if child.branch.gone}<span class="track gone">gone</span>{/if}
                    </div>
                  {/if}
                {/each}
              {/if}
            {:else}
              {@const full = node.fullName ?? node.branch.name}
              <div
                class="titem remote"
                class:active={full === activeBranch}
                class:gone={node.branch.gone}
                style="padding-left:36px"
                onclick={() => onSelectBranch(full, true)}
                oncontextmenu={(e) => onBranchCtx(e, full, false)}
                role="option" aria-selected={full === activeBranch} tabindex="0"
              >
                <span class="titem-icon">{@render branchIcon(false)}</span>
                <span class="titem-name">{node.displayName ?? node.branch.name.split('/').pop()}</span>
                {#if node.branch.gone}<span class="track gone">gone</span>{/if}
              </div>
            {/if}
          {/each}
        {/if}
      {/each}
    {/if}

    <!-- ── TAGS ─────────────────────────────────────────────────────────────── -->
    {@render sectionHdr('Tags', filteredTags.length, tagsOpen, () => (tagsOpen = !tagsOpen), onNewTag, 'New tag at HEAD')}
    {#if tagsOpen || filtering}
      {#if filteredTags.length === 0}
        <div class="stash-empty">No tags</div>
      {:else}
        {#each filteredTags as tag}
          <!-- No click handler — double-click intentionally does nothing.
               Right-click opens context menu via onTagCtx prop. -->
          <div
            class="titem tag-row"
            onclick={() => onTagSelect(tag.hash)}
            oncontextmenu={(e) => { e.preventDefault(); onTagCtx(e, tag.name); }}
            role="option"
            aria-selected="false"
            tabindex="0"
          >
            <span class="titem-icon tag-icon">◇</span>
            <span class="titem-name">{tag.name}</span>
            {#if tag.date}<span class="track">{tag.date}</span>{/if}
          </div>
        {/each}
      {/if}
    {/if}

    <!-- ── STASHES ───────────────────────────────────────────────────────────── -->
    {@render sectionHdr('Stashes', filteredStashes.length, stashOpen, () => (stashOpen = !stashOpen), onNewStash, 'Stash working tree')}
    {#if stashOpen || filtering}
      {#if filteredStashes.length === 0}
        <div class="stash-empty">No stashes</div>
      {:else}
        {#each filteredStashes as s}
          {@const i = stashes.indexOf(s)}
          <div
            class="titem stash"
            class:active={selStashIdx === i}
            onclick={() => onSelectStash(i)}
            oncontextmenu={(e) => onStashCtx(e, i)}
            role="option"
            aria-selected={selStashIdx === i}
            tabindex="0"
          >
            <div class="stash-msg" title={s.msg ?? s.message ?? ''}>{s.msg ?? s.message ?? ''}</div>
            <div class="stash-meta">
              <span>stash@{'{'}{s.index ?? i}{'}'}</span>
              <span>{s.time ?? s.date ?? ''}</span>
              {#if s.add ?? s.additions}
                <span style="color:var(--vscode-gitDecoration-addedResourceForeground, #4ec94e)">+{s.add ?? s.additions}</span>
              {/if}
              {#if s.rem ?? s.deletions}
                <span style="color:var(--vscode-gitDecoration-deletedResourceForeground, #f07070)">-{s.rem ?? s.deletions}</span>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    {/if}

    <!-- ── WORKTREES ─────────────────────────────────────────────────────────── -->
    {@render sectionHdr('Worktrees', filteredWorktrees.length, worktreesOpen, () => (worktreesOpen = !worktreesOpen), onNewWorktree, 'Add worktree')}
    {#if worktreesOpen || filtering}
      {#if filteredWorktrees.length === 0}
        <div class="stash-empty">No worktrees</div>
      {:else}
        {#each filteredWorktrees as wt}
          <div
            class="titem worktree"
            class:current={wt.isMain}
            onclick={() => onSelectWorktree(wt.path)}
            oncontextmenu={(e) => { e.preventDefault(); onWorktreeCtx(e, wt); }}
            title={wt.locked && wt.lockReason ? `${wt.path}\nLocked: ${wt.lockReason}` : wt.path}
            role="option"
            aria-selected="false"
            tabindex="0"
          >
            <span class="titem-icon">{wt.locked ? '⊘' : '⧉'}</span>
            <span class="titem-name">{worktreeLabel(wt)}</span>
            {#if wt.isMain}<span class="track">main</span>
            {:else if wt.prunable}<span class="track gone">missing</span>
            {:else if wt.locked}<span class="track">locked</span>{/if}
          </div>
        {/each}
      {/if}
    {/if}

    <!-- ── SNAPSHOTS — working-tree time machine ─────────────────────────────── -->
    {@render sectionHdr('Snapshots', filteredSnapshots.length, snapshotsOpen, () => (snapshotsOpen = !snapshotsOpen), onNewSnapshot, 'Take a snapshot now')}
    {#if snapshotsOpen || filtering}
      {#if filteredSnapshots.length === 0}
        <div class="stash-empty">No snapshots — taken automatically before risky operations</div>
      {:else}
        {#each filteredSnapshots as snap (snap.ref)}
          <div
            class="titem snapshot"
            onclick={() => onSnapshotSelect(snap)}
            title={`${snap.label}${snap.branch ? ` on ${snap.branch}` : ''}\n${new Date(snap.date).toLocaleString()}\nClick: show what was captured · ↺: restore · ×: delete`}
            role="option"
            aria-selected="false"
            tabindex="0"
          >
            <span class="titem-icon">◷</span>
            <span class="titem-name">{snap.label}{#if snap.branch} <span class="snap-branch">· {snap.branch}</span>{/if}</span>
            <span class="track">{smartDate(snap.date)}</span>
            <span
              class="snap-act" title="Restore working tree from this snapshot" role="button" tabindex="0"
              onclick={(e) => { e.stopPropagation(); onSnapshotAction('restore', snap); }}
            >↺</span>
            <span
              class="snap-act" title="Delete snapshot" role="button" tabindex="0"
              onclick={(e) => { e.stopPropagation(); onSnapshotAction('drop', snap); }}
            >×</span>
          </div>
        {/each}
      {/if}
    {/if}

  </div><!-- /tree-scroll -->

</div>

<style>
  .snap-act {
    display: none;
    padding: 0 3px;
    border-radius: 3px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    flex-shrink: 0;
  }
  .titem.snapshot:hover .snap-act { display: inline; }
  .snap-branch { color: var(--vscode-descriptionForeground, #8c8c8c); }
  .snap-act:hover {
    color: var(--vscode-foreground, #ccc);
    background: var(--vscode-toolbar-hoverBackground, #3a3a3a);
  }

  .pane-branches {
    width: 200px;
    min-width: 120px;
    max-width: 400px;
    background: var(--vscode-sideBar-background, #252526);
    border-right: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
    min-height: 0;
    height: 100%;
  }
  .pane-hdr {
    height: 22px;
    padding: 0px 10px;
    font-size: var(--hg-font-xxs);
    color: var(--vscode-disabledForeground, #444);
    border-bottom: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    background: var(--vscode-sideBarSectionHeader-background, #222);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .pane-hdr-btn {
    background: none;
    border: none;
    padding: 1px 2px;
    display: flex;
    align-items: center;
    color: var(--vscode-disabledForeground, #444);
    cursor: pointer;
    line-height: 1;
    font-size: var(--hg-font-xs);
  }
  .pane-hdr-btn:hover { color: var(--vscode-foreground, #ccc); }
  .pane-filter {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    outline: none;
    color: var(--vscode-input-foreground, #ccc);
    font-size: var(--hg-font-xs);
    font-family: var(--hg-font-family);
  }
  .pane-filter::placeholder { color: var(--vscode-disabledForeground, #444); }

  .tree-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  /* ── Section headers ─────────────────────────────────────────────────────── */
  .tgroup-hdr {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    gap: 4px;
    cursor: pointer;
    color: var(--vscode-descriptionForeground, #666);
    font-size: var(--hg-font-xs);
    user-select: none;
  }
  .tgroup-hdr:hover { color: var(--vscode-foreground, #ccc); }

  .tgroup-arrow {
    font-size: var(--hg-font-xxs);
    width: 10px;
    flex-shrink: 0;
    transition: transform 0.15s;
    display: inline-block;
  }
  .tgroup-arrow.closed { transform: rotate(-90deg); }

  /* De-shouted (Linear-style): rows louder than headers — no caps, no weight. */
  .tgroup-label {
    font-weight: 400;
    font-size: var(--hg-font-xs);
  }
  .tgroup-count {
    font-size: var(--hg-font-xxs);
    color: var(--vscode-disabledForeground, #3a3a3a);
    margin-left: auto;
  }
  /* Per-section create action — appears on header hover only (Discord style). */
  .tgroup-add {
    visibility: hidden;
    background: none;
    border: none;
    padding: 0 3px;
    margin-left: 2px;
    border-radius: 3px;
    color: var(--vscode-descriptionForeground, #888);
    font-size: var(--hg-font-sm);
    line-height: 1;
    cursor: pointer;
    flex-shrink: 0;
  }
  .tgroup-hdr:hover .tgroup-add { visibility: visible; }
  .tgroup-add:hover {
    color: var(--vscode-foreground, #fff);
    background: var(--vscode-toolbar-hoverBackground, #3a3a3a);
  }
  /* ── Worktree rows ───────────────────────────────────────────────────────── */
  .titem.worktree { font-size: var(--hg-font-xs); }
  .titem.worktree .titem-icon { opacity: 0.7; }

  /* ── Tree items ──────────────────────────────────────────────────────────── */
  .titem {
    display: flex;
    align-items: center;
    padding: 4px 8px 4px 22px;
    gap: 5px;
    cursor: pointer;
    font-size: var(--hg-font-sm);
    color: var(--vscode-descriptionForeground, #888);
    border-left: 2px solid transparent;
    white-space: nowrap;
    overflow: hidden;
  }
  /* ── Undo timeline row (door to reflog mode) ─────────────────────────────── */
  .titem.timeline {
    padding-left: 10px;
    margin-bottom: 2px;
    color: var(--vscode-descriptionForeground, #888);
  }
  .titem.timeline .timeline-icon { color: #e0a030; opacity: 0.75; flex-shrink: 0; }
  .titem.timeline:hover .timeline-icon { opacity: 1; }
  .titem.timeline.active {
    background: rgba(224,160,48,0.08);
    border-left-color: #e0a030;
    color: var(--vscode-foreground, #ccc);
  }
  .titem:hover {
    background: var(--vscode-list-hoverBackground, #2a2d2e);
    color: var(--vscode-foreground, #ccc);
  }
  .titem.active {
    background: var(--vscode-list-activeSelectionBackground, #0e2535);
    color: var(--vscode-foreground, #ccc);
    border-left-color: #56c8e8;
  }
  .titem.current { color: var(--vscode-foreground, #eee); }
  .titem-icon {
    font-size: var(--hg-font-xs);
    flex-shrink: 0;
    width: 14px;
    text-align: center;
  }
  .titem-name { overflow: hidden; text-overflow: ellipsis; flex: 1; }

  /* ── Folder rows ─────────────────────────────────────────────────────────── */
  .folder-row { color: var(--vscode-descriptionForeground, #666); }
  .folder-row:hover { color: var(--vscode-foreground, #ccc); }

  .folder-arrow {
    font-size: var(--hg-font-xxs);
    width: 10px;
    flex-shrink: 0;
    transition: transform 0.12s;
    display: inline-block;
    transform: rotate(-90deg); /* closed by default */
  }
  .folder-arrow.open { transform: rotate(0deg); }

  /* Folder SVG icon */
  .folder-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--vscode-symbolIcon-folderForeground, #dcb67a);
  }

  /* ── Remote subgroup ─────────────────────────────────────────────────────── */
  .tsubgroup-hdr {
    display: flex;
    align-items: center;
    padding: 3px 8px 3px 22px;
    gap: 4px;
    cursor: pointer;
    color: var(--vscode-descriptionForeground, #555);
    font-size: var(--hg-font-xs);
    user-select: none;
  }
  .tsubgroup-hdr:hover { color: var(--vscode-foreground, #ccc); }

  .titem.remote {
    font-size: var(--hg-font-xs);
    color: var(--vscode-descriptionForeground, #666);
  }
  .titem.remote:hover { color: var(--vscode-foreground, #999); }

  /* ── Tag rows ────────────────────────────────────────────────────────────── */
  .tag-row { cursor: pointer; }
  .tag-row:hover {
    background: var(--vscode-list-hoverBackground, #2a2d2e);
    color: var(--vscode-foreground, #ccc);
  }
  .tag-icon { opacity: 0.6; }

  /* ── Tracking badge ──────────────────────────────────────────────────────── */
  .track {
    margin-left: auto;
    font-size: 0.7rem;
    opacity: 0.6;
    white-space: nowrap;
  }
  .track.gone { color: #f07070; opacity: 1; }
  .titem.gone .titem-name { opacity: 0.45; text-decoration: line-through; }

  /* Ahead/behind (Fork/Tower style) — in-sync branches show nothing at all. */
  .tkwrap {
    margin-left: auto;
    display: flex;
    gap: 3px;
    flex-shrink: 0;
    font-size: var(--hg-font-xxs);
  }
  .tk-ahead  { color: #e0a030; }
  .tk-behind { color: #56c8e8; }

  /* Branch icon (hydra head) + default-branch shield */
  .bicon { display: block; color: var(--vscode-descriptionForeground, #777); }
  .titem.current .bicon, .titem.active .bicon { color: var(--vscode-foreground, #ccc); }
  .shield-wrap {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    opacity: 0.8;
  }

  /* ── Stash rows ──────────────────────────────────────────────────────────── */
  .titem.stash {
    padding-left: 22px;
    font-size: var(--hg-font-xs);
    flex-direction: column;
    align-items: flex-start;
    height: auto;
    padding-top: 5px;
    padding-bottom: 5px;
    gap: 2px;
  }
  .titem.stash.active { background: var(--vscode-list-activeSelectionBackground, #0e2535); border-left-color: #9a7ae8; }
  .stash-msg { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
  .stash-meta {
    font-size: var(--hg-font-xxs);
    color: var(--vscode-disabledForeground, #3a3a3a);
    display: flex;
    gap: 6px;
    width: 100%;
  }
  .stash-empty { padding: 8px 22px; font-size: var(--hg-font-xs); color: #333; font-style: italic; }

  /* ── Stash action bar ────────────────────────────────────────────────────── */
  .stash-actions {
    padding: 4px 8px;
    border-top: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    display: flex;
    gap: 3px;
    flex-shrink: 0;
    background: var(--vscode-editor-background, #1e1e1e);
  }
  .sab {
    font-size: var(--hg-font-xxs);
    padding: 2px 6px;
    border-radius: 3px;
    border: 0.5px solid var(--vscode-widget-border, #333);
    background: var(--vscode-sideBar-background, #252526);
    color: var(--vscode-descriptionForeground, #777);
    cursor: pointer;
    flex: 1;
    text-align: center;
    font-family: var(--hg-font-family);
  }
  .sab:hover { color: var(--vscode-foreground, #ccc); }
  /* Translucent accent tints, not solid dark fills — readable over any theme's
     panel background (the fill colours assumed a dark theme). Brand cyan/red
     foregrounds kept (Alpha Legion accent). */
  .sab.primary { background: rgba(86,200,232,0.12); border-color: rgba(86,200,232,0.45); color: #56c8e8; }
  .sab.danger  { background: rgba(240,112,112,0.12); border-color: rgba(240,112,112,0.45); color: #f07070; }
</style>
