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

export function arcEdge(x1: number, y1: number, x2: number, y2: number, color: string): string {
  const dx = x2 - x1;
  if (dx === 0) {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${ATTR}/>`;
  }
  const span = y2 - y1;
  const r = Math.abs(dx);
  if (r <= span) {
    const pad = (span - r) / 2;
    const sweep = dx > 0 ? 1 : 0;
    return `<path d="M${x1},${y1} L${x1},${y1 + pad} A${r},${r} 0 0,${sweep} ${x2},${y2 - pad} L${x2},${y2}" fill="none" stroke="${color}" ${ATTR}/>`;
  }
  // Multi-lane jump wider than row height — fallback to Bézier
  const third = span / 3;
  return `<path d="M${x1},${y1} C${x1},${y1 + third} ${x2},${y2 - third} ${x2},${y2}" fill="none" stroke="${color}" ${ATTR}/>`;
}

export function buildGraphSVG(commits: Commit[], laneCount: number): string {
  const svgW = Math.max(28, laneCount * LANE_W + PAD * 2);
  const svgH = commits.length * ROW_H;
  let edgeStr = '';
  let dotStr = '';

  // Pass 1: per-row edges (row i → row i+1)
  for (let i = 0; i < commits.length; i++) {
    for (const e of commits[i].edges ?? []) {
      edgeStr += arcEdge(cx(e.fromLane), cy(i), cx(e.toLane), cy(i + 1), e.color);
    }
  }

  // Pass 1b: merge connectors (curves from merge commit to branch tip)
  for (let i = 0; i < commits.length; i++) {
    for (const mp of commits[i].mergePaths ?? []) {
      const x1 = cx(mp.fromLane), y1 = cy(mp.fromRow);
      const x2 = cx(mp.toLane), y2 = cy(mp.toRow);
      if (mp.fromRow === mp.toRow) {
        const midY = y1 + ROW_H / 2;
        edgeStr += `<path d="M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}" fill="none" stroke="${mp.color}" ${ATTR}/>`;
      } else {
        edgeStr += arcEdge(x1, y1, x2, y2, mp.color);
      }
    }
  }

  // Pass 2: dots
  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    const color = c.color ?? '#e8873e';
    const x = cx(c.lane ?? 0);
    const y = cy(i);
    const isMerge = (c.parents ?? []).length > 1;

    if (isMerge) {
      dotStr += `<circle cx="${x}" cy="${y}" r="5" fill="var(--vscode-editor-background, #1e1e1e)" stroke="${color}" stroke-width="2"/>
          <circle cx="${x}" cy="${y}" r="1.5" fill="${color}"/>`;
    } else {
      dotStr += `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`;
    }
  }

  return `<svg width="${svgW}" height="${svgH}" style="display:block">${edgeStr}${dotStr}</svg>`;
}
