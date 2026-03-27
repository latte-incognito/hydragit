<script lang="ts">
  export let branch:     string = '—'
  export let statusMsg:  string = ''
  export let statusColor: string = ''
</script>

<div class="status-bar">
  <span class="status-branch">
    <!-- Git branch icon -->
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true" style="flex-shrink:0">
      <circle cx="3"   cy="2.5" r="1.5" stroke="currentColor" stroke-width="1"/>
      <circle cx="3"   cy="8.5" r="1.5" stroke="currentColor" stroke-width="1"/>
      <circle cx="8.5" cy="5.5" r="1.5" stroke="currentColor" stroke-width="1"/>
      <line x1="3"   y1="4"   x2="3"   y2="7"   stroke="currentColor" stroke-width="1"/>
      <line x1="4.3" y1="3.2" x2="7.2" y2="4.8" stroke="currentColor" stroke-width="1"/>
    </svg>
    <span>{branch}</span>
  </span>

  {#if statusMsg}
    <span class="status-msg" style:color={statusColor || undefined}>{statusMsg}</span>
  {/if}
</div>

<style>
  .status-bar {
    flex-shrink: 0;
    height:      18px;
    background:  var(--vscode-statusBar-background, #007acc);
    color:       var(--vscode-statusBar-foreground, #ffffff);
    font-size:   var(--hg-font-xxs);
    display:     flex;
    align-items: center;
    padding:     0 8px;
    gap:         8px;
    overflow:    hidden;
  }

  .status-branch {
    font-weight: 500;
    display:     flex;
    align-items: center;
    gap:         4px;
  }

  .status-msg {
    margin-left:   auto;
    opacity:       0.8;
    overflow:      hidden;
    text-overflow: ellipsis;
    white-space:   nowrap;
  }
</style>
