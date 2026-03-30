<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { on, send } from '$shared/messageBus';
  import type { GitStatus } from './types';

  import SectionHeader from './components/SectionHeader.svelte';
  import FileList from './components/FileList.svelte';
  import CommitArea from './components/CommitArea.svelte';

  // ── State ──────────────────────────────────────────────
  let files: GitFile[] = [];
  let sectionOpen: boolean = true;
  let selectedIndex: number | null = null;
  let loading: boolean = true;

  // Staged paths live in the webview only — git working tree state
  // is separate from what the user intends to include in the next commit.
  let stagedPaths: Set<string> = new Set();

  // ── Push events from extension ─────────────────────────
  function applyStatus(data: unknown) {
    const s = data as GitStatus;
    const nextFiles = s.files ?? [];

    // Preserve staged state only for paths that still exist in the new list.
    // Paths that disappeared (deleted / reverted) are dropped automatically.
    const nextPaths = new Set(nextFiles.map((f) => f.path));
    stagedPaths = new Set([...stagedPaths].filter((p) => nextPaths.has(p)));

    files = nextFiles;
    loading = false;
  }

  const unsub = on('statusUpdate', applyStatus);
  onDestroy(unsub);

  // ── Lifecycle ──────────────────────────────────────────
  onMount(() => {
    loadChanges();
  });

  async function loadChanges() {
    loading = true;
    try {
      const status = await send<GitStatus>('status');
      applyStatus(status);
    } catch {
      loading = false;
      flash('Error loading changes', '#c74e39');
    }
  }

  // ── Section header handlers ────────────────────────────
  function handleToggle() {
    sectionOpen = !sectionOpen;
  }

  function handleRefresh(e: MouseEvent) {
    e.stopPropagation();
    loading = true;
    loadChanges();
  }

  // ── Staging handlers ───────────────────────────────────
  function handleToggleStage(path: string) {
    const next = new Set(stagedPaths);
    next.has(path) ? next.delete(path) : next.add(path);
    stagedPaths = next;
  }

  function handleToggleAll(stage: boolean) {
    stagedPaths = stage ? new Set(files.map((f) => f.path)) : new Set();
  }

  // ── File selection ─────────────────────────────────────
  function handleSelect(i: number) {
    selectedIndex = i;
    // TODO: open diff view for files[i]
  }

  // ── Commit handlers ────────────────────────────────────
  async function handleCommit(msg: string) {
    // TODO: await send('commit', { message: msg, paths: [...stagedPaths] })
  }

  async function handleCommitPush(msg: string) {
    // TODO: await send('commit', { message: msg, paths: [...stagedPaths], push: true })
  }

  $: stagedCount = stagedPaths.size;
  $: allStaged = files.length > 0 && files.every((f) => stagedPaths.has(f.path));
  $: someStaged = files.some((f) => stagedPaths.has(f.path));
</script>

<SectionHeader
  title="Changes"
  count={files.length > 0 ? files.length : null}
  open={sectionOpen}
  {allStaged}
  {someStaged}
  onToggle={handleToggle}
  onRefresh={handleRefresh}
  onToggleAll={handleToggleAll}
/>

{#if sectionOpen}
  <FileList
    {files}
    {loading}
    {selectedIndex}
    {stagedPaths}
    onSelect={handleSelect}
    onToggleStage={handleToggleStage}
  />
{/if}

<CommitArea
  hasFiles={files.length > 0}
  {stagedCount}
  onCommit={handleCommit}
  onCommitPush={handleCommitPush}
/>
