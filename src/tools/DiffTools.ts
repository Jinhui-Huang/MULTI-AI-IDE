import * as vscode from 'vscode';
export class DiffTools {
  async showUnifiedDiff(patch: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({ content: patch, language: 'diff' });
    await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
  }
  async openDiff(original: vscode.Uri, modified: vscode.Uri, title = 'AutoGen Diff'): Promise<void> {
    await vscode.commands.executeCommand('vscode.diff', original, modified, title);
  }
}
