<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { on, send } from '$shared/messageBus';
  import { uiConfirm } from '$shared/dialogs';
  import type { RepoInfo } from '$shared/repoStore';
  import type { GitFile, GitStatus } from '../types';

  import FileTree from './FileTree.svelte';
  import CommitArea from './CommitArea.svelte';
  import ConflictBanner from './ConflictBanner.svelte';

  
  
  
  
  interface Props {
    // ── Props ────────────────────────────────────────────────────────────────
    repo: RepoInfo;
    focused?: boolean;
    /** Focus this repo → the main panel (log/branches/diff) follows it. */
    onFocus?: (rootPath: string) => void;
    /** Collapse the whole group (header still visible). */
    expanded?: boolean;
    /** Show the repo header. Hidden for a solo repo so the view stays flat. */
    showHeader?: boolean;
  }

  let {
    repo,
    focused = false,
    onFocus = () => {},
    expanded = $bindable(true),
    showHeader = true
  }: Props = $props();

  // ── State (per repo) ────────────────────────────────────────────────────────
  let files: GitFile[] = $state([]);
  let branch = $state('');
  let hasUpstream = $state(false);
  let loading = $state(true);
  let conflicts: { operation: string; files: string[] } = $state({ operation: '', files: [] });
  let stagedPaths: Set<string> = $state(new Set());
  let collapsed: Set<string> = $state(new Set());
  let commitError = $state('');
  let commitAreaRef: CommitArea = $state();
  let loaded = $state(false); // first successful load done — gates the loading spinner
  // Clean repos collapse to a one-liner (§4.15); this opens the commit area
  // anyway for the message-only amend path (§4.16).
  let showCleanCommitArea = $state(false);

  // Every git call is scoped to THIS repo's root, so reading/committing here
  // never disturbs the focused repo.
  const call = (cmd: string, params: Record<string, unknown> = {}): Promise<unknown> =>
    send(cmd, params, repo.rootPath);

  function sameFiles(a: GitFile[], b: GitFile[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].path !== b[i].path || a[i].status !== b[i].status) return false;
    }
    return true;
  }

  function applyStatus(s: GitStatus) {
    const nextFiles = s.files ?? [];
    const nextBranch = s.branch ?? branch;
    const nextUpstream = s.hasUpstream ?? false;

    // No-op when nothing changed — the 3s poll must not re-render (blink) the
    // tree/commit area when the working tree is idle.
    if (loaded && nextBranch === branch && nextUpstream === hasUpstream && sameFiles(nextFiles, files)) {
      return;
    }

    const nextPaths = new Set(nextFiles.map((f) => f.path));
    stagedPaths = new Set([...stagedPaths].filter((p) => nextPaths.has(p)));
    hasUpstream = nextUpstream;
    branch = nextBranch;
    files = nextFiles;
    loading = false;
    loaded = true;
    if (nextFiles.some((f) => f.status === '!') || conflicts.operation) {
      refreshConflicts();
    }
  }

  async function loadChanges() {
    if (!loaded) loading = true; // spinner only on first load, never on polls
    try {
      applyStatus((await call('status')) as GitStatus);
    } catch {
      loading = false; // repo vanished mid-flight — leave last known state
    }
  }

  async function refreshConflicts() {
    try {
      conflicts =
        ((await call('conflicts')) as { operation: string; files: string[] }) ?? {
          operation: '',
          files: [],
        };
    } catch {
      /* non-fatal */
    }
  }

  // Keep this group fresh: reload on the host 'refresh' push (repo switch /
  // git activity) and poll every 3s for working-tree edits, which don't touch
  // .git and so can't be watched. Mirrors the old single-repo status poll.
  const unsub = on('refresh', loadChanges);
  let timer: ReturnType<typeof setInterval>;
  onMount(() => {
    loadChanges();
    timer = setInterval(loadChanges, 3000);
  });
  onDestroy(() => {
    unsub();
    clearInterval(timer);
  });

  // ── Conflict resolution ─────────────────────────────────────────────────────
  function handleConflictResolve(action: 'current' | 'incoming' | 'merge-editor', file: string) {
    if (action === 'merge-editor') {
      send('openMergeEditor', { file }, repo.rootPath);
      return;
    }
    const cmd = action === 'current' ? 'conflict.keepCurrent' : 'conflict.keepIncoming';
    call(cmd, { file })
      .then(loadChanges)
      .catch(() => {});
  }

  async function handleConflictContinue() {
    try {
      await call('conflict.continue', { operation: conflicts.operation });
      await loadChanges();
    } catch (e: unknown) {
      commitError = e instanceof Error ? e.message : String(e);
    }
  }

  async function handleConflictAbort() {
    try {
      await call('conflict.abort', { operation: conflicts.operation });
      conflicts = { operation: '', files: [] };
      await loadChanges();
    } catch (e: unknown) {
      commitError = e instanceof Error ? e.message : String(e);
    }
  }

  // ── Staging ──────────────────────────────────────────────────────────────────
  function handleToggleFolder(key: string) {
    collapsed.has(key) ? collapsed.delete(key) : collapsed.add(key);
    collapsed = collapsed;
  }
  function handleToggleStage(path: string) {
    const next = new Set(stagedPaths);
    next.has(path) ? next.delete(path) : next.add(path);
    stagedPaths = next;
  }
  function handleStageFolder(paths: string[], stage: boolean) {
    const next = new Set(stagedPaths);
    for (const p of paths) stage ? next.add(p) : next.delete(p);
    stagedPaths = next;
  }

  // ── Diff ───────────────────────────────────────────────────────────────────
  function handleOpenDiff(path: string) {
    onFocus(repo.rootPath); // viewing a file focuses its repo
    const file = files.find((f) => f.path === path);
    if (file?.status === '!') {
      send('openMergeEditor', { file: path }, repo.rootPath);
      return;
    }
    send('openDiff', { commit: 'HEAD', parent: '', file: path }, repo.rootPath);
  }

  // ── Commit ───────────────────────────────────────────────────────────────────
  async function runCommit(cmd: 'commit' | 'commit.push' | 'commit.amend', msg: string) {
    commitError = '';
    try {
      // Pre-commit safety net: warn (never block) on likely secrets, leftover
      // conflict markers, huge files, protected branch. Which checks run comes
      // from user settings, resolved by the extension host.
      try {
        const warnings = (await call('commit.precheck', { paths: [...stagedPaths] })) as
          | { type: string; path: string; detail: string }[]
          | null;
        if (warnings?.length) {
          const lines = warnings
            .slice(0, 6)
            .map((w) => `• ${w.path ? w.path + ' — ' : ''}${w.detail}`)
            .join('\n');
          const more = warnings.length > 6 ? `\n…and ${warnings.length - 6} more` : '';
          if (!(await uiConfirm(`Safety check found:\n${lines}${more}\n\nCommit anyway?`))) return;
        }
      } catch { /* precheck unavailable — never block the commit on it */ }
      await call(cmd, { message: msg, paths: [...stagedPaths] });
      stagedPaths = new Set();
      commitAreaRef?.clearMessage();
      showCleanCommitArea = false;
      await loadChanges();
    } catch (e: unknown) {
      commitError = e instanceof Error ? e.message : String(e);
    }
  }

  // Full header line toggles expand/collapse and focuses the repo (so opening a
  // group also points the main panel at it).
  function handleHeaderClick() {
    expanded = !expanded;
    onFocus(repo.rootPath);
  }

  let stagedCount = $derived(stagedPaths.size);

  // Long branch names keep their informative tail (the leaf) — §4.21.
  function middleTruncate(s: string, max: number): string {
    if (s.length <= max) return s;
    const half = Math.floor((max - 1) / 2);
    return s.slice(0, half) + '…' + s.slice(-half);
  }

  let isClean = $derived(loaded && files.length === 0 && !conflicts.operation);
