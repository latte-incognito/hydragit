<script lang="ts">
  interface Props {
    hasPending?: boolean; // true → Pull icon highlighted
    onAction?: (a: string) => void;
  }

  let { hasPending = false, onAction = () => {} }: Props = $props();

  // ── Tooltip ───────────────────────────────────────────────────────────────
  let tipText = $state('');
  let tipX = $state(0), tipY = $state(0);
  let tipVisible = $state(false);
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

  <!-- Sync — the primary "bring me up to date" action: fetch, then integrate the
       current branch (silent ff-pull, or a confirmed rebase/stash/push). -->
  <button class="rail-btn primary" aria-label="Sync" onclick={() => onAction('sync')}
          onmouseenter={(e) => showTip(e, 'Smart Sync (fetch · pull · push)')} onmouseleave={hideTip}>
    <i class="codicon codicon-sync"></i>
  </button>

  <div class="rail-sep"></div>

  <!-- Checkout — the most frequent action, kept prominent near the top. Opens a
       searchable branch picker (the IntelliJ "Branches" popup equivalent). -->
  <button class="rail-btn" aria-label="Checkout" onclick={() => onAction('branch.switch')}
          onmouseenter={(e) => showTip(e, 'Checkout')} onmouseleave={hideTip}>
    <i class="codicon codicon-arrow-swap"></i>
  </button>

  <!-- Group 1: granular remote ops -->
  <button class="rail-btn" aria-label="Fetch" onclick={() => onAction('fetch')}
          onmouseenter={(e) => showTip(e, 'Fetch')} onmouseleave={hideTip}>
    <i class="codicon codicon-cloud-download"></i>
  </button>

  <button class="rail-btn" class:pending={hasPending} aria-label="Pull" onclick={() => onAction('pull')}
          onmouseenter={(e) => showTip(e, 'Pull')} onmouseleave={hideTip}>
    <i class="codicon codicon-repo-pull"></i>
  </button>

  <button class="rail-btn" aria-label="Push" onclick={() => onAction('push')}
          onmouseenter={(e) => showTip(e, 'Push')} onmouseleave={hideTip}>
    <i class="codicon codicon-repo-push"></i>
  </button>

  <div class="rail-sep"></div>

  <!-- Group 2: branch ops -->
  <button class="rail-btn" aria-label="New branch" onclick={() => onAction('branch.new')}
          onmouseenter={(e) => showTip(e, 'New branch')} onmouseleave={hideTip}>
    <i class="codicon codicon-git-branch"></i>
  </button>

  <button class="rail-btn" aria-label="Merge branch" onclick={() => onAction('merge')}
          onmouseenter={(e) => showTip(e, 'Merge branch')} onmouseleave={hideTip}>
    <i class="codicon codicon-git-merge"></i>
  </button>

  <button class="rail-btn" aria-label="Rebase" onclick={() => onAction('rebase')}
          onmouseenter={(e) => showTip(e, 'Rebase')} onmouseleave={hideTip}>
    <i class="codicon codicon-fold"></i>
  </button>

  <button class="rail-btn danger" aria-label="Delete branch" onclick={() => onAction('branch.delete')}
          onmouseenter={(e) => showTip(e, 'Delete branch')} onmouseleave={hideTip}>
    <i class="codicon codicon-trash"></i>
  </button>

  <div class="rail-sep"></div>

  <!-- Group 3: stash / tag -->
  <button class="rail-btn" aria-label="Stash changes" onclick={() => onAction('stash.save')}
          onmouseenter={(e) => showTip(e, 'Stash changes')} onmouseleave={hideTip}>
    <i class="codicon codicon-git-stash"></i>
  </button>

  <button class="rail-btn" aria-label="Create tag" onclick={() => onAction('tag')}
          onmouseenter={(e) => showTip(e, 'Create tag')} onmouseleave={hideTip}>
    <i class="codicon codicon-tag"></i>
  </button>

  <!-- New worktree — a parallel checkout of a branch in its own folder, opened
       in a new window. Purple-accented to stand apart from the git ops above. -->
  <button class="rail-btn worktree" aria-label="New worktree" onclick={() => onAction('worktree.new')}
          onmouseenter={(e) => showTip(e, 'New worktree')} onmouseleave={hideTip}>
    <i class="codicon codicon-multiple-windows"></i>
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
    min-height: 0;
    /* Scroll only when the buttons don't fit a short viewport. No visible
       scrollbar at all — on a 32px icon strip even a 2px bar is noise, and
       hiding it is immune to VS Code's injected scrollbar styles (the
       "widens on hover" bug). Wheel/trackpad scrolling still works. */
    overflow-y: auto;
    scrollbar-width: none;
  }
  .rail::-webkit-scrollbar {
    display: none;
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
  /* Worktree — purple accent, matching the active-stash highlight elsewhere. */
  .rail-btn.worktree {
    color: #9a7ae8;
    opacity: 0.75;
  }
  .rail-btn.worktree:hover {
    background: rgba(154, 122, 232, 0.12);
    color: #b29bef;
    opacity: 1;
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
