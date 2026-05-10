import * as vscode from 'vscode';
import { execFile } from 'child_process';
export class SearchTools {
  async searchCode(query: string): Promise<string[]> {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!cwd) throw new Error('No workspace');
    return new Promise((resolve) => {
      execFile('rg', ['--line-number', '--hidden', '--glob', '!{.git,node_modules,target,build,dist}', query, '.'], { cwd }, (err, stdout) => {
        if (err && !stdout) resolve([]); else resolve(stdout.split(/\r?\n/).filter(Boolean).slice(0, 200));
      });
    });
  }
}
