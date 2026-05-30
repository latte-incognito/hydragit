<script lang="ts" context="module">
  import type { BlameLine } from './types';

  // Coarse relative time, mirrors the editor hover's formatRelative. Exported so
  // it can be unit-tested without mounting the component.
  export function relativeTime(epochSec: number, nowMs: number = Date.now()): string {
    const deltaSec = Math.max(0, Math.floor(nowMs / 1000) - epochSec);
    if (deltaSec < 45) return 'just now';
    const units: [number, string][] = [
      [60, 'second'],
      [60, 'minute'],
      [24, 'hour'],
      [7, 'day'],
      [4.34524, 'week'],
      [12, 'month'],
      [Number.POSITIVE_INFINITY, 'year'],
    ];
    let value = deltaSec;
    for (const [size, name] of units) {
      if (value < size) {
        const n = Math.max(1, Math.round(value));
        return `${n} ${name}${n === 1 ? '' : 's'} ago`;
      }
      value = value / size;
    }
    return 'a long time ago';
  }

  // The avatar fallback chain: github → gravatar → offline initials SVG.
  export function avatarChain(b: BlameLine): string[] {
    const a = b.avatar;
    if (!a) return [];
    return [a.github, a.gravatar, a.initialsSvg].filter((u): u is string => !!u);
  }
</script>

<script lang="ts">
  export let blame: BlameLine;
  export let x = 0;
  export let y = 0;

  $: chain = avatarChain(blame);
  let srcIdx = 0;
  // Reset to the best source whenever the hovered line changes.
  $: if (blame) srcIdx = 0;

  function onError() {
    if (srcIdx < chain.length - 1) srcIdx += 1;
  }

  $: shortSha = blame.commit.slice(0, 8);
  $: absolute = new Date(blame.authorTime * 1000).toLocaleString();
</script>

<div class="blame-card" style="left:{x}px; top:{y}px;">
  {#if blame.uncommitted}
    <div class="bc-body">
      <div class="bc-title">Not Committed Yet</div>
      <div class="bc-sub">This line has uncommitted changes.</div>
    </div>
  {:else}
    <div class="bc-body">
      <div class="bc-title">{blame.summary || '(no message)'}</div>
      <div class="bc-meta">{blame.author}</div>
      <div class="bc-sub">{blame.authorEmail}</div>
      <div class="bc-sub">{relativeTime(blame.authorTime)} — {absolute}</div>
      <div class="bc-sha">{shortSha}</div>
    </div>
    {#if chain.length}
      <img class="bc-avatar" src={chain[srcIdx]} alt={blame.author} on:error={onError} />
    {/if}
  {/if}
</div>

<style>
  .blame-card {
    position: fixed;
    z-index: 50;
    display: flex;
    gap: 10px;
    max-width: 420px;
    padding: 8px 10px;
    background: var(--vscode-editorHoverWidget-background, #252526);
    color: var(--vscode-editorHoverWidget-foreground, #ccc);
    border: 0.5px solid var(--vscode-editorHoverWidget-border, #454545);
    border-radius: 3px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    font-size: var(--hg-font-xs);
    pointer-events: none;
  }
  .bc-body {
    flex: 1;
    min-width: 0;
  }
  .bc-title {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bc-meta {
    margin-top: 3px;
    color: var(--vscode-foreground, #ddd);
  }
  .bc-sub {
    color: var(--vscode-descriptionForeground, #888);
    font-size: var(--hg-font-xxs);
  }
  .bc-sha {
    margin-top: 3px;
    font-family: var(--hg-editor-font-family);
    color: var(--vscode-textLink-foreground, #4daafc);
  }
  /* Rectangular avatar, pinned bottom-right of the card (real CSS here, unlike
     the markdown editor hover). */
  .bc-avatar {
    align-self: flex-end;
    width: 38px;
    height: 38px;
    border-radius: 3px;
    object-fit: cover;
    flex-shrink: 0;
  }
</style>
