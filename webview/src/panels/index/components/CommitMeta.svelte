<script lang="ts">
  // The detail-pane meta panel: commit card (hash/message/byline/refs/actions +
  // ⋯ overflow), the stash card (pop/apply/drop), or a compare header. Extracted
  // from DetailPane so the pane is a thin composition of ChangedFiles + this.
  import { fullDate, smartDate } from '$shared/dates';
  import type { Commit, DiffFile } from '../types';

  interface Props {
    commit?: Commit | null;
    stash?: any;
    compare?: { title: string } | null;
    files?: DiffFile[];
    loading?: boolean;
    onCommitMenuAction?: (action: string, commit: Commit) => void;
    onStashAction?: (action: string) => void;
  }

  let {
    commit = null,
    stash = null,
    compare = null,
    files = [],
    loading = false,
    onCommitMenuAction = () => {},
    onStashAction = () => {},
  }: Props = $props();

  let isStash = $derived(!commit && stash !== null);
  let totalAdd = $derived(files.reduce((a, f) => a + (f.additions ?? 0), 0));
  let totalDel = $derived(files.reduce((a, f) => a + (f.deletions ?? 0), 0));

  // ── Hash copy ───────────────────────────────────────────────────────────
  let hashCopied = $state(false);
  let hashCopyTimer: ReturnType<typeof setTimeout>;
  async function copyHash() {
    if (!commit?.hash) return;
    await navigator.clipboard.writeText(commit.hash);
    hashCopied = true;
    clearTimeout(hashCopyTimer);
    hashCopyTimer = setTimeout(() => (hashCopied = false), 1200);
  }

  // "HEAD -> develop" becomes two pills; "tag: v1.0" keeps its tag styling.
  function refPills(refs: string[]): { label: string; kind: 'head' | 'tag' | 'branch' }[] {
    return refs.flatMap((r) =>
      r.split(' -> ').map((part) => {
        const p = part.trim();
        if (p === 'HEAD') return { label: 'HEAD', kind: 'head' as const };
        if (p.startsWith('tag: ')) return { label: p.slice(5), kind: 'tag' as const };
        return { label: p, kind: 'branch' as const };
      }),
    );
  }

  // ⋯ overflow — rarer/destructive actions, same handler as the log menu.
  // Fixed + viewport-anchored: .detail-meta scrolls and would clip an absolute
  // dropdown, so it's positioned from the button's rect.
  let moreOpen = $state(false);
  let moreRight = $state(0);
  let moreBottom = $state(0);
  function toggleMore(e: MouseEvent) {
    hideTip();
    if (!moreOpen) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      moreRight = window.innerWidth - r.right;
      moreBottom = window.innerHeight - r.top + 4;
    }
    moreOpen = !moreOpen;
  }
  const MORE_ITEMS: { id: string; label: string; danger?: boolean }[] = [
    { id: 'checkout', label: 'Checkout at commit (detached)' },
    { id: 'copy-message', label: 'Copy commit message' },
    { id: 'create-patch', label: 'Save as patch…' },
    { id: 'revert', label: 'Revert commit', danger: true },
  ];
  function runMore(id: string) {
    moreOpen = false;
    if (commit) onCommitMenuAction(id, commit);
  }

  // ── Tooltip (button hints) ──────────────────────────────────────────────
  let tipText = $state('');
  let tipX = $state(0);
  let tipY = $state(0);
  let tipVisible = $state(false);
  let tipTimer: ReturnType<typeof setTimeout>;
  function showTip(e: MouseEvent, text: string) {
    clearTimeout(tipTimer);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tipText = text;
    tipX = rect.left + rect.width / 2;
    tipY = rect.top - 6;
    tipTimer = setTimeout(() => {
      tipVisible = true;
    }, 400);
  }
  function hideTip() {
    clearTimeout(tipTimer);
    tipVisible = false;
  }
</script>

<svelte:window
  onclick={(e) => {
    if (moreOpen && !(e.target as HTMLElement).closest('.dm-more-wrap')) moreOpen = false;
  }}
/>

