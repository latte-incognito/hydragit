<script lang="ts">
  import type { Commit } from '../types'

  export let commits:      Commit[] = []
  export let selectedIdx:  number | null = null
  export let onSelect:     (i: number) => void = () => {}
  export let onCtx:        (e: MouseEvent, i: number) => void = () => {}

  function esc(s: string) {
    return s ? s.replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''
  }

  function dot(color: string, merge: boolean, lane: number, laneCount: number) {
    const ROW_H = 26, LANE_W = 16, DOT_R = 3.5, PAD = 4
    const svgW = Math.max(28, laneCount * LANE_W + PAD * 2)
    const cx = PAD + lane * LANE_W + LANE_W / 2
    const cy = ROW_H / 2
    if (merge) {
      return `<svg width="${svgW}" height="${ROW_H}" style="overflow:visible">
        <line x1="${cx}" y1="0" x2="${cx}" y2="${ROW_H}" stroke="${color}" stroke-width="1.5"/>
        <circle cx="${cx}" cy="${cy}" r="${DOT_R + 1}" fill="#1e1e1e" stroke="${color}" stroke-width="1.5"/>
        <line x1="${cx - 3}" y1="${cy}" x2="${cx + 3}" y2="${cy}" stroke="${color}" stroke-width="1.2"/>
        <line x1="${cx}" y1="${cy - 3}" x2="${cx}" y2="${cy + 3}" stroke="${color}" stroke-width="1.2"/>
      </svg>`
    }
    return `<svg width="${svgW}" height="${ROW_H}" style="overflow:visible">
      <line x1="${cx}" y1="0" x2="${cx}" y2="${ROW_H}" stroke="${color}" stroke-width="1.5"/>
      <circle cx="${cx}" cy="${cy}" r="${DOT_R}" fill="${color}"/>
    </svg>`
  }

  function pillClass(r: string) {
    if (r.startsWith('origin/') || r.includes('remotes/')) return 'pill pill-remote'
    if (r.startsWith('tag:')) return 'pill pill-tag'
    return 'pill pill-main'
  }
  function pillLabel(r: string) {
    return r.startsWith('tag:') ? r.slice(4).trim() : r
  }

  $: maxLane   = commits.reduce((m, c) => Math.max(m, c.lane ?? 0), 0)
  $: laneCount = maxLane + 1
</script>

<div class="pane-log">
  <div class="log-col-hdr">
    <div class="lch-graph"></div>
    <div class="lch-subject">Subject</div>
    <div class="lch-author">Author</div>
    <div class="lch-date">Date</div>
  </div>

  <div class="log-scroll">
    {#if commits.length === 0}
      <div class="log-empty">No commits</div>
    {:else}
      {#each commits as c, i}
        {@const isMerge = (c.parents ?? []).length > 1}
        {@const color   = c.color ?? '#56c8e8'}
        {@const lane    = c.lane  ?? 0}
        <div
          class="crow"
          class:sel={selectedIdx === i}
          on:click={() => onSelect(i)}
          on:contextmenu={e => onCtx(e, i)}
          role="option"
          aria-selected={selectedIdx === i}
          tabindex="0"
        >
          <div class="cgraph">{@html dot(color, isMerge, lane, laneCount)}</div>
          <div class="csubject">
            {#each (c.refs ?? []) as r}
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
    {/if}
  </div>
</div>

<style>
  .pane-log {
    flex: 1; min-width: 200px; display: flex; flex-direction: column;
    overflow: hidden; border-right: 0.5px solid var(--vscode-panel-border, #1a1a1a);
  }
  .log-col-hdr {
    display: flex; align-items: center; height: 22px;
    background: var(--vscode-sideBarSectionHeader-background, #222);
    border-bottom: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    flex-shrink: 0; font-size: var(--hg-font-xxs);
    color: var(--vscode-disabledForeground, #3a3a3a); padding-right: 10px;
  }
  .lch-graph   { width: 28px; flex-shrink: 0; padding-left: 4px; }
  .lch-subject { flex: 1; padding-left: 4px; }
  .lch-author  { width: 90px; flex-shrink: 0; }
  .lch-date    { width: 110px; flex-shrink: 0; text-align: right; }

  .log-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; min-height: 0; }
  .log-empty  { padding: 20px; color: #333; font-size: var(--hg-font-xs); font-style: italic; }

  .crow {
    display: flex; align-items: center; height: 26px; cursor: pointer;
    border-bottom: 0.5px solid var(--vscode-editorGroup-border, #1f1f1f);
    border-left: 2px solid transparent; padding-right: 10px; flex-shrink: 0;
  }
  .crow:hover { background: var(--vscode-list-hoverBackground, #2a2a2a); }
  .crow.sel   { background: #0e2030; border-left-color: #56c8e8; }

  .cgraph   { width: 28px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .csubject {
    flex: 1; font-size: var(--hg-font-sm); color: var(--vscode-foreground, #bbb);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; padding-left: 4px;
  }
  .cauthor {
    width: 90px; flex-shrink: 0; font-size: var(--hg-font-xs);
    color: var(--vscode-descriptionForeground, #555);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cdate {
    width: 110px; flex-shrink: 0; font-size: var(--hg-font-xs);
    color: var(--vscode-disabledForeground, #3a3a3a); text-align: right;
  }

  /* Pills */
  :global(.pill) {
    display: inline-block; font-size: var(--hg-font-xxs); padding: 1px 4px;
    border-radius: 2px; font-weight: 600; white-space: nowrap;
    margin-right: 3px; vertical-align: middle; position: relative; top: -1px;
  }
  :global(.pill-main)   { background: #0a3050; color: #56c8e8; border: 0.5px solid #1a5a7a; }
  :global(.pill-remote) { background: #0a200a; color: #4e8c4e; border: 0.5px solid #1a4a1a; }
  :global(.pill-tag)    { background: #1a1200; color: #c8a020; border: 0.5px solid #5a4000; }
</style>
