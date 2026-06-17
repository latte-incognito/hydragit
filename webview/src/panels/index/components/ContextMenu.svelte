<script lang="ts">
  import type { Worktree } from '../types';

  
  

  

  

  interface Props {
    // Branch context menu
    branchMenu?: {
    visible: boolean;
    x: number;
    y: number;
    branch: string;
    isCurrent: boolean;
    current: string;
  };
    // Stash context menu
    stashMenu?: { visible: boolean; x: number; y: number; label: string };
    // Tag context menu
    tagMenu?: { visible: boolean; x: number; y: number; name: string; current: string };
    // Worktree context menu
    worktreeMenu?: { visible: boolean; x: number; y: number; wt: Worktree | null };
    onBranchAction?: (a: string) => void;
    onStashAction?: (a: string) => void;
    onTagAction?: (a: string) => void;
    onWorktreeAction?: (a: string) => void;
  }

  let {
    branchMenu = {
    visible: false,
    x: 0,
    y: 0,
    branch: '',
    isCurrent: false,
    current: '',
  },
    stashMenu = {
    visible: false,
    x: 0,
    y: 0,
    label: '',
  },
    tagMenu = {
    visible: false,
    x: 0,
    y: 0,
    name: '',
    current: '',
  },
    worktreeMenu = {
    visible: false,
    x: 0,
    y: 0,
    wt: null,
  },
    onBranchAction = () => {},
    onStashAction = () => {},
    onTagAction = () => {},
    onWorktreeAction = () => {}
  }: Props = $props();

  function fitMenu(node: HTMLElement) {
    requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      if (rect.right > vw) node.style.left = Math.max(0, vw - rect.width - 4) + 'px';
      if (rect.bottom > vh) node.style.top = Math.max(0, parseFloat(node.style.top) - (rect.bottom - vh) - 4) + 'px';
      const updated = node.getBoundingClientRect();
      if (updated.height > vh - 8) {
        node.style.top = '4px';
        node.style.maxHeight = (vh - 8) + 'px';
        node.style.overflowY = 'auto';
      }
    });
  }
</script>

<!-- Branch context menu -->
{#if branchMenu.visible}
  <div class="ctx show" style="left:{branchMenu.x}px;top:{branchMenu.y}px" use:fitMenu>
    {#if !branchMenu.isCurrent}
      <div class="ci" onclick={() => onBranchAction('checkout')}>Switch to Branch</div>
    {/if}
    <div class="ci" onclick={() => onBranchAction('new-from')}>
      New Branch from '{branchMenu.branch}'…
    </div>
    <div class="ci" onclick={() => onBranchAction('rename')}>
      Rename…
    </div>
    {#if !branchMenu.isCurrent}
      <div class="ci" onclick={() => onBranchAction('checkout-rebase')}>
        Checkout and Rebase onto '{branchMenu.current}'
      </div>
      <div class="ctx-sep"></div>
      <div class="ci" onclick={() => onBranchAction('compare')}>
        Compare with '{branchMenu.current}'
      </div>
    {/if}
    <div class="ci" onclick={() => onBranchAction('diff-working')}>
      Show Diff with Working Tree
    </div>
    {#if !branchMenu.isCurrent}
      <div class="ctx-sep"></div>
      <div class="ci" onclick={() => onBranchAction('rebase')}>
        Rebase '{branchMenu.current}' onto '{branchMenu.branch}'
      </div>
      <div class="ci" onclick={() => onBranchAction('merge')}>
        Merge '{branchMenu.branch}' into '{branchMenu.current}'
      </div>
    {/if}
    <div class="ctx-sep"></div>
    <div class="ci" onclick={() => onBranchAction('pull-rebase')}>
      Pull into '{branchMenu.current}' Using Rebase
    </div>
    <div class="ci" onclick={() => onBranchAction('pull-merge')}>
      Pull into '{branchMenu.current}' Using Merge
    </div>
    {#if !branchMenu.isCurrent}
      <div class="ctx-sep"></div>
      <div class="ci danger" onclick={() => onBranchAction('delete')}>
        Delete
      </div>
    {/if}
  </div>
{/if}

<!-- Stash context menu -->
{#if stashMenu.visible}
  <div class="ctx show" style="left:{stashMenu.x}px;top:{stashMenu.y}px" use:fitMenu>
    <div class="ci" onclick={() => onStashAction('pop')}>Pop</div>
    <div class="ci" onclick={() => onStashAction('apply')}>Apply</div>
    <div class="ci" onclick={() => onStashAction('unstash')}>Unstash…</div>
    <div class="ci danger" onclick={() => onStashAction('drop')}>Drop</div>
    <div class="ci danger" onclick={() => onStashAction('clear')}>Clear</div>
    <div class="ctx-sep"></div>
    <div class="ci" onclick={() => onStashAction('show-diff')}>Show Diff</div>
    <div class="ci" onclick={() => onStashAction('show-diff-tab')}>Show Diff in a New Tab</div>
  </div>
{/if}

<!-- Tag context menu -->
{#if tagMenu.visible}
  <div class="ctx show" style="left:{tagMenu.x}px;top:{tagMenu.y}px">
    <div class="ci" onclick={() => onTagAction('checkout')}>Checkout</div>
    <div class="ctx-sep"></div>
    <div class="ci" onclick={() => onTagAction('diff-working')}>Show Diff with Working Tree</div>
    <div class="ctx-sep"></div>
    <div class="ci" onclick={() => onTagAction('merge')}>
      Merge '{tagMenu.name}' into '{tagMenu.current}'
    </div>
    <div class="ctx-sep"></div>
    <div class="ci" onclick={() => onTagAction('push')}>Push to origin</div>
    <div class="ctx-sep"></div>
    <div class="ci danger" onclick={() => onTagAction('delete')}>Delete</div>
  </div>
{/if}

<!-- Worktree context menu -->
{#if worktreeMenu.visible && worktreeMenu.wt}
  {@const wt = worktreeMenu.wt}
  <div class="ctx show" style="left:{worktreeMenu.x}px;top:{worktreeMenu.y}px" use:fitMenu>
    <div class="ci" class:disabled={wt.isMain} onclick={() => onWorktreeAction('open')}>
      Open in New Window
    </div>
    <div class="ctx-sep"></div>
    {#if wt.locked}
      <div class="ci" onclick={() => onWorktreeAction('unlock')}>Unlock</div>
    {:else}
      <div class="ci" class:disabled={wt.isMain} onclick={() => onWorktreeAction('lock')}>Lock</div>
    {/if}
    <div class="ci" class:disabled={wt.isMain} onclick={() => onWorktreeAction('move')}>Move…</div>
    <div class="ctx-sep"></div>
    <div class="ci" onclick={() => onWorktreeAction('prune')}>Prune Stale Worktrees</div>
    <div class="ctx-sep"></div>
    <div class="ci danger" class:disabled={wt.isMain} onclick={() => onWorktreeAction('remove')}>
      Remove
    </div>
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
    background: rgba(240,112,112,0.15);
  }
  .ci.disabled {
    color: var(--vscode-disabledForeground, #444);
    cursor: default;
    pointer-events: none;
  }
</style>
