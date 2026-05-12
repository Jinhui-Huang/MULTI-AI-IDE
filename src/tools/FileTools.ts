import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { ConfigStore } from '../storage/ConfigStore';
import { SensitiveFileGuard } from './SensitiveFileGuard';
import { ToolError } from './ToolTypes';
import { WorkspaceGuard } from './WorkspaceGuard';

export interface ListFilesOptions {
  dir?: string;
  maxFiles?: number;
  includeHidden?: boolean;
}

export interface ReadFileOptions {
  maxBytes?: number;
}

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  'target',
  '.venv',
  '__pycache__'
]);

export class FileTools {
  private readonly sensitiveFileGuard: SensitiveFileGuard;

  constructor(
    private readonly configStore: ConfigStore,
    private readonly workspaceGuard = new WorkspaceGuard()
  ) {
    this.sensitiveFileGuard = new SensitiveFileGuard(configStore);
  }

  async listFiles(options: ListFilesOptions = {}): Promise<unknown> {
    const dir = options.dir ?? '.';
    const maxFiles = this.normalizePositiveInteger(options.maxFiles, 200);
    const includeHidden = options.includeHidden === true;
    const root = this.workspaceGuard.requireWorkspaceRoot();
    const base = this.workspaceGuard.resolveWorkspacePath(dir);
    const files: Array<{ path: string; type: 'file'; size: number }> = [];

    await this.walkFiles(base, files, maxFiles, includeHidden);

    return {
      ok: true,
      root: root.fsPath.replace(/\\/g, '/'),
      dir: this.workspaceGuard.normalizeRelativePath(dir),
      files,
      truncated: files.length >= maxFiles
    };
  }

  async readFile(filePath: string, options: ReadFileOptions = {}): Promise<unknown> {
    const maxBytes = this.normalizePositiveInteger(options.maxBytes, 200000);
    const uri = this.workspaceGuard.resolveWorkspacePath(filePath);
    const relativePath = this.workspaceGuard.toWorkspaceRelativePath(uri);
    await this.sensitiveFileGuard.assertNotSensitive(relativePath);

    let stat: vscode.FileStat;
    try {
      stat = await vscode.workspace.fs.stat(uri);
    } catch {
      throw new ToolError('FILE_NOT_FOUND', `File not found: ${relativePath}`);
    }

    if (stat.type !== vscode.FileType.File) {
      throw new ToolError('FILE_NOT_FOUND', `File not found: ${relativePath}`);
    }

    const bytesToRead = Math.min(stat.size, maxBytes);
    const handle = await fs.open(uri.fsPath, 'r');
    try {
      const buffer = Buffer.alloc(bytesToRead);
      const result = await handle.read(buffer, 0, bytesToRead, 0);
      const contentBytes = buffer.subarray(0, result.bytesRead);
      if (this.isBinary(contentBytes)) {
        throw new ToolError('BINARY_FILE_NOT_SUPPORTED', `Binary file is not supported: ${relativePath}`);
      }

      return {
        ok: true,
        path: relativePath,
        content: contentBytes.toString('utf8'),
        size: stat.size,
        truncated: stat.size > maxBytes
      };
    } finally {
      await handle.close();
    }
  }

  private async walkFiles(
    dir: vscode.Uri,
    files: Array<{ path: string; type: 'file'; size: number }>,
    maxFiles: number,
    includeHidden: boolean
  ): Promise<void> {
    if (files.length >= maxFiles) {
      return;
    }

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dir);
    } catch {
      throw new ToolError('FILE_NOT_FOUND', `Directory not found: ${this.workspaceGuard.toWorkspaceRelativePath(dir)}`);
    }

    for (const [name, type] of entries) {
      if (files.length >= maxFiles) {
        return;
      }
      if (this.shouldSkipEntry(name, type, includeHidden)) {
        continue;
      }

      const child = vscode.Uri.joinPath(dir, name);
      this.workspaceGuard.assertInsideWorkspace(child);
      const relativePath = this.workspaceGuard.toWorkspaceRelativePath(child);

      if (type === vscode.FileType.Directory) {
        await this.walkFiles(child, files, maxFiles, includeHidden);
        continue;
      }

      if (type !== vscode.FileType.File || await this.sensitiveFileGuard.isSensitive(relativePath)) {
        continue;
      }

      const stat = await vscode.workspace.fs.stat(child);
      files.push({
        path: relativePath,
        type: 'file',
        size: stat.size
      });
    }
  }

  private shouldSkipEntry(name: string, type: vscode.FileType, includeHidden: boolean): boolean {
    if (type === vscode.FileType.Directory && SKIPPED_DIRECTORIES.has(name)) {
      return true;
    }
    return !includeHidden && name.startsWith('.');
  }

  private normalizePositiveInteger(value: unknown, fallback: number): number {
    const numberValue = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numberValue) && numberValue > 0
      ? Math.floor(numberValue)
      : fallback;
  }

  private isBinary(buffer: Buffer): boolean {
    if (buffer.length === 0) {
      return false;
    }
    return buffer.includes(0);
  }
}
