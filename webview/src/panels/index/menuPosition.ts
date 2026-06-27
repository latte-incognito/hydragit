// Clamp a context-menu's top-left corner so a menu opened near the right/bottom
// edge of the viewport stays on screen. Matches the original per-handler
// `Math.min(clientX, innerWidth - menuW)` logic (right/bottom edge only — no
// lower bound), now in one tested place instead of repeated across every
// show*Ctx handler in App.svelte.
export function clampMenuPosition(
  clientX: number,
  clientY: number,
  menuW: number,
  menuH: number,
  viewportW: number,
  viewportH: number,
): { x: number; y: number } {
  return {
    x: Math.min(clientX, viewportW - menuW),
    y: Math.min(clientY, viewportH - menuH),
  };
}
