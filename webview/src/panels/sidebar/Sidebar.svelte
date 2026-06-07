<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { on, send } from '$shared/messageBus';
  import type { GitFile, GitStatus } from './types';

  import FileTree      from './components/FileTree.svelte';
  import CommitArea    from './components/CommitArea.svelte';
  import ConflictBanner from './components/ConflictBanner.svelte';

  // ── State ──────────────────────────────────────────────────────────────────
  let files: GitFile[] = [];
  let branch = '';
  let hasUpstream = false;
  let noRepo = false;
  let loading = true;
  // Conflict guidance: in-progress merge/rebase/cherry-pick + its unmerged files.
  let conflicts: { operation: string; files: string[] } = { operation: '', files: [] };

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

    // Fetch conflict state when the status shows unmerged ('!') files, or while
    // an operation is still in progress (all files resolved but not yet continued).
    if (nextFiles.some((f) => f.status === '!') || conflicts.operation) {
      refreshConflicts();
    }
  }

  async function refreshConflicts() {
    try {
      const c = await send<{ operation: string; files: string[] }>('conflicts');
      conflicts = c ?? { operation: '', files: [] };
    } catch { /* non-fatal */ }
  }

  // ── Conflict resolution ─────────────────────────────────────────────────────
  function handleConflictResolve(action: 'current' | 'incoming' | 'merge-editor', file: string) {
    if (action === 'merge-editor') { send('openMergeEditor', { file }); return; }
    const cmd = action === 'current' ? 'conflict.keepCurrent' : 'conflict.keepIncoming';
    send(cmd, { file }).then(() => loadChanges()).catch(() => {});
  }

  async function handleConflictContinue() {
    try {
      await send('conflict.continue', { operation: conflicts.operation });
      await loadChanges();
    } catch (e: unknown) {
      commitError = e instanceof Error ? e.message : String(e);
    }
  }

  async function handleConflictAbort() {
    try {
      await send('conflict.abort', { operation: conflicts.operation });
      conflicts = { operation: '', files: [] };
      await loadChanges();
    } catch (e: unknown) {
      commitError = e instanceof Error ? e.message : String(e);
    }
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

  // Amend HEAD: edit its message and/or fold the staged changes into it.
  async function handleAmend(msg: string) {
    commitError = '';
    try {
      await send('commit.amend', { message: msg, paths: [...stagedPaths] });
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
  {#if conflicts.operation}
    <ConflictBanner
      info={conflicts}
      onResolve={handleConflictResolve}
      onContinue={handleConflictContinue}
      onAbort={handleConflictAbort}
    />
  {/if}

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
    onAmend={handleAmend}
  />
{/if}
