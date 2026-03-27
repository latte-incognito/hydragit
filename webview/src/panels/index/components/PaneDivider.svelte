<script lang="ts">
  import { onMount, onDestroy } from 'svelte'

  // Pass the element refs via bind: in the parent
  export let leftEl:  HTMLElement | null = null
  export let rightEl: HTMLElement | null = null
  export let isRight: boolean = false   // true = resize right pane, false = resize left

  let divEl: HTMLElement
  let dragging = false
  let startX = 0
  let startW = 0

  function onMouseDown(e: MouseEvent) {
    dragging = true
    startX = e.clientX
    startW = isRight ? (rightEl?.offsetWidth ?? 0) : (leftEl?.offsetWidth ?? 0)
    divEl.classList.add('dragging')
    document.body.style.cursor = 'col-resize'
    e.preventDefault()
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragging) return
    const dx = e.clientX - startX
    if (isRight && rightEl) {
      const newW = Math.max(160, Math.min(500, startW - dx))
      rightEl.style.width = newW + 'px'
      rightEl.style.flex  = 'none'
    } else if (leftEl) {
      const newW = Math.max(120, Math.min(400, startW + dx))
      leftEl.style.width = newW + 'px'
    }
  }

  function onMouseUp() {
    if (!dragging) return
    dragging = false
    divEl?.classList.remove('dragging')
    document.body.style.cursor = ''
  }

  onMount(() => {
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup',   onMouseUp)
  })
  onDestroy(() => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup',   onMouseUp)
  })
</script>

<div class="divider" bind:this={divEl} on:mousedown={onMouseDown}></div>

<style>
  .divider {
    width: 4px; background: transparent; cursor: col-resize;
    flex-shrink: 0; position: relative; z-index: 10;
  }
  .divider:hover, .divider:global(.dragging) {
    background: var(--vscode-focusBorder, #56c8e8); opacity: .5;
  }
</style>
