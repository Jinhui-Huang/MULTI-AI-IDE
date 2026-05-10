import * as vscode from 'vscode';
export class TerminalTools {
  async runCommand(command: string): Promise<void> {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const terminal = vscode.window.createTerminal({ name: 'AutoGen Task', cwd });
    terminal.show();
    terminal.sendText(command);
  }
}
