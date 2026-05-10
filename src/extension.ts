import * as vscode from 'vscode';
import { RuntimeManager } from './runtime/RuntimeManager';
import { AgentControlPanelProvider } from './webview/AgentControlPanelProvider';
import { ToolServer } from './tools/ToolServer';
import { ConfigStore } from './storage/ConfigStore';
import { SecretStore } from './storage/SecretStore';
import { ExtensionApiClient } from './runtime/ExtensionApiClient';
let runtimeManager: RuntimeManager | undefined;
let toolServer: ToolServer | undefined;
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('AutoGen Code Agent');
  const configStore = new ConfigStore(context);
  const secretStore = new SecretStore(context);
  toolServer = new ToolServer(context, output, configStore);
  runtimeManager = new RuntimeManager(context, output, configStore, secretStore, toolServer);
  const apiClient = new ExtensionApiClient(configStore, output);
  const provider = new AgentControlPanelProvider(context, output, configStore, secretStore, runtimeManager, apiClient);
  context.subscriptions.push(output, vscode.window.registerWebviewViewProvider('autogenAgent.controlPanel', provider, { webviewOptions: { retainContextWhenHidden: true }}));
  context.subscriptions.push(vscode.commands.registerCommand('autogenAgent.openPanel', () => vscode.commands.executeCommand('autogenAgent.controlPanel.focus')));
  context.subscriptions.push(vscode.commands.registerCommand('autogenAgent.startRuntime', () => runtimeManager?.start()));
  context.subscriptions.push(vscode.commands.registerCommand('autogenAgent.stopRuntime', () => runtimeManager?.stop()));
  output.appendLine('[activate] AutoGen Code Agent activated');
}
export async function deactivate(): Promise<void> { await runtimeManager?.stop(); toolServer?.dispose(); }
