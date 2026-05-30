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

// Per-line authorship from `git blame`, used by the side-by-side hover card.
export interface BlameLine {
  line: number;
  commit: string;
  author: string;
  authorEmail: string;
  authorTime: number; // unix epoch seconds
  summary: string;
  uncommitted: boolean;
}

// One rendered row of the side-by-side viewer. A side may be absent (filler).
export interface DiffRow {
  kind: 'ctx' | 'del' | 'add' | 'mod';
  leftNo?: number;
  leftText?: string;
  rightNo?: number;
  rightText?: string;
}
