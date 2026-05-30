import { describe, it, expect } from 'vitest';
import { buildGraphSVG, cx, cy, ROW_H } from './graphSvg';
import type { Commit } from './types';

// Structural tests for the commit-graph SVG builder. These are the cheap,
// browser-free counterpart to the Go lane tests (internal/graph/lanes_test.go):
// Go decides which lane/edges each commit gets; this checks the webview turns
// that data into the right SVG markup. Geometry/visual fidelity stays in the
// Playwright spec (tests/e2e/graph-render.spec.ts).

function parse(svg: string): SVGElement {
  const div = document.createElement('div');
  div.innerHTML = svg;
  return div.querySelector('svg')!;
}

// One node marker per commit: r=3.5 for normal commits, r=5 ring for merges.
const nodeMarkers = (svg: SVGElement) =>
  svg.querySelectorAll('circle[r="3.5"], circle[r="5"]').length;
const mergeRings = (svg: SVGElement) => svg.querySelectorAll('circle[r="5"]').length;

describe('buildGraphSVG', () => {
  it('draws exactly one node marker per commit', () => {
    const commits: Commit[] = [
      { hash: 'm', parents: ['a', 'b'], lane: 0, color: '#f00',
        edges: [{ fromLane: 0, toLane: 0, color: '#f00' }],
        mergePaths: [{ fromLane: 0, toLane: 1, fromRow: 0, toRow: 1, color: '#0f0' }] },
      { hash: 'b', parents: ['base'], lane: 1, color: '#0f0', edges: [{ fromLane: 1, toLane: 1, color: '#0f0' }] },
      { hash: 'a', parents: ['base'], lane: 0, color: '#f00', edges: [{ fromLane: 0, toLane: 0, color: '#f00' }] },
      { hash: 'base', parents: [], lane: 0, color: '#f00' },
    ] as Commit[];

    const svg = parse(buildGraphSVG(commits, 2));
    expect(nodeMarkers(svg)).toBe(commits.length);
    expect(mergeRings(svg)).toBe(1); // only 'm' has >1 parent
  });

  it('renders a merge ring + one connector per extra parent (octopus)', () => {
    // 3-parent octopus: first parent inherits the lane, the 2 extra parents
    // each get a merge connector — matching TestOctopusMerge on the Go side.
    const octopus: Commit[] = [
      { hash: 'oct', parents: ['p1', 'p2', 'p3'], lane: 0, color: '#f00',
        edges: [{ fromLane: 0, toLane: 0, color: '#f00' }], // straight → <line>, not <path>
        mergePaths: [
          { fromLane: 0, toLane: 1, fromRow: 0, toRow: 2, color: '#0f0' },
          { fromLane: 0, toLane: 2, fromRow: 0, toRow: 3, color: '#00f' },
        ] },
      { hash: 'p1', parents: ['base'], lane: 0, color: '#f00', edges: [{ fromLane: 0, toLane: 0, color: '#f00' }] },
      { hash: 'p2', parents: ['base'], lane: 1, color: '#0f0', edges: [] },
      { hash: 'p3', parents: ['base'], lane: 2, color: '#00f', edges: [] },
      { hash: 'base', parents: [], lane: 0, color: '#f00' },
    ] as Commit[];

    const svg = parse(buildGraphSVG(octopus, 3));
    expect(mergeRings(svg)).toBe(1);
    // Straight edges render as <line>, so every <path> here is a merge connector.
    expect(svg.querySelectorAll('path').length).toBe(2);
  });

  it('draws crossing connectors for a criss-cross pair', () => {
    // Two merge heads, each connecting across to the other lane (the crossing).
    const criss: Commit[] = [
      { hash: 'm1', parents: ['x', 'y'], lane: 0, color: '#f00',
        edges: [{ fromLane: 0, toLane: 0, color: '#f00' }],
        mergePaths: [{ fromLane: 0, toLane: 1, fromRow: 0, toRow: 3, color: '#0f0' }] },
      { hash: 'm2', parents: ['y', 'x'], lane: 1, color: '#0f0',
        edges: [{ fromLane: 1, toLane: 1, color: '#0f0' }],
        mergePaths: [{ fromLane: 1, toLane: 0, fromRow: 1, toRow: 2, color: '#f00' }] },
      { hash: 'x', parents: ['base'], lane: 0, color: '#f00', edges: [{ fromLane: 0, toLane: 0, color: '#f00' }] },
      { hash: 'y', parents: ['base'], lane: 1, color: '#0f0', edges: [{ fromLane: 1, toLane: 1, color: '#0f0' }] },
      { hash: 'base', parents: [], lane: 0, color: '#f00' },
    ] as Commit[];

    const svg = parse(buildGraphSVG(criss, 2));
    expect(mergeRings(svg)).toBe(2); // both heads are merges
    // Two connectors, each moving between lane 0 and lane 1.
    expect(svg.querySelectorAll('path').length).toBe(2);
  });

  it('places node markers at lane/row coordinates from cx/cy', () => {
    const commits: Commit[] = [
      { hash: 'a', parents: ['base'], lane: 1, color: '#f00', edges: [] },
      { hash: 'base', parents: [], lane: 0, color: '#f00' },
    ] as Commit[];

    const svg = parse(buildGraphSVG(commits, 2));
    const first = svg.querySelector('circle[r="3.5"]')!; // 'a', drawn first
    expect(Number(first.getAttribute('cx'))).toBe(cx(1));
    expect(Number(first.getAttribute('cy'))).toBe(cy(0));
  });

  it('returns an empty-ish svg for no commits', () => {
    const svg = parse(buildGraphSVG([], 0));
    expect(svg).toBeTruthy();
    expect(nodeMarkers(svg)).toBe(0);
  });

  it('renders only the requested row window (virtual scrolling)', () => {
    // A 6-commit linear chain.
    const commits: Commit[] = [];
    for (let i = 0; i < 6; i++) {
      commits.push({
        hash: `c${i}`,
        parents: i < 5 ? [`c${i + 1}`] : [],
        lane: 0,
        color: '#f00',
        edges: i < 5 ? [{ fromLane: 0, toLane: 0, color: '#f00' }] : [],
      } as Commit);
    }

    // Full render: one node marker per commit.
    expect(nodeMarkers(parse(buildGraphSVG(commits, 1)))).toBe(6);

    // Window [2, 4): only rows 2 and 3 get node markers, and the SVG is sized
    // to the window (2 rows tall) — not the whole history.
    const win = parse(buildGraphSVG(commits, 1, 2, 4));
    expect(nodeMarkers(win)).toBe(2);
    expect(Number(win.getAttribute('height'))).toBe(2 * ROW_H);
  });
});
