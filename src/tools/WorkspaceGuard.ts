import * as path from 'path';
import * as vscode from 'vscode';
import { ToolError } from './ToolTypes';

export class WorkspaceGuard {
  getWorkspaceRoot(): vscode.Uri | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
  }

  requireWorkspaceRoot(): vscode.Uri {
    const root = this.getWorkspaceRoot();
    if (!root) {
      throw new ToolError('WORKSPACE_NOT_OPEN', 'No workspace folder is open.');
    }
    return root;
  }

  normalizeRelativePath(inputPath: string): string {
    const rawPath = (inputPath || '.').trim() || '.';
    const normalized = rawPath.replace(/\\/g, '/');

    if (path.posix.isAbsolute(normalized) || /^[a-zA-Z]:[\\/]/.test(rawPath)) {
      throw new ToolError('PATH_OUTSIDE_WORKSPACE', `Absolute paths are not allowed: ${inputPath}`);
    }

    const collapsed = path.posix.normalize(normalized);
    if (collapsed === '..' || collapsed.startsWith('../')) {
      throw new ToolError('PATH_OUTSIDE_WORKSPACE', `Path outside workspace denied: ${inputPath}`);
    }

    return collapsed === '.' ? '.' : collapsed.replace(/^\.\/+/, '');
  }

  resolveWorkspacePath(relativePath: string): vscode.Uri {
    const root = this.requireWorkspaceRoot();
    const normalized = this.normalizeRelativePath(relativePath);
    const uri = normalized === '.'
      ? root
      : vscode.Uri.joinPath(root, ...normalized.split('/'));
    this.assertInsideWorkspace(uri);
    return uri;
  }

  isInsideWorkspace(uri: vscode.Uri): boolean {
    const root = this.requireWorkspaceRoot();
    const rootPath = this.normalizeFsPath(root.fsPath);
    const targetPath = this.normalizeFsPath(uri.fsPath);
    return targetPath === rootPath || targetPath.startsWith(`${rootPath}${path.sep}`);
  }

  assertInsideWorkspace(uri: vscode.Uri): void {
    if (!this.isInsideWorkspace(uri)) {
      throw new ToolError('PATH_OUTSIDE_WORKSPACE', `Path outside workspace denied: ${uri.fsPath}`);
    }
  }

  toWorkspaceRelativePath(uri: vscode.Uri): string {
    this.assertInsideWorkspace(uri);
    const root = this.requireWorkspaceRoot();
    const relativePath = path.relative(root.fsPath, uri.fsPath).replace(/\\/g, '/');
    return relativePath || '.';
  }

  private normalizeFsPath(fsPath: string): string {
    return path.resolve(fsPath);
  }
}
