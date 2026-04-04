<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { on, send } from '$shared/messageBus';
  import type { Branch, Commit, DiffFile, DiffHunk, Stash, GitStatus } from './types';

  import Toolbar     from './components/Toolbar.svelte';
  import ActionRail  from './components/ActionRail.svelte';
  import BranchPane  from './components/BranchPane.svelte';
  import PaneDivider from './components/PaneDivider.svelte';
  import LogPane     from './components/LogPane.svelte';
  import DetailPane  from './components/DetailPane.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import StatusBar   from './components/StatusBar.svelte';

  // ── Core state ────────────────────────────────────────────────────────────
  let branches:    Branch[]   = [];
  let commits:     Commit[]   = [];
  let filtered:    Commit[]   = [];
  let stashes:     Stash[]    = [];
  let activeBranch = 'master';
  let selCommitIdx: number | null = null;
  let selStashIdx:  number | null = null;
  let selFile:      string | null = null;
  let diffFiles:    DiffFile[]    = [];
  let diffHunks:    DiffHunk[]    = [];
  let detailLoading = false;
  let hasPending    = false;   // ahead > 0 → pull button lit

  let sbBranch = 'master';
  let sbInfo   = '';
  let sbCounts = '';
  let iconUri  = document.body.dataset.iconUri ?? '';
  let repoName = 'HydraGit';

  let branchPaneEl: HTMLElement | null = null;
  let detailPaneEl: HTMLElement | null = null;

  // ── Search state ──────────────────────────────────────────────────────────
  type SearchMode = 'msg' | 'hash' | 'file' | 'author';
  let searchMode:  SearchMode = 'msg';
  let searchQuery  = '';
  let allBranches  = false;
  // When in file mode and a result is returned from Go
  let fileSearchActive = false;
  let fileSearchPath   = '';

  // ── Context menus ─────────────────────────────────────────────────────────
  let branchMenu  = { visible: false, x: 0, y: 0, branch: '', isCurrent: false };
  let stashMenu   = { visible: false, x: 0, y: 0, label: '' };
  let ctxBranch   = '';
  let ctxStashIdx: number | null = null;

  // ── Flash bar ────────────────────────────────────────────────────────────
  let flashMsg   = '';
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  function flash(msg: string, _color = '#febc2e') {
    flashMsg = msg;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashMsg = ''; }, 2200);
  }

  // ── Refresh on .git changes ───────────────────────────────────────────────
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const unsub = on('refresh', () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(loadAll, 500);
  });
  onDestroy(unsub);

  // ── Load everything ───────────────────────────────────────────────────────
  async function loadAll() {
    try {
      const [status, brs, rawCommits, rawStashes] = await Promise.all([
        send<GitStatus>('status'),
        send<Branch[]>('branches'),
        send<Commit[]>('log', { branch: allBranches ? '' : activeBranch, limit: 200 }),
        send<Stash[]>('stash'),
      ]);
      sbBranch    = status.branch || activeBranch;
      sbInfo      = status.ahead || status.behind ? ` · ↑${status.ahead} ↓${status.behind}` : '';
      hasPending  = (status.behind ?? 0) > 0;
      branches    = brs;
      commits     = rawCommits;
      stashes     = rawStashes;
      sbCounts    = `${commits.length} commits · ${branches.filter(b => !b.isRemote).length} branches`;
      const current = branches.find(b => b.isCurrent);
      if (current) activeBranch = current.name;
      // Re-apply active search filter
      applyFilter();
    } catch (e: unknown) {
      flash('Load error: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  onMount(loadAll);

  // ── All-branches toggle ───────────────────────────────────────────────────
  async function handleAllBranches(v: boolean) {
    allBranches = v;
    selCommitIdx = null; diffFiles = []; diffHunks = [];
    try {
      commits = await send<Commit[]>('log', { branch: allBranches ? '' : activeBranch, limit: 200 });
      applyFilter();
    } catch (e: unknown) {
      flash('Log error: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // ── Branch select ─────────────────────────────────────────────────────────
  async function selectBranch(name: string, _remote: boolean) {
    activeBranch = name;
    selCommitIdx = null; selFile = null; diffFiles = []; diffHunks = [];
    try {
      commits = await send<Commit[]>('log', { branch: allBranches ? '' : name, limit: 200 });
      applyFilter();
    } catch (e: unknown) {
      flash('Log error: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // ── Search / filter ───────────────────────────────────────────────────────
  function applyFilter() {
    if (fileSearchActive) return; // file mode uses its own commits list
    const q = searchQuery.trim().toLowerCase();
    if (!q) { filtered = [...commits]; return; }
    filtered = commits.filter(c => {
      if (searchMode === 'msg')    return (c.message ?? '').toLowerCase().includes(q);
      if (searchMode === 'hash')   return (c.hash ?? '').toLowerCase().startsWith(q);
      if (searchMode === 'author') return (c.author ?? '').toLowerCase().includes(q);
      return true;
    });
    selCommitIdx = null; diffFiles = []; diffHunks = [];
  }

  async function handleSearch(q: string) {
    searchQuery = q;
    if (searchMode === 'file') {
      if (!q.trim()) {
        // clear file search, restore normal log
        fileSearchActive = false;
        fileSearchPath   = '';
        filtered = [...commits];
        selCommitIdx = null; diffFiles = []; diffHunks = [];
      }
      // file search triggers on Enter — see handleSearchKey
      return;
    }
    applyFilter();
  }

  async function handleSearchKey(e: KeyboardEvent) {
    if (e.key !== 'Enter' || searchMode !== 'file' || !searchQuery.trim()) return;
    fileSearchPath   = searchQuery.trim();
    fileSearchActive = true;
    selCommitIdx = null; diffFiles = []; diffHunks = [];
    flash(`Searching commits for: ${fileSearchPath}…`);
    try {
      // log.file requires a new Go IPC command (see handler.go note below)
      const result = await send<Commit[]>('log.file', { path: fileSearchPath });
      filtered = result;
      flash(`${result.length} commit${result.length !== 1 ? 's' : ''} touched ${fileSearchPath}`, '#4ec94e');
    } catch (e: unknown) {
      flash('File search failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
      fileSearchActive = false;
    }
  }

  function handleModeChange(m: SearchMode) {
    searchMode = m;
    searchQuery = '';
    // Leaving file mode — restore log
    if (m !== 'file' && fileSearchActive) {
      fileSearchActive = false;
      fileSearchPath   = '';
      filtered = [...commits];
      selCommitIdx = null; diffFiles = []; diffHunks = [];
    }
  }

  // ── Commit select ─────────────────────────────────────────────────────────
  async function selectCommit(i: number) {
    selCommitIdx = i;
    selFile = null; diffFiles = []; diffHunks = [];
    detailLoading = true;
    const c = filtered[i];
    try {
      const files = await send<DiffFile[]>('diff', { commit: c.hash });
      diffFiles = files;
      detailLoading = false;
      if (files.length) selectDiffFile(files[0].path);
    } catch (e: unknown) {
      detailLoading = false;
      flash('Diff error: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  async function selectDiffFile(path: string) {
    selFile = path;
    diffHunks = [];
    if (selCommitIdx === null) return;
    try {
      diffHunks = await send<DiffHunk[]>('diff', {
        commit: filtered[selCommitIdx].hash,
        file: path,
      });
    } catch (e: unknown) {
      flash('Diff error: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // ── Stash ─────────────────────────────────────────────────────────────────
  function selectStash(i: number) { selStashIdx = i; }

  async function stashAction(a: string) {
    if (selStashIdx === null) return;
    const s   = stashes[selStashIdx];
    const idx = s.index ?? selStashIdx;
    if (a === 'show') {
      try {
        diffHunks    = await send<DiffHunk[]>('stash.show', { index: idx });
        selCommitIdx = null; diffFiles = []; selFile = 'stash';
      } catch (e: unknown) {
        flash('Show failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
      }
      return;
    }
    const cmdMap: Record<string, string> = { pop: 'stash.pop', apply: 'stash.apply', drop: 'stash.drop' };
    try {
      await send(cmdMap[a], { index: idx });
      flash(`${a} stash@{${idx}} done`, '#4ec94e');
      loadAll();
    } catch (e: unknown) {
      flash(`${a} failed: ` + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // ── Toolbar / rail actions ────────────────────────────────────────────────
  async function tbAction(a: string) {
    if (a === 'refresh') { loadAll(); return; }
    flash({ fetch: 'Fetching…', pull: 'Pulling…', push: 'Pushing…' }[a] ?? a);
    try {
      await send(a);
      flash(a + ' done', '#4ec94e');
      loadAll();
    } catch (e: unknown) {
      flash(a + ' failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  async function railAction(a: string) {
    if (a === 'branch.new') {
      const name = prompt('New branch name:');
      if (name) {
        try {
          await send('branch.create', { name });
          flash(`Created ${name}`, '#4ec94e');
          loadAll();
        } catch (e: unknown) {
          flash('Create failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
        }
      }
      return;
    }
    if (a === 'branch.delete') {
      // Use VS Code's showWarningMessage for a native confirmation dialog
      // We can't call VS Code APIs directly from the webview, so we send a
      // special command to the extension host which shows the dialog and
      // only deletes if confirmed.
      const name = prompt(`Delete branch — enter branch name (cannot delete current branch):`);
      if (!name) return;
      if (name === activeBranch) {
        flash(`Cannot delete the current branch: ${name}`, '#f07070');
        return;
      }
      // Two-step confirmation: native confirm() as the webview-accessible fallback
      const confirmed = confirm(
        `Delete branch "${name}"?\n\nThis cannot be undone. The branch will be deleted locally.`
      );
      if (!confirmed) return;
      flash(`Deleting ${name}…`);
      try {
        await send('branch.delete', { name, force: false });
        flash(`Deleted ${name}`, '#4ec94e');
        loadAll();
      } catch (e: unknown) {
        // Likely "not fully merged" — offer force delete
        const msg = e instanceof Error ? e.message : String(e);
        const force = confirm(
          `Could not delete "${name}":\n${msg}\n\nForce delete? (data may be lost)`
        );
        if (force) {
          try {
            await send('branch.delete', { name, force: true });
            flash(`Force deleted ${name}`, '#4ec94e');
            loadAll();
          } catch (e2: unknown) {
            flash('Force delete failed: ' + (e2 instanceof Error ? e2.message : String(e2)), '#f07070');
          }
        }
      }
      return;
    }
    if (a === 'merge') {
      const target = prompt('Merge branch into current — branch name:');
      if (target) {
        flash(`Merging ${target}…`);
        try { await send('merge', { branch: target }); flash(`Merged ${target}`, '#4ec94e'); loadAll(); }
        catch (e: unknown) { flash('Merge failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070'); }
      }
      return;
    }
    if (a === 'rebase') {
      const onto = prompt('Rebase onto branch:');
      if (onto) {
        flash(`Rebasing onto ${onto}…`);
        try { await send('rebase', { onto }); flash('Rebased', '#4ec94e'); loadAll(); }
        catch (e: unknown) { flash('Rebase failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070'); }
      }
      return;
    }
    if (a === 'tag') {
      flash('Tag creation — coming soon', '#febc2e');
      return;
    }
    // stash.save, fetch, pull, push
    await tbAction(a);
  }

  // ── Commit actions ────────────────────────────────────────────────────────
  async function commitAction(action: string, hash: string) {
    if (action === 'copy') { flash('Copied: ' + hash, '#4ec94e'); return; }
    flash(`${action}: ${hash}`);
    const cmdMap: Record<string, string> = { 'cherry-pick': 'cherrypick', revert: 'revert' };
    try {
      await send(cmdMap[action] ?? action, { commit: hash });
      flash(action + ' done', '#4ec94e');
      loadAll();
    } catch (e: unknown) {
      flash(action + ' failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // ── Branch context menu ───────────────────────────────────────────────────
  function showBranchCtx(e: MouseEvent, name: string, isCurrent: boolean) {
    e.preventDefault(); e.stopPropagation();
    ctxBranch  = name;
    branchMenu = {
      visible: true, isCurrent, branch: name,
      x: Math.min(e.clientX, window.innerWidth - 180),
      y: Math.min(e.clientY, window.innerHeight - 260),
    };
  }

  async function branchAction(a: string) {
    branchMenu = { ...branchMenu, visible: false };
    const acts: Record<string, () => Promise<void>> = {
      checkout:  async () => { await send('checkout', { branch: ctxBranch });                flash(`Checked out ${ctxBranch}`, '#4ec94e'); loadAll(); },
      merge:     async () => { await send('merge',    { branch: ctxBranch });                flash(`Merged ${ctxBranch}`, '#4ec94e');     loadAll(); },
      rebase:    async () => { await send('rebase',   { onto:   ctxBranch });                flash('Rebased', '#4ec94e');                 loadAll(); },
      push:      async () => { await send('push',     { branch: ctxBranch });                flash(`Pushed ${ctxBranch}`, '#4ec94e');     loadAll(); },
      delete:    async () => { await send('branch.delete', { name: ctxBranch, force: false }); flash(`Deleted ${ctxBranch}`, '#f07070'); loadAll(); },
      copy:      async () => { flash(`Copied: ${ctxBranch}`, '#4ec94e'); },
      rename:    async () => {
        const to = prompt('New name:');
        if (to) { await send('branch.rename', { from: ctxBranch, to }); flash(`Renamed to ${to}`, '#4ec94e'); loadAll(); }
      },
      'new-from': async () => {
        const name = prompt('Branch name:');
        if (name) { await send('branch.create', { name, from: ctxBranch }); flash(`Created ${name}`, '#4ec94e'); loadAll(); }
      },
    };
    try { await acts[a]?.(); }
    catch (e: unknown) { flash(a + ' failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070'); }
  }

  // ── Stash context menu ────────────────────────────────────────────────────
  function showStashCtx(e: MouseEvent, i: number) {
    e.preventDefault(); e.stopPropagation();
    ctxStashIdx = i;
    stashMenu   = {
      visible: true,
      label: `stash@{${stashes[i].index ?? i}}`,
      x: Math.min(e.clientX, window.innerWidth - 160),
      y: Math.min(e.clientY, window.innerHeight - 160),
    };
  }

  async function stashCtxAction(a: string) {
    stashMenu = { ...stashMenu, visible: false };
    if (ctxStashIdx === null) return;
    selStashIdx = ctxStashIdx;
    await stashAction(a);
  }

  function closeMenus() {
    branchMenu = { ...branchMenu, visible: false };
    stashMenu  = { ...stashMenu,  visible: false };
  }
</script>

<!--
  NOTE — Go side: add to internal/git/log.go:
    func LogFile(repoPath, filePath string) ([]Commit, error) {
      out, err := run(repoPath, "log", "--follow", "--format=...", "--", filePath)
      ...
    }
  And in internal/ipc/handler.go add case "log.file":
    files := params["path"].(string)
    commits, err := git.LogFile(repoPath, files)
-->

<svelte:window on:click={closeMenus} on:keydown={(e) => e.key === 'Escape' && closeMenus()} />

<div class="app-root">
  <Toolbar
    {repoName}
    {iconUri}
    {activeBranch}
    {branches}
    {hasPending}
    {allBranches}
    {searchMode}
    {searchQuery}
    onAction={tbAction}
    onSearch={handleSearch}
    onModeChange={handleModeChange}
    onAllBranches={handleAllBranches}
    onSelectBranch={selectBranch}
  />

  <div class="main">
    <ActionRail {hasPending} onAction={railAction} />

    <div bind:this={branchPaneEl} class="branch-wrap">
      <BranchPane
        {branches}
        {stashes}
        {activeBranch}
        {selStashIdx}
        onSelectBranch={selectBranch}
        onSelectStash={selectStash}
        onStashAction={stashAction}
        onNewBranch={() => railAction('branch.new')}
        onBranchCtx={showBranchCtx}
        onStashCtx={showStashCtx}
      />
    </div>

    <PaneDivider leftEl={branchPaneEl} isRight={false} />

    <LogPane
      commits={filtered}
      selectedIdx={selCommitIdx}
      onSelect={selectCommit}
      onCtx={() => {}}
      {fileSearchActive}
      {fileSearchPath}
      on:searchkey={handleSearchKey}
    />

    <PaneDivider rightEl={detailPaneEl} isRight={true} />

    <div bind:this={detailPaneEl} class="detail-wrap">
      <DetailPane
        commit={selCommitIdx !== null ? filtered[selCommitIdx] : null}
        files={diffFiles}
        hunks={diffHunks}
        {selFile}
        loading={detailLoading}
        {iconUri}
        onSelectFile={selectDiffFile}
        onCommitAction={commitAction}
      />
    </div>
  </div>

  <StatusBar
    branch={sbBranch}
    info={sbInfo}
    countsText={flashMsg ? `⚡ ${flashMsg}` : sbCounts}
  />

  <ContextMenu
    {branchMenu}
    {stashMenu}
    onBranchAction={branchAction}
    onStashAction={stashCtxAction}
  />
</div>

<style>
  .app-root {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
  .main {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .branch-wrap,
  .detail-wrap {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    flex-shrink: 0;
  }
</style>
