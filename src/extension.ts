import * as vscode from 'vscode';
import { ConfigStore } from './storage/ConfigStore';
import { RuntimeManager } from './runtime/RuntimeManager';
import { AgentControlPanel } from './webview/AgentControlPanel';

let output: vscode.OutputChannel | undefined;
let runtimeManager: RuntimeManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('AutoGen Code Agent');
  output.appendLine('[activate] AutoGen Code Agent activation started');

  try {
    const configStore = new ConfigStore(context);
    runtimeManager = new RuntimeManager(context, output, configStore);
    const panel = new AgentControlPanel(context, output, runtimeManager);

    const openPanelCommand = vscode.commands.registerCommand('autogenAgent.openPanel', () => panel.open());
    const startTaskCommand = vscode.commands.registerCommand('autogenAgent.startTask', async () => {
      await panel.postPlaceholderTaskCreate('Command placeholder task');
    });

    context.subscriptions.push(output, openPanelCommand, startTaskCommand);
    output.appendLine('[activate] AutoGen Code Agent activated');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    output.appendLine(`[activate] failed: ${message}`);
    void vscode.window.showErrorMessage(`AutoGen Code Agent activation failed: ${message}`);
    throw err;
  }
}

export async function deactivate(): Promise<void> {
  await runtimeManager?.dispose();
  output?.dispose();
  output = undefined;
  runtimeManager = undefined;
}
