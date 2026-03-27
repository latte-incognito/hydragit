<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { on, send } from '$shared/messageBus'
  import type { Branch, Commit, DiffFile, DiffHunk, Stash, GitStatus } from './types'

  import Toolbar     from './components/Toolbar.svelte'
  import BranchPane  from './components/BranchPane.svelte'
  import PaneDivider from './components/PaneDivider.svelte'
  import LogPane     from './components/LogPane.svelte'
  import DetailPane  from './components/DetailPane.svelte'
  import ContextMenu from './components/ContextMenu.svelte'
  import StatusBar   from './components/StatusBar.svelte'

  let branches:     Branch[] = []
  let commits:      Commit[] = []
  let filtered:     Commit[] = []
  let stashes:      Stash[]  = []
  let activeBranch: string   = 'master'
  let selCommitIdx: number | null = null
  let selStashIdx:  number | null = null
  let selFile:      string | null = null
  let diffFiles:    DiffFile[] = []
  let diffHunks:    DiffHunk[] = []
  let detailLoading = false

  let sbBranch = 'master'
  let sbInfo   = ''
  let sbCounts = ''
  let iconUri  = ''
  let repoName = 'HydraGit'

  let branchPaneEl: HTMLElement | null = null
  let detailPaneEl: HTMLElement | null = null

  let branchMenu = { visible: false, x: 0, y: 0, branch: '', isCurrent: false }
  let stashMenu  = { visible: false, x: 0, y: 0, label: '' }
  let ctxBranch  = ''
  let ctxStashIdx: number | null = null

  let flashMsg   = ''
  let flashTimer: ReturnType<typeof setTimeout> | null = null

  function flash(msg: string, color = '#febc2e') {
    flashMsg = msg
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => { flashMsg = '' }, 2200)
  }

  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  const unsub = on('refresh', () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(loadAll, 500)
  })
  onDestroy(unsub)

  async function loadAll() {
    try {
      const [status, brs, rawCommits, rawStashes] = await Promise.all([
        send<GitStatus>('status'),
        send<Branch[]>('branches'),
        send<Commit[]>('log', { branch: activeBranch, limit: 200 }),
        send<Stash[]>('stash'),
      ])
      sbBranch     = status.branch || activeBranch
      sbInfo       = (status.ahead || status.behind) ? ` · ↑${status.ahead} ↓${status.behind}` : ''
      branches     = brs
      commits      = rawCommits
      filtered     = [...commits]
      stashes      = rawStashes
      sbCounts     = `${commits.length} commits · ${branches.filter(b => !b.isRemote).length} branches`
      const current = branches.find(b => b.isCurrent)
      if (current) activeBranch = current.name
    } catch(e: unknown) {
      flash('Load error: ' + (e instanceof Error ? e.message : String(e)), '#f07070')
    }
  }

  onMount(loadAll)

  async function selectBranch(name: string, _remote: boolean) {
    activeBranch = name; selCommitIdx = null; selFile = null
    diffFiles = []; diffHunks = []
    try {
      commits = await send<Commit[]>('log', { branch: name, limit: 200 })
      filtered = [...commits]
    } catch(e: unknown) { flash('Log error: ' + (e instanceof Error ? e.message : String(e)), '#f07070') }
  }

  async function selectCommit(i: number) {
    selCommitIdx = i; selFile = null; diffFiles = []; diffHunks = []
    detailLoading = true
    const c = filtered[i]
    try {
      const files = await send<DiffFile[]>('diff', { commit: c.hash })
      diffFiles = files; detailLoading = false
      if (files.length) selectDiffFile(files[0].path)
    } catch(e: unknown) {
      detailLoading = false
      flash('Diff error: ' + (e instanceof Error ? e.message : String(e)), '#f07070')
    }
  }

  async function selectDiffFile(path: string) {
    selFile = path; diffHunks = []
    if (selCommitIdx === null) return
    try {
      diffHunks = await send<DiffHunk[]>('diff', { commit: filtered[selCommitIdx].hash, file: path })
    } catch(e: unknown) { flash('Diff error: ' + (e instanceof Error ? e.message : String(e)), '#f07070') }
  }

  function selectStash(i: number) { selStashIdx = i }

  async function stashAction(a: string) {
    if (selStashIdx === null) return
    const s = stashes[selStashIdx]
    const idx = s.index ?? selStashIdx
    if (a === 'show') {
      try {
        diffHunks = await send<DiffHunk[]>('stash.show', { index: idx })
        selCommitIdx = null; diffFiles = []; selFile = 'stash'
      } catch(e: unknown) { flash('Show failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070') }
      return
    }
    const cmdMap: Record<string, string> = { pop: 'stash.pop', apply: 'stash.apply', drop: 'stash.drop' }
    try {
      await send(cmdMap[a], { index: idx })
      flash(`${a} stash@{${idx}} done`, '#4ec94e'); loadAll()
    } catch(e: unknown) { flash(`${a} failed: ` + (e instanceof Error ? e.message : String(e)), '#f07070') }
  }

  async function tbAction(a: string) {
    flash({ fetch: 'Fetching…', pull: 'Pulling…', push: 'Pushing…' }[a] ?? a, '#febc2e')
    try { await send(a); flash(a + ' done', '#4ec94e'); loadAll() }
    catch(e: unknown) { flash(a + ' failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070') }
  }

  async function commitAction(action: string, hash: string) {
    if (action === 'copy') { flash('Copied: ' + hash, '#4ec94e'); return }
    flash(`${action}: ${hash}`, '#febc2e')
    const cmdMap: Record<string, string> = { 'cherry-pick': 'cherrypick', revert: 'revert' }
    try { await send(cmdMap[action] ?? action, { commit: hash }); flash(action + ' done', '#4ec94e'); loadAll() }
    catch(e: unknown) { flash(action + ' failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070') }
  }

  function showBranchCtx(e: MouseEvent, name: string, isCurrent: boolean) {
    e.preventDefault(); e.stopPropagation()
    ctxBranch = name
    branchMenu = { visible: true, isCurrent, branch: name,
      x: Math.min(e.clientX, window.innerWidth - 180),
      y: Math.min(e.clientY, window.innerHeight - 260) }
  }

  async function branchAction(a: string) {
    branchMenu = { ...branchMenu, visible: false }
    const acts: Record<string, () => Promise<void>> = {
      checkout:   async () => { await send('checkout',      { branch: ctxBranch });               flash(`Checked out ${ctxBranch}`, '#4ec94e'); loadAll() },
      merge:      async () => { await send('merge',         { branch: ctxBranch });               flash(`Merged ${ctxBranch}`,      '#4ec94e'); loadAll() },
      rebase:     async () => { await send('rebase',        { onto:   ctxBranch });               flash('Rebased',                   '#4ec94e'); loadAll() },
      push:       async () => { await send('push',          { branch: ctxBranch });               flash(`Pushed ${ctxBranch}`,      '#4ec94e'); loadAll() },
      delete:     async () => { await send('branch.delete', { name:   ctxBranch, force: false }); flash(`Deleted ${ctxBranch}`,     '#f07070'); loadAll() },
      copy:       async () => { flash(`Copied: ${ctxBranch}`, '#4ec94e') },
      rename:     async () => { const to   = prompt('New name:');    if (to)   { await send('branch.rename',  { from: ctxBranch, to });           flash(`Renamed to ${to}`, '#4ec94e'); loadAll() } },
      'new-from': async () => { const name = prompt('Branch name:'); if (name) { await send('branch.create', { name, from: ctxBranch });          flash(`Created ${name}`,  '#4ec94e'); loadAll() } },
    }
    try { await acts[a]?.() }
    catch(e: unknown) { flash(a + ' failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070') }
  }

  function showStashCtx(e: MouseEvent, i: number) {
    e.preventDefault(); e.stopPropagation()
    ctxStashIdx = i
    stashMenu = { visible: true, label: `stash@{${stashes[i].index ?? i}}`,
      x: Math.min(e.clientX, window.innerWidth - 160),
      y: Math.min(e.clientY, window.innerHeight - 160) }
  }

  async function stashCtxAction(a: string) {
    stashMenu = { ...stashMenu, visible: false }
    if (ctxStashIdx === null) return
    selStashIdx = ctxStashIdx
    await stashAction(a)
  }

  function filterCommits(q: string) {
    filtered = q
      ? commits.filter(c =>
          (c.message ?? '').toLowerCase().includes(q.toLowerCase()) ||
          (c.hash ?? '').startsWith(q) ||
          (c.author ?? '').toLowerCase().includes(q.toLowerCase()))
      : [...commits]
    selCommitIdx = null; diffFiles = []; diffHunks = []
  }

  function closeMenus() {
    branchMenu = { ...branchMenu, visible: false }
    stashMenu  = { ...stashMenu,  visible: false }
  }
</script>

<!-- replace the template section (everything after </script>) with this -->

<svelte:window on:click={closeMenus} on:keydown={e => e.key === 'Escape' && closeMenus()} />

<div class="app-root">
  <Toolbar {repoName} {iconUri} onAction={tbAction} onSearch={filterCommits} />

  <div class="main">
    <div bind:this={branchPaneEl} class="branch-wrap">
      <BranchPane
        {branches} {stashes} {activeBranch} {selStashIdx}
        onSelectBranch={selectBranch}
        onSelectStash={selectStash}
        onStashAction={stashAction}
        onNewBranch={() => flash('New branch dialog…', '#febc2e')}
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
    {branchMenu} {stashMenu}
    onBranchAction={branchAction}
    onStashAction={stashCtxAction}
  />
</div>

<style>
  .app-root {
    display:        flex;
    flex-direction: column;
    width:          100vw;
    height:         100vh;
    overflow:       hidden;
  }

  .main {
    display:    flex;
    flex:       1;
    min-height: 0;
    overflow:   hidden;
  }

  .branch-wrap,
  .detail-wrap {
    display:        flex;
    flex-direction: column;
    min-height:     0;
    overflow:       hidden;
    flex-shrink:    0;
  }
</style>