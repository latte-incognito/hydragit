<script lang="ts">
  // Multi-repo: the active repo name + a click handler that opens the picker.
  
  interface Props {
    branch?: string;
    info?: string;
    infoTitle?: string; // tooltip with the raw ↑/↓ symbols
    countsText?: string;
    iconUri?: string;
    // When repo is empty (single-repo workspace) the segment is hidden.
    repo?: string;
    onRepoClick?: () => void;
  }

  let {
    branch = 'master',
    info = '',
    infoTitle = '',
    countsText = '',
    iconUri = '',
    repo = '',
    onRepoClick = () => {}
  }: Props = $props();
</script>

<div class="statusbar" id="statusbar">
  <svg class="sb-logo" width="12" height="14" viewBox="0 0 12 16" fill="none">
    <circle cx="2.5" cy="1.8" r="1.5" fill="currentColor"/>
    <circle cx="6"   cy="1.8" r="1.5" fill="currentColor"/>
    <circle cx="9.5" cy="1.8" r="1.5" fill="currentColor"/>
    <circle cx="6"   cy="14.2" r="1.5" fill="currentColor"/>
    <path d="M2.5 3.3C2.5 6.5 6 8 6 8M9.5 3.3C9.5 6.5 6 8 6 8M6 3.3V8M6 8v4.7"
          stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>
  </svg>
  {#if repo}
    <button class="sb-repo" title="Active repository — click to switch" onclick={onRepoClick}>
      {repo}
    </button>
    <span class="sb-sep" aria-hidden="true">▸</span>
  {/if}
  <span class="sb-branch">{branch}</span>
  <span class="sb-info" title={infoTitle}>{info}</span>
  <span class="sb-right">{countsText}</span>
</div>

<style>
  .statusbar {
    min-height: 20px;
    max-height: 40px;
    background: #0e4a6a;
    display: flex;
    align-items: center;
    padding: 0 10px;
    font-size: var(--hg-font-xs);
    color: #7abdd4;
    gap: 8px;
    border-top: 0.5px solid #0a3a5a;
    flex-shrink: 0;
    overflow: hidden;
  }
  .sb-info {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sb-logo {
    flex-shrink: 0;
    color: #7abdd4;
    margin-right: -4px;
  }
  .sb-repo {
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
    color: #9ad4e8;
    font-weight: 600;
    cursor: pointer;
  }
  .sb-repo:hover {
    color: #c4ecf7;
    text-decoration: underline;
  }
  .sb-sep {
    color: #4a7a8a;
    margin: 0 -2px;
  }
  .sb-branch {
    color: #7abdd4;
    font-weight: 500;
  }
  .sb-right {
    margin-left: auto;
    color: #4a7a8a;
  }
</style>
