import '@testing-library/jest-dom';

// Mock VS Code webview API for all tests
(globalThis as any).acquireVsCodeApi = () => ({
  postMessage: () => {},
  getState: () => undefined,
  setState: () => {},
});

// jsdom has no Web Animations API; Svelte 5 transitions call element.animate().
// Minimal stub: completes immediately so transitioned elements settle in tests.
// Guarded on Element existing — extension-host tests share this setup but run
// in a plain Node environment with no DOM at all.
if (typeof Element !== 'undefined' && !Element.prototype.animate) {
  Element.prototype.animate = function () {
    const anim = {
      onfinish: null as (() => void) | null,
      oncancel: null as (() => void) | null,
      finished: Promise.resolve(),
      cancel() {},
      finish() {},
      pause() {},
      play() {},
      reverse() {},
    };
    setTimeout(() => anim.onfinish?.(), 0);
    return anim as unknown as Animation;
  };
}