import * as vscode from 'vscode';
import { execFile } from 'child_process';
export class GitTools {
  private cwd(): string { const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath; if (!cwd) throw new Error('No workspace'); return cwd; }
  git(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise(resolve => execFile('git', args, { cwd: this.cwd() }, (err, stdout, stderr) => resolve({ exitCode: err ? 1 : 0, stdout, stderr })));
  }
  status(): Promise<unknown> { return this.git(['status', '--short']); }
  diff(): Promise<unknown> { return this.git(['diff']); }
}
