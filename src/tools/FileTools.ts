import * as vscode from 'vscode';
import { WorkspaceGuard } from './WorkspaceGuard';
export class FileTools {
  constructor(private readonly workspaceGuard = new WorkspaceGuard()) {}
  async readFile(path: string): Promise<string> {
    const abs = this.workspaceGuard.guard().resolveInside(path);
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(abs));
    return Buffer.from(bytes).toString('utf8');
  }
  async listFiles(glob = '**/*'): Promise<string[]> {
    const files = await vscode.workspace.findFiles(glob, '**/{node_modules,.git,target,build,dist}/**', 500);
    return files.map(f => vscode.workspace.asRelativePath(f));
  }
  async writeFile(path: string, content: string): Promise<void> {
    const abs = this.workspaceGuard.guard().resolveInside(path);
    await vscode.workspace.fs.writeFile(vscode.Uri.file(abs), Buffer.from(content, 'utf8'));
  }
}
