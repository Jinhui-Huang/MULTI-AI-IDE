export interface GitStatusFile {
  path: string;
  status: 'modified' | 'untracked' | 'added' | 'deleted' | 'renamed' | 'unknown';
}

export interface GitStatusResult {
  ok: true;
  isGitRepository: boolean;
  branch: string;
  shortStatus: string;
  files: GitStatusFile[];
}

export interface GitDiffOptions {
  cached?: boolean;
  path?: string;
  maxBytes?: number;
}

export interface GitDiffResult {
  ok: true;
  diff: string;
  truncated: boolean;
  bytes: number;
}
