<script lang="ts">
  import { send } from '$shared/messageBus';
  import BlameCard from './BlameCard.svelte';
  import type { Hunk, BlameLine } from './types';

  export let hunks: Hunk[] = [];
  export let loading = false;

  // Blame context: which file and which revision each side is attributed to.
  // Right side = the selected (newer) commit, left side = the previous (older).
  export let file = '';
  export let newerRef = '';
  export let olderRef = '';

  // Per-ref blame, lazily loaded and indexed by line number.
  let blameByRef: Record<string, Map<number, BlameLine>> = {};
  const loaded = new Set<string>();
  const loading_ = new Set<string>();

  async function ensureBlame(ref: string) {
    if (!ref || !file || loaded.has(ref) || loading_.has(ref)) return;
    loading_.add(ref);
    try {
      const lines = await send<BlameLine[]>('blame', { path: file, ref });
      const map = new Map<number, BlameLine>();
      for (const l of lines ?? []) map.set(l.line, l);
      blameByRef[ref] = map;
      blameByRef = blameByRef; // trigger reactivity
      loaded.add(ref);
    } catch {
      // No blame for this ref — hover simply won't show a card.
    } finally {
      loading_.delete(ref);
    }
  }

  // Prefetch blame for both visible revisions when they change.
  $: if (file && newerRef) ensureBlame(newerRef);
  $: if (file && olderRef) ensureBlame(olderRef);

  let hover: { blame: BlameLine; x: number; y: number } | null = null;

  function showBlame(e: MouseEvent, ref: string, lineNo?: number) {
    const b = lineNo ? blameByRef[ref]?.get(lineNo) : undefined;
    hover = b ? { blame: b, x: e.clientX + 14, y: e.clientY + 14 } : null;
  }
  function moveBlame(e: MouseEvent) {
    if (hover) hover = { ...hover, x: e.clientX + 14, y: e.clientY + 14 };
  }
  function hideBlame() {
    hover = null;
  }

  interface Seg {
    text: string;
    hi: boolean; // exact intra-line change
  }
  interface Row {
    kind: 'ctx' | 'del' | 'add' | 'mod';
    leftNo?: number;
    rightNo?: number;
    leftText?: string;
    rightText?: string;
    leftHi?: [number, number]; // changed char range
    rightHi?: [number, number];
  }

  function parseHeader(header: string): [number, number] {
    const m = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (!m) return [1, 1];
    return [parseInt(m[1], 10), parseInt(m[2], 10)];
  }

  // Intra-line change range: common prefix/suffix stays plain, middle is marked.
  function changeRange(a: string, b: string): { left: [number, number]; right: [number, number] } {
    let start = 0;
    const minLen = Math.min(a.length, b.length);
    while (start < minLen && a[start] === b[start]) start++;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
      endA--;
      endB--;
    }
    return { left: [start, endA], right: [start, endB] };
  }

  function buildRows(hunks: Hunk[]) {
    const rows: Row[] = [];
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
          const r = changeRange(pendingDel[i].text, pendingAdd[i].text);
          rows.push({
            kind: 'mod',
            leftNo: pendingDel[i].no,
            rightNo: pendingAdd[i].no,
            leftText: pendingDel[i].text,
            rightText: pendingAdd[i].text,
            leftHi: r.left,
            rightHi: r.right,
          });
        }
        for (let i = pairs; i < pendingDel.length; i++) {
          rows.push({
            kind: 'del',
            leftNo: pendingDel[i].no,
            leftText: pendingDel[i].text,
          });
        }
        for (let i = pairs; i < pendingAdd.length; i++) {
          rows.push({
            kind: 'add',
            rightNo: pendingAdd[i].no,
            rightText: pendingAdd[i].text,
          });
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
            rightNo: newNo,
            leftText: line.content,
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

  // Split a line into plain / changed segments around the intra-line change range.
  function segsFor(text: string, hi?: [number, number]): Seg[] {
    if (!hi || hi[1] <= hi[0]) return [{ text, hi: false }];
    const [a, b] = hi;
    const segs: Seg[] = [];
    if (a > 0) segs.push({ text: text.slice(0, a), hi: false });
    segs.push({ text: text.slice(a, b), hi: true });
    if (b < text.length) segs.push({ text: text.slice(b), hi: false });
    return segs;
  }

  $: built = buildRows(hunks ?? []);
  $: rows = built.rows;
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
          <!-- svelte-ignore a11y_no_static_element_interactions a11y_mouse_events_have_key_events -->
          <span
            class="side side-left"
            class:filler={r.leftText === undefined}
            on:mouseenter={(e) => showBlame(e, olderRef, r.leftNo)}
            on:mousemove={moveBlame}
            on:mouseleave={hideBlame}
          >
            {#if r.leftText !== undefined}
              {#each segsFor(r.leftText, r.leftHi) as s}<span class:hi={s.hi}>{s.text}</span>{/each}
            {/if}
          </span>
          <span class="gutter">{r.rightNo ?? ''}</span>
          <!-- svelte-ignore a11y_no_static_element_interactions a11y_mouse_events_have_key_events -->
          <span
            class="side side-right"
            class:filler={r.rightText === undefined}
            on:mouseenter={(e) => showBlame(e, newerRef, r.rightNo)}
            on:mousemove={moveBlame}
            on:mouseleave={hideBlame}
          >
            {#if r.rightText !== undefined}
              {#each segsFor(r.rightText, r.rightHi) as s}<span class:hi={s.hi}>{s.text}</span
                >{/each}
            {/if}
          </span>
        </div>
      {/each}
    </div>
  {/if}

  {#if hover}
    <BlameCard blame={hover.blame} x={hover.x} y={hover.y} />
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
    font-weight: var(--hg-editor-font-weight);
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

  /* Whole changed line — softer line-level tint. */
  .drow--del .side-left,
  .drow--mod .side-left {
    background: var(--vscode-diffEditor-removedLineBackground, rgba(240, 112, 112, 0.16));
  }
  .drow--add .side-right,
  .drow--mod .side-right {
    background: var(--vscode-diffEditor-insertedLineBackground, rgba(78, 201, 78, 0.14));
  }
  .side.filler {
    background: var(--vscode-diffEditor-diagonalFill, rgba(128, 128, 128, 0.08));
  }

  /* Exact intra-line change — stronger char-level tint. */
  .side-left .hi {
    background: var(--vscode-diffEditor-removedTextBackground, rgba(240, 112, 112, 0.4));
  }
  .side-right .hi {
    background: var(--vscode-diffEditor-insertedTextBackground, rgba(78, 201, 78, 0.35));
  }
</style>
