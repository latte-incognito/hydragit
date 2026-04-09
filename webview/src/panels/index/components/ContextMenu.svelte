<script lang="ts">
  // Branch context menu
  export let branchMenu: {
    visible: boolean;
    x: number;
    y: number;
    branch: string;
    isCurrent: boolean;
  } = {
    visible: false,
    x: 0,
    y: 0,
    branch: '',
    isCurrent: false,
  };
  // Stash context menu
  export let stashMenu: { visible: boolean; x: number; y: number; label: string } = {
    visible: false,
    x: 0,
    y: 0,
    label: '',
  };

  // Tag context menu
  export let tagMenu: { visible: boolean; x: number; y: number; name: string } = {
    visible: false,
    x: 0,
    y: 0,
    name: '',
  };

  export let onBranchAction: (a: string) => void = () => {};
  export let onStashAction: (a: string) => void = () => {};
  export let onTagAction: (a: string) => void = () => {};
</script>

<!-- Branch context menu -->
{#if branchMenu.visible}
  <div class="ctx show" style="left:{branchMenu.x}px;top:{branchMenu.y}px">
    <div class="ctx-lbl">{branchMenu.branch}</div>
    <div class="ctx-sep"></div>
    <div class="ci" on:click={() => onBranchAction('checkout')}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
        ><circle cx="6" cy="6" r="2.2" stroke="#56c8e8" stroke-width="1.1" /><path
          d="M6 1v2M6 9v2M1 6h2M9 6h2"
          stroke="#56c8e8"
          stroke-width="1"
          stroke-linecap="round"
        /></svg
      >
      Checkout
    </div>
    <div class="ci" on:click={() => onBranchAction('new-from')}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
        ><circle cx="3" cy="9" r="1.4" stroke="#4ec94e" stroke-width="1" /><circle
          cx="9"
          cy="3"
          r="1.4"
          stroke="#4ec94e"
          stroke-width="1"
        /><path
          d="M3 7.6V5a3 3 0 013-3h1.6"
          stroke="#4ec94e"
          stroke-width="1"
          stroke-linecap="round"
        /></svg
      >
      New branch from here…
    </div>
    <div class="ci" on:click={() => onBranchAction('merge')}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
        ><circle cx="3" cy="3" r="1.4" stroke="#888" stroke-width="1" /><circle
          cx="3"
          cy="9"
          r="1.4"
          stroke="#888"
          stroke-width="1"
        /><circle cx="9" cy="6" r="1.4" stroke="#888" stroke-width="1" /><line
          x1="3"
          y1="4.4"
          x2="3"
          y2="7.6"
          stroke="#888"
          stroke-width="1"
        /><line x1="4.4" y1="3.5" x2="7.6" y2="5.5" stroke="#888" stroke-width="1" /></svg
      >
      Merge into current
    </div>
    <div class="ci" on:click={() => onBranchAction('rebase')}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
        ><line x1="6" y1="10" x2="6" y2="2" stroke="#888" stroke-width="1.1" /><polyline
          points="3,5 6,2 9,5"
          stroke="#888"
          stroke-width="1.1"
          fill="none"
        /></svg
      >
      Rebase onto current
    </div>
    <div class="ctx-sep"></div>
    <div class="ci" on:click={() => onBranchAction('rename')}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
        ><path d="M2 9.5l5.5-5.5 2 2L4 11H2V9.5z" stroke="#888" stroke-width="1" fill="none" /></svg
      >
      Rename…
    </div>
    <div class="ci" on:click={() => onBranchAction('push')}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
        ><line x1="6" y1="8" x2="6" y2="2" stroke="#888" stroke-width="1.1" /><polyline
          points="3,5 6,2 9,5"
          stroke="#888"
          stroke-width="1.1"
          fill="none"
        /><line x1="2" y1="10.5" x2="10" y2="10.5" stroke="#888" stroke-width="1.1" /></svg
      >
      Push to remote
    </div>
    <div class="ci" on:click={() => onBranchAction('copy')}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
        ><rect x="4" y="1.5" width="6.5" height="7.5" rx="1" stroke="#888" stroke-width="1" /><rect
          x="1.5"
          y="3"
          width="6.5"
          height="7.5"
          rx="1"
          stroke="#888"
          stroke-width="1"
        /></svg
      >
      Copy name
    </div>
    <div class="ctx-sep"></div>
    <div
      class="ci danger"
      class:disabled={branchMenu.isCurrent}
      on:click={() => onBranchAction('delete')}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
        ><path
          d="M2 3.5h8M4.5 3.5V2.5h3v1M4 3.5v6h4v-6"
          stroke="#f07070"
          stroke-width="1"
          stroke-linecap="round"
        /></svg
      >
      Delete branch
    </div>
  </div>
{/if}

<!-- Stash context menu -->
{#if stashMenu.visible}
  <div class="ctx show" style="left:{stashMenu.x}px;top:{stashMenu.y}px">
    <div class="ctx-lbl">{stashMenu.label}</div>
    <div class="ctx-sep"></div>
    <div class="ci" on:click={() => onStashAction('pop')}>Pop</div>
    <div class="ci" on:click={() => onStashAction('apply')}>Apply</div>
    <div class="ci" on:click={() => onStashAction('show')}>Show diff</div>
    <div class="ctx-sep"></div>
    <div class="ci danger" on:click={() => onStashAction('drop')}>Drop</div>
  </div>
{/if}

<!-- Tag context menu -->
{#if tagMenu.visible}
  <div class="ctx show" style="left:{tagMenu.x}px;top:{tagMenu.y}px">
    <div class="ctx-lbl">{tagMenu.name}</div>
    <div class="ctx-sep"></div>
    <div class="ci" on:click={() => onTagAction('checkout')}>Checkout</div>
    <div class="ci" on:click={() => onTagAction('new-branch')}>New branch from tag</div>
    <div class="ctx-sep"></div>
    <div class="ci" on:click={() => onTagAction('copy-hash')}>Copy hash</div>
  </div>
{/if}

<style>
  .ctx {
    position: fixed;
    background: var(--vscode-menu-background, #252526);
    border: 0.5px solid var(--vscode-menu-border, #3a3a3a);
    border-radius: 5px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6);
    z-index: 999;
    min-width: 168px;
    padding: 3px 0;
  }
  .ctx-lbl {
    padding: 5px 14px 3px;
    font-size: var(--hg-font-xxs);
    color: var(--vscode-menu-separatorBackground, #444);
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }
  .ctx-sep {
    height: 0.5px;
    background: var(--vscode-menu-separatorBackground, #333);
    margin: 3px 0;
  }
  .ci {
    padding: 5px 14px;
    font-size: var(--hg-font-sm);
    color: var(--vscode-menu-foreground, #bbb);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 7px;
    white-space: nowrap;
  }
  .ci:hover {
    background: var(--vscode-menu-selectionBackground, #0e2535);
    color: var(--vscode-menu-selectionForeground, #eee);
  }
  .ci.danger {
    color: #f07070;
  }
  .ci.danger:hover {
    background: #2e0d0d;
  }
  .ci.disabled {
    color: var(--vscode-disabledForeground, #444);
    cursor: default;
    pointer-events: none;
  }
</style>
