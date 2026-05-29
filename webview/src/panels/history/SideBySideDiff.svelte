<script lang="ts">
  import type { Hunk, DiffRow } from './types';

  export let hunks: Hunk[] = [];
  export let loading = false;

  // Parse "@@ -oldStart,oldCount +newStart,newCount @@" → [oldStart, newStart].
  function parseHeader(header: string): [number, number] {
    const m = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (!m) return [1, 1];
    return [parseInt(m[1], 10), parseInt(m[2], 10)];
  }

  // Convert unified hunks into aligned side-by-side rows. Consecutive del/add
  // runs are paired into 'mod' rows; leftovers become one-sided del/add rows.
  function buildRows(hunks: Hunk[]): { rows: DiffRow[]; diffs: number } {
    const rows: DiffRow[] = [];
    let diffs = 0;

    for (const h of hunks) {
      let [oldNo, newNo] = parseHeader(h.header);
      let pendingDel: { no: number; text: string }[] = [];
      let pendingAdd: { no: number; text: string }[] = [];

      const flush = () => {
        if (!pendingDel.length && !pendingAdd.length) return;
        diffs++;
        const pairs = Math.min(pendingDel.length, pendingAdd.length);
        for (let i = 0; i < pairs; i++) {
          rows.push({
            kind: 'mod',
            leftNo: pendingDel[i].no,
            leftText: pendingDel[i].text,
            rightNo: pendingAdd[i].no,
            rightText: pendingAdd[i].text,
          });
        }
        for (let i = pairs; i < pendingDel.length; i++) {
          rows.push({ kind: 'del', leftNo: pendingDel[i].no, leftText: pendingDel[i].text });
        }
        for (let i = pairs; i < pendingAdd.length; i++) {
          rows.push({ kind: 'add', rightNo: pendingAdd[i].no, rightText: pendingAdd[i].text });
        }
        pendingDel = [];
        pendingAdd = [];
      };

      for (const line of h.lines) {
        if (line.type === 'ctx') {
          flush();
          rows.push({
            kind: 'ctx',
            leftNo: oldNo,
            leftText: line.content,
            rightNo: newNo,
            rightText: line.content,
          });
          oldNo++;
          newNo++;
        } else if (line.type === 'del') {
          pendingDel.push({ no: oldNo, text: line.content });
          oldNo++;
        } else if (line.type === 'add') {
          pendingAdd.push({ no: newNo, text: line.content });
          newNo++;
        }
      }
      flush();
    }
    return { rows, diffs };
  }

  $: built = buildRows(hunks ?? []);
  $: rows = built.rows;
  // Exposed so the parent can show "N difference(s)".
  export let diffCount = 0;
  $: diffCount = built.diffs;
</script>

<div class="sbs">
  {#if loading}
    <div class="sbs-msg">Loading diff…</div>
  {:else if rows.length === 0}
    <div class="sbs-msg">No changes to display.</div>
  {:else}
    <div class="sbs-scroll">
      {#each rows as r}
        <div class="drow drow--{r.kind}">
          <span class="gutter">{r.leftNo ?? ''}</span>
          <span class="side side-left" class:filler={r.leftText === undefined}>{r.leftText ?? ''}</span>
          <span class="gutter">{r.rightNo ?? ''}</span>
          <span class="side side-right" class:filler={r.rightText === undefined}>{r.rightText ?? ''}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .sbs {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: var(--vscode-editor-background, #1e1e1e);
  }
  .sbs-msg {
    padding: 16px;
    color: var(--vscode-disabledForeground, #777);
    font-style: italic;
  }
  .sbs-scroll {
    flex: 1;
    overflow: auto;
    font-family: var(--hg-editor-font-family);
    font-size: var(--hg-editor-font-size);
    line-height: var(--hg-editor-line-height);
  }

  .drow {
    display: grid;
    grid-template-columns: 48px 1fr 48px 1fr;
    white-space: pre;
  }
  .gutter {
    text-align: right;
    padding: 0 8px;
    color: var(--vscode-editorLineNumber-foreground, #6e7681);
    user-select: none;
    background: var(--vscode-editorGutter-background, transparent);
    border-right: 0.5px solid var(--vscode-panel-border, #2a2a2a);
  }
  .side {
    padding: 0 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--vscode-editor-foreground, #ccc);
  }

  /* Changed-line backgrounds — VS Code diff tokens with sane fallbacks. */
  .drow--del .side-left,
  .drow--mod .side-left {
    background: var(--vscode-diffEditor-removedLineBackground, rgba(240, 112, 112, 0.18));
  }
  .drow--add .side-right,
  .drow--mod .side-right {
    background: var(--vscode-diffEditor-insertedLineBackground, rgba(78, 201, 78, 0.16));
  }
  .side.filler {
    background: var(--vscode-diffEditor-diagonalFill, rgba(128, 128, 128, 0.08));
  }
</style>
