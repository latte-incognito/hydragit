<script lang="ts">
  import type { Branch, Stash } from '../types'

  export let branches:     Branch[] = []
  export let stashes:      Stash[]  = []
  export let activeBranch: string   = ''
  export let selStashIdx:  number | null = null

  export let onSelectBranch: (name: string, remote: boolean) => void = () => {}
  export let onSelectStash:  (i: number) => void = () => {}
  export let onStashAction:  (a: string) => void = () => {}
  export let onNewBranch:    () => void = () => {}
  export let onBranchCtx:    (e: MouseEvent, name: string, isCurrent: boolean) => void = () => {}
  export let onStashCtx:     (e: MouseEvent, i: number) => void = () => {}

  $: local  = branches.filter(b => !b.isRemote)
  $: remote = branches.filter(b => b.isRemote)
  $: currentUpstream = local.find(b => b.isCurrent)?.upstream ?? '' 
  $: remoteByOrigin = remote.reduce((acc, b) => {
    const origin = b.name.split('/')[0]
    acc[origin] = acc[origin] ?? []
    acc[origin].push(b)
    return acc
  }, {} as Record<string, Branch[]>)

  let localOpen  = true
  let remoteOpen = true
  let stashOpen  = true
</script>

<div class="pane-branches">
  <div class="pane-hdr">
    <span>Branches</span>
    <span class="pane-hdr-btn" title="New branch" on:click={onNewBranch} role="button" tabindex="0"
      on:keydown={e => e.key === 'Enter' && onNewBranch()}>+</span>
  </div>

  <div class="tree-scroll">
    <!-- HEAD item -->
    <div class="titem active current head"
      on:click={() => onSelectBranch(activeBranch, false)}
      role="option" aria-selected="true" tabindex="0">
      <span class="titem-icon">◎</span>
      <span class="titem-name">{activeBranch || 'HEAD'}</span>
    </div>

    <!-- Local -->
    <div class="tgroup-hdr" on:click={() => localOpen = !localOpen} role="button" tabindex="0">
      <span class="tgroup-arrow" class:open={localOpen} class:closed={!localOpen}>▾</span>
      <span class="tgroup-label">Local</span>
      <span class="tgroup-count">{local.length}</span>
    </div>
    {#if localOpen}
      <div>
        {#each local as b}
        <div class="titem" class:current={b.isCurrent} class:active={b.name === activeBranch}
            class:gone={b.gone}
            on:click={() => onSelectBranch(b.name, false)}
            on:contextmenu={e => onBranchCtx(e, b.name, b.isCurrent)}
            role="option" aria-selected={b.name === activeBranch} tabindex="0">
              <span class="titem-icon">{b.isCurrent ? '⭐' : '⎇'}</span>
              <span class="titem-name">{b.name}</span>
              {#if b.gone}
                <span class="track gone">gone</span>
              {:else if b.trackShort}
                <span class="track">{b.trackShort}</span>
               {/if}
        </div>
        {/each}
      </div>
    {/if}

   <!-- Remote -->
<div class="tgroup-hdr" on:click={() => remoteOpen = !remoteOpen} role="button" tabindex="0">
  <span class="tgroup-arrow" class:open={remoteOpen} class:closed={!remoteOpen}>▾</span>
  <span class="tgroup-label">Remote</span>
  <span class="tgroup-count">{remote.length}</span>
</div>
{#if remoteOpen}
  {#each Object.entries(remoteByOrigin) as [origin, bs]}
    <div class="tsubgroup">
      <div class="tsubgroup-hdr" role="button" tabindex="0">
        <span class="tsubgroup-arrow">▾</span>
        <span>{origin}</span>
      </div>
      {#each bs as b}
        <div class="titem remote" class:active={b.name === activeBranch}
          class:gone={b.gone}
          on:click={() => onSelectBranch(b.name, true)}
          on:contextmenu={e => onBranchCtx(e, b.name, false)}
          role="option" aria-selected={b.name === activeBranch} tabindex="0">
          <span class="titem-icon">{b.name === currentUpstream ? '⭐' : '⎇'}</span>
          <span class="titem-name">{b.name.split('/').slice(1).join('/')}</span>
          {#if b.gone}
            <span class="track gone">gone</span>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
{/if}

    <!-- Stashes -->
    <div class="tgroup-hdr" on:click={() => stashOpen = !stashOpen} role="button" tabindex="0">
      <span class="tgroup-arrow" class:open={stashOpen} class:closed={!stashOpen}>▾</span>
      <span class="tgroup-label">Stashes</span>
      <span class="tgroup-count">{stashes.length}</span>
    </div>
    {#if stashOpen}
      {#if stashes.length === 0}
        <div class="stash-empty">No stashes</div>
      {:else}
        {#each stashes as s, i}
          <div class="titem stash" class:active={selStashIdx === i}
            on:click={() => onSelectStash(i)}
            on:contextmenu={e => onStashCtx(e, i)}
            role="option" aria-selected={selStashIdx === i} tabindex="0">
            <div class="stash-msg" title={s.msg ?? s.message ?? ''}>{s.msg ?? s.message ?? ''}</div>
            <div class="stash-meta">
              <span>stash@{'{'}{ s.index ?? i}{'}'}</span>
              <span>{s.time ?? s.date ?? ''}</span>
              {#if s.add ?? s.additions}
                <span style="color:#4ec94e">+{s.add ?? s.additions}</span>
              {/if}
              {#if s.rem ?? s.deletions}
                <span style="color:#f07070">-{s.rem ?? s.deletions}</span>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    {/if}
  </div>

  <!-- Stash action bar -->
  {#if selStashIdx !== null}
    <div class="stash-actions">
      <button class="sab primary" on:click={() => onStashAction('pop')}>Pop</button>
      <button class="sab"         on:click={() => onStashAction('apply')}>Apply</button>
      <button class="sab"         on:click={() => onStashAction('show')}>Show</button>
      <button class="sab danger"  on:click={() => onStashAction('drop')}>Drop</button>
    </div>
  {/if}
</div>

<style>
  .pane-branches {
    width: 200px; min-width: 120px; max-width: 400px;
    background: var(--vscode-sideBar-background, #252526);
    border-right: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0;
    min-height: 0;
    height: 100%; 
  }
  .pane-hdr {
    height: 22px;
    padding: 0px 10px;
    font-size: var(--hg-font-xxs);
    color: var(--vscode-disabledForeground, #444);
    border-bottom: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    background: var(--vscode-sideBarSectionHeader-background, #222);
    flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  }
  .pane-hdr-btn { font-size: var(--hg-font-lg); color: var(--vscode-disabledForeground, #444); cursor: pointer; line-height: 1; }
  .pane-hdr-btn:hover { color: var(--vscode-foreground, #ccc); }

  .tree-scroll { flex: 1; overflow-y: auto; padding: 4px 0; }

  .tgroup-hdr {
    display: flex; align-items: center; padding: 4px 8px; gap: 4px;
    cursor: pointer; color: var(--vscode-descriptionForeground, #666);
    font-size: var(--hg-font-xs); user-select: none;
  }
  .tgroup-hdr:hover { color: var(--vscode-foreground, #ccc); }
  .tgroup-arrow { font-size: var(--hg-font-xxs); width: 10px; flex-shrink: 0; transition: transform .15s; }
  .tgroup-arrow.closed { transform: rotate(-90deg); }
  .tgroup-label { font-weight: 500; letter-spacing: .04em; text-transform: uppercase; font-size: var(--hg-font-xxs); }
  .tgroup-count { font-size: var(--hg-font-xxs); color: var(--vscode-disabledForeground, #3a3a3a); margin-left: auto; }

  .titem {
    display: flex; align-items: center; padding: 4px 8px 4px 22px; gap: 5px;
    cursor: pointer; font-size: var(--hg-font-sm);
    color: var(--vscode-descriptionForeground, #888);
    border-left: 2px solid transparent; white-space: nowrap; overflow: hidden;
  }
  .titem.head { padding-left: 10px; margin-bottom: 2px; }
  .titem:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); color: var(--vscode-foreground, #ccc); }
  .titem.active { background: #0e2535; color: var(--vscode-foreground, #ccc); border-left-color: #56c8e8; }
  .titem.current { color: var(--vscode-foreground, #eee); }
  .titem-icon { font-size: var(--hg-font-xs); flex-shrink: 0; width: 14px; text-align: center; }
  .titem-name { overflow: hidden; text-overflow: ellipsis; flex: 1; }

  .tsubgroup-hdr {
    display: flex; align-items: center; padding: 3px 8px 3px 22px; gap: 4px;
    cursor: pointer; color: var(--vscode-descriptionForeground, #555); font-size: var(--hg-font-xs);
  }
  .tsubgroup-arrow { font-size: var(--hg-font-xxs); width: 10px; flex-shrink: 0; }
  .titem.remote { padding-left: 36px; font-size: var(--hg-font-xs); color: var(--vscode-descriptionForeground, #666); }
  .titem.remote:hover { color: var(--vscode-foreground, #999); }

.track {
  margin-left: auto;
  font-size: 0.7rem;
  opacity: 0.6;
  white-space: nowrap;
}
.track.gone {
  color: #f07070;
  opacity: 1;
}
.titem.gone .titem-name {
  opacity: 0.45;
  text-decoration: line-through;
}
  .titem.stash {
    padding-left: 22px; font-size: var(--hg-font-xs);
    flex-direction: column; align-items: flex-start;
    height: auto; padding-top: 5px; padding-bottom: 5px; gap: 2px;
  }
  .titem.stash.active { background: #0e2535; border-left-color: #9a7ae8; }
  .stash-msg  { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
  .stash-meta { font-size: var(--hg-font-xxs); color: var(--vscode-disabledForeground, #3a3a3a); display: flex; gap: 6px; width: 100%; }
  .stash-empty { padding: 8px 22px; font-size: var(--hg-font-xs); color: #333; font-style: italic; }

  .stash-actions {
    padding: 4px 8px;
    border-top: 0.5px solid var(--vscode-panel-border, #1a1a1a);
    display: flex; gap: 3px; flex-shrink: 0;
    background: var(--vscode-editor-background, #1e1e1e);
  }
  .sab {
    font-size: var(--hg-font-xxs); padding: 2px 6px; border-radius: 3px;
    border: 0.5px solid var(--vscode-widget-border, #333);
    background: var(--vscode-sideBar-background, #252526);
    color: var(--vscode-descriptionForeground, #777); cursor: pointer; flex: 1; text-align: center;
    font-family: var(--hg-font-family);
  }
  .sab:hover  { color: var(--vscode-foreground, #ccc); }
  .sab.primary { background: #0e5a7c; border-color: #1a8ab0; color: #56c8e8; }
  .sab.danger  { background: #2e0d0d; border-color: #6a1a1a; color: #f07070; }
</style>
