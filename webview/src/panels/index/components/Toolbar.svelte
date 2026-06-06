<script lang="ts">
  export let repoName: string = 'HydraGit';
  export let iconUri: string = '';
  export let activeBranch: string = '';
  export let branches: import('../types').Branch[] = [];
  export let hasPending: boolean = false;
  export let allBranches: boolean = false;
  export let searchMode: 'msg' | 'hash' | 'file' | 'author' = 'msg';
  export let searchQuery: string = '';

  export let onAction:       (a: string) => void                    = () => {};
  export let onSearch:       (q: string) => void                    = () => {};
  export let onModeChange:   (m: typeof searchMode) => void         = () => {};
  export let onAllBranches:  (v: boolean) => void                   = () => {};
  export let onSelectBranch: (name: string, remote: boolean) => void = () => {};

  const MODES: { id: typeof searchMode; label: string; hint: string; placeholder: string }[] = [
    { id: 'msg',    label: 'Message', hint: 'msg',    placeholder: 'Search commit messages…'          },
    { id: 'hash',   label: 'Hash',    hint: 'hash',   placeholder: 'Enter hash prefix (e.g. a0c103)…' },
    { id: 'file',   label: 'File',    hint: 'file',   placeholder: 'File name or path…'               },
    { id: 'author', label: 'Author',  hint: 'author', placeholder: 'Author name or email…'            },
  ];

  $: currentMode = MODES.find(m => m.id === searchMode) ?? MODES[0];

  // ── Branch switcher ───────────────────────────────────────────────────────
  let branchOpen   = false;
  let branchFilter = '';
  let branchInputEl: HTMLInputElement;

  $: branchList = branches.filter(b =>
    !branchFilter || b.name.toLowerCase().includes(branchFilter.toLowerCase())
  );

  function openBranchPicker() {
    branchFilter = '';
    branchOpen   = true;
    // focus the input on next tick after it renders
    setTimeout(() => branchInputEl?.focus(), 10);
  }

  function closeBranchPicker() {
    branchOpen   = false;
    branchFilter = '';
  }

  function pickBranch(name: string, isRemote: boolean) {
    closeBranchPicker();
    onSelectBranch(name, isRemote);
  }

  function onBranchKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeBranchPicker();
    if (e.key === 'Enter' && branchList.length > 0) {
      const b = branchList[0];
      pickBranch(b.name, b.isRemote);
    }
  }

  // ── Search input ──────────────────────────────────────────────────────────
  function handleInput(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    searchQuery = v;
    onSearch(v);
  }

  function clearSearch() {
    searchQuery = '';
    onSearch('');
  }

  function setMode(m: typeof searchMode) {
    searchMode  = m;
    searchQuery = '';
    onSearch('');
    onModeChange(m);
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────
  let tipText = '';
  let tipX = 0, tipY = 0;
  let tipVisible = false;
  let tipTimer: ReturnType<typeof setTimeout>;

  function showTip(e: MouseEvent, text: string) {
    clearTimeout(tipTimer);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tipText = text; tipX = r.left + r.width / 2; tipY = r.bottom + 5;
    tipTimer = setTimeout(() => { tipVisible = true; }, 400);
  }
  function hideTip() { clearTimeout(tipTimer); tipVisible = false; }
</script>

<svelte:window on:click={(e) => {
  if (branchOpen && !(e.target as HTMLElement).closest('.branch-picker-wrap')) closeBranchPicker();
}} />

{#if tipVisible}
  <div class="hg-tooltip" style="left:{tipX}px;top:{tipY}px">{tipText}</div>
{/if}

<div class="toolbar">

  <!-- Branch switcher -->
  <div class="branch-picker-wrap">
    <button class="branch-pill" on:click={openBranchPicker} title="Switch branch">
      <span class="branch-name">{activeBranch || repoName}</span>
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" class="branch-chevron">
        <path d="M1 3l3 3 3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    </button>

    {#if branchOpen}
      <div class="branch-dropdown">
        <div class="bd-search">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" class="bd-search-icon">
            <circle cx="5" cy="5" r="3.5" stroke="currentColor" stroke-width="1.2"/>
            <path d="M8 8l2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          <input
            bind:this={branchInputEl}
            class="bd-input"
            placeholder="Filter branches…"
            bind:value={branchFilter}
            on:keydown={onBranchKeydown}
          />
        </div>
        <div class="bd-list">
          {#if branchList.length === 0}
            <div class="bd-empty">No branches match</div>
          {:else}
            {#each branchList as b}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="bd-item"
                class:bd-item--current={b.name === activeBranch}
                class:bd-item--remote={b.isRemote}
                on:click={() => pickBranch(b.name, b.isRemote)}
              >
                <span class="bd-icon">{b.isCurrent ? '★' : '⎇'}</span>
                <span class="bd-name">{b.name}</span>
                {#if b.trackShort}
                  <span class="bd-track">{b.trackShort}</span>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <div class="tb-sep"></div>

  <!-- Search bar -->
  <div class="search-wrap" class:mode-msg={searchMode==='msg'} class:mode-hash={searchMode==='hash'}
       class:mode-file={searchMode==='file'} class:mode-author={searchMode==='author'}>
    <div class="mode-tabs">
      {#each MODES as m}
        <button
          class="mtab mtab-{m.id}"
          class:active={searchMode === m.id}
          title={m.label}
          on:click={() => setMode(m.id)}
          on:mouseenter={(e) => showTip(e, 'Search by ' + m.label.toLowerCase())}
          on:mouseleave={hideTip}
        >
          {#if m.id === 'msg'}
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 3h9M2 6.5h6M2 10h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          {:else if m.id === 'hash'}
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M3 2v9M10 2v9M1.5 5h10M1.5 8h10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          {:else if m.id === 'file'}
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M3 1.5h5l2.5 2.5V11.5a1 1 0 01-1 1H3a1 1 0 01-1-1v-9a1 1 0 011-1z" stroke="currentColor" stroke-width="1.2"/>
              <path d="M8 1.5V4H10.5" stroke="currentColor" stroke-width="1.2"/>
            </svg>
          {:else}
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="4.5" r="2.5" stroke="currentColor" stroke-width="1.2"/>
              <path d="M1.5 12c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          {/if}
        </button>
      {/each}
    </div>
    <div class="search-inner">
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" class="search-icon">
        <circle cx="5" cy="5" r="3.5" stroke="currentColor" stroke-width="1.2"/>
        <path d="M8 8l2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
      <input
        type="text"
        placeholder={currentMode.placeholder}
        value={searchQuery}
        on:input={handleInput}
      />
      <span class="mode-hint mode-hint-{searchMode}">{currentMode.hint}</span>
      {#if searchQuery}
        <button class="clear-btn" on:click={clearSearch} tabindex="-1">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- All branches toggle -->
  <button
    class="filter-pill"
    class:active={allBranches}
    on:click={() => { allBranches = !allBranches; onAllBranches(allBranches); }}
    on:mouseenter={(e) => showTip(e, allBranches ? 'Showing all branches' : 'Showing current branch only')}
    on:mouseleave={hideTip}
  >
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1 2h8M2.5 5h5M4 8h2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>
    {allBranches ? 'All branches' : 'This branch'}
  </button>

  <div class="tb-spacer"></div>

  <!-- Undo last operation — express lane: abort an in-progress op, else rewind
       to ORIG_HEAD (the state before the last merge/rebase/reset/pull). -->
  <button
    class="undo-btn"
    on:click={() => onAction('undo')}
    on:mouseenter={(e) => showTip(e, 'Undo last operation')}
    on:mouseleave={hideTip}
  >
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M4 3L1.5 5.5 4 8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M1.5 5.5H8a3.5 3.5 0 010 7H5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>
    Undo
  </button>

</div>

<style>
  .toolbar {
    background: var(--vscode-editorGroupHeader-tabsBackground, #2d2d2d);
    height: 34px;
    display: flex;
    align-items: center;
    padding: 0 8px;
    gap: 5px;
    border-bottom: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    flex-shrink: 0;
    overflow: visible;
    position: relative;
    z-index: 10;
  }

  /* ── Branch switcher ── */
  .branch-picker-wrap {
    position: relative;
    flex-shrink: 0;
  }
  .hg-logo {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    object-fit: contain;
    filter: grayscale(1) brightness(0.7);
    opacity: 0.8;
  }
  .branch-pill {
    display: flex;
    align-items: center;
    gap: 5px;
    background: var(--vscode-input-background, #1a1a1a);
    border: 0.5px solid var(--vscode-widget-border, #3a3a3a);
    border-radius: 4px;
    padding: 3px 8px;
    color: var(--vscode-foreground, #ccc);
    font-size: var(--hg-font-xs);
    font-family: var(--hg-font-family);
    cursor: pointer;
    max-width: 180px;
    transition: border-color 0.12s;
  }
  .branch-pill:hover {
    border-color: var(--vscode-focusBorder, #007fd4);
    color: var(--vscode-foreground, #fff);
  }
  .branch-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }
  .branch-chevron { color: var(--vscode-disabledForeground, #555); flex-shrink: 0; }

  /* Dropdown */
  .branch-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 200;
    background: var(--vscode-menu-background, #252526);
    border: 0.5px solid var(--vscode-menu-border, #3a3a3a);
    border-radius: 4px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    min-width: 220px;
    max-width: 320px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .bd-search {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-bottom: 0.5px solid var(--vscode-panel-border, #2a2a2a);
  }
  .bd-search-icon { color: var(--vscode-disabledForeground, #555); flex-shrink: 0; }
  .bd-input {
    background: none;
    border: none;
    outline: none;
    color: var(--vscode-input-foreground, #ccc);
    font-size: var(--hg-font-xs);
    font-family: var(--hg-font-family);
    flex: 1;
    min-width: 0;
  }
  .bd-input::placeholder { color: var(--vscode-disabledForeground, #444); }
  .bd-list {
    max-height: 240px;
    overflow-y: auto;
    padding: 4px 0;
  }
  .bd-empty {
    padding: 8px 12px;
    font-size: var(--hg-font-xs);
    color: var(--vscode-disabledForeground, #555);
    font-style: italic;
  }
  .bd-item {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    font-size: var(--hg-font-xs);
    font-family: var(--hg-font-family);
    color: var(--vscode-foreground, #ccc);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
  }
  .bd-item:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }
  .bd-item--current {
    color: var(--vscode-foreground, #fff);
    border-left: 2px solid #56c8e8;
    padding-left: 8px;
  }
  .bd-item--remote { color: var(--vscode-descriptionForeground, #888); }
  .bd-icon { font-size: 10px; flex-shrink: 0; width: 14px; text-align: center; }
  .bd-name { flex: 1; overflow: hidden; text-overflow: ellipsis; }
  .bd-track { font-size: var(--hg-font-xxs); color: var(--vscode-disabledForeground, #555); margin-left: auto; flex-shrink: 0; }

  .tb-sep { width: 0.5px; height: 16px; background: var(--vscode-widget-border, #3a3a3a); flex-shrink: 0; }
  .tb-spacer { flex: 1; }

  /* ── Search bar ── */
  .search-wrap {
    flex: 1;
    max-width: 420px;
    display: flex;
    align-items: stretch;
    background: var(--vscode-input-background, #1a1a1a);
    border: 0.5px solid var(--vscode-input-border, #333);
    border-radius: 4px;
    overflow: hidden;
    height: 24px;
    transition: border-color 0.15s;
  }
  .search-wrap.mode-msg    { border-color: #1a4a5a; }
  .search-wrap.mode-hash   { border-color: #4a3a1a; }
  .search-wrap.mode-file   { border-color: #1a3a1a; }
  .search-wrap.mode-author { border-color: #2a1a3a; }

  .mode-tabs { display: flex; border-right: 0.5px solid var(--vscode-panel-border, #2a2a2a); flex-shrink: 0; }
  .mtab {
    width: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--vscode-disabledForeground, #444);
    border: none;
    background: none;
    border-right: 0.5px solid var(--vscode-panel-border, #222);
    transition: color 0.12s, background 0.12s;
    padding: 0;
  }
  .mtab:last-child { border-right: none; }
  .mtab:hover { background: var(--vscode-list-hoverBackground, #2a2a2a); color: var(--vscode-descriptionForeground, #888); }
  .mtab-msg.active    { background: rgba(86,200,232,0.1);  color: #56c8e8; }
  .mtab-hash.active   { background: rgba(224,160,48,0.1);  color: #e0a030; }
  .mtab-file.active   { background: rgba(78,201,78,0.1);   color: #4ec94e; }
  .mtab-author.active { background: rgba(160,122,232,0.1); color: #a07ae8; }

  .search-inner {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 7px;
    min-width: 0;
  }
  .search-icon { color: var(--vscode-disabledForeground, #444); flex-shrink: 0; }
  .search-inner input {
    background: none;
    border: none;
    outline: none;
    color: var(--vscode-input-foreground, #ccc);
    font-size: var(--hg-font-xs);
    font-family: var(--hg-font-family);
    flex: 1;
    min-width: 0;
  }
  .search-inner input::placeholder { color: var(--vscode-disabledForeground, #3a3a3a); }

  .mode-hint {
    font-size: var(--hg-font-xxs);
    padding: 1px 4px;
    border-radius: 2px;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .mode-hint-msg    { color: #3a7a8a; background: rgba(86,200,232,0.08); }
  .mode-hint-hash   { color: #8a6030; background: rgba(224,160,48,0.08); }
  .mode-hint-file   { color: #2a7a3a; background: rgba(78,201,78,0.08);  }
  .mode-hint-author { color: #7a5aaa; background: rgba(160,122,232,0.08);}

  .clear-btn {
    background: none; border: none; padding: 2px; border-radius: 2px;
    cursor: pointer; color: var(--vscode-disabledForeground, #555);
    display: flex; align-items: center; flex-shrink: 0;
  }
  .clear-btn:hover { color: var(--vscode-foreground, #ccc); }

  /* ── All-branches pill ── */
  .filter-pill {
    display: flex; align-items: center; gap: 3px;
    border: 0.5px solid var(--vscode-widget-border, #3a3a3a);
    border-radius: 3px; padding: 2px 7px;
    font-size: var(--hg-font-xxs); font-family: var(--hg-font-family);
    cursor: pointer; white-space: nowrap;
    color: var(--vscode-disabledForeground, #555);
    background: none; transition: all 0.12s;
  }
  .filter-pill:hover { border-color: var(--vscode-focusBorder, #007fd4); color: var(--vscode-foreground, #ccc); }
  .filter-pill.active { background: rgba(86,200,232,0.08); border-color: #1a5a7a; color: #56c8e8; }

  /* ── Undo button ── */
  .undo-btn {
    display: flex; align-items: center; gap: 4px;
    border: 0.5px solid var(--vscode-widget-border, #3a3a3a);
    border-radius: 3px; padding: 2px 8px;
    font-size: var(--hg-font-xxs); font-family: var(--hg-font-family);
    cursor: pointer; white-space: nowrap; flex-shrink: 0;
    color: var(--vscode-disabledForeground, #888);
    background: none; transition: all 0.12s;
  }
  .undo-btn:hover { border-color: #e0a030; color: #e0a030; background: rgba(224,160,48,0.08); }

  /* ── Tooltip ── */
  .hg-tooltip {
    position: fixed;
    transform: translate(-50%, 0);
    background: var(--vscode-editorHoverWidget-background, #252526);
    border: 0.5px solid var(--vscode-editorHoverWidget-border, #454545);
    color: var(--vscode-editorHoverWidget-foreground, #ccc);
    font-size: var(--hg-font-xxs); font-family: var(--hg-font-family);
    white-space: nowrap; padding: 3px 7px; border-radius: 3px;
    pointer-events: none; z-index: 200;
  }
</style>
