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
