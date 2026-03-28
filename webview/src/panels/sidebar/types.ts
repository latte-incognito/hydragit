export interface GitFile {
  path:   string
  status: string   // M | A | D | U | R | C | T
}

export interface GitStatus {
  branch: string
  files:  GitFile[]
}
