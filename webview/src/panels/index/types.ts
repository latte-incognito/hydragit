export interface Branch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream?: string;
  trackShort?: string; // "[ahead 2]", "[behind 1]", "[gone]"
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
}

export interface Tag {
  name: string;   // e.g. "v0.1.0"
  hash: string;   // short commit hash
  date?: string;  // ISO date string (git creatordate:short)
}
