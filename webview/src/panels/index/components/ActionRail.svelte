<script lang="ts">
  export let hasPending: boolean = false;   // true → Pull icon highlighted
  export let onAction: (a: string) => void = () => {};

  // ── Tooltip ───────────────────────────────────────────────────────────────
  let tipText = '';
  let tipX = 0, tipY = 0;
  let tipVisible = false;
  let tipTimer: ReturnType<typeof setTimeout>;

  function showTip(e: MouseEvent, text: string) {
    clearTimeout(tipTimer);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tipText = text;
    tipX = r.right + 6;
    tipY = r.top + r.height / 2;
    tipTimer = setTimeout(() => { tipVisible = true; }, 350);
  }
  function hideTip() { clearTimeout(tipTimer); tipVisible = false; }
</script>

{#if tipVisible}
  <div class="hg-tooltip" style="left:{tipX}px;top:{tipY}px">{tipText}</div>
{/if}

<div class="rail">

  <!-- Sync — the primary "bring me up to date" action (fetch + integrate). -->
  <button class="rail-btn primary" aria-label="Sync" on:click={() => onAction('sync')}
          on:mouseenter={(e) => showTip(e, 'Sync (fetch + pull)')} on:mouseleave={hideTip}>
    <i class="codicon codicon-sync"></i>
  </button>

  <div class="rail-sep"></div>

  <!-- Checkout — the most frequent action, kept prominent near the top. Opens a
       searchable branch picker (the IntelliJ "Branches" popup equivalent). -->
  <button class="rail-btn" aria-label="Checkout" on:click={() => onAction('branch.switch')}
          on:mouseenter={(e) => showTip(e, 'Checkout')} on:mouseleave={hideTip}>
    <i class="codicon codicon-arrow-swap"></i>
  </button>

  <!-- Group 1: granular remote ops -->
  <button class="rail-btn" aria-label="Fetch" on:click={() => onAction('fetch')}
          on:mouseenter={(e) => showTip(e, 'Fetch')} on:mouseleave={hideTip}>
    <i class="codicon codicon-cloud-download"></i>
  </button>

  <button class="rail-btn" class:pending={hasPending} aria-label="Pull" on:click={() => onAction('pull')}
          on:mouseenter={(e) => showTip(e, 'Pull')} on:mouseleave={hideTip}>
    <i class="codicon codicon-repo-pull"></i>
  </button>

  <button class="rail-btn" aria-label="Push" on:click={() => onAction('push')}
          on:mouseenter={(e) => showTip(e, 'Push')} on:mouseleave={hideTip}>
    <i class="codicon codicon-repo-push"></i>
  </button>

  <div class="rail-sep"></div>

  <!-- Group 2: branch ops -->
  <button class="rail-btn" aria-label="New branch" on:click={() => onAction('branch.new')}
          on:mouseenter={(e) => showTip(e, 'New branch')} on:mouseleave={hideTip}>
    <i class="codicon codicon-git-branch"></i>
  </button>

  <button class="rail-btn" aria-label="Merge branch" on:click={() => onAction('merge')}
          on:mouseenter={(e) => showTip(e, 'Merge branch')} on:mouseleave={hideTip}>
    <i class="codicon codicon-git-merge"></i>
  </button>

  <button class="rail-btn" aria-label="Rebase" on:click={() => onAction('rebase')}
          on:mouseenter={(e) => showTip(e, 'Rebase')} on:mouseleave={hideTip}>
    <i class="codicon codicon-fold"></i>
  </button>

  <button class="rail-btn danger" aria-label="Delete branch" on:click={() => onAction('branch.delete')}
          on:mouseenter={(e) => showTip(e, 'Delete branch')} on:mouseleave={hideTip}>
    <i class="codicon codicon-trash"></i>
  </button>

  <div class="rail-sep"></div>

  <!-- Group 3: stash / tag -->
  <button class="rail-btn" aria-label="Stash changes" on:click={() => onAction('stash.save')}
          on:mouseenter={(e) => showTip(e, 'Stash changes')} on:mouseleave={hideTip}>
    <i class="codicon codicon-git-stash"></i>
  </button>

  <button class="rail-btn" aria-label="Create tag" on:click={() => onAction('tag')}
          on:mouseenter={(e) => showTip(e, 'Create tag')} on:mouseleave={hideTip}>
    <i class="codicon codicon-tag"></i>
  </button>

</div>

<style>
  .rail {
    width: 32px;
    background: var(--vscode-sideBar-background, #252526);
    border-right: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 5px 0;
    gap: 1px;
    flex-shrink: 0;
    height: 100%;
  }

  .rail-btn {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
    color: var(--vscode-disabledForeground, #555);
    border: none;
    background: none;
    transition: color 0.1s, background 0.1s;
    flex-shrink: 0;
  }
  .rail-btn:hover {
    background: var(--vscode-list-hoverBackground, #2a2d2e);
    color: var(--vscode-foreground, #ccc);
  }
  .rail-btn.danger {
    color: var(--vscode-errorForeground, #f07070);
    opacity: 0.5;
  }
  .rail-btn.danger:hover {
    background: rgba(240, 112, 112, 0.1);
    color: var(--vscode-errorForeground, #f07070);
    opacity: 1;
  }
  .rail-btn.pending {
    color: #56c8e8;
  }
  .rail-btn.pending:hover {
    background: rgba(86,200,232,0.1);
  }
  /* Sync is the primary action — accented so it reads above the granular ops. */
  .rail-btn.primary {
    color: var(--vscode-textLink-foreground, #4daafc);
  }
  .rail-btn.primary:hover {
    background: rgba(77, 170, 252, 0.12);
    color: var(--vscode-textLink-activeForeground, #6cb6ff);
  }
  .rail-btn .codicon {
    font-size: 16px;
    line-height: 1;
  }

  .rail-sep {
    width: 18px;
    height: 0.5px;
    background: var(--vscode-panel-border, #2a2a2a);
    margin: 3px 0;
    flex-shrink: 0;
  }

  /* ── Tooltip — right side of rail ── */
  .hg-tooltip {
    position: fixed;
    transform: translate(0, -50%);
    background: var(--vscode-editorHoverWidget-background, #252526);
    border: 0.5px solid var(--vscode-editorHoverWidget-border, #454545);
    color: var(--vscode-editorHoverWidget-foreground, #ccc);
    font-size: var(--hg-font-xxs);
    font-family: var(--hg-font-family);
    white-space: nowrap;
    padding: 3px 7px;
    border-radius: 3px;
    pointer-events: none;
    z-index: 200;
  }
</style>
