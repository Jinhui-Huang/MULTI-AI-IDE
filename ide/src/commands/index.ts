import * as vscode from 'vscode';
import { ChatViewProvider } from '../chat/chatViewProvider';
import { ConfigManager } from '../core/config';

export function registerCommands(
  context: vscode.ExtensionContext,
  chatProvider: ChatViewProvider
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('aiAgent.openChat', () => {
      vscode.commands.executeCommand('aiAgent.chat.focus');
    }),
    vscode.commands.registerCommand('aiAgent.clearChat', () => {
      chatProvider.clearHistory();
    }),
    vscode.commands.registerCommand('aiAgent.setApiKey', async () => {
      const key = await vscode.window.showInputBox({
        prompt: 'Enter your AI API Key (for current provider)',
        password: true,
        placeHolder: 'sk-...',
      });
      if (key) {
        await ConfigManager.getInstance().setApiKey(key);
        vscode.window.showInformationMessage('API key saved. Use AI Settings for per-provider configuration.');
      }
    }),
    vscode.commands.registerCommand('aiAgent.openSettings', async () => {
      await vscode.commands.executeCommand('aiAgent.chat.focus');
      chatProvider.postMessage({ type: 'settings/providers', payload: await ConfigManager.getInstance().getAllProvidersConfig() });
    }),
  );
}
