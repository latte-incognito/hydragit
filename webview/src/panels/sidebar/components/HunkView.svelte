<script lang="ts">
  import { send } from '$shared/messageBus';

  interface HunkLine {
    kind: 'ctx' | 'add' | 'del';
    old?: number;
    new?: number;
    text: string;
  }
  interface WorkingHunk {
    header: string;
    lines: HunkLine[];
    patch: string;
  }

  interface Props {
    /** File path, scoped to its repo via `repoRoot`. */
    file: string;
    repoRoot: string;
    /** Staged section (HEAD↔index) vs Changes section (index↔worktree). */
    staged: boolean;
    /** Bump to force a re-fetch after the surrounding tree's status changes. */
    refreshKey?: number;
    onStage: (patch: string) => void;
    onUnstage: (patch: string) => void;
    onDiscard: (patch: string) => void;
  }

  let {
    file,
    repoRoot,
    staged,
    refreshKey = 0,
    onStage,
    onUnstage,
    onDiscard,
  }: Props = $props();

  let hunks: WorkingHunk[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  // Re-fetch whenever the file/side changes or the parent signals a status
  // change (a sibling stage/unstage shifts what this file's diff contains).
  $effect(() => {
    void refreshKey;
    let cancelled = false;
    loading = true;
    error = '';
    send<WorkingHunk[]>('diff.working', { file, cached: staged }, repoRoot)
      .then((h) => {
        if (cancelled) return;
        hunks = h ?? [];
        loading = false;
      })
      .catch((e) => {
        if (cancelled) return;
        error = e instanceof Error ? e.message : String(e);
        loading = false;
      });
    return () => {
      cancelled = true;
    };
  });
</script>

<div class="hunk-wrap">
  {#if loading}
    <div class="hunk-msg">Loading diff…</div>
  {:else if error}
    <div class="hunk-msg hunk-err">{error}</div>
  {:else if hunks.length === 0}
    <!-- Whole-file changes (binary, untracked, mode-only) have no hunks. -->
    <div class="hunk-msg">No partial changes — use the file checkbox.</div>
  {:else}
    {#each hunks as h}
      <div class="hunk">
        <div class="hunk-head">
          <span class="hunk-range" title={h.header}>{h.header}</span>
          {#if staged}
            <button class="hk-btn" title="Unstage this hunk" onclick={() => onUnstage(h.patch)}>
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M7 9.5V3M7 9.5l-2.5-2.5M7 9.5l2.5-2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>Unstage</span>
            </button>
          {:else}
            <button class="hk-btn" title="Stage this hunk" onclick={() => onStage(h.patch)}>
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M7 4.5V11M7 4.5L4.5 7M7 4.5l2.5 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>Stage</span>
            </button>
            <button class="hk-btn hk-btn--discard" title="Discard this hunk (snapshot saved first)" onclick={() => onDiscard(h.patch)}>
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M3 6 L 6 3 M3 6 L 6 9 M3 6 H 9 a 3 3 0 0 1 0 6 H 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          {/if}
        </div>
        <div class="hunk-body">
          {#each h.lines as l}
            <div class="hl hl-{l.kind}">
              <span class="hl-num">{l.kind === 'add' ? '' : l.old ?? ''}</span>
              <span class="hl-num">{l.kind === 'del' ? '' : l.new ?? ''}</span>
              <span class="hl-mark">{l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '}</span>
              <span class="hl-text">{l.text}</span>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .hunk-wrap {
    background: var(--vscode-editor-background, #1e1e1e);
    border-left: 2px solid var(--vscode-panel-border, #3a3a3a);
    margin: 1px 0 3px 22px;
    border-radius: 3px;
    overflow: hidden;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--hg-font-xxs, 10px);
  }
  .hunk-msg {
    padding: 5px 10px;
    color: var(--vscode-descriptionForeground, #888);
    font-family: var(--hg-font-family);
  }
  .hunk-err { color: var(--vscode-errorForeground, #f07070); }

  .hunk + .hunk { border-top: 1px solid var(--vscode-panel-border, #3a3a3a); }

  .hunk-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 6px;
    background: var(--vscode-editorGroupHeader-tabsBackground, #252526);
    border-bottom: 1px solid var(--vscode-panel-border, #3a3a3a);
  }
  .hunk-range {
    flex: 1;
    min-width: 0;
    color: var(--vscode-descriptionForeground, #888);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hk-btn {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--vscode-descriptionForeground, #999);
    cursor: pointer;
    font-family: var(--hg-font-family);
    font-size: var(--hg-font-xxs, 10px);
    flex-shrink: 0;
  }
  .hk-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.25));
    color: var(--vscode-foreground, #ccc);
  }
  .hk-btn--discard { padding: 1px 4px; }
  .hk-btn--discard:hover { color: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39); }

  .hunk-body { overflow-x: auto; }
  .hl {
    display: flex;
    white-space: pre;
    line-height: 1.45;
  }
  .hl-num {
    width: 30px;
    flex-shrink: 0;
    text-align: right;
    padding-right: 4px;
    color: var(--vscode-editorLineNumber-foreground, #6e7681);
    user-select: none;
  }
  .hl-mark {
    width: 10px;
    flex-shrink: 0;
    text-align: center;
    user-select: none;
  }
  .hl-text { flex: 1; }
  .hl-add { background: var(--vscode-diffEditor-insertedLineBackground, rgba(78,201,78,0.12)); }
  .hl-add .hl-mark, .hl-add .hl-text { color: var(--vscode-gitDecoration-addedResourceForeground, #81b88b); }
  .hl-del { background: var(--vscode-diffEditor-removedLineBackground, rgba(224,72,72,0.12)); }
  .hl-del .hl-mark, .hl-del .hl-text { color: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39); }
  .hl-ctx .hl-text { color: var(--vscode-foreground, #ccc); opacity: 0.75; }
</style>
