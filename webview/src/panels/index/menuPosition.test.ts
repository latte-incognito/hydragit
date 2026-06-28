import { describe, it, expect } from 'vitest';
import { clampMenuPosition } from './menuPosition';

describe('clampMenuPosition', () => {
  it('returns the click point unchanged when the menu fits', () => {
    expect(clampMenuPosition(100, 200, 320, 280, 1000, 800)).toEqual({ x: 100, y: 200 });
  });

  it('shifts a near-edge menu back inside the viewport', () => {
    expect(clampMenuPosition(900, 750, 320, 280, 1000, 800)).toEqual({ x: 680, y: 520 });
  });

  it('clamps each axis independently', () => {
    expect(clampMenuPosition(900, 100, 200, 50, 1000, 800)).toEqual({ x: 800, y: 100 });
  });
});
