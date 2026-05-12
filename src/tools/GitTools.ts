import { spawn } from 'child_process';
import { GitDiffOptions, GitDiffResult, GitStatusFile, GitStatusResult } from '../types/git';
import { ToolError } from './ToolTypes';
import { WorkspaceGuard } from './WorkspaceGuard';

const GIT_TIMEOUT_MS = 10000;
const DEFAULT_DIFF_MAX_BYTES = 200000;

export class GitTools {
  constructor(private readonly workspaceGuard = new WorkspaceGuard()) {}

  async isGitRepository(): Promise<boolean> {
    const result = await this.runGit(['rev-parse', '--is-inside-work-tree'], 1000);
    return result.exitCode === 0 && result.stdout.trim() === 'true';
  }

  async gitStatus(): Promise<GitStatusResult> {
    this.workspaceGuard.requireWorkspaceRoot();
    if (!await this.isGitRepository()) {
      return {
        ok: true,
        isGitRepository: false,
        branch: '',
        shortStatus: '',
        files: []
      };
    }

    const result = await this.runGit(['status', '--short', '--branch'], DEFAULT_DIFF_MAX_BYTES);
    if (result.exitCode !== 0) {
      throw new ToolError('GIT_COMMAND_FAILED', result.stderr || 'git status failed');
    }

    return this.parseStatus(result.stdout);
  }

  async gitDiff(options: GitDiffOptions = {}): Promise<GitDiffResult> {
    this.workspaceGuard.requireWorkspaceRoot();
    if (!await this.isGitRepository()) {
      throw new ToolError('NOT_GIT_REPOSITORY', 'Workspace is not a Git repository.');
    }

    const maxBytes = this.normalizePositiveInteger(options.maxBytes, DEFAULT_DIFF_MAX_BYTES);
    const args = ['diff'];
    if (options.cached === true) {
      args.push('--cached');
    }
    args.push('--no-ext-diff');

    if (options.path && options.path.trim()) {
      const relativePath = this.workspaceGuard.normalizeRelativePath(options.path);
      this.workspaceGuard.resolveWorkspacePath(relativePath);
      args.push('--', relativePath);
    }

    const result = await this.runGit(args, maxBytes);
    if (result.exitCode !== 0) {
      throw new ToolError('GIT_COMMAND_FAILED', result.stderr || 'git diff failed');
    }

    return {
      ok: true,
      diff: result.stdout,
      truncated: result.truncated,
      bytes: Buffer.byteLength(result.stdout, 'utf8')
    };
  }

  private parseStatus(shortStatus: string): GitStatusResult {
    const lines = shortStatus.split(/\r?\n/).filter(Boolean);
    const branchLine = lines[0]?.startsWith('## ') ? lines.shift() ?? '' : '';
    return {
      ok: true,
      isGitRepository: true,
      branch: this.parseBranch(branchLine),
      shortStatus,
      files: lines.map((line) => this.parseStatusFile(line))
    };
  }

  private parseBranch(line: string): string {
    return line
      .replace(/^##\s+/, '')
      .split('...')[0]
      .trim();
  }

  private parseStatusFile(line: string): GitStatusFile {
    const code = line.slice(0, 2);
    const rawPath = line.slice(3).trim();
    const path = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() ?? rawPath : rawPath;
    return {
      path,
      status: this.mapStatusCode(code)
    };
  }

  private mapStatusCode(code: string): GitStatusFile['status'] {
    if (code === '??') {
      return 'untracked';
    }
    if (code.includes('R')) {
      return 'renamed';
    }
    if (code.includes('A')) {
      return 'added';
    }
    if (code.includes('D')) {
      return 'deleted';
    }
    if (code.includes('M')) {
      return 'modified';
    }
    return 'unknown';
  }

  private runGit(args: string[], maxBytes: number): Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
    truncated: boolean;
  }> {
    const cwd = this.workspaceGuard.requireWorkspaceRoot().fsPath;
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let truncated = false;
      let settled = false;
      const child = spawn('git', args, {
        cwd,
        shell: false,
        windowsHide: true
      });

      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill();
        reject(new ToolError('GIT_COMMAND_TIMEOUT', 'Git command timed out'));
      }, GIT_TIMEOUT_MS);

      child.stdout.on('data', (chunk) => {
        const result = this.appendOutput(stdout, chunk.toString('utf8'), maxBytes);
        stdout = result.value;
        truncated = truncated || result.truncated;
      });

      child.stderr.on('data', (chunk) => {
        const result = this.appendOutput(stderr, chunk.toString('utf8'), maxBytes);
        stderr = result.value;
        truncated = truncated || result.truncated;
      });

      child.on('error', (error) => {
        if (settled) {
          return;
        }
        clearTimeout(timeout);
        settled = true;
        reject(new ToolError('GIT_COMMAND_FAILED', error.message));
      });

      child.on('close', (exitCode) => {
        if (settled) {
          return;
        }
        clearTimeout(timeout);
        settled = true;
        resolve({ exitCode, stdout, stderr, truncated });
      });
    });
  }

  private appendOutput(current: string, chunk: string, maxBytes: number): { value: string; truncated: boolean } {
    const next = current + chunk;
    const buffer = Buffer.from(next, 'utf8');
    if (buffer.byteLength <= maxBytes) {
      return { value: next, truncated: false };
    }
    return {
      value: buffer.subarray(0, maxBytes).toString('utf8'),
      truncated: true
    };
  }

  private normalizePositiveInteger(value: unknown, fallback: number): number {
    const numberValue = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numberValue) && numberValue > 0
      ? Math.floor(numberValue)
      : fallback;
  }
}
