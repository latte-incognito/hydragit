<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { on, send } from '$shared/messageBus';
  import type { GitFile, GitStatus } from './types';

  import FileTree      from './components/FileTree.svelte';
  import CommitArea    from './components/CommitArea.svelte';

  // ── State ──────────────────────────────────────────────────────────────────
  let files: GitFile[] = [];
  let branch = '';
  let hasUpstream = false;
  let noRepo = false;
  let loading = true;

  // Staged paths — webview-only, separate from git state
  let stagedPaths: Set<string> = new Set();

  // Collapsed folder keys — persisted across status refreshes
  // We intentionally keep this as a module-level variable so it survives
  // Svelte's reactive re-renders without being reset.
  let collapsed: Set<string> = new Set();
  let commitAreaRef: CommitArea;

  // ── Push events from extension ─────────────────────────────────────────────
  function applyStatus(data: unknown) {
    if (noRepo) return;
    const s = data as GitStatus;
    const nextFiles = s.files ?? [];

    const nextPaths = new Set(nextFiles.map((f) => f.path));
    stagedPaths = new Set([...stagedPaths].filter((p) => nextPaths.has(p)));

    hasUpstream = s.hasUpstream ?? false;
    branch = s.branch ?? branch;
    files = nextFiles;
    loading = false;
  }

  const unsub = on('statusUpdate', applyStatus);
  onDestroy(unsub);

  onMount(() => {
    loadChanges();
    document.addEventListener('contextmenu', (e) => e.preventDefault(), true);
  });

  async function loadChanges() {
    loading = true;
    noRepo = false;
    try {
      const status = await send<GitStatus>('status');
      applyStatus(status);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('[HydraGit sidebar] loadChanges error:', msg);
      noRepo = msg.includes('not a git repository');
      loading = false;
    }
  }

  // ── Collapse state ─────────────────────────────────────────────────────────
  function handleToggleFolder(key: string) {
    if (collapsed.has(key)) collapsed.delete(key);
    else collapsed.add(key);
    collapsed = collapsed; // trigger reactivity
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

  // ── Diff ───────────────────────────────────────────────────────────────────
  function handleOpenDiff(path: string) {
    // Conflicted files ('!') open VS Code's 3-way merge resolver instead of a
    // plain diff — a 2-way HEAD↔working-tree diff can't resolve a conflict.
    const file = files.find((f) => f.path === path);
    if (file?.status === '!') {
      send('openMergeEditor', { file: path });
      return;
    }
    // Working tree diff: HEAD as the commit ref, empty parent means working tree
    send('openDiff', { commit: 'HEAD', parent: '', file: path });
  }
  let commitError = '';

  async function handleCommit(msg: string) {
    commitError = '';
    try {
      await send('commit', { message: msg, paths: [...stagedPaths] });
      stagedPaths = new Set();
      commitAreaRef?.clearMessage();
      loadChanges();
    } catch (e: unknown) {
      commitError = e instanceof Error ? e.message : String(e);
    }
  }

  async function handleCommitPush(msg: string) {
    commitError = '';
    try {
      await send('commit.push', { message: msg, paths: [...stagedPaths] });
      stagedPaths = new Set();
      commitAreaRef?.clearMessage();
      loadChanges();
    } catch (e: unknown) {
      commitError = e instanceof Error ? e.message : String(e);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  $: stagedCount = stagedPaths.size;
</script>


{#if noRepo}
  <FileTree
    files={[]}
    loading={false}
    noRepo={true}
    stagedPaths={new Set()}
    collapsed={new Set()}
  />
{:else}
  <FileTree
    {files}
    {loading}
    {noRepo}
    {stagedPaths}
    {collapsed}
    onToggleStage={handleToggleStage}
    onToggleFolder={handleToggleFolder}
    onStageFolder={handleStageFolder}
    onOpenDiff={handleOpenDiff}
  />

  <CommitArea
    bind:this={commitAreaRef}
    hasFiles={files.length > 0}
    {stagedCount}
    {hasUpstream}
    {branch}
    error={commitError}
    onCommit={handleCommit}
    onCommitPush={handleCommitPush}
  />
{/if}
