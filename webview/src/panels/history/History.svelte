<script lang="ts">
  import { onMount } from 'svelte';
  import { send, on } from '$shared/messageBus';
  import vscode from '$shared/vscode';
  import type { Commit, HistoryInit } from './types';

  let mode: 'file' | 'selection' = 'file';
  let file = '';
  let start = 0;
  let end = 0;

  let commits: Commit[] = [];
  let selectedIdx: number | null = null;
  let loading = false;
  let error = '';

  $: fileName = file.split('/').pop() ?? file;
  $: selected = selectedIdx !== null ? commits[selectedIdx] : null;

  async function load() {
    loading = true;
    error = '';
    selectedIdx = null;
    try {
      const result =
        mode === 'selection'
          ? await send<Commit[]>('log.lines', { path: file, start, end })
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
    send('openDiff', {
      commit: c.hash,
      parent: (c.parents ?? [])[0] ?? '',
      file,
    });
  }

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

  // ref → display label + class. Mirrors the main panel's pill colors:
  // current branch / HEAD → main (cyan), remotes → remote (green), tags → tag (gold).
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
    // Tell the extension we're mounted and ready for our target.
    vscode.postMessage({ cmd: 'ready' });
    return off;
  });
</script>

<div class="app-root history">
  <header class="hist-header">
    <span class="hist-title">
      {#if mode === 'selection'}
        History for Selection: <strong>{fileName}</strong>
        <span class="hist-range">L{start}–{end}</span>
      {:else}
        History: <strong>{fileName}</strong>
      {/if}
    </span>
    {#if !loading && !error}
      <span class="hist-count">{commits.length} commit{commits.length !== 1 ? 's' : ''}</span>
    {/if}
  </header>

  {#if loading}
    <div class="hist-msg">Loading…</div>
  {:else if error}
    <div class="hist-msg hist-msg--error">{error}</div>
  {:else if commits.length === 0}
    <div class="hist-msg">No history for this {mode === 'selection' ? 'selection' : 'file'}.</div>
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

    {#if mode === 'selection' && selected}
      <footer class="hist-footer">
        <span class="f-label">Commit Message:</span>
        <span class="f-hash">{selected.hash.slice(0, 8)}</span>
        <span class="f-msg">{selected.message ?? selected.msg ?? ''}</span>
      </footer>
    {/if}
  {/if}
</div>

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

  /* ── Header (matches .log-col-hdr) ── */
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
  .hist-range {
    color: #56c8e8;
    margin-left: 4px;
  }
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

  .hist-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
  }

  /* ── Commit row (matches .crow) ── */
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
  .row:hover { background: var(--vscode-list-hoverBackground, #2a2a2a); }
  .row.selected { background: #0e2030; border-left-color: #56c8e8; }

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

  /* ── Pills (matches main panel .pill colors) ── */
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
  .pill-main   { background: #0a3050; color: #56c8e8; border: 0.5px solid #1a5a7a; }
  .pill-remote { background: #0a200a; color: #4e8c4e; border: 0.5px solid #1a4a1a; }
  .pill-tag    { background: #1a1200; color: #c8a020; border: 0.5px solid #5a4000; }

  /* ── Selection-mode footer ── */
  .hist-footer {
    flex-shrink: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 8px 12px;
    border-top: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    background: var(--vscode-sideBarSectionHeader-background, #222);
  }
  .f-label {
    flex-shrink: 0;
    font-size: var(--hg-font-xxs);
    color: var(--vscode-disabledForeground, #3a3a3a);
  }
  .f-hash {
    flex-shrink: 0;
    color: #56c8e8;
    font-family: var(--hg-editor-font-family);
    font-size: var(--hg-editor-font-size);
  }
  .f-msg {
    flex: 1;
    font-size: var(--hg-font-sm);
    color: var(--vscode-foreground, #bbb);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
