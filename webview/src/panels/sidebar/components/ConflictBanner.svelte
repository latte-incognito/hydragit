<script lang="ts">
  // Conflict-resolution guidance, shown above the file tree while a merge/rebase/
  // cherry-pick is paused. Per-file quick actions + Continue/Abort.
  // "Current" = your side (git --ours); "Incoming" = the other side (--theirs).
  
  interface Props {
    // This holds for both merge AND rebase because HEAD is always "current".
    info?: { operation: string; files: string[] };
    onResolve?: (action: 'current' | 'incoming' | 'merge-editor', file: string) => void;
    onContinue?: () => void;
    onAbort?: () => void;
  }

  let {
    info = { operation: '', files: [] },
    onResolve = () => {},
    onContinue = () => {},
    onAbort = () => {}
  }: Props = $props();

  let count = $derived(info.files.length);

  function base(p: string): string {
    return p.split('/').pop() ?? p;
  }
</script>

<div class="cb">
  <div class="cb-head">
    <span class="cb-title">⚠ Resolving a {info.operation}</span>
    <span class="cb-sub">
      {#if count > 0}{count} file{count === 1 ? '' : 's'} left — pick a side or open the merge editor{:else}all resolved — click Continue{/if}
    </span>
  </div>

  {#if count > 0}
    <div class="cb-files">
      {#each info.files as f (f)}
        <div class="cb-file">
          <span class="cb-name" title={f}>{base(f)}</span>
          <span class="cb-actions">
            <button class="cb-btn merge" title="Open the 3-way merge editor"
                    onclick={() => onResolve('merge-editor', f)}>merge</button>
            <button class="cb-btn current" title="Keep your side (HEAD / --ours)"
                    onclick={() => onResolve('current', f)}>current</button>
            <button class="cb-btn incoming" title="Keep the other side (--theirs)"
                    onclick={() => onResolve('incoming', f)}>incoming</button>
          </span>
        </div>
      {/each}
    </div>
  {/if}

  <div class="cb-foot">
    <button class="cb-cont" disabled={count > 0} onclick={onContinue}>Continue</button>
    <button class="cb-abort" onclick={onAbort}>Abort</button>
  </div>
</div>

<style>
  .cb {
    background: rgba(224, 160, 48, 0.10);
    border: 0.5px solid rgba(224, 160, 48, 0.4);
    border-radius: 5px;
    margin: 6px 8px;
    padding: 7px 9px;
    font-size: var(--hg-font-xs);
  }
  .cb-head { display: flex; flex-direction: column; gap: 1px; margin-bottom: 6px; }
  .cb-title { color: var(--hg-warn, #e0a030); font-size: var(--hg-font-sm); }
  .cb-sub { color: var(--vscode-descriptionForeground, #999); }

  .cb-files { display: flex; flex-direction: column; gap: 3px; margin-bottom: 7px; }
  .cb-file {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .cb-name {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--vscode-foreground, #ccc);
  }
  .cb-actions { display: flex; gap: 3px; flex-shrink: 0; }
  .cb-btn {
    border: 0.5px solid var(--vscode-button-border, transparent);
    border-radius: 3px;
    padding: 1px 6px;
    font-size: var(--hg-font-xxs);
    cursor: pointer;
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #ddd);
  }
  .cb-btn:hover { filter: brightness(1.15); }
  .cb-btn.merge { background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff); }
  .cb-btn.current  { color: var(--vscode-gitDecoration-modifiedResourceForeground, #4a9cd6); }
  .cb-btn.incoming { color: var(--vscode-gitDecoration-addedResourceForeground, #4ec94e); }

  .cb-foot { display: flex; gap: 6px; }
  .cb-cont {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border: none; border-radius: 3px; padding: 3px 12px; cursor: pointer;
    font-size: var(--hg-font-xs);
  }
  .cb-cont:disabled { opacity: 0.45; cursor: default; }
  .cb-abort {
    background: none;
    color: #e06a6a;
    border: 0.5px solid rgba(224, 106, 106, 0.4);
    border-radius: 3px; padding: 3px 12px; cursor: pointer;
    font-size: var(--hg-font-xs);
  }
  .cb-abort:hover { background: rgba(224, 106, 106, 0.1); }
</style>
