import * as vscode from 'vscode';
export class ApprovalManager {
  async confirm(message: string, allowLabel = '允许'): Promise<boolean> {
    const answer = await vscode.window.showWarningMessage(message, { modal: true }, allowLabel, '拒绝');
    return answer === allowLabel;
  }
}
