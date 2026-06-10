<script lang="ts">
  import type { Branch, Snapshot, Stash, Worktree } from '../types';


  interface Props {
    branches?: Branch[];
    stashes?: Stash[];
    tags?: { name: string; hash: string; date?: string }[];
    worktrees?: Worktree[];
    activeBranch?: string;
    selStashIdx?: number | null;
    onSelectBranch?: (name: string, remote: boolean) => void;
    onHead?: () => void;
    onFolderCtx?: (e: MouseEvent, prefix: string) => void;
    onSelectStash?: (i: number) => void;
    onStashAction?: (a: string) => void;
    onNewBranch?: () => void;
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
    onFolderCtx = () => {},
    onSelectStash = () => {},
    onStashAction = () => {},
    onNewBranch = () => {},
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

  // Short relative age for snapshot rows ("2h", "3d") — they're timestamps
  // first, labels second.
  function snapAge(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }

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

  // ── Derived ───────────────────────────────────────────────────────────────────

  let local = $derived(branches.filter((b) => !b.isRemote));
  let remote = $derived(branches.filter((b) => b.isRemote));

  // The ⭐ marks ONLY the default branch (master/main) — a single, consistent
  // meaning. It used to also mark the current branch's upstream on remote
  // branches, which made the star appear in two places with two meanings (BUG
  // #21). The current branch is shown prominently in the HEAD row at the top.
  let defaultBranchName = $derived((() => {
    for (const name of ['master', 'main']) {
      if (local.some((b) => b.name === name)) return name;
    }
    return '';
  })());

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

  // $effect.pre so the trees are computed before paint (no empty-tree flash).
  $effect.pre(() => {
    const next = sortTree(buildTree(local.map((b) => ({ name: b.name, branch: b }))));
    mergeOpen(localOpenCache, next);
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
  let remoteOriginOpen: Record<string, boolean> = {};
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
    remoteOriginOpen = remoteOriginOpen;
  }
</script>

<div class="pane-branches">
  <div class="pane-hdr">
    <span>Branches</span>
    <span
      class="pane-hdr-btn"
      title="New branch"
      onclick={onNewBranch}
      role="button"
      tabindex="0"
      onkeydown={(e) => e.key === 'Enter' && onNewBranch()}>+</span
    >
  </div>

  <div class="tree-scroll">

    <!-- HEAD — opens the undo timeline (reflog). The current branch lives in
         LOCAL below; this row is HEAD's movement history, not a branch select. -->
    <div
      class="titem active current head"
      onclick={onHead}
      title="Open the HEAD undo timeline (reflog)"
      role="option"
      aria-selected="true"
      tabindex="0"
    >
      <span class="titem-icon">◎</span>
      <span class="titem-name">HEAD{activeBranch ? ` · ${activeBranch}` : ''}</span>
    </div>

    <!-- ── LOCAL ──────────────────────────────────────────────────────────── -->
    <div class="tgroup-hdr" onclick={() => (localOpen = !localOpen)} role="button" tabindex="0">
      <span class="tgroup-arrow" class:closed={!localOpen}>▾</span>
      <span class="tgroup-label">Local</span>
      <span class="tgroup-count">{local.length}</span>
    </div>
    {#if localOpen}
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
                        <span class="titem-icon">{b.name === defaultBranchName ? '⭐' : '⎇'}</span>
                        <span class="titem-name">{b.name.split('/').pop()}</span>
                        {#if b.gone}<span class="track gone">gone</span>
                        {:else if b.trackShort}<span class="track">{b.trackShort}</span>{/if}
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
                  <span class="titem-icon">{b.name === defaultBranchName ? '⭐' : '⎇'}</span>
                  <span class="titem-name">{b.name.split('/').pop()}</span>
                  {#if b.gone}<span class="track gone">gone</span>
                  {:else if b.trackShort}<span class="track">{b.trackShort}</span>{/if}
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
            <span class="titem-icon">{b.name === defaultBranchName ? '⭐' : '⎇'}</span>
            <span class="titem-name">{b.name}</span>
            {#if b.gone}<span class="track gone">gone</span>
            {:else if b.trackShort}<span class="track">{b.trackShort}</span>{/if}
          </div>
        {/if}
      {/each}
    {/if}

    <!-- ── REMOTE ───────────────────────────────────────────────────────────── -->
    <div class="tgroup-hdr" onclick={() => (remoteOpen = !remoteOpen)} role="button" tabindex="0">
      <span class="tgroup-arrow" class:closed={!remoteOpen}>▾</span>
      <span class="tgroup-label">Remote</span>
      <span class="tgroup-count">{remote.length}</span>
    </div>
    {#if remoteOpen}
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
                      <span class="titem-icon">⎇</span>
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
                <span class="titem-icon">⎇</span>
                <span class="titem-name">{node.displayName ?? node.branch.name.split('/').pop()}</span>
                {#if node.branch.gone}<span class="track gone">gone</span>{/if}
              </div>
            {/if}
          {/each}
        {/if}
      {/each}
    {/if}

    <!-- ── TAGS ─────────────────────────────────────────────────────────────── -->
    <div class="tgroup-hdr" onclick={() => (tagsOpen = !tagsOpen)} role="button" tabindex="0">
      <span class="tgroup-arrow" class:closed={!tagsOpen}>▾</span>
      <span class="tgroup-label">Tags</span>
      <span class="tgroup-count">{tags.length}</span>
    </div>
    {#if tagsOpen}
      {#if tags.length === 0}
        <div class="stash-empty">No tags</div>
      {:else}
        {#each tags as tag}
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
    <div class="tgroup-hdr" onclick={() => (stashOpen = !stashOpen)} role="button" tabindex="0">
      <span class="tgroup-arrow" class:closed={!stashOpen}>▾</span>
      <span class="tgroup-label">Stashes</span>
      <span class="tgroup-count">{stashes.length}</span>
    </div>
    {#if stashOpen}
      {#if stashes.length === 0}
        <div class="stash-empty">No stashes</div>
      {:else}
        {#each stashes as s, i}
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
                <span style="color:#4ec94e">+{s.add ?? s.additions}</span>
              {/if}
              {#if s.rem ?? s.deletions}
                <span style="color:#f07070">-{s.rem ?? s.deletions}</span>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    {/if}

    <!-- ── WORKTREES ─────────────────────────────────────────────────────────── -->
    <div class="tgroup-hdr" onclick={() => (worktreesOpen = !worktreesOpen)} role="button" tabindex="0">
      <span class="tgroup-arrow" class:closed={!worktreesOpen}>▾</span>
      <span class="tgroup-label">Worktrees</span>
      <span class="tgroup-count">{worktrees.length}</span>
    </div>
    {#if worktreesOpen}
      {#if worktrees.length === 0}
        <div class="stash-empty">No worktrees</div>
      {:else}
        {#each worktrees as wt}
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
    <div class="tgroup-hdr" onclick={() => (snapshotsOpen = !snapshotsOpen)} role="button" tabindex="0">
      <span class="tgroup-arrow" class:closed={!snapshotsOpen}>▾</span>
      <span class="tgroup-label">Snapshots</span>
      <span class="tgroup-count">{snapshots.length}</span>
    </div>
    {#if snapshotsOpen}
      {#if snapshots.length === 0}
        <div class="stash-empty">No snapshots — taken automatically before risky operations</div>
      {:else}
        {#each snapshots as snap (snap.ref)}
          <div
            class="titem snapshot"
            onclick={() => onSnapshotSelect(snap)}
            title={`${snap.label}\n${new Date(snap.date).toLocaleString()}\nClick: show diff · ↺: restore · ×: delete`}
            role="option"
            aria-selected="false"
            tabindex="0"
          >
            <span class="titem-icon">◷</span>
            <span class="titem-name">{snap.label}</span>
            <span class="track">{snapAge(snap.date)}</span>
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
    font-size: var(--hg-font-lg);
    color: var(--vscode-disabledForeground, #444);
    cursor: pointer;
    line-height: 1;
  }
  .pane-hdr-btn:hover { color: var(--vscode-foreground, #ccc); }

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

  .tgroup-label {
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: var(--hg-font-xxs);
  }
  .tgroup-count {
    font-size: var(--hg-font-xxs);
    color: var(--vscode-disabledForeground, #3a3a3a);
    margin-left: auto;
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
  .titem.head { padding-left: 10px; margin-bottom: 2px; }
  .titem:hover {
    background: var(--vscode-list-hoverBackground, #2a2d2e);
    color: var(--vscode-foreground, #ccc);
  }
  .titem.active {
    background: #0e2535;
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
  .titem.stash.active { background: #0e2535; border-left-color: #9a7ae8; }
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
  .sab.primary { background: #0e5a7c; border-color: #1a8ab0; color: #56c8e8; }
  .sab.danger  { background: #2e0d0d; border-color: #6a1a1a; color: #f07070; }
</style>
