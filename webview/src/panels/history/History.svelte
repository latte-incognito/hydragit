<script lang="ts">
  import { onMount } from 'svelte';
  import { send, on } from '$shared/messageBus';
  import vscode from '$shared/vscode';
  import SideBySideDiff from './SideBySideDiff.svelte';
  import type { Commit, HistoryInit, Hunk, LineCommit } from './types';

  let mode: 'file' | 'selection' = 'file';
  let file = '';
  let start = 0;
  let end = 0;

  // File mode → Commit[]; selection mode → LineCommit[] (each carries its
  // line-range hunks). Stored together; selection rows are cast when needed.
  let commits: Commit[] = [];
  let selectedIdx: number | null = null;
  let loading = false;
  let error = '';

  // Selection-mode diff state.
  let diffHunks: Hunk[] = [];
  let diffCount = 0;
  let olderRef = '';
  let newerRef = '';

  $: fileName = file.split('/').pop() ?? file;
  $: selected = selectedIdx !== null ? commits[selectedIdx] : null;

  async function load() {
    loading = true;
    error = '';
    selectedIdx = null;
    diffHunks = [];
    try {
      const result =
        mode === 'selection'
          ? await send<LineCommit[]>('line.history', { path: file, start, end })
          : await send<Commit[]>('file.history', { path: file });
      commits = result ?? [];
      if (commits.length) selectRow(0);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      commits = [];
    } finally {
      loading = false;
    }
  }

  function selectRow(i: number) {
    selectedIdx = i;
    const c = commits[i];
    if (!c) return;

    if (mode === 'selection') {
      // The diff is already scoped to the selected lines: each LineCommit
      // carries its own line-range hunks (git log -L). left = previous
      // revision in the list (older), right = selected.
      diffHunks = (c as LineCommit).hunks ?? [];
      newerRef = c.hash;
      olderRef = commits[i + 1]?.hash ?? (c.parents ?? [])[0] ?? '';
    } else {
      // File history → native VS Code diff in the top editor group.
      send('openDiff', {
        commit: c.hash,
        parent: (c.parents ?? [])[0] ?? '',
        file,
      });
    }
  }

  const short = (h: string) => (h ? h.slice(0, 8) : '');

  // ── Date formatting ─────────────────────────────────────────────────────
  function fmtDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const now = new Date();
    const time = d
      .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      .toLowerCase();
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(d, now)) return `Today ${time}`;
    if (sameDay(d, yesterday)) return `Yesterday ${time}`;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')} ${time}`;
  }

  // ref → display label + class (file-mode list only). Mirrors main-panel pills.
  function refPill(r: string): { label: string; cls: string } | null {
    if (r === 'HEAD') return { label: 'HEAD', cls: 'pill-main' };
    if (r.startsWith('HEAD -> ')) return { label: r.slice(8), cls: 'pill-main' };
    if (r.startsWith('tag: ')) return { label: r.slice(5), cls: 'pill-tag' };
    if (r.startsWith('origin/') || r.includes('/')) return { label: r, cls: 'pill-remote' };
    return { label: r, cls: 'pill-main' };
  }

  onMount(() => {
    const off = on('init', (data) => {
      const init = data as HistoryInit;
      mode = init.mode;
      file = init.file;
      if (init.mode === 'selection') {
        start = init.start;
        end = init.end;
      }
      load();
    });
    vscode.postMessage({ cmd: 'ready' });
    return off;
  });
</script>

