<script lang="ts">
  // Branch context menu
  export let branchMenu: {
    visible: boolean;
    x: number;
    y: number;
    branch: string;
    isCurrent: boolean;
    current: string;
  } = {
    visible: false,
    x: 0,
    y: 0,
    branch: '',
    isCurrent: false,
    current: '',
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
    <div class="ci" on:click={() => onBranchAction('checkout')}>Checkout</div>
    <div class="ci" on:click={() => onBranchAction('new-from')}>
      New Branch from '{branchMenu.branch}'…
    </div>
    <div class="ci" on:click={() => onBranchAction('checkout-rebase')}>
      Checkout and Rebase onto '{branchMenu.current}'
    </div>
    <div class="ctx-sep"></div>
    <div class="ci">Compare with '{branchMenu.current}'</div>
    <div class="ci">Show Diff with Working Tree</div>
    <div class="ctx-sep"></div>
    <div class="ci" on:click={() => onBranchAction('rebase')}>
      Rebase '{branchMenu.current}' onto '{branchMenu.branch}'
    </div>
    <div class="ci" on:click={() => onBranchAction('merge')}>
      Merge '{branchMenu.branch}' into '{branchMenu.current}'
    </div>
    <div class="ctx-sep"></div>
    <div class="ci" on:click={() => onBranchAction('pull-rebase')}>
      Pull into '{branchMenu.current}' Using Rebase
    </div>
    <div class="ci" on:click={() => onBranchAction('pull-merge')}>
      Pull into '{branchMenu.current}' Using Merge
    </div>
    <div class="ctx-sep"></div>
    <div
      class="ci"
      class:disabled={branchMenu.isCurrent}
      on:click={() => onBranchAction('delete')}
    >
      Delete
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
    min-width: 280px;
    padding: 4px 0;
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
