export interface Commit {
  hash: string;
  message: string;
  msg?: string;
  author: string;
  date: string;
  refs: string[];
  parents: string[];
}

export type HistoryInit =
  | { mode: 'file'; file: string }
  | { mode: 'selection'; file: string; start: number; end: number };

export interface HunkLine {
  type: 'add' | 'del' | 'ctx';
  content: string;
}

export interface Hunk {
  header: string;
  lines: HunkLine[];
}

// A commit plus the diff hunks scoped to the tracked line range (selection).
export interface LineCommit extends Commit {
  hunks: Hunk[];
}

// Avatar URLs for an author, resolved in the extension host (see avatar.ts).
// Consumers render them as a fallback chain: github → gravatar → initialsSvg.
export interface Avatar {
  github?: string;
  gravatar: string;
  initials: string;
  color: string;
  initialsSvg: string;
}

// Per-line authorship from `git blame`, enriched with an avatar by the host.
export interface BlameLine {
  line: number;
  commit: string;
  author: string;
  authorEmail: string;
  authorTime: number; // unix epoch seconds
  summary: string;
  uncommitted: boolean;
  avatar?: Avatar;
}

// One rendered row of the side-by-side viewer. A side may be absent (filler).
export interface DiffRow {
  kind: 'ctx' | 'del' | 'add' | 'mod';
  leftNo?: number;
  leftText?: string;
  rightNo?: number;
  rightText?: string;
}
