import * as vscode from 'vscode';
import { ChatViewProvider } from '../chat/chatViewProvider';
import { RightChatPanelProvider } from '../chat/rightChatPanelProvider';
import { ConfigManager } from '../core/config';
import { registerAgentConsoleCommand } from './agentConsole';
import { registerDevAgentPanelCommand } from './devAgentPanel';

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
        vscode.window.showInformationMessage('API key saved. Use command "AI: Open Right Chat" for settings.');
      }
    }),
    vscode.commands.registerCommand('aiAgent.openSettings', async () => {
      await RightChatPanelProvider.createOrShow(context.extensionUri);
    }),
  );

  // Register Agent Console command (old)
  registerAgentConsoleCommand(context);

  // Register Dev Agent Panel command (new)
  registerDevAgentPanelCommand(context);
}
