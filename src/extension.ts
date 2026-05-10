import * as vscode from 'vscode';
import { AgentControlPanelProvider } from './webview/AgentControlPanelProvider';

let output: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('AutoGen Code Agent');
  const provider = new AgentControlPanelProvider(context, output);

  const viewRegistration = vscode.window.registerWebviewViewProvider(
    'autogenAgent.controlPanel',
    provider,
    { webviewOptions: { retainContextWhenHidden: true } }
  );
  const openPanelCommand = vscode.commands.registerCommand('autogenAgent.openPanel', () =>
    vscode.commands.executeCommand('autogenAgent.controlPanel.focus')
  );
  const startTaskCommand = vscode.commands.registerCommand('autogenAgent.startTask', async () => {
    await vscode.commands.executeCommand('autogenAgent.controlPanel.focus');
    provider.postPlaceholderTaskCreate('Command placeholder task');
  });

  context.subscriptions.push(output, viewRegistration, openPanelCommand, startTaskCommand);
  output.appendLine('[activate] AutoGen Code Agent activated with Task 1 placeholders');
}

export function deactivate(): void {
  output?.dispose();
  output = undefined;
}
