<script lang="ts">
  // The "HEAD" undo timeline: git reflog as a flat list, each row offering
  // soft/mixed/hard reset (green → amber → red by destructiveness). Replaces the
  
  interface Props {
    // commit graph while active; clicking a branch (or the back button) exits.
    entries?: { hash: string; selector: string; subject: string; date: string }[];
    activeBranch?: string;
    onReset?: (hash: string, mode: 'soft' | 'mixed' | 'hard') => void;
    onExit?: () => void;
  }

  let {
    entries = [],
    activeBranch = '',
    onReset = () => {},
    onExit = () => {}
  }: Props = $props();

  function rel(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '';
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 45) return 'just now';
    const units: [number, string][] = [
      [60, 'min'], [60, 'hr'], [24, 'day'], [7, 'wk'], [4.345, 'mo'], [12, 'yr'],
    ];
    let v = s / 60;
    let label = 'min';
    for (const [size, name] of units) {
      label = name;
      if (v < size) break;
      v = v / size;
    }
    const n = Math.max(1, Math.round(v));
    return `${n} ${label}${n === 1 ? '' : 's'} ago`;
  }
</script>

<div class="reflog-pane">
  <div class="rl-head">
    <button class="rl-back" onclick={onExit} title="Back to the commit graph">‹ Graph</button>
    <span class="rl-title">HEAD{activeBranch ? ` · ${activeBranch}` : ''}</span>
    <span class="rl-sub">undo timeline — reset to any point</span>
  </div>

  <div class="rl-list">
    {#each entries as e (e.selector)}
      <div class="rl-row">
        <span class="rl-selector">{e.selector}</span>
        <span class="rl-subject" title={e.subject}>{e.subject}</span>
        <span class="rl-hash">{e.hash.slice(0, 7)}</span>
        <span class="rl-date">{rel(e.date)}</span>
        <span class="rl-actions">
          <button class="rl-reset soft"  title="Soft — move HEAD here, keep changes staged"
                  onclick={() => onReset(e.hash, 'soft')}>soft</button>
          <button class="rl-reset mixed" title="Mixed — move HEAD here, keep changes (unstaged)"
                  onclick={() => onReset(e.hash, 'mixed')}>mixed</button>
          <button class="rl-reset hard"  title="Hard — move HEAD here, DISCARD all changes"
                  onclick={() => onReset(e.hash, 'hard')}>hard</button>
        </span>
      </div>
    {/each}
    {#if entries.length === 0}
      <div class="rl-empty">No reflog entries.</div>
    {/if}
  </div>
</div>

<style>
  .reflog-pane {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--vscode-editor-background);
  }
  .rl-head {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 7px 12px;
    border-bottom: 0.5px solid var(--vscode-panel-border, #333);
    flex-shrink: 0;
  }
  .rl-back {
    background: none;
    border: 0.5px solid var(--vscode-panel-border, #444);
    color: var(--vscode-foreground, #ccc);
    border-radius: 4px;
    padding: 1px 8px;
    cursor: pointer;
    font-size: var(--hg-font-xs);
  }
  .rl-back:hover { background: var(--vscode-toolbar-hoverBackground, #2a2d2e); }
  .rl-title { font-size: var(--hg-font-md); color: var(--vscode-foreground, #ddd); }
  .rl-sub { font-size: var(--hg-font-xs); color: var(--vscode-descriptionForeground, #888); }

  .rl-list { overflow-y: auto; flex: 1; }
  .rl-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 12px;
    font-size: var(--hg-font-sm);
    border-bottom: 0.5px solid var(--vscode-panel-border, #262626);
  }
  .rl-row:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }
  .rl-selector {
    font-family: var(--hg-font-mono, monospace);
    color: var(--vscode-descriptionForeground, #888);
    flex-shrink: 0;
    min-width: 78px;
  }
  .rl-subject {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--vscode-foreground, #ccc);
  }
  .rl-hash {
    font-family: var(--hg-font-mono, monospace);
    color: var(--hg-warn);
    flex-shrink: 0;
  }
  .rl-date {
    color: var(--vscode-descriptionForeground, #888);
    flex-shrink: 0;
    min-width: 64px;
    text-align: right;
  }
  .rl-actions { display: flex; gap: 4px; flex-shrink: 0; }
  .rl-reset {
    border: none;
    border-radius: 3px;
    padding: 1px 8px;
    font-size: var(--hg-font-xxs);
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  /* Traffic-light by destructiveness, themed via VS Code vars with fallbacks. */
  .rl-reset.soft  { background: var(--vscode-testing-iconPassed, #3f9a4a); color: #fff; }
  .rl-reset.mixed { background: var(--vscode-statusBarItem-warningBackground, #c9991f); color: #1a1a1a; }
  .rl-reset.hard  { background: var(--vscode-statusBarItem-errorBackground, #8b1a1a); color: #fff; }
  .rl-reset:hover { filter: brightness(1.12); }

  .rl-empty {
    padding: 16px;
    color: var(--vscode-descriptionForeground, #888);
    font-size: var(--hg-font-sm);
  }
</style>
