<script lang="ts">
  // Interactive-rebase editor (GitLens/IntelliJ style): drag to reorder, pick an
  // action per commit, then Start. Commits arrive oldest-first (git todo order).
  interface Props {
    commits?: { sha: string; subject: string }[];
    onStart?: (items: { sha: string; action: string }[]) => void;
    onCancel?: () => void;
  }

  let { commits = [], onStart = () => {}, onCancel = () => {} }: Props = $props();

  const ACTIONS = ['pick', 'squash', 'fixup', 'drop'] as const;

  // Working copy the user edits — never mutate the incoming prop.
  let rows = $state(commits.map((c) => ({ ...c, action: 'pick' as string })));

  let dragIndex: number | null = null;

  function onDragStart(i: number) {
    dragIndex = i;
  }
  function onDrop(i: number) {
    if (dragIndex === null || dragIndex === i) {
      dragIndex = null;
      return;
    }
    const next = rows.slice();
    const [moved] = next.splice(dragIndex, 1);
    next.splice(i, 0, moved);
    rows = next;
    dragIndex = null;
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    [next[i], next[j]] = [next[j], next[i]];
    rows = next;
  }

  // The first kept (non-drop) commit must be a pick — squash/fixup need a commit
  // above them to fold into.
  let firstKept = $derived(rows.find((r) => r.action !== 'drop'));
  let invalid = $derived(firstKept ? firstKept.action !== 'pick' : true);

  function start() {
    if (invalid) return;
    onStart(rows.map((r) => ({ sha: r.sha, action: r.action })));
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="ir-overlay" onclick={onCancel}></div>
<div class="ir-modal" role="dialog" aria-label="Interactive rebase">
  <div class="ir-head">
    <span class="ir-title">Interactive Rebase</span>
    <span class="ir-sub">{rows.length} commits · drag to reorder</span>
  </div>

  <div class="ir-list">
    {#each rows as row, i (row.sha)}
      <div
        class="ir-row"
        class:dropping={row.action === 'drop'}
        draggable={true}
        ondragstart={() => onDragStart(i)}
        ondragover={(e) => e.preventDefault()}
        ondrop={(e) => { e.preventDefault(); onDrop(i); }}
      >
        <span class="ir-grip" title="Drag to reorder">⋮⋮</span>
        <select class="ir-action" bind:value={row.action} aria-label="Action for {row.sha.slice(0, 7)}">
          {#each ACTIONS as a}
            <option value={a}>{a}</option>
          {/each}
        </select>
        <span class="ir-sha">{row.sha.slice(0, 7)}</span>
        <span class="ir-subject" title={row.subject}>{row.subject}</span>
        <span class="ir-moves">
          <button class="ir-move" disabled={i === 0} onclick={() => move(i, -1)} aria-label="Move up">↑</button>
          <button class="ir-move" disabled={i === rows.length - 1} onclick={() => move(i, 1)} aria-label="Move down">↓</button>
        </span>
      </div>
    {/each}
  </div>

  {#if invalid}
    <div class="ir-warn">The first kept commit must be “pick” (squash/fixup fold into the commit above).</div>
  {/if}

  <div class="ir-actions">
    <button class="ir-btn" onclick={onCancel}>Cancel</button>
    <button class="ir-btn ir-btn--primary" disabled={invalid} onclick={start}>Start Rebasing</button>
  </div>
</div>

<style>
  .ir-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 1000;
  }
  .ir-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(620px, 92vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    background: var(--vscode-editorWidget-background, #252526);
    border: 0.5px solid var(--vscode-widget-border, #3a3a3a);
    border-radius: 7px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
    z-index: 1001;
  }
  .ir-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 0.5px solid var(--vscode-widget-border, #333);
  }
  .ir-title { font-size: var(--hg-font-md); color: var(--vscode-foreground, #ddd); }
  .ir-sub { font-size: var(--hg-font-xs); color: var(--vscode-descriptionForeground, #888); }
  .ir-list { overflow-y: auto; padding: 6px 0; }
  .ir-row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 5px 16px;
    font-size: var(--hg-font-sm);
    cursor: grab;
  }
  .ir-row:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }
  .ir-row.dropping { opacity: 0.5; }
  .ir-row.dropping .ir-subject { text-decoration: line-through; }
  .ir-grip { color: #666; cursor: grab; user-select: none; }
  .ir-action {
    background: var(--vscode-dropdown-background, #3c3c3c);
    color: var(--vscode-dropdown-foreground, #ddd);
    border: 0.5px solid var(--vscode-dropdown-border, #555);
    border-radius: 3px;
    padding: 1px 4px;
    font-size: var(--hg-font-xs);
  }
  .ir-sha {
    font-family: var(--hg-font-mono, monospace);
    color: var(--hg-warn);
    flex-shrink: 0;
  }
  .ir-subject {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--vscode-foreground, #ccc);
  }
  .ir-moves { display: flex; gap: 2px; flex-shrink: 0; }
  .ir-move {
    background: none;
    border: none;
    color: #999;
    cursor: pointer;
    padding: 0 3px;
  }
  .ir-move:disabled { opacity: 0.3; cursor: default; }
  .ir-warn {
    margin: 0 16px 8px;
    padding: 5px 9px;
    font-size: var(--hg-font-xs);
    color: var(--hg-warn);
    background: rgba(224, 160, 48, 0.1);
    border-radius: 3px;
  }
  .ir-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 11px 16px;
    border-top: 0.5px solid var(--vscode-widget-border, #333);
  }
  .ir-btn {
    padding: 4px 14px;
    font-size: var(--hg-font-sm);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    color: var(--vscode-button-secondaryForeground, #ddd);
    background: var(--vscode-button-secondaryBackground, #3a3d41);
  }
  .ir-btn--primary {
    color: var(--vscode-button-foreground, #fff);
    background: var(--vscode-button-background, #0e639c);
  }
  .ir-btn--primary:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  .ir-btn:disabled { opacity: 0.5; cursor: default; }
</style>
