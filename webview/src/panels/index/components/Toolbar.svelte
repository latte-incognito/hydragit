<script lang="ts">
  import { slide } from 'svelte/transition';

  interface Props {
    repoName?: string;
    iconUri?: string;
    headUri?: string;
    activeBranch?: string;
    branches?: import('../types').Branch[];
    hasPending?: boolean;
    allBranches?: boolean;
    searchMode?: 'msg' | 'hash' | 'file' | 'author' | 'code';
    searchQuery?: string;
    onAction?: (a: string) => void;
    onSearch?: (q: string) => void;
    onSearchSubmit?: () => void;
    onModeChange?: (m: typeof searchMode) => void;
    onAllBranches?: (v: boolean) => void;
    onSelectBranch?: (name: string, remote: boolean) => void;
    statusOpen?: boolean;
    onToggleStatus?: () => void;
    // Contextual undo: empty = nothing to undo, button hidden.
    // Non-empty = the op it would undo ("merge", "rebase", …).
    undoLabel?: string;
  }

  let {
    repoName = 'HydraGit',
    iconUri = '',
    headUri = '',
    activeBranch = '',
    branches = [],
    hasPending = false,
    allBranches = $bindable(false),
    searchMode = $bindable('msg'),
    searchQuery = $bindable(''),
    onAction = () => {},
    onSearch = () => {},
    onSearchSubmit = () => {},
    onModeChange = () => {},
    onAllBranches = () => {},
    onSelectBranch = () => {},
    statusOpen = false,
    onToggleStatus = () => {},
    undoLabel = ''
  }: Props = $props();

  // ── Search scopes (token search) ──────────────────────────────────────────
  // One input, Slack/Gmail style: focusing it offers the scopes, typing a
  // prefix ("author:") converts it into a removable chip. No mode tabs.
  const SCOPES: { id: typeof searchMode; label: string; prefix: string; example: string; placeholder: string }[] = [
    { id: 'msg',    label: 'Message', prefix: '',        example: '',                placeholder: 'Search commits — or pick a scope…' },
    { id: 'author', label: 'Author',  prefix: 'author:', example: 'author: vlad',    placeholder: 'Author name or email…'            },
    { id: 'file',   label: 'File',    prefix: 'file:',   example: 'file: panel.ts',  placeholder: 'File name or path — Enter to search…' },
    { id: 'hash',   label: 'Hash',    prefix: 'hash:',   example: 'hash: a0c103',    placeholder: 'Hash prefix…'                     },
    { id: 'code',   label: 'Code',    prefix: 'code:',   example: 'code: render(',   placeholder: ''                                 },
  ];

  let currentScope = $derived(SCOPES.find(m => m.id === searchMode) ?? SCOPES[0]);

  // Scope dropdown (shown on focus while unscoped)
  let scopeOpen = $state(false);
  let scopeHi   = $state(-1); // keyboard highlight: index into pickable scopes
  let searchInputEl: HTMLInputElement = $state();
  // Scopes offered by the dropdown (everything except the implicit msg default)
  const pickable = SCOPES.filter(s => s.id !== 'msg');

  // ── Branch switcher ───────────────────────────────────────────────────────
  let branchOpen   = $state(false);
  let branchFilter = $state('');
  let branchInputEl: HTMLInputElement = $state();

  let branchList = $derived(branches.filter(b =>
    !branchFilter || b.name.toLowerCase().includes(branchFilter.toLowerCase())
  ));

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
    allBranches = false; // picking a branch always means "view that branch"
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
    // Prefix → chip conversion: "author:…" becomes the author scope chip and
    // the prefix is stripped from the query. "@" is a Slack-ism for author.
    if (searchMode === 'msg') {
      const m = v.match(/^(author|file|hash|code|msg):\s*/i);
      const scope = m ? (m[1].toLowerCase() as typeof searchMode) : (v.startsWith('@') ? 'author' : null);
      if (scope && scope !== 'msg') {
        const rest = m ? v.slice(m[0].length) : v.slice(1);
        setScope(scope, rest);
        return;
      }
    }
    searchQuery = v;
    scopeOpen = v === '' && searchMode === 'msg';
    scopeHi = -1;
    onSearch(v);
  }

  function clearSearch() {
    searchQuery = '';
    onSearch('');
  }

  // setScope activates a scope chip, optionally keeping already-typed text.
  // Order matters: the host's onModeChange resets its query state, so the
  // mode must change BEFORE the kept text is pushed via onSearch.
  function setScope(m: typeof searchMode, keep = '') {
    searchMode  = m;
    scopeOpen = false;
    scopeHi = -1;
    onModeChange(m);
    searchQuery = keep;
    if (keep) onSearch(keep);
    if (m === 'code') setTimeout(() => codeBoxEl?.focus(), 10);
    else setTimeout(() => searchInputEl?.focus(), 10);
  }

  // removeScope drops the chip back to plain message search.
  function removeScope() {
    searchMode  = 'msg';
    searchQuery = '';
    onModeChange('msg');
    onSearch('');
    setTimeout(() => searchInputEl?.focus(), 10);
  }

  function handleSearchFocus() {
    if (searchMode === 'msg' && !searchQuery) { scopeOpen = true; scopeHi = -1; }
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    // Backspace on an empty input removes the scope chip (Gmail behaviour).
    if (e.key === 'Backspace' && !searchQuery && searchMode !== 'msg') {
      e.preventDefault();
      removeScope();
      return;
    }
    if (!scopeOpen) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); scopeHi = (scopeHi + 1) % pickable.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); scopeHi = scopeHi <= 0 ? pickable.length - 1 : scopeHi - 1; }
    else if (e.key === 'Enter' && scopeHi >= 0) { e.preventDefault(); setScope(pickable[scopeHi].id); }
    else if (e.key === 'Escape') { scopeOpen = false; scopeHi = -1; }
  }

  // ── Code search (pickaxe) ─────────────────────────────────────────────────
  // Code snippets don't fit the one-line toolbar input, and `git log -S` scans
  // every diff in history — too expensive to run per keystroke. Code mode gets
  // an expanded monospace box below the toolbar; search runs only on submit.
  let codeBoxEl: HTMLTextAreaElement = $state();

  let codeLines = $derived(searchQuery ? searchQuery.split('\n').length : 1);
  let codeRows  = $derived(Math.min(6, Math.max(1, codeLines)));
  let codeFirstLine = $derived(
    (searchQuery.split('\n').find(l => l.trim()) ?? '').trim()
  );

  function handleCodeInput(e: Event) {
    searchQuery = (e.target as HTMLTextAreaElement).value;
    // Notify only when cleared, so the host restores the full log; non-empty
    // values wait for an explicit submit.
    if (!searchQuery.trim()) onSearch('');
  }

  function handleCodeKeydown(e: KeyboardEvent) {
    // Only intercept plain Enter. Never stopPropagation on other keys — VS Code
    // forwards webview keybindings (Cmd+V paste!) via a document-level listener,
    // and swallowing keydown here breaks the clipboard inside the webview.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      submitCode();
    }
  }

  function submitCode() {
    if (!searchQuery.trim()) return;
    onSearch(searchQuery);
    onSearchSubmit();
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────
  let tipText = $state('');
  let tipX = $state(0), tipY = $state(0);
  let tipVisible = $state(false);
  let tipTimer: ReturnType<typeof setTimeout>;

  function showTip(e: MouseEvent, text: string) {
    clearTimeout(tipTimer);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tipText = text; tipX = r.left + r.width / 2; tipY = r.bottom + 5;
    tipTimer = setTimeout(() => { tipVisible = true; }, 400);
  }
  function hideTip() { clearTimeout(tipTimer); tipVisible = false; }
</script>

<svelte:window onclick={(e) => {
  if (branchOpen && !(e.target as HTMLElement).closest('.branch-picker-wrap')) closeBranchPicker();
  if (scopeOpen && !(e.target as HTMLElement).closest('.search-wrap')) { scopeOpen = false; scopeHi = -1; }
}} />

{#if tipVisible}
  <div class="hg-tooltip" style="left:{tipX}px;top:{tipY}px">{tipText}</div>
{/if}

<div class="toolbar">

  <!-- Status bar toggle — teal/silver gradient hydra, glow on hover only -->
  <button
    class="status-toggle"
    class:active={statusOpen}
    onclick={onToggleStatus}
    aria-expanded={statusOpen}
    title={statusOpen ? 'Hide repository status' : 'Show repository status'}
  >
    {#if headUri}
      <!-- Hydra Bloom: a single head at rest; on hover the side heads "grow"
           in and it scales up into the full three-head logo — cut one head,
           two grow back. Both imgs are absolute so the bloom floats over the
           toolbar without shifting layout. -->
      <span class="hydra-bloom">
        <img class="hb-head" src={headUri} alt="" draggable="false" />
        <img class="hb-full" src={iconUri} alt="" draggable="false" />
      </span>
    {:else}
      <svg class="st-logo" width="12" height="14" viewBox="0 0 12 16" fill="none">
        <defs>
          <linearGradient id="st-hydra-grad" x1="0" y1="0" x2="12" y2="16" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stop-color="#2fbdb3"/>
            <stop offset="55%"  stop-color="#1e8f8f"/>
            <stop offset="100%" stop-color="#c0c8cc"/>
          </linearGradient>
        </defs>
        <circle cx="2.5" cy="1.8" r="1.5" fill="url(#st-hydra-grad)"/>
        <circle cx="6"   cy="1.8" r="1.5" fill="url(#st-hydra-grad)"/>
        <circle cx="9.5" cy="1.8" r="1.5" fill="url(#st-hydra-grad)"/>
        <circle cx="6"   cy="14.2" r="1.5" fill="url(#st-hydra-grad)"/>
        <path d="M2.5 3.3C2.5 6.5 6 8 6 8M9.5 3.3C9.5 6.5 6 8 6 8M6 3.3V8M6 8v4.7"
              stroke="url(#st-hydra-grad)" stroke-width="1.4" stroke-linecap="round" fill="none"/>
      </svg>
    {/if}
  </button>

  <!-- Branch view picker (which branch(es) the log shows — not a checkout) -->
  <div class="branch-picker-wrap">
    <button class="branch-pill" onclick={openBranchPicker} title="Choose which branches the log shows">
      <span class="branch-name">{allBranches ? 'All branches' : (activeBranch || repoName)}</span>
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
            onkeydown={onBranchKeydown}
          />
        </div>
        <div class="bd-list">
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="bd-item bd-item--all"
            class:bd-item--current={allBranches}
            onclick={() => { allBranches = true; onAllBranches(true); closeBranchPicker(); }}
          >
            <span class="bd-icon">⊞</span>
            <span class="bd-name">All branches</span>
          </div>
          {#if branchList.length === 0}
            <div class="bd-empty">No branches match</div>
          {:else}
            {#each branchList as b}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="bd-item"
                class:bd-item--current={!allBranches && b.name === activeBranch}
                class:bd-item--remote={b.isRemote}
                onclick={() => pickBranch(b.name, b.isRemote)}
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

  <!-- Token search: one input, scope chip on the left, dropdown teaches scopes -->
  <div class="search-wrap" class:scoped={searchMode !== 'msg'} class:scope-hash={searchMode==='hash'}
       class:scope-file={searchMode==='file'} class:scope-author={searchMode==='author'} class:scope-code={searchMode==='code'}>

    {#if searchMode !== 'msg'}
      <span class="scope-chip scope-chip-{searchMode}">
        {currentScope.label.toLowerCase()}
        <button class="chip-x" onclick={removeScope} title="Remove scope (back to message search)">
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
            <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
        </button>
      </span>
    {/if}

    {#if searchMode === 'code'}
      <!-- Code scope edits in the expanded box below — this slot just summarizes. -->
      <button class="search-inner code-summary" onclick={() => codeBoxEl?.focus()}>
        {#if searchQuery.trim()}
          <span class="code-summary-text">{codeFirstLine}</span>
          {#if codeLines > 1}
            <span class="code-summary-more">+{codeLines - 1} line{codeLines > 2 ? 's' : ''}</span>
          {/if}
        {:else}
          <span class="code-summary-placeholder">Code snippet — use the box below</span>
        {/if}
      </button>
    {:else}
      <div class="search-inner">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" class="search-icon">
          <circle cx="5" cy="5" r="3.5" stroke="currentColor" stroke-width="1.2"/>
          <path d="M8 8l2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        <input
          bind:this={searchInputEl}
          type="text"
          placeholder={currentScope.placeholder}
          value={searchQuery}
          oninput={handleInput}
          onfocus={handleSearchFocus}
          onkeydown={handleSearchKeydown}
        />
        {#if searchQuery}
          <button class="clear-btn" onclick={clearSearch} tabindex="-1">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
          </button>
        {/if}
      </div>
    {/if}

    {#if scopeOpen}
      <div class="scope-dropdown">
        <div class="sd-head">Search in…</div>
        {#each pickable as s, i}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="sd-item"
            class:sd-item--hi={scopeHi === i}
            onmousedown={(e) => { e.preventDefault(); setScope(s.id); }}
            onmouseenter={() => (scopeHi = i)}
          >
            <span class="sd-label sd-label-{s.id}">{s.label}</span>
            <span class="sd-example">{s.example}</span>
          </div>
        {/each}
        <div class="sd-foot">type a prefix (<code>author:</code>, <code>@</code>) or ↑↓ + Enter</div>
      </div>
    {/if}
  </div>

  <div class="tb-spacer"></div>

  <!-- Contextual undo — appears only when there is something to undo: an op in
       progress (abort) or the last merge/rebase/reset/pull (ORIG_HEAD rewind). -->
  {#if undoLabel}
    <button
      class="undo-btn"
      transition:slide={{ axis: 'x', duration: 140 }}
      onclick={() => onAction('undo')}
      onmouseenter={(e) => showTip(e, 'Rewind the last ' + undoLabel)}
      onmouseleave={hideTip}
    >
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M4 3L1.5 5.5 4 8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M1.5 5.5H8a3.5 3.5 0 010 7H5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
      Undo {undoLabel}
    </button>
  {/if}

</div>

{#if searchMode === 'code'}
  <div class="code-search-row" transition:slide={{ duration: 150 }}>
    <svg class="csr-icon" width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M4.5 3.5 1.5 6.5l3 3M8.5 3.5l3 3-3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <textarea
      bind:this={codeBoxEl}
      class="code-box"
      rows={codeRows}
      spellcheck="false"
      placeholder="Paste a code snippet — finds commits that added or removed it. Enter to search, Shift+Enter for a new line."
      value={searchQuery}
      oninput={handleCodeInput}
      onkeydown={handleCodeKeydown}
    ></textarea>
    <div class="csr-actions">
      <button class="csr-run" disabled={!searchQuery.trim()} onclick={submitCode}>Search</button>
      {#if searchQuery}
        <button class="csr-clear" onclick={clearSearch}>Clear</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Alpha-Legion teal/silver gradient at rest — visibly "special" without any
     idle animation (permanent toolbar motion is how extensions get uninstalled).
     Motion only on interaction: glow on hover, brighter when open. */
  .status-toggle {
    background: transparent;
    border: none;
    padding: 2px 4px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
  .status-toggle .st-logo {
    opacity: 0.85;
    transition: transform 0.15s ease, filter 0.15s ease, opacity 0.15s ease;
  }
  .status-toggle:hover {
    background: var(--vscode-toolbar-hoverBackground, #3a3a3a);
  }
  .status-toggle:hover .st-logo {
    opacity: 1;
    transform: scale(1.15);
    filter: drop-shadow(0 0 3px #2fbdb3);
  }
  .status-toggle.active .st-logo {
    opacity: 1;
    filter: drop-shadow(0 0 2px #2fbdb3);
  }

  /* ── Hydra Bloom ── single head → full three-head logo on hover */
  .hydra-bloom {
    position: relative;
    display: inline-block;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  .hydra-bloom .hb-head,
  .hydra-bloom .hb-full {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
    transform-origin: center center;
    transition: opacity 0.22s ease, transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  /* rest: head shown, full mark hidden + shrunk */
  .hydra-bloom .hb-head { opacity: 0.9; transform: scale(1); }
  .hydra-bloom .hb-full { opacity: 0; transform: scale(0.55); }
  /* active (status panel open): show the full mark in place — no overflow */
  .status-toggle.active .hb-head { opacity: 0; transform: scale(1.2); }
  .status-toggle.active .hb-full {
    opacity: 1;
    transform: scale(1.05);
    filter: drop-shadow(0 0 2px rgba(47, 189, 179, 0.5));
  }
  /* hover: dramatic bloom — declared after .active so it wins on equal specificity */
  .status-toggle:hover .hb-head { opacity: 0; transform: scale(1.35); }
  .status-toggle:hover .hb-full {
    opacity: 1;
    transform: scale(1.95);
    filter: drop-shadow(0 0 4px rgba(47, 189, 179, 0.65));
    z-index: 2;
  }
  /* respect reduced-motion: instant crossfade, no scaling */
  @media (prefers-reduced-motion: reduce) {
    .hydra-bloom .hb-head,
    .hydra-bloom .hb-full {
      transition: opacity 0.12s linear;
      transform: none !important;
    }
  }

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
    border-left: 2px solid var(--hg-info, #56c8e8);
    padding-left: 8px;
  }
  .bd-item--remote { color: var(--vscode-descriptionForeground, #888); }
  .bd-item--all {
    border-bottom: 0.5px solid var(--vscode-panel-border, #2a2a2a);
    margin-bottom: 3px;
    padding-bottom: 6px;
  }
  .bd-icon { font-size: 10px; flex-shrink: 0; width: 14px; text-align: center; }
  .bd-name { flex: 1; overflow: hidden; text-overflow: ellipsis; }
  .bd-track { font-size: var(--hg-font-xxs); color: var(--vscode-disabledForeground, #555); margin-left: auto; flex-shrink: 0; }

  .tb-sep { width: 0.5px; height: 16px; background: var(--vscode-widget-border, #3a3a3a); flex-shrink: 0; }
  .tb-spacer { flex: 1; }

  /* ── Search bar (token search) ── */
  .search-wrap {
    flex: 1;
    max-width: 560px;
    position: relative;
    display: flex;
    align-items: center;
    background: var(--vscode-input-background, #1a1a1a);
    border: 0.5px solid var(--vscode-input-border, #333);
    border-radius: 4px;
    height: 24px;
    padding-left: 4px;
    transition: border-color 0.15s;
  }
  .search-wrap:focus-within  { border-color: var(--vscode-focusBorder, #007fd4); }
  .search-wrap.scope-hash    { border-color: #4a3a1a; }
  .search-wrap.scope-file    { border-color: #1a3a1a; }
  .search-wrap.scope-author  { border-color: #2a1a3a; }
  .search-wrap.scope-code    { border-color: #4a2230; }

  /* Scope chip */
  .scope-chip {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
    padding: 1px 3px 1px 6px;
    border-radius: 3px;
    font-size: var(--hg-font-xxs);
    font-family: var(--hg-font-family);
    line-height: 1.4;
  }
  .scope-chip-hash   { color: var(--hg-warn, #e0a030); background: rgba(224,160,48,0.12); }
  .scope-chip-file   { color: #4ec94e; background: rgba(78,201,78,0.12);  }
  .scope-chip-author { color: var(--hg-author, #9a7ae8); background: rgba(160,122,232,0.12);}
  .scope-chip-code   { color: var(--hg-code, #e8648a); background: rgba(232,100,138,0.12);}
  .chip-x {
    background: none; border: none; padding: 1px; display: flex;
    align-items: center; cursor: pointer; color: inherit; opacity: 0.6;
  }
  .chip-x:hover { opacity: 1; }

  /* Scope dropdown */
  .scope-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 200;
    background: var(--vscode-menu-background, #252526);
    border: 0.5px solid var(--vscode-menu-border, #3a3a3a);
    border-radius: 4px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    overflow: hidden;
    padding: 4px 0;
  }
  .sd-head {
    padding: 3px 10px 5px;
    font-size: var(--hg-font-xxs);
    color: var(--vscode-disabledForeground, #555);
    font-family: var(--hg-font-family);
  }
  .sd-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    cursor: pointer;
    font-size: var(--hg-font-xs);
    font-family: var(--hg-font-family);
  }
  .sd-item--hi { background: var(--vscode-list-hoverBackground, #2a2d2e); }
  .sd-label { width: 64px; flex-shrink: 0; }
  .sd-label-author { color: var(--hg-author, #9a7ae8); }
  .sd-label-file   { color: #4ec94e; }
  .sd-label-hash   { color: var(--hg-warn, #e0a030); }
  .sd-label-code   { color: var(--hg-code, #e8648a); }
  .sd-example {
    color: var(--vscode-disabledForeground, #555);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--hg-font-xxs);
  }
  .sd-foot {
    padding: 5px 10px 3px;
    font-size: var(--hg-font-xxs);
    color: var(--vscode-disabledForeground, #444);
    font-family: var(--hg-font-family);
    border-top: 0.5px solid var(--vscode-panel-border, #2a2a2a);
    margin-top: 4px;
  }
  .sd-foot code {
    font-family: var(--vscode-editor-font-family, monospace);
    color: var(--vscode-descriptionForeground, #777);
  }

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

  /* Code-mode summary slot — the real editing happens in .code-search-row */
  .code-summary {
    border: none;
    background: none;
    cursor: text;
    text-align: left;
    font-size: var(--hg-font-xs);
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .code-summary-text {
    color: var(--vscode-input-foreground, #ccc);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }
  .code-summary-more {
    font-size: var(--hg-font-xxs);
    color: #a04a64;
    flex-shrink: 0;
  }
  .code-summary-placeholder {
    color: var(--vscode-disabledForeground, #3a3a3a);
    font-family: var(--hg-font-family);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Expanded code-search row (pickaxe) ── */
  .code-search-row {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    padding: 6px 10px;
    background: var(--vscode-editorGroupHeader-tabsBackground, #2d2d2d);
    border-bottom: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    flex-shrink: 0;
  }
  .csr-icon {
    color: var(--hg-code, #e8648a);
    flex-shrink: 0;
    margin-top: 4px;
  }
  .code-box {
    flex: 1;
    min-width: 0;
    resize: none;
    background: var(--vscode-input-background, #1a1a1a);
    border: 0.5px solid #4a2230;
    border-radius: 4px;
    padding: 4px 8px;
    color: var(--vscode-input-foreground, #ccc);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--hg-font-xs);
    line-height: 1.5;
    outline: none;
    white-space: pre;
    overflow-x: auto;
  }
  .code-box:focus { border-color: var(--hg-code, #e8648a); }
  .code-box::placeholder {
    color: var(--vscode-disabledForeground, #3a3a3a);
    font-family: var(--hg-font-family);
  }
  .csr-actions {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-shrink: 0;
  }
  .csr-run {
    border: 0.5px solid #4a2230;
    border-radius: 3px;
    padding: 3px 10px;
    font-size: var(--hg-font-xxs);
    font-family: var(--hg-font-family);
    cursor: pointer;
    color: var(--hg-code, #e8648a);
    background: rgba(232,100,138,0.08);
    transition: all 0.12s;
    white-space: nowrap;
  }
  .csr-run:hover:not(:disabled) { border-color: var(--hg-code, #e8648a); background: rgba(232,100,138,0.16); }
  .csr-run:disabled { opacity: 0.4; cursor: default; }
  .csr-clear {
    border: 0.5px solid var(--vscode-widget-border, #3a3a3a);
    border-radius: 3px;
    padding: 3px 10px;
    font-size: var(--hg-font-xxs);
    font-family: var(--hg-font-family);
    cursor: pointer;
    color: var(--vscode-disabledForeground, #888);
    background: none;
    transition: all 0.12s;
    white-space: nowrap;
  }
  .csr-clear:hover { color: var(--vscode-foreground, #ccc); border-color: var(--vscode-focusBorder, #007fd4); }

  .clear-btn {
    background: none; border: none; padding: 2px; border-radius: 2px;
    cursor: pointer; color: var(--vscode-disabledForeground, #555);
    display: flex; align-items: center; flex-shrink: 0;
  }
  .clear-btn:hover { color: var(--vscode-foreground, #ccc); }

  /* ── Contextual undo — amber, only present when something is undoable ── */
  .undo-btn {
    display: flex; align-items: center; gap: 4px;
    border: 0.5px solid #5a4a20;
    border-radius: 3px; padding: 2px 8px;
    font-size: var(--hg-font-xxs); font-family: var(--hg-font-family);
    cursor: pointer; white-space: nowrap; flex-shrink: 0;
    color: var(--hg-warn, #e0a030);
    background: rgba(224,160,48,0.08); transition: all 0.12s;
  }
  .undo-btn:hover { border-color: var(--hg-warn, #e0a030); background: rgba(224,160,48,0.16); }

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