{#if mode === 'selection'}
  <!-- ════ History for Selection ════ -->
  <div class="app-root history history--selection">
    <div class="diff-toolbar">
      <span class="dt-mode">Side-by-side viewer</span>
      <span class="dt-spacer"></span>
      {#if selected}
        <span class="dt-count">{diffCount} difference{diffCount !== 1 ? 's' : ''}</span>
      {/if}
    </div>

    <div class="rev-headers">
      <div class="rev">{olderRef ? `Revision ${short(olderRef)}` : '(no earlier revision)'}</div>
      <div class="rev">{newerRef ? `Revision ${short(newerRef)}` : ''}</div>
    </div>

    {#if loading}
      <div class="hist-msg">Loading…</div>
    {:else if error}
      <div class="hist-msg hist-msg--error">{error}</div>
    {:else if commits.length === 0}
      <div class="hist-msg">No history for this selection.</div>
    {:else}
      <SideBySideDiff hunks={diffHunks} bind:diffCount />

      <div class="sel-list">
        <div class="list-toolbar">
          <label class="changes-only"><input type="checkbox" checked disabled /> Changes only</label>
        </div>
        <div class="cols-hdr">
          <span class="c-ver">Version</span>
          <span class="c-date">Date</span>
          <span class="c-author">Author</span>
          <span class="c-msg">Commit Message</span>
        </div>
        <div class="rows" role="listbox" tabindex="-1">
          {#each commits as c, i}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="srow"
              class:selected={selectedIdx === i}
              role="option"
              aria-selected={selectedIdx === i}
              tabindex="0"
              on:click={() => selectRow(i)}
            >
              <span class="c-ver mono">{short(c.hash)}</span>
              <span class="c-date">{fmtDate(c.date)}</span>
              <span class="c-author">{c.author}</span>
              <span class="c-msg" title={c.message ?? c.msg ?? ''}>{c.message ?? c.msg ?? ''}</span>
            </div>
          {/each}
        </div>
      </div>

      {#if selected}
        <footer class="hist-footer">
          <span class="f-label">Commit Message:</span>
          <span class="f-msg">{selected.message ?? selected.msg ?? ''}</span>
        </footer>
      {/if}
    {/if}
  </div>
{:else}
  <!-- ════ File History (native diff in split editor) ════ -->
  <div class="app-root history">
    <header class="hist-header">
      <span class="hist-title">History: <strong>{fileName}</strong></span>
      {#if !loading && !error}
        <span class="hist-count">{commits.length} commit{commits.length !== 1 ? 's' : ''}</span>
      {/if}
    </header>

    {#if loading}
      <div class="hist-msg">Loading…</div>
    {:else if error}
      <div class="hist-msg hist-msg--error">{error}</div>
    {:else if commits.length === 0}
      <div class="hist-msg">No history for this file.</div>
    {:else}
      <div class="hist-list" role="listbox" tabindex="-1">
        {#each commits as c, i}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="row"
            class:selected={selectedIdx === i}
            role="option"
            aria-selected={selectedIdx === i}
            tabindex="0"
            on:click={() => selectRow(i)}
          >
            <span class="r-refs">
              {#each c.refs ?? [] as r}
                {@const p = refPill(r)}
                {#if p}<span class="pill {p.cls}">{p.label}</span>{/if}
              {/each}
            </span>
            <span class="r-msg" title={c.message ?? c.msg ?? ''}>{c.message ?? c.msg ?? ''}</span>
            <span class="r-author">{c.author}</span>
            <span class="r-date">{fmtDate(c.date)}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .history {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--vscode-editor-background, #1e1e1e);
    color: var(--vscode-foreground, #ccc);
    font-family: var(--hg-font-family);
    font-size: var(--hg-font-xs);
  }

  /* ── File-mode header (matches .log-col-hdr) ── */
  .hist-header {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 22px;
    flex-shrink: 0;
    padding: 0 10px;
    background: var(--vscode-sideBarSectionHeader-background, #222);
    border-bottom: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    user-select: none;
  }
  .hist-title {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: var(--hg-font-xxs);
    color: var(--vscode-disabledForeground, #3a3a3a);
  }
  .hist-title strong { color: var(--vscode-descriptionForeground, #888); }
  .hist-count {
    flex-shrink: 0;
    font-size: var(--hg-font-xxs);
    color: var(--vscode-disabledForeground, #3a3a3a);
  }

  .hist-msg {
    padding: 20px;
    color: var(--vscode-disabledForeground, #333);
    font-size: var(--hg-font-xs);
    font-style: italic;
  }
  .hist-msg--error {
    color: var(--vscode-errorForeground, #f07070);
    font-style: normal;
    white-space: pre-wrap;
  }

  /* ── File-mode commit list (matches .crow) ── */
  .hist-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
  }
  .row {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    height: 22px;
    min-height: 22px;
    max-height: 22px;
    cursor: pointer;
    border-bottom: 0.5px solid var(--vscode-editorGroup-border, #1f1f1f);
    border-left: 2px solid transparent;
    padding: 0 10px;
  }
  .row:hover { background: var(--vscode-list-hoverBackground); }
  .row.selected {
    background: var(--vscode-list-activeSelectionBackground);
    border-left-color: var(--vscode-list-focusOutline, var(--vscode-focusBorder));
  }
  /* Keep text legible against the theme's selection background. */
  .row.selected .r-msg,
  .row.selected .r-author,
  .row.selected .r-date {
    color: var(--vscode-list-activeSelectionForeground);
  }
  .r-refs { display: flex; align-items: center; flex-shrink: 0; }
  .r-msg {
    flex: 1;
    min-width: 0;
    font-size: var(--hg-font-sm);
    color: var(--vscode-foreground, #bbb);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-left: 4px;
  }
  .r-author {
    width: 140px;
    flex-shrink: 0;
    font-size: var(--hg-font-xs);
    color: var(--vscode-descriptionForeground, #555);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-left: 8px;
  }
  .r-date {
    width: 150px;
    flex-shrink: 0;
    font-size: var(--hg-font-xs);
    color: var(--vscode-disabledForeground, #3a3a3a);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-left: 8px;
  }
  .pill {
    display: inline-block;
    font-size: var(--hg-font-xxs);
    padding: 1px 4px;
    border-radius: 2px;
    font-weight: 600;
    white-space: nowrap;
    margin-right: 3px;
    vertical-align: middle;
  }
  /* Theme-aware via VS Code chart colors; subtle tint over the theme bg. */
  .pill-main {
    color: var(--vscode-charts-blue);
    background: color-mix(in srgb, var(--vscode-charts-blue) 15%, transparent);
    border: 0.5px solid color-mix(in srgb, var(--vscode-charts-blue) 40%, transparent);
  }
  .pill-remote {
    color: var(--vscode-charts-green);
    background: color-mix(in srgb, var(--vscode-charts-green) 15%, transparent);
    border: 0.5px solid color-mix(in srgb, var(--vscode-charts-green) 40%, transparent);
  }
  .pill-tag {
    color: var(--vscode-charts-yellow);
    background: color-mix(in srgb, var(--vscode-charts-yellow) 15%, transparent);
    border: 0.5px solid color-mix(in srgb, var(--vscode-charts-yellow) 40%, transparent);
  }

  /* ════ Selection-mode layout ════ */
  .history--selection { user-select: none; }

  .diff-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 26px;
    flex-shrink: 0;
    padding: 0 10px;
    background: var(--vscode-sideBarSectionHeader-background, #222);
    border-bottom: 0.5px solid var(--vscode-panel-border, #1a1a1a);
  }
  .dt-mode {
    font-size: var(--hg-font-xs);
    color: var(--vscode-descriptionForeground, #888);
  }
  .dt-spacer { flex: 1; }
  .dt-count {
    font-size: var(--hg-font-xxs);
    color: var(--vscode-disabledForeground, #777);
  }

  .rev-headers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    flex-shrink: 0;
    border-bottom: 0.5px solid var(--vscode-panel-border, #1a1a1a);
  }
  .rev {
    padding: 3px 10px;
    font-family: var(--hg-editor-font-family);
    font-size: var(--hg-font-xxs);
    color: var(--vscode-descriptionForeground, #888);
    background: var(--vscode-editor-background, #1e1e1e);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rev:first-child { border-right: 0.5px solid var(--vscode-panel-border, #2a2a2a); }

  .sel-list {
    flex-shrink: 0;
    height: 38%;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    border-top: 0.5px solid var(--vscode-panel-border, #1a1a1a);
  }
  .list-toolbar {
    flex-shrink: 0;
    padding: 4px 10px;
    background: var(--vscode-sideBar-background, #252526);
  }
  .changes-only {
    font-size: var(--hg-font-xxs);
    color: var(--vscode-descriptionForeground, #888);
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .changes-only input { margin: 0; }

  .cols-hdr,
  .srow {
    display: grid;
    grid-template-columns: 90px 150px 150px 1fr;
    align-items: center;
  }
  .cols-hdr {
    flex-shrink: 0;
    height: 20px;
    padding: 0 10px;
    font-size: var(--hg-font-xxs);
    color: var(--vscode-disabledForeground, #3a3a3a);
    background: var(--vscode-sideBarSectionHeader-background, #222);
    border-top: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    border-bottom: 0.5px solid var(--vscode-panel-border, #1a1a1a);
  }
  .rows {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  .srow {
    height: 22px;
    padding: 0 10px;
    cursor: pointer;
    border-left: 2px solid transparent;
    font-size: var(--hg-font-xs);
  }
  .srow:hover { background: var(--vscode-list-hoverBackground); }
  .srow.selected {
    background: var(--vscode-list-activeSelectionBackground);
    border-left-color: var(--vscode-list-focusOutline, var(--vscode-focusBorder));
  }
  .srow > span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-right: 8px;
  }
  .c-ver.mono { font-family: var(--hg-editor-font-family); color: var(--vscode-textLink-foreground); }
  .srow .c-date { color: var(--vscode-disabledForeground); }
  .srow .c-author { color: var(--vscode-descriptionForeground); }
  .srow .c-msg { color: var(--vscode-foreground); padding-right: 0; }
  /* Legible on the theme's selection background. */
  .srow.selected > span { color: var(--vscode-list-activeSelectionForeground); }

  .hist-footer {
    flex-shrink: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 10px;
    border-top: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    background: var(--vscode-sideBarSectionHeader-background, #222);
  }
  .f-label {
    flex-shrink: 0;
    font-size: var(--hg-font-xxs);
    color: var(--vscode-disabledForeground, #777);
  }
  .f-msg {
    flex: 1;
    font-size: var(--hg-font-xs);
    color: var(--vscode-foreground, #bbb);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
