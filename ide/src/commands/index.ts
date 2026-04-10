import * as vscode from 'vscode';
import { ChatViewProvider } from '../chat/chatViewProvider';

export function registerCommands(
  context: vscode.ExtensionContext,
  chatProvider: ChatViewProvider
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('aiAgent.openChat', () => {
      vscode.commands.executeCommand('aiAgent.chat.focus');
    }),
    vscode.commands.registerCommand('aiAgent.clearChat', () => {
      chatProvider.postMessage({ type: 'chat/done', payload: { id: 'clear' } });
    })
  );
}