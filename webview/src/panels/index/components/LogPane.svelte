<script lang="ts">
  import type { Commit } from '../types';
  import { buildGraphSVG, LANE_W, PAD, ROW_H } from '../graphSvg';
  import { fullDate, smartDate } from '$shared/dates';

  interface Props {
    commits?: Commit[];
    selectedIdx?: number | null;
    onSelect?: (i: number) => void;
    onCtx?: (e: MouseEvent, i: number) => void;
    onCommitAction?: (action: string, commit: Commit) => void;
    fileSearchActive?: boolean;
    fileSearchPath?: string;
  }

  let {
    commits = [],
    selectedIdx = null,
    onSelect = () => {},
    onCtx = () => {},
    onCommitAction = () => {},
    fileSearchActive = false,
    fileSearchPath = ''
  }: Props = $props();

  // ── Pill helpers ──────────────────────────────────────────────────────────
  function pillClass(r: string) {
    if (r.startsWith('origin/') || r.includes('remotes/')) return 'pill pill-remote';
    if (r.startsWith('tag:')) return 'pill pill-tag';
    return 'pill pill-main';
  }
  function pillLabel(r: string) {
    return r.startsWith('tag:') ? r.slice(4).trim() : r;
  }

  // ── Date formatting: smartDate keeps the column from truncating (older
  // dates drop the time); the full timestamp lives in the cell tooltip.

  // Single-author repos (the common solo case): the author column is pure
  // repetition — hide it and give the width back to the subject.
  let singleAuthor = $derived(new Set(commits.map((c) => c.author ?? '')).size <= 1);

  // ── Resizable columns ─────────────────────────────────────────────────────
  // subjectW is derived: it fills whatever space author+date don't use.
  // We measure the rows-col container width reactively.
  let containerW = $state(0);   // bound via clientWidth
  let authorW    = $state(110);
  let dateW      = $state(140);
  const HANDLE_W = 5;   // width of each spacer/handle
  const MIN_W    = 60;

  // subject gets the remainder after author, date, and two handles
  // (a hidden author column contributes zero — the subject reclaims it)
  let subjectW = $derived(
    Math.max(MIN_W, containerW - (singleAuthor ? 0 : authorW + HANDLE_W) - dateW - HANDLE_W)
  );

  function startResize(e: MouseEvent, left: 'subject' | 'author', right: 'author' | 'date') {
    e.preventDefault();
    const startX = e.clientX;
    const startAuthor = authorW;
    const startDate   = dateW;

    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX;

      if (left === 'subject' && right === 'date') {
        // Single-author layout: the only handle trades subject ↔ date.
        const newDate = Math.max(MIN_W, startDate - delta);
        const wouldBeSubject = containerW - newDate - HANDLE_W;
        if (wouldBeSubject >= MIN_W) dateW = newDate;
      } else if (left === 'subject' && right === 'author') {
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
  let ctxVisible = $state(false);
  let ctxX = $state(0);
  let ctxY = $state(0);
  // $state: the unpushed gate below must re-evaluate when a second right-click
  // retargets the already-open menu to a different commit.
  let ctxIdx: number | null = $state(null);

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
  let tipText = $state('');
  let tipX = $state(0), tipY = $state(0);
  let tipVisible = $state(false);
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
  let maxLane  = $derived(commits.reduce((m, c) => Math.max(m, c.lane ?? 0), 0));
  let laneCount = $derived(maxLane + 1);
  let graphW    = $derived(Math.max(28, laneCount * LANE_W + PAD * 2));

  // ── Virtual scrolling ───────────────────────────────────────────────────────
  // The whole history is loaded, but we only render the rows in (and a little
  // around) the viewport — both the commit rows and the graph SVG slice — so the
  // DOM stays small no matter how many commits there are.
  const OVERSCAN = 8;                       // extra rows rendered above/below
  let scroller: HTMLElement = $state();
  let scrollTop = $state(0);
  let viewportH = $state(0);
  let rafPending = false;

  function onScroll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      scrollTop = scroller?.scrollTop ?? 0;
      rafPending = false;
    });
  }

  // ── Branch-line highlight ────────────────────────────────────────────────
  // Hovering a row highlights its branch line (segment) and dims the rest.
  let hoveredSeg: number | null = $state(null);
  function hoverRow(i: number) { hoveredSeg = commits[i]?.seg ?? null; }
  function clearHover() { hoveredSeg = null; }

  let totalH   = $derived(commits.length * ROW_H);
  let winStart = $derived(Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN));
  let winEnd   = $derived(Math.min(commits.length, Math.ceil((scrollTop + viewportH) / ROW_H) + OVERSCAN));
  let winTopPx = $derived(winStart * ROW_H);
  let graphSVG = $derived(buildGraphSVG(commits, laneCount, winStart, winEnd, hoveredSeg));
  // Indices of the rows to render (avoids slicing/cloning commit objects).
  let visible = $derived((() => {
    const out: number[] = [];
    for (let i = winStart; i < winEnd; i++) out.push(i);
    return out;
  })());

  // Keep the selected row on screen (e.g. keyboard navigation into an off-screen row).
  function ensureVisible(idx: number) {
    if (!scroller || idx < 0) return;
    const top = idx * ROW_H;
    const bottom = top + ROW_H;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (bottom > scroller.scrollTop + viewportH) scroller.scrollTop = bottom - viewportH;
  }
  // Post-DOM effect: the scroll math reads row geometry, so run after render.
  $effect(() => {
    if (selectedIdx != null) ensureVisible(selectedIdx);
  });
