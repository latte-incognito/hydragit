<script lang="ts">
  import type { Commit } from '../types';

  export let commits: Commit[] = [];
  export let selectedIdx: number | null = null;
  export let onSelect: (i: number) => void = () => {};
  export let onCtx: (e: MouseEvent, i: number) => void = () => {};

  const ROW_H = 26;
  const LANE_W = 16;
  const PAD = 4;

  function cx(lane: number) {
    return PAD + lane * LANE_W + LANE_W / 2;
  }
  function cy(row: number) {
    return row * ROW_H + ROW_H / 2;
  }

  function buildGraphSVG(commits: Commit[], laneCount: number): string {
    const svgW = Math.max(28, laneCount * LANE_W + PAD * 2);
    const svgH = commits.length * ROW_H;
    let pathStr = '';
    let dotStr = '';

    // collect curve endpoints for + dot detection
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

    // debug: log all curves so we can verify opening/closing curves
    const allCurves = commits.flatMap((c, i) =>
      (c.paths ?? [])
        .filter((p) => p.type === 'curve')
        .map((p) => ({
          commitMsg: c.message ?? c.msg ?? '',
          commitRow: i,
          fromLane: p.fromLane,
          toLane: p.toLane,
          fromRow: p.fromRow,
          toRow: p.toRow,
          color: p.color,
        }))
    );
    console.log('[graph] all curves:', JSON.stringify(allCurves, null, 2));
    console.log('[graph] curveSourceRows:', [...curveSourceRows]);
    console.log('[graph] curveTargetRows:', [...curveTargetRows]);

    // log which commits get + dots
    for (let i = 0; i < commits.length; i++) {
      const c = commits[i];
      const isMerge = (c.parents ?? []).length > 1;
      const isBranchStart = curveTargetRows.has(i);
      const isBranchSource = curveSourceRows.has(i);
      if (isMerge || isBranchStart || isBranchSource) {
        console.log(
          `[graph] + dot at row ${i}: "${c.message ?? c.msg ?? ''}" isMerge=${isMerge} isBranchStart=${isBranchStart} isBranchSource=${isBranchSource}`
        );
      }
    }

    // Pass 1: edges
    for (const c of commits) {
      for (const p of c.paths ?? []) {
        const x1 = cx(p.fromLane),
          y1 = cy(p.fromRow);
        const x2 = cx(p.toLane),
          y2 = cy(p.toRow);
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
      const c = commits[i];
      const color = c.color ?? '#56c8e8';
      const x = cx(c.lane ?? 0);
      const y = cy(i);
      const isMerge = (c.parents ?? []).length > 1;
      const isBranchStart = curveTargetRows.has(i);
      const isBranchSource = curveSourceRows.has(i);

      if (isMerge || isBranchStart || isBranchSource) {
        dotStr += `<circle cx="${x}" cy="${y}" r="4.5" fill="#1e1e1e" stroke="${color}" stroke-width="1.5"/>
          <line x1="${x - 3}" y1="${y}" x2="${x + 3}" y2="${y}" stroke="${color}" stroke-width="1.2"/>
          <line x1="${x}" y1="${y - 3}" x2="${x}" y2="${y + 3}" stroke="${color}" stroke-width="1.2"/>`;
      } else {
        dotStr += `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`;
      }
    }

    return `<svg width="${svgW}" height="${svgH}" style="display:block">${pathStr}${dotStr}</svg>`;
  }

  function pillClass(r: string) {
    if (r.startsWith('origin/') || r.includes('remotes/')) return 'pill pill-remote';
    if (r.startsWith('tag:')) return 'pill pill-tag';
    return 'pill pill-main';
  }
  function pillLabel(r: string) {
    return r.startsWith('tag:') ? r.slice(4).trim() : r;
  }

  $: maxLane = commits.reduce((m, c) => Math.max(m, c.lane ?? 0), 0);
  $: laneCount = maxLane + 1;
  $: {
    commits.forEach((c, i) => {
      if ((c.paths ?? []).length > 0) {
        console.log(`[paths] row ${i} "${c.message}":`, JSON.stringify(c.paths));
      }
    });
  }
  $: graphSVG = buildGraphSVG(commits, laneCount);
  $: graphW = Math.max(28, laneCount * LANE_W + PAD * 2);
</script>

<div class="pane-log">
  <div class="log-col-hdr">
    <div class="lch-graph" style="width:{graphW}px"></div>
    <div class="lch-subject">Subject</div>
    <div class="lch-author">Author</div>
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

        <div class="rows-col">
          {#each commits as c, i}
            {@const isMerge = (c.parents ?? []).length > 1}
            <div
              class="crow"
              class:sel={selectedIdx === i}
              on:click={() => onSelect(i)}
              on:contextmenu={(e) => onCtx(e, i)}
              role="option"
              aria-selected={selectedIdx === i}
              tabindex="0"
            >
              <div class="csubject">
                {#each c.refs ?? [] as r}
                  <span class={pillClass(r)}>{pillLabel(r)}</span>
                {/each}
                {#if isMerge}
                  <span style="color:#555;font-style:italic">{c.message ?? c.msg ?? ''}</span>
                {:else}
                  {c.message ?? c.msg ?? ''}
                {/if}
              </div>
              <div class="cauthor">{c.author ?? ''}</div>
              <div class="cdate">{c.date ?? ''}</div>
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

  .log-col-hdr {
    display: flex;
    align-items: center;
    height: 22px;
    background: var(--vscode-sideBarSectionHeader-background, #222);
    border-bottom: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    flex-shrink: 0;
    font-size: var(--hg-font-xxs);
    color: var(--vscode-disabledForeground, #3a3a3a);
    padding-right: 10px;
  }
  .lch-graph {
    flex-shrink: 0;
    padding-left: 4px;
  }
  .lch-subject {
    flex: 1;
    padding-left: 4px;
  }
  .lch-author {
    width: 90px;
    flex-shrink: 0;
  }
  .lch-date {
    width: 110px;
    flex-shrink: 0;
    text-align: right;
  }

  .log-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
  }
  .log-empty {
    padding: 20px;
    color: #333;
    font-size: var(--hg-font-xs);
    font-style: italic;
  }

  .log-inner {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    margin: 0;
    padding: 0;
  }

  .graph-col {
    flex-shrink: 0;
    align-self: flex-start;
    margin: 0;
    padding: 0;
    overflow: visible;
    line-height: 0;
  }

  .rows-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
  }

  .crow {
    display: flex;
    align-items: center;
    height: 26px;
    min-height: 26px;
    max-height: 26px;
    box-sizing: border-box;
    cursor: pointer;
    border-bottom: 0.5px solid var(--vscode-editorGroup-border, #1f1f1f);
    border-left: 2px solid transparent;
    padding-right: 10px;
    flex-shrink: 0;
  }
  .crow:hover {
    background: var(--vscode-list-hoverBackground, #2a2a2a);
  }
  .crow.sel {
    background: #0e2030;
    border-left-color: #56c8e8;
  }

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
  .cauthor {
    width: 90px;
    flex-shrink: 0;
    font-size: var(--hg-font-xs);
    color: var(--vscode-descriptionForeground, #555);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cdate {
    width: 110px;
    flex-shrink: 0;
    font-size: var(--hg-font-xs);
    color: var(--vscode-disabledForeground, #3a3a3a);
    text-align: right;
  }

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
  :global(.pill-main) {
    background: #0a3050;
    color: #56c8e8;
    border: 0.5px solid #1a5a7a;
  }
  :global(.pill-remote) {
    background: #0a200a;
    color: #4e8c4e;
    border: 0.5px solid #1a4a1a;
  }
  :global(.pill-tag) {
    background: #1a1200;
    color: #c8a020;
    border: 0.5px solid #5a4000;
  }
</style>
