export interface GitFile {
  path: string;
  status: string;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  hasUpstream: boolean;
  files: GitFile[];
}
