import type { Commit } from './types';

// Pure SVG builder for the commit-graph lane rendering. Extracted from
// LogPane.svelte so the geometry/markup is unit-testable without mounting the
// component (see graphSvg.test.ts). The lane *data* (which lane / which edges)
// is computed in Go — internal/graph/lanes.go — this only draws it.

// ── Graph constants ──────────────────────────────────────────────────────────
export const ROW_H = 22;
export const LANE_W = 16;
export const PAD = 4;

export function cx(lane: number): number {
  return PAD + lane * LANE_W + LANE_W / 2;
}
export function cy(row: number): number {
  return row * ROW_H + ROW_H / 2;
}

const DASH = '5,3';
const LINE_W = 1.6;
const ATTR = `stroke-width="${LINE_W}" stroke-dasharray="${DASH}" stroke-linecap="round"`;

export function arcEdge(
  x1: number, y1: number, x2: number, y2: number, color: string, extra = '',
): string {
  const dx = x2 - x1;
  if (dx === 0) {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${ATTR}${extra}/>`;
  }
  const span = y2 - y1;
  const r = Math.abs(dx);
  if (r <= span) {
    const pad = (span - r) / 2;
    const sweep = dx > 0 ? 1 : 0;
    return `<path d="M${x1},${y1} L${x1},${y1 + pad} A${r},${r} 0 0,${sweep} ${x2},${y2 - pad} L${x2},${y2}" fill="none" stroke="${color}" ${ATTR}${extra}/>`;
  }
  // Multi-lane jump wider than row height — fallback to Bézier
  const third = span / 3;
  return `<path d="M${x1},${y1} C${x1},${y1 + third} ${x2},${y2 - third} ${x2},${y2}" fill="none" stroke="${color}" ${ATTR}${extra}/>`;
}

// buildGraphSVG renders the lane graph for rows [startRow, endRow). The default
// range is the whole history; pass a window to render only the visible slice
// (virtual scrolling). The SVG is sized to the window and its y-coordinates are
// relative to startRow, so the caller positions it at startRow * ROW_H. Long
// edges / merge connectors whose span crosses the window are still drawn (they
// extend past the SVG box, which is overflow:visible).
export function buildGraphSVG(
  commits: Commit[],
  laneCount: number,
  startRow = 0,
  endRow = commits.length,
  highlightSeg: number | null = null,
): string {
  const n = commits.length;
  startRow = Math.max(0, Math.min(startRow, n));
  endRow = Math.max(startRow, Math.min(endRow, n));

  const svgW = Math.max(28, laneCount * LANE_W + PAD * 2);
  const svgH = (endRow - startRow) * ROW_H;
  // y of an absolute row, relative to the window's top.
  const wy = (row: number) => (row - startRow) * ROW_H + ROW_H / 2;

  // When a branch line is hovered, dim everything not on that segment.
  const dim = (seg: number | undefined) =>
    highlightSeg != null && seg !== highlightSeg ? ' opacity="0.16"' : '';

  let edgeStr = '';
  let dotStr = '';

  // Pass 1: per-row edges (row i → row i+1). An edge spans rows i..i+1, so draw
  // it when that span intersects the window (one row of overscan each side).
  for (let i = Math.max(0, startRow - 1); i < Math.min(n, endRow + 1); i++) {
    for (const e of commits[i].edges ?? []) {
      edgeStr += arcEdge(cx(e.fromLane), wy(i), cx(e.toLane), wy(i + 1), e.color, dim(e.seg));
    }
  }

  // Pass 1b: merge connectors can span many rows; include any whose span
  // intersects the window so long edges passing through still render.
  for (let i = 0; i < n; i++) {
    for (const mp of commits[i].mergePaths ?? []) {
      const lo = Math.min(mp.fromRow, mp.toRow);
      const hi = Math.max(mp.fromRow, mp.toRow);
      if (hi < startRow || lo >= endRow) continue;
      const x1 = cx(mp.fromLane), y1 = wy(mp.fromRow);
      const x2 = cx(mp.toLane), y2 = wy(mp.toRow);
      const op = dim(mp.seg);
      if (mp.fromRow === mp.toRow) {
        const midY = y1 + ROW_H / 2;
        edgeStr += `<path d="M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}" fill="none" stroke="${mp.color}" ${ATTR}${op}/>`;
      } else {
        edgeStr += arcEdge(x1, y1, x2, y2, mp.color, op);
      }
    }
  }

  // Pass 2: dots for the visible rows only.
  for (let i = startRow; i < endRow; i++) {
    const c = commits[i];
    const color = c.color ?? '#e8873e';
    const x = cx(c.lane ?? 0);
    const y = wy(i);
    const isMerge = (c.parents ?? []).length > 1;
    const op = dim(c.seg);

    if (isMerge) {
      dotStr += `<circle cx="${x}" cy="${y}" r="5" fill="var(--vscode-editor-background, #1e1e1e)" stroke="${color}" stroke-width="2"${op}/>
          <circle cx="${x}" cy="${y}" r="1.5" fill="${color}"${op}/>`;
    } else {
      dotStr += `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"${op}/>`;
    }
  }

  return `<svg width="${svgW}" height="${svgH}" style="display:block;overflow:visible">${edgeStr}${dotStr}</svg>`;
}
