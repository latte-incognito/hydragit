<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { on, send } from '$shared/messageBus'
  import type { GitFile, GitStatus } from './types'

  import SectionHeader from './components/SectionHeader.svelte'
  import FileList      from './components/FileList.svelte'
  import CommitArea    from './components/CommitArea.svelte'
  import StatusBar     from './components/StatusBar.svelte'

  // ── State ──────────────────────────────────────────────
  let files:         GitFile[] = []
  let branch:        string    = '—'
  let sectionOpen:   boolean   = true
  let selectedIndex: number | null = null
  let loading:       boolean   = true

  let statusMsg:   string = ''
  let statusColor: string = ''
  let statusTimer: ReturnType<typeof setTimeout> | null = null

  // ── Push events from extension ─────────────────────────
  function applyStatus(data: unknown) {
    const s = data as GitStatus
    branch  = s.branch ?? '—'
    files   = s.files  ?? []
    loading = false
  }

  const unsub = on('statusUpdate', applyStatus)
  onDestroy(unsub)

  // ── Lifecycle ──────────────────────────────────────────
  onMount(() => {
    loadChanges()
  })

  async function loadChanges() {
    loading = true
    try {
      const status = await send<GitStatus>('getStatus')
      applyStatus(status)
    } catch (e) {
      loading = false
      flash('Error loading changes', '#c74e39')
    }
  }

  // ── Handlers ───────────────────────────────────────────
  function handleToggle() {
    sectionOpen = !sectionOpen
  }

  function handleRefresh(e: MouseEvent) {
    e.stopPropagation()
    loading = true
    loadChanges()
  }

  function handleSelect(i: number) {
    selectedIndex = i
    // TODO: open diff view
  }

  async function handleCommit(msg: string) {
    flash('Commit — coming soon', '#e2c08d')
    // TODO: await send('commit', { message: msg })
  }

  async function handleCommitPush(msg: string) {
    flash('Commit & Push — coming soon', '#e2c08d')
    // TODO: await send('commit', { message: msg, push: true })
  }

  function flash(msg: string, color: string) {
    statusMsg   = msg
    statusColor = color
    if (statusTimer) clearTimeout(statusTimer)
    statusTimer = setTimeout(() => { statusMsg = ''; statusColor = '' }, 3000)
  }
</script>

<SectionHeader
  title="Changes"
  count={files.length > 0 ? files.length : null}
  open={sectionOpen}
  onToggle={handleToggle}
  onRefresh={handleRefresh}
/>

{#if sectionOpen}
  <FileList
    {files}
    {loading}
    {selectedIndex}
    onSelect={handleSelect}
  />
{/if}

<CommitArea
  hasFiles={files.length > 0}
  onCommit={handleCommit}
  onCommitPush={handleCommitPush}
/>

<StatusBar
  {branch}
  {statusMsg}
  {statusColor}
/>
