export interface GitFile {
  path: string;
  status: string; // combined letter (counts, badges)
  indexStatus?: string; // staged side: M A D R C T — set when the file has index changes
  workStatus?: string; // working-tree side: M D T; U untracked; ! conflict
  oldPath?: string; // rename source for staged renames
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  hasUpstream: boolean;
  files: GitFile[];
}
