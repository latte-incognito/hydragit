<script lang="ts">
  import type { Commit } from '../types';

  export let commits: Commit[] = [];
  export let selectedIdx: number | null = null;
  export let onSelect: (i: number) => void = () => {};
  export let onCtx: (e: MouseEvent, i: number) => void = () => {};

  // ── Graph constants ───────────────────────────────────────────────────────
  const ROW_H = 26;
  const LANE_W = 16;
  const PAD = 4;

  function cx(lane: number) { return PAD + lane * LANE_W + LANE_W / 2; }
  function cy(row: number)  { return row * ROW_H + ROW_H / 2; }

  function buildGraphSVG(commits: Commit[], laneCount: number): string {
    const svgW = Math.max(28, laneCount * LANE_W + PAD * 2);
    const svgH = commits.length * ROW_H;
    let pathStr = '';
    let dotStr  = '';

    const curveTargetRows = new Set<number>();
    const curveSourceRows = new Set<number>();
    for (const c of commits) {
      for (const p of c.paths ?? []) {
        if (p.type === 'curve') {
          curveTargetRows.add(p.toRow);
          curveSourceRows.add(p.fromRow);
        }
      }
    }

    // Pass 1: edges
    for (const c of commits) {
      for (const p of c.paths ?? []) {
        const x1 = cx(p.fromLane), y1 = cy(p.fromRow);
        const x2 = cx(p.toLane),   y2 = cy(p.toRow);
        if (p.type === 'straight') {
          pathStr += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${p.color}" stroke-width="1.5" stroke-linecap="round"/>`;
        } else {
          const my = (y1 + y2) / 2;
          pathStr += `<path d="M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}" fill="none" stroke="${p.color}" stroke-width="1.5"/>`;
        }
      }
    }

    // Pass 2: dots
    for (let i = 0; i < commits.length; i++) {
      const c     = commits[i];
      const color = c.color ?? '#56c8e8';
      const x     = cx(c.lane ?? 0);
      const y     = cy(i);
      const isMerge      = (c.parents ?? []).length > 1;
      const isBranchStart = curveTargetRows.has(i);
      const isBranchSource = curveSourceRows.has(i);

      if (isMerge || isBranchStart || isBranchSource) {
        dotStr += `<circle cx="${x}" cy="${y}" r="4.5" fill="#1e1e1e" stroke="${color}" stroke-width="1.5"/>
          <line x1="${x-3}" y1="${y}" x2="${x+3}" y2="${y}" stroke="${color}" stroke-width="1.2"/>
          <line x1="${x}" y1="${y-3}" x2="${x}" y2="${y+3}" stroke="${color}" stroke-width="1.2"/>`;
      } else {
        dotStr += `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`;
      }
    }

    return `<svg width="${svgW}" height="${svgH}" style="display:block">${pathStr}${dotStr}</svg>`;
  }

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
  let authorW = 110;
  let dateW   = 140;

  function startResize(e: MouseEvent, col: 'author' | 'date') {
    e.preventDefault();
    const startX = e.clientX;
    const startW = col === 'author' ? authorW : dateW;

    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX;
      const next  = Math.max(60, startW + (col === 'date' ? delta : -delta));
      if (col === 'author') authorW = next;
      else dateW = next;
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

  function showCtx(e: MouseEvent, i: number) {
    e.preventDefault();
    ctxX = e.clientX;
    ctxY = e.clientY;
    ctxVisible = true;
    onCtx(e, i); // still propagate to parent for future use
  }

  function closeCtx() { ctxVisible = false; }

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
  <div class="ctx-menu" style="left:{ctxX}px;top:{ctxY}px">
    <div class="ctx-header">
      <span class="ctx-icon">🚧</span>
      <span class="ctx-label">Under construction</span>
    </div>
    <div class="ctx-item ctx-item--dim">Copy hash</div>
    <div class="ctx-item ctx-item--dim">Cherry-pick</div>
    <div class="ctx-item ctx-item--dim">Revert</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item ctx-item--dim">Create branch here</div>
    <div class="ctx-item ctx-item--dim">Create tag here</div>
  </div>
{/if}

<div class="pane-log">
  <!-- Column headers -->
  <div class="log-col-hdr" style="--author-w:{authorW}px;--date-w:{dateW}px">
    <div class="lch-graph" style="width:{graphW}px"></div>
    <div class="lch-subject">Commit</div>

    <!-- Resize handle before Author -->
    <div
      class="col-resize"
      on:mousedown={(e) => startResize(e, 'author')}
      on:mouseenter={(e) => showTip(e, 'Drag to resize')}
      on:mouseleave={hideTip}
    ></div>

    <div class="lch-author">Author</div>

    <!-- Resize handle before Date -->
    <div
      class="col-resize"
      on:mousedown={(e) => startResize(e, 'date')}
      on:mouseenter={(e) => showTip(e, 'Drag to resize')}
      on:mouseleave={hideTip}
    ></div>

    <div class="lch-date">Date</div>
  </div>

  <div class="log-scroll">
    {#if commits.length === 0}
      <div class="log-empty">No commits</div>
    {:else}
      <div class="log-inner">
        <div class="graph-col" style="width:{graphW}px">
          {@html graphSVG}
        </div>

        <div class="rows-col" style="--author-w:{authorW}px;--date-w:{dateW}px">
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
              <div class="csubject">
                {#each c.refs ?? [] as r}
                  <span class={pillClass(r)}>{pillLabel(r)}</span>
                {/each}
                {#if isMerge}
                  <span class="merge-msg">{c.message ?? c.msg ?? ''}</span>
                {:else}
                  {c.message ?? c.msg ?? ''}
                {/if}
              </div>
              <div class="cauthor">{c.author ?? ''}</div>
              <div class="cdate">{formatDate(c.date ?? '')}</div>
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
  .lch-subject { flex: 1; padding-left: 4px; min-width: 0; }
  .lch-author  { width: var(--author-w); flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lch-date    { width: var(--date-w); flex-shrink: 0; text-align: right; padding-right: 10px; overflow: hidden; }

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
    height: 26px;
    min-height: 26px;
    max-height: 26px;
    cursor: pointer;
    border-bottom: 0.5px solid var(--vscode-editorGroup-border, #1f1f1f);
    border-left: 2px solid transparent;
    padding-right: 10px;
    flex-shrink: 0;
  }
  .crow:hover { background: var(--vscode-list-hoverBackground, #2a2a2a); }
  .crow.sel   { background: #0e2030; border-left-color: #56c8e8; }

  .csubject {
    flex: 1;
    font-size: var(--hg-font-sm);
    color: var(--vscode-foreground, #bbb);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    padding-left: 4px;
  }
  .merge-msg {
    color: var(--vscode-disabledForeground, #555);
    font-style: italic;
  }
  .cauthor {
    width: var(--author-w);
    flex-shrink: 0;
    font-size: var(--hg-font-xs);
    color: var(--vscode-descriptionForeground, #555);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cdate {
    width: var(--date-w);
    flex-shrink: 0;
    font-size: var(--hg-font-xs);
    color: var(--vscode-disabledForeground, #3a3a3a);
    text-align: right;
    white-space: nowrap;
    padding-right: 10px;
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
    border-radius: 4px;
    padding: 4px 0;
    min-width: 190px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.35);
    font-family: var(--hg-font-family);
    font-size: var(--hg-font-xs);
  }
  .ctx-header {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 12px;
    border-bottom: 0.5px solid var(--vscode-panel-border, #2a2a2a);
    margin-bottom: 3px;
  }
  .ctx-icon  { font-size: 14px; line-height: 1; }
  .ctx-label { font-size: var(--hg-font-xxs); color: var(--vscode-descriptionForeground, #888); }
  .ctx-item  { padding: 5px 12px; cursor: default; color: var(--vscode-foreground, #ccc); }
  .ctx-item--dim { color: var(--vscode-disabledForeground, #555); }
  .ctx-divider { height: 0.5px; background: var(--vscode-panel-border, #2a2a2a); margin: 3px 0; }
</style>
