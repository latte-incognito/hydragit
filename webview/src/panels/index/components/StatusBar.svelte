<script lang="ts">
  export let branch:      string = 'master'
  export let info:        string = ''
  export let countsText:  string = ''
</script>

<div class="statusbar" id="statusbar">
  <span class="sb-branch">{branch}</span>
  <span class="sb-info">{info}</span>
  <span class="sb-right">{countsText}</span>
</div>

<style>
  .statusbar {
    height: 20px; background: #0e4a6a;
    display: flex; align-items: center;
    padding: 0 10px; font-size: var(--hg-font-xs); color: #7abdd4;
    gap: 8px; border-top: 0.5px solid #0a3a5a; flex-shrink: 0;
  }
  .sb-branch { color: #56c8e8; font-weight: 500; }
  .sb-right  { margin-left: auto; color: #4a7a8a; }
</style>
