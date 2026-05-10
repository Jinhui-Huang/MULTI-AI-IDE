import * as vscode from 'vscode';
import { PathGuard } from '../utils/pathGuard';
export class WorkspaceGuard {
  getWorkspaceRoot(): string {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) throw new Error('No workspace folder is open');
    return folder.uri.fsPath;
  }
  guard(): PathGuard { return new PathGuard(this.getWorkspaceRoot()); }
}
