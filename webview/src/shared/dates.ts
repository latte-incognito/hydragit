// Shared date formatting for commit metadata (ROADMAP §4.7 / §4.8).
// Two altitudes: smartDate for tight log columns, fullDate for detail panes.

/**
 * Compact, column-friendly: `Today 9:46 pm` · `Yesterday 9:46 pm` · `Jun 7`
 * (this year) · `Jun 7, 2025` (older). Older dates drop the time entirely —
 * that's what keeps the column from truncating.
 */
export function smartDate(raw: string, now: Date = new Date()): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);

  if (d >= todayStart || d >= yesterdayStart) {
    // 12-hour time, no seconds, narrow no-break space before am/pm.
    const time = d
      .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })
      .toLowerCase()
      .replace(/\s/g, ' ');
    return d >= todayStart ? `Today ${time}` : `Yesterday ${time}`;
  }

  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Full human timestamp for detail panes: `Jun 7, 2026, 9:46 PM`.
 * Unparseable input (e.g. git's relative stash times) passes through as-is.
 */
export function fullDate(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
