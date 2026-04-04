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

  <!-- Group 1: remote ops -->
  <button class="rail-btn" on:click={() => onAction('fetch')}
          on:mouseenter={(e) => showTip(e, 'Fetch')} on:mouseleave={hideTip}>
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
      <path d="M7 2v7M4 6l3 3 3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M2 12h10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>
  </button>

  <button class="rail-btn" class:pending={hasPending} on:click={() => onAction('pull')}
          on:mouseenter={(e) => showTip(e, 'Pull')} on:mouseleave={hideTip}>
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
      <path d="M7 9V2M4 6l3 3 3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M2 12h10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>
  </button>

  <button class="rail-btn" on:click={() => onAction('push')}
          on:mouseenter={(e) => showTip(e, 'Push')} on:mouseleave={hideTip}>
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
      <path d="M7 9V2M4 5l3-3 3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M2 12h10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>
  </button>

  <div class="rail-sep"></div>

  <!-- Group 2: branch ops -->
  <button class="rail-btn" on:click={() => onAction('branch.new')}
          on:mouseenter={(e) => showTip(e, 'New branch')} on:mouseleave={hideTip}>
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
      <circle cx="4" cy="3" r="1.7" stroke="currentColor" stroke-width="1.2"/>
      <circle cx="4" cy="11" r="1.7" stroke="currentColor" stroke-width="1.2"/>
      <circle cx="10" cy="3" r="1.7" stroke="currentColor" stroke-width="1.2"/>
      <path d="M4 4.7v4.6M4 9.3c0 1.2.9 1.7 3 1.7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M9.5 1v4M7.5 3h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>
  </button>

  <button class="rail-btn" on:click={() => onAction('merge')}
          on:mouseenter={(e) => showTip(e, 'Merge branch')} on:mouseleave={hideTip}>
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
      <circle cx="4" cy="3" r="1.7" stroke="currentColor" stroke-width="1.2"/>
      <circle cx="4" cy="11" r="1.7" stroke="currentColor" stroke-width="1.2"/>
      <circle cx="10" cy="3" r="1.7" stroke="currentColor" stroke-width="1.2"/>
      <path d="M4 4.7v4.6M10 4.7C10 7.5 7 9 4 9.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>
  </button>

  <button class="rail-btn" on:click={() => onAction('rebase')}
          on:mouseenter={(e) => showTip(e, 'Rebase')} on:mouseleave={hideTip}>
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
      <path d="M4 2v10M4 8l4-4M8 4h2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>

  <button class="rail-btn danger" on:click={() => onAction('branch.delete')}
          on:mouseenter={(e) => showTip(e, 'Delete branch')} on:mouseleave={hideTip}>
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
      <path d="M3 3h8M5 3V2h4v1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5.5 6v4M8.5 6v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M4 3l.7 8h4.6L10 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>

  <div class="rail-sep"></div>

  <!-- Group 3: stash / tag -->
  <button class="rail-btn" on:click={() => onAction('stash.save')}
          on:mouseenter={(e) => showTip(e, 'Stash changes')} on:mouseleave={hideTip}>
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="5.5" width="10" height="6.5" rx="1" stroke="currentColor" stroke-width="1.2"/>
      <path d="M5 5.5V4.5a2 2 0 014 0v1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>
  </button>

  <button class="rail-btn" on:click={() => onAction('tag')}
          on:mouseenter={(e) => showTip(e, 'Create tag')} on:mouseleave={hideTip}>
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
      <path d="M2 2h5l5 5-5 5-5-5V2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      <circle cx="5" cy="5" r="1" fill="currentColor"/>
    </svg>
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
