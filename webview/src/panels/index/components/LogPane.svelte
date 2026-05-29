<script lang="ts">
  import type { Commit } from '../types';
  import { buildGraphSVG, LANE_W, PAD } from '../graphSvg';

  export let commits: Commit[] = [];
  export let selectedIdx: number | null = null;
  export let onSelect: (i: number) => void = () => {};
  export let onCtx: (e: MouseEvent, i: number) => void = () => {};
  export let onCommitAction: (action: string, commit: Commit) => void = () => {};
  export let fileSearchActive: boolean = false;
  export let fileSearchPath: string = '';

  // ── Pill helpers ──────────────────────────────────────────────────────────
  function pillClass(r: string) {
    if (r.startsWith('origin/') || r.includes('remotes/')) return 'pill pill-remote';
    if (r.startsWith('tag:')) return 'pill pill-tag';
    return 'pill pill-main';
  }
  function pillLabel(r: string) {
    return r.startsWith('tag:') ? r.slice(4).trim() : r;
  }

  // ── Date formatting ───────────────────────────────────────────────────────
  function formatDate(raw: string): string {
    if (!raw) return '';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;

    const now   = new Date();
    const todayStart     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);

    // 12-hour time, no seconds, lowercase am/pm
    const time = d.toLocaleTimeString(undefined, {
      hour:   'numeric',
      minute: '2-digit',
      hour12: true,
    }).toLowerCase().replace(/\s/g, '\u202f'); // narrow no-break space before am/pm

    if (d >= todayStart)     return `Today ${time}`;
    if (d >= yesterdayStart) return `Yesterday ${time}`;

    // Older: YYYY-MM-DD, time
    const ymd = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return `${ymd}, ${time}`;
  }

  // ── Resizable columns ─────────────────────────────────────────────────────
  // subjectW is derived: it fills whatever space author+date don't use.
  // We measure the rows-col container width reactively.
  let containerW = 0;   // bound via clientWidth
  let authorW    = 110;
  let dateW      = 140;
  const HANDLE_W = 5;   // width of each spacer/handle
  const MIN_W    = 60;

  // subject gets the remainder after author, date, and two handles
  $: subjectW = Math.max(MIN_W, containerW - authorW - dateW - HANDLE_W * 2);

  function startResize(e: MouseEvent, left: 'subject' | 'author', right: 'author' | 'date') {
    e.preventDefault();
    const startX = e.clientX;
    const startAuthor = authorW;
    const startDate   = dateW;

    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX;

      if (left === 'subject' && right === 'author') {
        // Dragging right: author shrinks (its left edge moves right), subject grows via reactive remainder
        // Dragging left: author grows, subject shrinks
        const newAuthor = Math.max(MIN_W, startAuthor - delta);
        // Also clamp so subjectW doesn't go below MIN_W
        const wouldBeSubject = containerW - newAuthor - dateW - HANDLE_W * 2;
        if (wouldBeSubject >= MIN_W) authorW = newAuthor;
      } else {
        // author ↔ date: trade width between them, total (author+date) stays fixed
        const total = startAuthor + startDate;
        const newAuthor = Math.max(MIN_W, Math.min(startAuthor + delta, total - MIN_W));
        authorW = newAuthor;
        dateW   = total - newAuthor;
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }

  // ── Context menu ─────────────────────────────────────────────────────────
  let ctxVisible = false;
  let ctxX = 0;
  let ctxY = 0;
  let ctxIdx: number | null = null;

  function showCtx(e: MouseEvent, i: number) {
    e.preventDefault();
    ctxX = e.clientX;
    ctxY = e.clientY;
    ctxIdx = i;
    ctxVisible = true;
    onCtx(e, i);
  }

  function closeCtx() { ctxVisible = false; }

  function fitMenu(node: HTMLElement) {
    requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      if (rect.right > vw) node.style.left = Math.max(0, vw - rect.width - 4) + 'px';
      if (rect.bottom > vh) node.style.top = Math.max(0, parseFloat(node.style.top) - (rect.bottom - vh) - 4) + 'px';
      const updated = node.getBoundingClientRect();
      if (updated.height > vh - 8) {
        node.style.top = '4px';
        node.style.maxHeight = (vh - 8) + 'px';
        node.style.overflowY = 'auto';
      }
    });
  }

  function runAction(action: string) {
    closeCtx();
    if (ctxIdx === null) return;
    onCommitAction(action, commits[ctxIdx]);
  }

  function goToParent() {
    closeCtx();
    if (ctxIdx === null) return;
    const c = commits[ctxIdx];
    const parentHash = (c.parents ?? [])[0];
    if (!parentHash) return;
    const idx = commits.findIndex((x) => x.hash === parentHash);
    if (idx >= 0) onSelect(idx);
  }

  function goToChild() {
    closeCtx();
    if (ctxIdx === null) return;
    const hash = commits[ctxIdx].hash;
    const idx = commits.findIndex((x) => (x.parents ?? []).includes(hash));
    if (idx >= 0) onSelect(idx);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeCtx();
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────
  let tipText = '';
  let tipX = 0, tipY = 0;
  let tipVisible = false;
  let tipTimer: ReturnType<typeof setTimeout>;

  function showTip(e: MouseEvent, text: string) {
    clearTimeout(tipTimer);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tipText = text;
    tipX = rect.left + rect.width / 2;
    tipY = rect.top - 6;
    tipTimer = setTimeout(() => { tipVisible = true; }, 400);
  }
  function hideTip() { clearTimeout(tipTimer); tipVisible = false; }

  // ── Derived ───────────────────────────────────────────────────────────────
  $: maxLane  = commits.reduce((m, c) => Math.max(m, c.lane ?? 0), 0);
  $: laneCount = maxLane + 1;
  $: graphSVG  = buildGraphSVG(commits, laneCount);
  $: graphW    = Math.max(28, laneCount * LANE_W + PAD * 2);
</script>

<svelte:window on:keydown={onKeyDown} />

<!-- Tooltip -->
{#if tipVisible}
  <div class="hg-tooltip" style="left:{tipX}px;top:{tipY}px">{tipText}</div>
{/if}

<!-- Context menu -->
{#if ctxVisible}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="ctx-overlay" on:click={closeCtx}></div>
  <div class="ctx-menu" style="left:{ctxX}px;top:{ctxY}px" use:fitMenu>
    <div class="ctx-item" on:click={() => runAction('copy-hash')}>
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <rect x="3" y="2" width="7" height="9" rx="1" stroke="currentColor" stroke-width="1.1"/>
          <rect x="5" y="4" width="7" height="9" rx="1" stroke="currentColor" stroke-width="1.1" fill="var(--vscode-menu-background, #252526)"/>
        </svg>
      </span>
      <span class="ci-text">Copy Revision Number</span>
      <span class="ci-shortcut">⌥⇧⌘C</span>
    </div>
    <div class="ctx-item">
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <line x1="7" y1="3" x2="7" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          <line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          <line x1="3" y1="12" x2="11" y2="12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="ci-text">Create Patch…</span>
    </div>
    <div class="ctx-item" on:click={() => runAction('cherry-pick')}>
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <circle cx="5" cy="10" r="2.2" stroke="currentColor" stroke-width="1.1"/>
          <circle cx="9.5" cy="10" r="2.2" stroke="currentColor" stroke-width="1.1"/>
          <path d="M5 8 C 5 4, 9.5 4, 9.5 8" stroke="currentColor" stroke-width="1.1" fill="none"/>
          <path d="M7 4 L 9 2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="ci-text">Cherry-Pick</span>
    </div>

    <div class="ctx-divider"></div>

    <div class="ctx-item" on:click={() => runAction('checkout')}><span class="ci-icon"></span><span class="ci-text">Checkout Revision</span></div>
    <div class="ctx-item"><span class="ci-icon"></span><span class="ci-text">Show Repository at Revision</span></div>
    <div class="ctx-item"><span class="ci-icon"></span><span class="ci-text">Compare with Local</span></div>

    <div class="ctx-divider"></div>

    <div class="ctx-item" on:click={() => runAction('reset')}>
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M3 7 L 6 4 M3 7 L 6 10 M3 7 H 9 a 3 3 0 0 1 0 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </span>
      <span class="ci-text">Reset Current Branch to Here…</span>
    </div>
    <div class="ctx-item" on:click={() => runAction('revert')}><span class="ci-icon"></span><span class="ci-text">Revert Commit</span></div>
    <div class="ctx-item ctx-item--dim"><span class="ci-icon"></span><span class="ci-text">Undo Commit…</span></div>

    <div class="ctx-divider"></div>

    <div class="ctx-item">
      <span class="ci-icon"></span>
      <span class="ci-text">Edit Commit Message…</span>
      <span class="ci-shortcut">F2</span>
    </div>
    <div class="ctx-item ctx-item--dim"><span class="ci-icon"></span><span class="ci-text">Fixup…</span></div>
    <div class="ctx-item ctx-item--dim"><span class="ci-icon"></span><span class="ci-text">Squash Into…</span></div>
    <div class="ctx-item"><span class="ci-icon"></span><span class="ci-text">Drop Commit</span></div>
    <div class="ctx-item"><span class="ci-icon"></span><span class="ci-text">Interactively Rebase from Here…</span></div>
    <div class="ctx-item"><span class="ci-icon"></span><span class="ci-text">Push All up to Here…</span></div>

    <div class="ctx-divider"></div>

    <div class="ctx-item" on:click={() => runAction('new-branch')}>
      <span class="ci-icon"></span>
      <span class="ci-text">New Branch…</span>
      <span class="ci-shortcut">⌥⌘N</span>
    </div>
    <div class="ctx-item" on:click={() => runAction('new-tag')}><span class="ci-icon"></span><span class="ci-text">New Tag…</span></div>

    <div class="ctx-divider"></div>

    <div class="ctx-item" on:click={goToChild}>
      <span class="ci-icon"></span>
      <span class="ci-text">Go to Child Commit</span>
      <span class="ci-shortcut">←</span>
    </div>
    <div class="ctx-item" on:click={goToParent}>
      <span class="ci-icon"></span>
      <span class="ci-text">Go to Parent Commit</span>
      <span class="ci-shortcut">→</span>
    </div>

    <div class="ctx-divider"></div>

    <div class="ctx-item" on:click={() => runAction('view-in-browser')}>
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M7 1.3 a5.7 5.7 0 0 0 -1.8 11.1 c0.3 0.05 0.4 -0.13 0.4 -0.3 v-1.05 c-1.6 0.35 -1.95 -0.78 -1.95 -0.78 -0.27 -0.66 -0.65 -0.84 -0.65 -0.84 -0.53 -0.36 0.04 -0.36 0.04 -0.36 0.59 0.04 0.9 0.6 0.9 0.6 0.52 0.9 1.37 0.64 1.7 0.49 0.05 -0.38 0.2 -0.64 0.37 -0.79 -1.28 -0.14 -2.62 -0.64 -2.62 -2.85 0 -0.63 0.22 -1.14 0.59 -1.55 -0.06 -0.14 -0.26 -0.73 0.06 -1.52 0 0 0.49 -0.16 1.6 0.59 a5.55 5.55 0 0 1 1.45 -0.2 c0.5 0 1 0.07 1.45 0.2 1.1 -0.75 1.6 -0.59 1.6 -0.59 0.32 0.79 0.12 1.38 0.06 1.52 0.37 0.4 0.59 0.92 0.59 1.55 0 2.22 -1.34 2.7 -2.62 2.85 0.21 0.18 0.39 0.53 0.39 1.07 v1.59 c0 0.17 0.1 0.36 0.4 0.3 A5.7 5.7 0 0 0 7 1.3 z" fill="currentColor"/>
        </svg>
      </span>
      <span class="ci-text">View in browser</span>
    </div>
  </div>
{/if}

<div class="pane-log">
  {#if fileSearchActive}
    <div class="file-search-bar">⌕ Commits touching: <em>{fileSearchPath}</em></div>
  {/if}
  <!-- Column headers -->
  <div class="log-col-hdr">
    <div class="lch-graph" style="width:{graphW}px;flex-shrink:0"></div>
    <div class="lch-col" style="width:{subjectW}px">Commit</div>
    <div class="col-resize" on:mousedown={(e) => startResize(e, 'subject', 'author')} on:mouseenter={(e) => showTip(e, 'Drag to resize')} on:mouseleave={hideTip}></div>
    <div class="lch-col" style="width:{authorW}px">Author</div>
    <div class="col-resize" on:mousedown={(e) => startResize(e, 'author', 'date')} on:mouseenter={(e) => showTip(e, 'Drag to resize')} on:mouseleave={hideTip}></div>
    <div class="lch-col" style="width:{dateW}px">Date</div>
  </div>

  <div class="log-scroll">
    {#if commits.length === 0}
      <div class="log-empty">No commits</div>
    {:else}
      <div class="log-inner">
        <div class="graph-col" style="width:{graphW}px">
          {@html graphSVG}
        </div>

        <div class="rows-col" bind:clientWidth={containerW}>
          {#each commits as c, i}
            {@const isMerge = (c.parents ?? []).length > 1}
            <div
              class="crow"
              class:sel={selectedIdx === i}
              on:click={() => onSelect(i)}
              on:contextmenu={(e) => showCtx(e, i)}
              role="option"
              aria-selected={selectedIdx === i}
              tabindex="0"
            >
              <div class="csubject" style="width:{subjectW}px">
                {#each c.refs ?? [] as r}
                  <span class={pillClass(r)}>{pillLabel(r)}</span>
                {/each}
                {#if isMerge}
                  <span class="merge-msg">{c.message ?? c.msg ?? ''}</span>
                {:else}
                  {c.message ?? c.msg ?? ''}
                {/if}
              </div>
              <div class="col-spacer"></div>
              <div class="cauthor" style="width:{authorW}px">{c.author ?? ''}</div>
              <div class="col-spacer"></div>
              <div class="cdate" style="width:{dateW}px">{formatDate(c.date ?? '')}</div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .pane-log {
    flex: 1;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 0.5px solid var(--vscode-panel-border, #1a1a1a);
  }

  .file-search-bar {
    padding: 4px 10px;
    font-size: var(--hg-font-xs);
    color: var(--vscode-descriptionForeground, #888);
    background: var(--vscode-editor-background, #1e1e1e);
    border-bottom: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    flex-shrink: 0;
  }
  .file-search-bar em { color: #56c8e8; font-style: normal; }

  /* ── Header ── */
  .log-col-hdr {
    display: flex;
    align-items: center;
    height: 22px;
    background: var(--vscode-sideBarSectionHeader-background, #222);
    border-bottom: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    flex-shrink: 0;
    font-size: var(--hg-font-xxs);
    color: var(--vscode-disabledForeground, #3a3a3a);
    user-select: none;
  }
  .lch-graph   { flex-shrink: 0; padding-left: 4px; }
  .lch-col {
    flex-shrink: 0;
    padding-left: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Resize handle ── */
  .col-resize {
    width: 5px;
    flex-shrink: 0;
    height: 100%;
    cursor: col-resize;
    position: relative;
    z-index: 1;
  }
  .col-resize::after {
    content: '';
    position: absolute;
    top: 20%;
    bottom: 20%;
    left: 2px;
    width: 1px;
    background: var(--vscode-panel-border, #2a2a2a);
    transition: background 0.1s;
  }
  .col-resize:hover::after {
    background: var(--vscode-focusBorder, #007fd4);
  }

  /* ── Scroll area ── */
  .log-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
  }
  .log-empty {
    padding: 20px;
    color: var(--vscode-disabledForeground, #333);
    font-size: var(--hg-font-xs);
    font-style: italic;
  }

  .log-inner {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
  }

  .graph-col {
    flex-shrink: 0;
    align-self: flex-start;
    overflow: visible;
    line-height: 0;
  }

  .rows-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  /* ── Commit row ── */
  .crow {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    height: 22px;
    min-height: 22px;
    max-height: 22px;
    cursor: pointer;
    border-bottom: 0.5px solid var(--vscode-editorGroup-border, #1f1f1f);
    border-left: 2px solid transparent;
    padding-right: 10px;
    flex-shrink: 0;
  }
  .crow:hover { background: var(--vscode-list-hoverBackground, #2a2a2a); }
  .crow.sel   { background: #0e2030; border-left-color: #56c8e8; }

  .col-spacer {
    width: 5px;
    flex-shrink: 0;
  }
  .csubject {
    flex-shrink: 0;
    font-size: var(--hg-font-sm);
    color: var(--vscode-foreground, #bbb);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-left: 4px;
  }
  .merge-msg {
    color: var(--vscode-disabledForeground, #555);
    font-style: italic;
  }
  .cauthor {
    flex-shrink: 0;
    font-size: var(--hg-font-xs);
    color: var(--vscode-descriptionForeground, #555);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-left: 4px;
  }
  .cdate {
    flex-shrink: 0;
    font-size: var(--hg-font-xs);
    color: var(--vscode-disabledForeground, #3a3a3a);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-left: 4px;
  }

  /* ── Pills ── */
  :global(.pill) {
    display: inline-block;
    font-size: var(--hg-font-xxs);
    padding: 1px 4px;
    border-radius: 2px;
    font-weight: 600;
    white-space: nowrap;
    margin-right: 3px;
    vertical-align: middle;
    position: relative;
    top: -1px;
  }
  :global(.pill-main)   { background: #0a3050; color: #56c8e8; border: 0.5px solid #1a5a7a; }
  :global(.pill-remote) { background: #0a200a; color: #4e8c4e; border: 0.5px solid #1a4a1a; }
  :global(.pill-tag)    { background: #1a1200; color: #c8a020; border: 0.5px solid #5a4000; }

  /* ── Tooltip ── */
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

  /* ── Context menu ── */
  .ctx-overlay {
    position: fixed;
    inset: 0;
    z-index: 99;
  }
  .ctx-menu {
    position: fixed;
    z-index: 100;
    background: var(--vscode-menu-background, #252526);
    border: 0.5px solid var(--vscode-menu-border, #3a3a3a);
    border-radius: 5px;
    padding: 4px 0;
    min-width: 280px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.5);
    font-family: var(--hg-font-family);
    font-size: var(--hg-font-xs);
  }
  .ctx-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 14px 5px 10px;
    cursor: default;
    color: var(--vscode-menu-foreground, #ccc);
    white-space: nowrap;
  }
  .ctx-item:hover {
    background: var(--vscode-menu-selectionBackground, #094771);
    color: var(--vscode-menu-selectionForeground, #fff);
  }
  .ctx-item--dim {
    color: var(--vscode-disabledForeground, #555);
  }
  .ctx-item--dim:hover {
    background: transparent;
    color: var(--vscode-disabledForeground, #555);
  }
  .ci-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: currentColor;
  }
  .ci-text {
    flex: 1;
  }
  .ci-shortcut {
    color: var(--vscode-descriptionForeground, #888);
    font-size: var(--hg-font-xxs);
    margin-left: 24px;
  }
  .ctx-item:hover .ci-shortcut {
    color: var(--vscode-menu-selectionForeground, #ddd);
  }
  .ctx-divider {
    height: 0.5px;
    background: var(--vscode-panel-border, #3a3a3a);
    margin: 4px 0;
  }
</style>
