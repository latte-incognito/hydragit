<script lang="ts">
  // Multi-repo: the active repo name + a click handler that opens the picker.
  
  interface Props {
    branch?: string;
    countsText?: string;
    iconUri?: string;
    // When repo is empty (single-repo workspace) the segment is hidden.
    repo?: string;
    onRepoClick?: () => void;
    // On a branch with no upstream: show a "Publish" pill that pushes + sets upstream.
    noUpstream?: boolean;
    onPublish?: () => void;
    // Ahead/behind drive contextual Push / Pull / Sync pills (same handlers as
    // the action rail). Sync shows only when diverged (ahead AND behind).
    ahead?: number;
    behind?: number;
    onPush?: () => void;
    onPull?: () => void;
    onSync?: () => void;
  }

  let {
    branch = 'master',
    countsText = '',
    iconUri = '',
    repo = '',
    onRepoClick = () => {},
    noUpstream = false,
    onPublish = () => {},
    ahead = 0,
    behind = 0,
    onPush = () => {},
    onPull = () => {},
    onSync = () => {}
  }: Props = $props();

  let diverged = $derived(ahead > 0 && behind > 0);
</script>

<div class="statusbar" id="statusbar">
  {#if repo}
    <button class="sb-repo" title="Active repository — click to switch" onclick={onRepoClick}>
      {repo}
    </button>
    <span class="sb-sep" aria-hidden="true">▸</span>
  {/if}
  <span class="sb-branch">{branch}</span>
  {#if noUpstream}
    <button
      class="sb-pill sb-pill--accent"
      title="This branch has no upstream — click to push and set the upstream"
      onclick={onPublish}
    >
      <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M7 11V3.5M7 3.5L4 6.5M7 3.5l3 3M3 12h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>Publish</span>
    </button>
  {:else}
    {#if behind > 0}
      <button class="sb-pill" title="{behind} commit{behind === 1 ? '' : 's'} to pull — click to pull" onclick={onPull}>
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M7 3v7.5M7 10.5L4 7.5M7 10.5l3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>{behind}</span>
      </button>
    {/if}
    {#if ahead > 0}
      <button class="sb-pill" title="{ahead} commit{ahead === 1 ? '' : 's'} to push — click to push" onclick={onPush}>
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M7 11V3.5M7 3.5L4 6.5M7 3.5l3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>{ahead}</span>
      </button>
    {/if}
    {#if diverged}
      <button class="sb-pill sb-pill--accent" title="Diverged from upstream — Sync (pull, then push)" onclick={onSync}>
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M3.5 5.5a4 4 0 016.5-1.2M3 3v2.5h2.5M10.5 8.5a4 4 0 01-6.5 1.2M11 11V8.5H8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Sync</span>
      </button>
    {/if}
  {/if}
  <span class="sb-right">{countsText}</span>
</div>

<style>
  /* Colored with the user's actual status-bar theme tokens (ROADMAP §4.4) —
     the bar matches whatever their VS Code status bar looks like and follows
     theme switches live. Dim segments use opacity, not separate colors, so
     they track any theme automatically. Old palette kept as fallbacks. */
  .statusbar {
    min-height: 20px;
    max-height: 40px;
    background: var(--vscode-statusBar-background, #0e4a6a);
    display: flex;
    align-items: center;
    padding: 0 10px;
    font-size: var(--hg-font-xs);
    color: var(--vscode-statusBar-foreground, #7abdd4);
    gap: 8px;
    border-bottom: 0.5px solid var(--vscode-statusBar-border, var(--vscode-panel-border, #0a3a5a));
    flex-shrink: 0;
    overflow: hidden;
  }
  .sb-repo {
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .sb-repo:hover {
    text-decoration: underline;
  }
  .sb-sep {
    opacity: 0.55;
    margin: 0 -2px;
  }
  .sb-branch {
    color: inherit;
    font-weight: 500;
  }
  /* Contextual action pills (Pull / Push / Sync / Publish). Plain pills use a
     subtle wash; accent pills (Sync, Publish) use VS Code's prominent
     status-bar tokens — the same treatment VS Code gives its own "Publish
     Branch" item — so they read as the recommended action without hardcoded
     colors. */
  .sb-pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 7px;
    border: none;
    border-radius: 9px;
    font: inherit;
    font-size: var(--hg-font-xxs);
    cursor: pointer;
    background: var(--vscode-statusBarItem-hoverBackground, rgba(255,255,255,0.1));
    color: inherit;
    flex-shrink: 0;
  }
  .sb-pill:hover {
    background: var(--vscode-statusBarItem-prominentHoverBackground, rgba(255,255,255,0.22));
  }
  .sb-pill--accent {
    background: var(--vscode-statusBarItem-prominentBackground, rgba(255,255,255,0.18));
    color: var(--vscode-statusBarItem-prominentForeground, inherit);
  }
  .sb-pill--accent:hover {
    background: var(--vscode-statusBarItem-prominentHoverBackground, rgba(255,255,255,0.3));
  }
  .sb-pill svg { flex-shrink: 0; }
  .sb-right {
    margin-left: auto;
    opacity: 0.55;
  }
</style>
