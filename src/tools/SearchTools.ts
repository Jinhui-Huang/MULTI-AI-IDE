import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { ConfigStore } from '../storage/ConfigStore';
import { SensitiveFileGuard } from './SensitiveFileGuard';
import { ToolError } from './ToolTypes';
import { WorkspaceGuard } from './WorkspaceGuard';

export interface SearchCodeOptions {
  dir?: string;
  maxResults?: number;
  includeHidden?: boolean;
}

const SKIPPED_DIRECTORIES = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/out/**',
  '**/build/**',
  '**/target/**',
  '**/.venv/**',
  '**/__pycache__/**'
];

export class SearchTools {
  private readonly sensitiveFileGuard: SensitiveFileGuard;

  constructor(
    private readonly configStore: ConfigStore,
    private readonly workspaceGuard = new WorkspaceGuard()
  ) {
    this.sensitiveFileGuard = new SensitiveFileGuard(configStore);
  }

  async searchCode(query: string, options: SearchCodeOptions = {}): Promise<unknown> {
    if (!query.trim()) {
      throw new ToolError('QUERY_REQUIRED', 'Search query is required.');
    }

    const dir = this.workspaceGuard.normalizeRelativePath(options.dir ?? '.');
    const maxResults = this.normalizePositiveInteger(options.maxResults, 50);
    const includeHidden = options.includeHidden === true;
    const files = await this.findCandidateFiles(dir, includeHidden);
    const results: Array<{ path: string; line: number; text: string }> = [];

    for (const file of files) {
      if (results.length >= maxResults) {
        break;
      }

      const relativePath = this.workspaceGuard.toWorkspaceRelativePath(file);
      if (await this.sensitiveFileGuard.isSensitive(relativePath)) {
        continue;
      }

      await this.searchFile(file, relativePath, query, results, maxResults);
    }

    return {
      ok: true,
      query,
      results,
      truncated: results.length >= maxResults
    };
  }

  private async findCandidateFiles(dir: string, includeHidden: boolean): Promise<vscode.Uri[]> {
    const base = this.workspaceGuard.resolveWorkspacePath(dir);
    const relativeDir = this.workspaceGuard.toWorkspaceRelativePath(base);
    const include = relativeDir === '.'
      ? '**/*'
      : `${relativeDir.replace(/\/$/, '')}/**/*`;
    const exclude = `{${SKIPPED_DIRECTORIES.join(',')}}`;
    const files = await vscode.workspace.findFiles(include, exclude, 2000);
    return files.filter((file) => {
      this.workspaceGuard.assertInsideWorkspace(file);
      const relativePath = this.workspaceGuard.toWorkspaceRelativePath(file);
      return includeHidden || !relativePath.split('/').some((part) => part.startsWith('.'));
    });
  }

  private async searchFile(
    uri: vscode.Uri,
    relativePath: string,
    query: string,
    results: Array<{ path: string; line: number; text: string }>,
    maxResults: number
  ): Promise<void> {
    let bytes: Buffer;
    try {
      bytes = await fs.readFile(uri.fsPath);
    } catch {
      return;
    }

    if (this.isBinary(bytes)) {
      return;
    }

    const lines = bytes.toString('utf8').split(/\r?\n/);
    for (let index = 0; index < lines.length && results.length < maxResults; index += 1) {
      if (!lines[index].includes(query)) {
        continue;
      }
      results.push({
        path: relativePath,
        line: index + 1,
        text: lines[index].slice(0, 300)
      });
    }
  }

  private normalizePositiveInteger(value: unknown, fallback: number): number {
    const numberValue = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numberValue) && numberValue > 0
      ? Math.floor(numberValue)
      : fallback;
  }

  private isBinary(buffer: Buffer): boolean {
    return buffer.includes(0);
  }
}