</script>

<section class="repo-group" class:focused={focused && showHeader}>
  {#if showHeader}
    <header class="repo-header" onclick={handleHeaderClick}>
      <span class="chevron" class:open={expanded} aria-hidden="true">▸</span>
      <span class="repo-name" title={repo.rootPath}>{repo.name}</span>
      {#if branch}<span class="repo-branch" title={branch}>{middleTruncate(branch, 26)}</span>{/if}
      {#if files.length}<span class="repo-count">{files.length}</span>{/if}
    </header>
  {/if}

  {#if expanded || !showHeader}
    {#if conflicts.operation}
      <ConflictBanner
        info={conflicts}
        onResolve={handleConflictResolve}
        onContinue={handleConflictContinue}
        onAbort={handleConflictAbort}
      />
    {/if}

    {#if isClean && !showCleanCommitArea}
      <!-- Clean repo: one quiet line instead of ~400px of empty commit UI
           (§4.15). Amend stays reachable for the message-only reword (§4.16). -->
      <div class="clean-state">
        <span class="clean-msg">No changes · working tree clean</span>
        <button class="clean-amend" onclick={() => (showCleanCommitArea = true)}>
          Amend last commit…
        </button>
      </div>
    {:else}
      {#if !isClean}
        <FileTree
          {files}
          {loading}
          noRepo={false}
          {stagedPaths}
          {collapsed}
          onToggleStage={handleToggleStage}
          onToggleFolder={handleToggleFolder}
          onStageFolder={handleStageFolder}
          onOpenDiff={handleOpenDiff}
        />
      {/if}

      <CommitArea
        bind:this={commitAreaRef}
        hasFiles={files.length > 0}
        {stagedCount}
        {hasUpstream}
        {branch}
        error={commitError}
        startAmend={isClean && showCleanCommitArea}
        onCommit={(m) => runCommit('commit', m)}
        onCommitPush={(m) => runCommit('commit.push', m)}
        onAmend={(m) => runCommit('commit.amend', m)}
      />
    {/if}
  {/if}
</section>

<style>
  .repo-group {
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
  }
  /* The active group is the one the main panel follows — make that state
     explicit with a filled header, not just the (too subtle) edge line (§4.18). */
  .repo-group.focused {
    box-shadow: inset 2px 0 0 var(--vscode-focusBorder, #4ec94e);
  }
  .repo-group.focused .repo-header {
    background: var(--vscode-list-activeSelectionBackground, #094771);
    color: var(--vscode-list-activeSelectionForeground, #ffffff);
  }

  .clean-state {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 5px 10px 6px;
    font-size: var(--hg-font-xs, 11px);
    color: var(--vscode-descriptionForeground, #8c8c8c);
    min-width: 0;
  }
  .clean-msg {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .clean-amend {
    margin-left: auto;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--vscode-textLink-foreground, #3794ff);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .clean-amend:hover { text-decoration: underline; }
  .repo-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    cursor: pointer;
    user-select: none;
    background: var(--vscode-sideBarSectionHeader-background, transparent);
  }
  .repo-header:hover {
    background: var(--vscode-list-hoverBackground);
  }
  .chevron {
    background: none;
    border: none;
    padding: 0;
    color: inherit;
    cursor: pointer;
    transition: transform 0.1s;
    font-size: 10px;
  }
  .chevron.open {
    transform: rotate(90deg);
  }
  .repo-name {
    font-weight: 600;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .repo-branch {
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .repo-count {
    margin-left: auto;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 8px;
    padding: 0 6px;
    font-size: 10px;
    line-height: 16px;
  }
</style>
