<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { on, send } from '$shared/messageBus';
  import type { GitFile, GitStatus } from './types';

  import SectionHeader from './components/SectionHeader.svelte';
  import FileTree      from './components/FileTree.svelte';
  import CommitArea    from './components/CommitArea.svelte';

  // ── State ──────────────────────────────────────────────────────────────────
  let files: GitFile[] = [];
  let sectionOpen = true;
  let loading = true;

  // Staged paths — webview-only, separate from git state
  let stagedPaths: Set<string> = new Set();

  // Collapsed folder keys — persisted across status refreshes
  // We intentionally keep this as a module-level variable so it survives
  // Svelte's reactive re-renders without being reset.
  let collapsed: Set<string> = new Set();

  // ── Push events from extension ─────────────────────────────────────────────
  function applyStatus(data: unknown) {
    const s = data as GitStatus;
    const nextFiles = s.files ?? [];

    // Prune staged paths that no longer exist
    const nextPaths = new Set(nextFiles.map((f) => f.path));
    stagedPaths = new Set([...stagedPaths].filter((p) => nextPaths.has(p)));

    files = nextFiles;
    loading = false;
  }

  const unsub = on('statusUpdate', applyStatus);
  onDestroy(unsub);

  onMount(loadChanges);

  async function loadChanges() {
    loading = true;
    try {
      const status = await send<GitStatus>('status');
      applyStatus(status);
    } catch {
      loading = false;
    }
  }

  // ── Collapse state ─────────────────────────────────────────────────────────
  function handleToggleFolder(key: string) {
    if (collapsed.has(key)) collapsed.delete(key);
    else collapsed.add(key);
    collapsed = collapsed; // trigger reactivity
  }

  function handleExpandAll() {
    collapsed = new Set();
  }

  function handleCollapseAll() {
    // Collect all folder keys from current tree — build from files
    const keys = new Set<string>();
    for (const f of files) {
      const parts = f.path.split('/');
      parts.pop();
      let acc = '';
      for (const p of parts) {
        acc = acc ? acc + '/' + p : p;
        keys.add(acc);
      }
    }
    collapsed = keys;
  }

  // ── Staging ────────────────────────────────────────────────────────────────
  function handleToggleStage(path: string) {
    const next = new Set(stagedPaths);
    next.has(path) ? next.delete(path) : next.add(path);
    stagedPaths = next;
  }

  function handleStageFolder(paths: string[], stage: boolean) {
    const next = new Set(stagedPaths);
    for (const p of paths) {
      stage ? next.add(p) : next.delete(p);
    }
    stagedPaths = next;
  }

  function handleToggleAll(stage: boolean) {
    stagedPaths = stage ? new Set(files.map((f) => f.path)) : new Set();
  }

  function handleRefresh(e: MouseEvent) {
    e.stopPropagation();
    loading = true;
    loadChanges();
  }

  // ── Commit ─────────────────────────────────────────────────────────────────
  async function handleCommit(msg: string) {
    // TODO: await send('commit', { message: msg, paths: [...stagedPaths] })
  }

  async function handleCommitPush(msg: string) {
    // TODO: await send('commit', { message: msg, paths: [...stagedPaths], push: true })
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  $: stagedCount = stagedPaths.size;
  $: allStaged   = files.length > 0 && files.every((f) => stagedPaths.has(f.path));
  $: someStaged  = files.some((f) => stagedPaths.has(f.path));
</script>

<SectionHeader
  title="Changes"
  count={files.length > 0 ? files.length : null}
  open={sectionOpen}
  {allStaged}
  {someStaged}
  onToggle={() => { sectionOpen = !sectionOpen; }}
  onRefresh={handleRefresh}
  onToggleAll={handleToggleAll}
  onExpandAll={handleExpandAll}
  onCollapseAll={handleCollapseAll}
/>

{#if sectionOpen}
  <FileTree
    {files}
    {loading}
    {stagedPaths}
    {collapsed}
    onToggleStage={handleToggleStage}
    onToggleFolder={handleToggleFolder}
    onStageFolder={handleStageFolder}
  />
{/if}

<CommitArea
  hasFiles={files.length > 0}
  {stagedCount}
  onCommit={handleCommit}
  onCommitPush={handleCommitPush}
/>