{#if tipVisible}
  <div class="hg-tooltip" style="left:{tipX}px;top:{tipY}px">{tipText}</div>
{/if}

<div class="detail-meta">
  {#if isStash && stash}
    <div class="dm-msg">{stash.msg ?? stash.message ?? ''}</div>
    <div class="dm-row"><span class="dm-label">Ref</span>stash@{'{'}{stash.index ?? 0}{'}'}</div>
    {#if stash.time ?? stash.date}
      <div class="dm-row"><span class="dm-label">Date</span>{fullDate(stash.time ?? stash.date ?? '')}</div>
    {/if}
    <div class="dm-stats">
      <span class="stat-add">+{totalAdd}</span>
      <span class="stat-del">-{totalDel}</span>
      <span class="dm-stat-dim">{files.length} file{files.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="dm-actions">
      <button class="action-btn" onclick={() => onStashAction('pop')}>Pop</button>
      <button class="action-btn" onclick={() => onStashAction('apply')}>Apply</button>
      <button class="action-btn action-btn--danger" onclick={() => onStashAction('drop')}>Drop</button>
    </div>
  {:else if compare}
    <div class="dm-msg">{compare.title}</div>
    {#if loading}
      <div class="dm-stats"><span class="dm-stat-dim">Loading…</span></div>
    {:else}
      <div class="dm-stats">
        <span class="stat-add">+{totalAdd}</span>
        <span class="stat-del">-{totalDel}</span>
        <span class="dm-stat-dim">{files.length} file{files.length !== 1 ? 's' : ''}</span>
      </div>
    {/if}
  {:else if commit}
    <!-- Hash copies itself on click (GitHub style) — no Copy-hash button. -->
    <button
      class="dm-hash"
      title={hashCopied ? 'Copied!' : `${commit.hash} — click to copy`}
      onclick={copyHash}
    >
      {(commit.hash ?? '').slice(0, 8)}
      {#if hashCopied}
        <span class="dm-hash-copied">✓ copied</span>
      {:else}
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" class="dm-hash-copy">
          <rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.1" />
          <path d="M8 4V3a1 1 0 00-1-1H3a1 1 0 00-1 1v4a1 1 0 001 1h1" stroke="currentColor" stroke-width="1.1" />
        </svg>
      {/if}
    </button>
    <div class="dm-msg">{commit.message ?? commit.msg ?? ''}</div>
    <div class="dm-byline">
      <span class="dm-author">{commit.author ?? ''}</span>
      <span class="dm-byline-sep">·</span>
      <span title={fullDate(commit.date ?? '')}>{smartDate(commit.date ?? '')}</span>
    </div>
    {#if (commit.refs ?? []).length}
      <div class="dm-refs">
        {#each refPills(commit.refs ?? []) as pill}
          <span class="dm-pill dm-pill--{pill.kind}">{pill.label}</span>
        {/each}
      </div>
    {/if}
    <div class="dm-actions">
      <button
        class="action-btn"
        onmouseenter={(e) => showTip(e, 'Apply this commit onto the current branch')}
        onmouseleave={hideTip}
        onclick={() => commit && onCommitMenuAction('cherry-pick', commit)}>Cherry-pick</button
      >
      <button
        class="action-btn"
        onmouseenter={(e) => showTip(e, 'Create a new branch at this commit')}
        onmouseleave={hideTip}
        onclick={() => commit && onCommitMenuAction('new-branch', commit)}>Branch here</button
      >
      <button
        class="action-btn"
        onmouseenter={(e) => showTip(e, 'Create a tag at this commit')}
        onmouseleave={hideTip}
        onclick={() => commit && onCommitMenuAction('new-tag', commit)}>Tag</button
      >
      {#if !commit.unpushed}
        <!-- Only for pushed commits — a local-only commit has no remote URL. -->
        <button
          class="action-btn"
          aria-label="View on remote"
          onmouseenter={(e) => showTip(e, 'View this commit on the remote (GitHub, GitLab…)')}
          onmouseleave={hideTip}
          onclick={() => commit && onCommitMenuAction('view-in-browser', commit)}>↗</button
        >
      {/if}
      <span class="dm-more-wrap">
        <button
          class="action-btn"
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          onmouseenter={(e) => showTip(e, 'More actions')}
          onmouseleave={hideTip}
          onclick={toggleMore}>⋯</button
        >
        {#if moreOpen}
          <div class="dm-more" role="menu" style="right:{moreRight}px;bottom:{moreBottom}px">
            {#each MORE_ITEMS as item}
              {#if item.danger}<div class="dm-more-sep"></div>{/if}
              <button
                class="dm-more-item"
                class:danger={item.danger}
                role="menuitem"
                onclick={() => runMore(item.id)}>{item.label}</button
              >
            {/each}
          </div>
        {/if}
      </span>
    </div>
  {/if}
</div>

<style>
  .hg-tooltip {
    position: fixed;
    transform: translate(-50%, -100%);
    background: var(--vscode-editorHoverWidget-background, #252526);
    border: 0.5px solid var(--vscode-editorHoverWidget-border, #454545);
    color: var(--vscode-editorHoverWidget-foreground, #ccc);
    font-size: var(--hg-font-xxs);
    font-family: var(--hg-font-family);
    white-space: nowrap;
    padding: 3px 7px;
    border-radius: 3px;
    pointer-events: none;
    z-index: 200;
  }

  /* ── Meta panel ── */
  .detail-meta {
    flex-shrink: 0;
    padding: 10px 12px;
    background: var(--vscode-sideBar-background, #252526);
    overflow-y: auto;
    max-height: 40%;
  }
  /* Hash is the copy affordance — click copies the full hash. */
  .dm-hash {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--hg-editor-font-family);
    font-size: var(--hg-editor-font-size);
    color: #4a9cd6;
    margin-bottom: 4px;
    opacity: 0.85;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .dm-hash:hover {
    opacity: 1;
  }
  .dm-hash-copy {
    opacity: 0;
    transition: opacity 0.12s;
  }
  .dm-hash:hover .dm-hash-copy {
    opacity: 0.7;
  }
  .dm-hash-copied {
    font-size: var(--hg-font-xxs);
    color: #4ec94e;
    font-family: var(--hg-font-family);
  }
  .dm-msg {
    font-size: var(--hg-font-sm);
    color: var(--vscode-foreground, #eee);
    line-height: 1.4;
    margin-bottom: 6px;
  }
  .dm-byline {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: var(--hg-font-xs);
    color: var(--vscode-descriptionForeground, #888);
    margin-bottom: 4px;
  }
  .dm-byline-sep {
    color: var(--vscode-disabledForeground, #555);
  }
  .dm-refs {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin: 2px 0 4px;
  }
  .dm-pill {
    font-size: var(--hg-font-xxs);
    font-family: var(--hg-font-family);
    padding: 0px 6px;
    border-radius: 7px;
    line-height: 1.5;
    white-space: nowrap;
  }
  .dm-pill--head {
    color: var(--hg-info, #56c8e8);
    background: rgba(86, 200, 232, 0.12);
    border: 0.5px solid rgba(86, 200, 232, 0.35);
  }
  .dm-pill--branch {
    color: #4ec94e;
    background: rgba(78, 201, 78, 0.1);
    border: 0.5px solid rgba(78, 201, 78, 0.3);
  }
  .dm-pill--tag {
    color: var(--hg-warn, #e0a030);
    background: rgba(224, 160, 48, 0.1);
    border: 0.5px solid rgba(224, 160, 48, 0.3);
  }
  .dm-stats {
    display: flex;
    gap: 8px;
    font-size: var(--hg-font-xs);
    margin-top: 6px;
    font-family: var(--hg-editor-font-family);
  }
  .dm-stat-dim {
    color: var(--vscode-disabledForeground, #555);
  }
  .stat-add {
    color: #4ec94e;
  }
  .stat-del {
    color: #f07070;
  }
  .dm-actions {
    display: flex;
    gap: 4px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .action-btn {
    font-size: var(--hg-font-xxs);
    padding: 2px 7px;
    border-radius: 3px;
    border: 0.5px solid var(--vscode-widget-border, #3a3a3a);
    background: transparent;
    color: var(--vscode-descriptionForeground, #888);
    cursor: pointer;
    font-family: var(--hg-font-family);
    transition: color 0.1s;
  }
  .action-btn:hover {
    color: var(--vscode-foreground, #ccc);
    background: var(--vscode-list-hoverBackground, #2a2d2e);
  }
  .action-btn--danger:hover {
    color: #f07070;
  }

  /* ── ⋯ overflow menu ── */
  .dm-more-wrap {
    position: relative;
  }
  .dm-more {
    position: fixed;
    z-index: 120;
    min-width: 200px;
    background: var(--vscode-menu-background, #252526);
    border: 0.5px solid var(--vscode-menu-border, #3a3a3a);
    border-radius: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    padding: 4px 0;
    display: flex;
    flex-direction: column;
  }
  .dm-more-item {
    background: none;
    border: none;
    text-align: left;
    padding: 4px 12px;
    font-size: var(--hg-font-xs);
    font-family: var(--hg-font-family);
    color: var(--vscode-menu-foreground, #ccc);
    cursor: pointer;
    white-space: nowrap;
  }
  .dm-more-item:hover {
    background: var(--vscode-menu-selectionBackground, #094771);
    color: var(--vscode-menu-selectionForeground, #fff);
  }
  .dm-more-item.danger {
    color: #f07070;
  }
  .dm-more-item.danger:hover {
    background: rgba(240, 112, 112, 0.12);
    color: #f07070;
  }
  .dm-more-sep {
    height: 0.5px;
    background: var(--vscode-menu-separatorBackground, #3a3a3a);
    margin: 4px 0;
  }
</style>
