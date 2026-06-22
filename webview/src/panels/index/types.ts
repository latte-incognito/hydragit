export interface Branch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  isDefault?: boolean; // the branch origin/HEAD points to
  upstream?: string;
  trackShort?: string; // "=", ">", "<", "<>" (upstream:trackshort)
  ahead?: number;
  behind?: number;
  gone?: boolean;
}

export interface GraphEdge {
  fromLane: number;
  toLane: number;
  color: string;
  seg?: number;
}

export interface MergePath {
  fromLane: number;
  toLane: number;
  fromRow: number;
  toRow: number;
  color: string;
  seg?: number;
}

export interface Commit {
  hash: string;
  message: string;
  msg?: string;
  author: string;
  date: string;
  refs: string[];
  parents: string[];
  unpushed?: boolean; // not reachable from any remote-tracking ref (local-only)
  lane?: number;
  seg?: number;
  color?: string;
  edges?: GraphEdge[];
  mergePaths?: MergePath[];
}

export interface DiffFile {
  path: string;
  oldPath?: string;  // set for R (renamed) and C (copied) — the previous path
  status: string;
  additions: number;
  deletions: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'del' | 'ctx';
  content: string;
}

export interface Stash {
  index?: number;
  msg?: string;
  message?: string;
  time?: string;
  date?: string;
  add?: number;
  additions?: number;
  rem?: number;
  deletions?: number;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  modified: number;
  detached?: boolean;
  hasUpstream?: boolean;
}

export interface Tag {
  name: string;   // e.g. "v0.1.0"
  hash: string;   // short commit hash
  date?: string;  // ISO date string (git creatordate:short)
}

// A working-tree snapshot (refs/hydragit/snapshots) — auto-captured before
// risky operations; hash is an ordinary commit, diffable like any other.
export interface Snapshot {
  ref: string;
  hash: string;
  date: string;    // RFC3339
  label: string;   // e.g. "before reset"
  branch?: string; // branch at capture time; absent on older snapshots
}

export interface Worktree {
  path: string;
  head: string;          // commit hash, "" for a bare main worktree
  branch: string;        // short branch name, "" if detached/bare
  isMain: boolean;       // the primary working tree (first in the list)
  detached: boolean;
  bare: boolean;
  locked: boolean;
  lockReason?: string;
  prunable: boolean;     // gitdir gone — a stale entry that prune would clear
  pruneReason?: string;
}
