import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { execFile } from 'child_process';
export class PatchTools {
  async applyPatch(patch: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!cwd) throw new Error('No workspace');
    const patchFile = path.join(os.tmpdir(), `autogen-${Date.now()}.patch`);
    await fs.writeFile(patchFile, patch, 'utf8');
    return new Promise(resolve => {
      execFile('git', ['apply', patchFile], { cwd }, (err, stdout, stderr) => resolve({ exitCode: err ? 1 : 0, stdout, stderr }));
    });
  }
}
