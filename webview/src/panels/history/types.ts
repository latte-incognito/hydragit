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

// One rendered row of the side-by-side viewer. A side may be absent (filler).
export interface DiffRow {
  kind: 'ctx' | 'del' | 'add' | 'mod';
  leftNo?: number;
  leftText?: string;
  rightNo?: number;
  rightText?: string;
}