</script>

<svelte:window onkeydown={onKeyDown} />

<!-- Tooltip -->
{#if tipVisible}
  <div class="hg-tooltip" style="left:{tipX}px;top:{tipY}px">{tipText}</div>
{/if}

<!-- Context menu -->
{#if ctxVisible}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="ctx-overlay" onclick={closeCtx}></div>
  <div class="ctx-menu" style="left:{ctxX}px;top:{ctxY}px" use:fitMenu>
    <div class="ctx-item" onclick={() => runAction('copy-hash')}>
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <rect x="3" y="2" width="7" height="9" rx="1" stroke="currentColor" stroke-width="1.1"/>
          <rect x="5" y="4" width="7" height="9" rx="1" stroke="currentColor" stroke-width="1.1" fill="var(--vscode-menu-background, #252526)"/>
        </svg>
      </span>
      <span class="ci-text">Copy Revision Number</span>
      <span class="ci-shortcut">⌥⇧⌘C</span>
    </div>
    <div class="ctx-item" onclick={() => runAction('create-patch')}>
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <line x1="7" y1="3" x2="7" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          <line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          <line x1="3" y1="12" x2="11" y2="12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="ci-text">Create Patch…</span>
    </div>
    <div class="ctx-item" onclick={() => runAction('cherry-pick')}>
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

    <div class="ctx-item" onclick={() => runAction('checkout')}><span class="ci-icon"></span><span class="ci-text">Checkout Revision</span></div>
    <div class="ctx-item ctx-item--dim"><span class="ci-icon"></span><span class="ci-text">Show Repository at Revision</span></div>
    <div class="ctx-item" onclick={() => runAction('compare-local')}><span class="ci-icon"></span><span class="ci-text">Compare with Local</span></div>

    <div class="ctx-divider"></div>

    <div class="ctx-item" onclick={() => runAction('reset')}>
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M3 7 L 6 4 M3 7 L 6 10 M3 7 H 9 a 3 3 0 0 1 0 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </span>
      <span class="ci-text">Reset Current Branch to Here…</span>
    </div>
    <div class="ctx-item" onclick={() => runAction('revert')}><span class="ci-icon"></span><span class="ci-text">Revert Commit</span></div>
    <div class="ctx-item" onclick={() => runAction('fixup')}><span class="ci-icon"></span><span class="ci-text">Fixup: Commit Changes into This…</span></div>
    <div class="ctx-item" onclick={() => runAction('autosquash')}><span class="ci-icon"></span><span class="ci-text">Apply Fixups Below (Autosquash)…</span></div>
    <div class="ctx-item ctx-item--dim"><span class="ci-icon"></span><span class="ci-text">Undo Commit…</span></div>

    <div class="ctx-divider"></div>

    <div class="ctx-item" onclick={() => runAction('edit-message')}>
      <span class="ci-icon"></span>
      <span class="ci-text">Edit Commit Message…</span>
      <span class="ci-shortcut">F2</span>
    </div>
    <div class="ctx-item ctx-item--dim"><span class="ci-icon"></span><span class="ci-text">Fixup…</span></div>
    <div class="ctx-item" onclick={() => runAction('squash')}><span class="ci-icon"></span><span class="ci-text">Squash with Parent</span></div>
    <div class="ctx-item" onclick={() => runAction('drop')}><span class="ci-icon"></span><span class="ci-text">Drop Commit</span></div>
    <div class="ctx-item" onclick={() => runAction('interactive-rebase')}><span class="ci-icon"></span><span class="ci-text">Interactively Rebase from Here…</span></div>
    <div class="ctx-item" onclick={() => runAction('push-here')}><span class="ci-icon"></span><span class="ci-text">Push All up to Here…</span></div>

    <div class="ctx-divider"></div>

    <div class="ctx-item" onclick={() => runAction('new-branch')}>
      <span class="ci-icon"></span>
      <span class="ci-text">New Branch…</span>
      <span class="ci-shortcut">⌥⌘N</span>
    </div>
    <div class="ctx-item" onclick={() => runAction('new-tag')}><span class="ci-icon"></span><span class="ci-text">New Tag…</span></div>

    <div class="ctx-divider"></div>

    <div class="ctx-item" onclick={goToChild}>
      <span class="ci-icon"></span>
      <span class="ci-text">Go to Child Commit</span>
      <span class="ci-shortcut">←</span>
    </div>
    <div class="ctx-item" onclick={goToParent}>
      <span class="ci-icon"></span>
      <span class="ci-text">Go to Parent Commit</span>
      <span class="ci-shortcut">→</span>
    </div>

    {#if ctxIdx === null || !commits[ctxIdx]?.unpushed}
    <!-- Only for pushed commits — a local-only commit has no remote URL. -->
    <div class="ctx-divider"></div>

    <div class="ctx-item" onclick={() => runAction('view-in-browser')}>
      <span class="ci-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M7 1.3 a5.7 5.7 0 0 0 -1.8 11.1 c0.3 0.05 0.4 -0.13 0.4 -0.3 v-1.05 c-1.6 0.35 -1.95 -0.78 -1.95 -0.78 -0.27 -0.66 -0.65 -0.84 -0.65 -0.84 -0.53 -0.36 0.04 -0.36 0.04 -0.36 0.59 0.04 0.9 0.6 0.9 0.6 0.52 0.9 1.37 0.64 1.7 0.49 0.05 -0.38 0.2 -0.64 0.37 -0.79 -1.28 -0.14 -2.62 -0.64 -2.62 -2.85 0 -0.63 0.22 -1.14 0.59 -1.55 -0.06 -0.14 -0.26 -0.73 0.06 -1.52 0 0 0.49 -0.16 1.6 0.59 a5.55 5.55 0 0 1 1.45 -0.2 c0.5 0 1 0.07 1.45 0.2 1.1 -0.75 1.6 -0.59 1.6 -0.59 0.32 0.79 0.12 1.38 0.06 1.52 0.37 0.4 0.59 0.92 0.59 1.55 0 2.22 -1.34 2.7 -2.62 2.85 0.21 0.18 0.39 0.53 0.39 1.07 v1.59 c0 0.17 0.1 0.36 0.4 0.3 A5.7 5.7 0 0 0 7 1.3 z" fill="currentColor"/>
        </svg>
      </span>
      <span class="ci-text">View in browser</span>
    </div>
    {/if}
  </div>
{/if}

<div class="pane-log">
  {#if fileSearchActive}
    <div class="file-search-bar">⌕ Commits touching: <em>{fileSearchPath}</em></div>
  {/if}
  <!-- Column headers — the Author column (header, cell and resize handle)
       disappears together in single-author repos, keeping header/row alignment. -->
  <div class="log-col-hdr">
    <div class="lch-graph" style="width:{graphW}px;flex-shrink:0"></div>
    <div class="lch-col" style="width:{subjectW}px">Commit</div>
    {#if !singleAuthor}
      <div class="col-resize" onmousedown={(e) => startResize(e, 'subject', 'author')} onmouseenter={(e) => showTip(e, 'Drag to resize')} onmouseleave={hideTip}></div>
      <div class="lch-col" style="width:{authorW}px">Author</div>
    {/if}
    <div class="col-resize" onmousedown={(e) => startResize(e, singleAuthor ? 'subject' : 'author', 'date')} onmouseenter={(e) => showTip(e, 'Drag to resize')} onmouseleave={hideTip}></div>
    <div class="lch-col" style="width:{dateW}px">Date</div>
  </div>

  <div class="log-scroll" bind:this={scroller} onscroll={onScroll} onmouseleave={clearHover} bind:clientHeight={viewportH}>
    {#if commits.length === 0}
      <div class="log-empty">No commits</div>
    {:else}
      <div class="log-inner" style="height:{totalH}px">
        <div class="graph-col" style="width:{graphW}px; transform:translateY({winTopPx}px)">
          {@html graphSVG}
        </div>

        <div class="rows-col" style="left:{graphW}px" bind:clientWidth={containerW}>
          {#each visible as i (i)}
            {@const c = commits[i]}
            {@const isMerge = (c.parents ?? []).length > 1}
            <div
              class="crow"
              class:sel={selectedIdx === i}
              class:dim={hoveredSeg !== null && c.seg !== hoveredSeg}
              style="top:{i * ROW_H}px"
              onclick={() => onSelect(i)}
              oncontextmenu={(e) => showCtx(e, i)}
              onmouseenter={() => hoverRow(i)}
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
              {#if !singleAuthor}
                <div class="col-spacer"></div>
                <div class="cauthor" style="width:{authorW}px">{c.author ?? ''}</div>
              {/if}
              <div class="col-spacer"></div>
              <div class="cdate" style="width:{dateW}px" title={fullDate(c.date ?? '')}>{smartDate(c.date ?? '')}</div>
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

  /* Virtual scroll: log-inner is the full-height spacer; graph + rows are
     absolutely positioned slices of it. */
  .log-inner {
    position: relative;
    width: 100%;
  }

  .graph-col {
    position: absolute;
    top: 0;
    left: 0;
    flex-shrink: 0;
    overflow: visible;
    line-height: 0;
    will-change: transform;
  }

  .rows-col {
    position: absolute;
    top: 0;
    right: 0;
    min-width: 0;
  }

  /* ── Commit row ── */
  .crow {
    position: absolute;
    left: 0;
    right: 0;
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
  }
  .crow:hover { background: var(--vscode-list-hoverBackground, #2a2a2a); }
  /* Selection = themed fill (reads as selection, not a focus ring) — ROADMAP §4.11 */
  .crow.sel {
    background: var(--vscode-list-activeSelectionBackground, #0e2030);
    border-left-color: var(--vscode-focusBorder, #56c8e8);
  }
  .crow.sel .csubject,
  .crow.sel .cauthor,
  .crow.sel .cdate {
    color: var(--vscode-list-activeSelectionForeground, #e8e8e8);
  }
  /* Dim rows that aren't on the hovered branch line. */
  .crow.dim   { opacity: 0.4; }

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
    /* descriptionForeground, not disabledForeground — dates are info, not
       disabled UI, and the old value was borderline-invisible (§4.14) */
    color: var(--vscode-descriptionForeground, #8c8c8c);
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
  /* Translucent accent tints so the ref pills read on any theme (the solid
     fills assumed a dark background). Cyan/green/gold accents are brand. */
  :global(.pill-main)   { background: rgba(86,200,232,0.12); color: #56c8e8; border: 0.5px solid rgba(86,200,232,0.4); }
  :global(.pill-remote) { background: rgba(78,140,78,0.15); color: #4e8c4e; border: 0.5px solid rgba(78,140,78,0.4); }
  :global(.pill-tag)    { background: rgba(200,160,32,0.13); color: #c8a020; border: 0.5px solid rgba(200,160,32,0.4); }

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
