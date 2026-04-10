import * as vscode from 'vscode';
import { ChatViewProvider } from './chat/chatViewProvider';
import { registerCommands } from './commands';
import { createLogger } from './core/logger';

const log = createLogger('extension');

export function activate(context: vscode.ExtensionContext) {
  log.info('AI Agent IDE activating');

  const chatProvider = new ChatViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('aiAgent.chat', chatProvider)
  );

  registerCommands(context, chatProvider);

  log.info('AI Agent IDE activated');
}

export function deactivate() {}