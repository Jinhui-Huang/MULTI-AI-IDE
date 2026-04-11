import * as vscode from 'vscode';
import { ChatViewProvider } from './chat/chatViewProvider';
import { registerCommands } from './commands';
import { createLogger } from './core/logger';
import { ConfigManager } from './core/config';

const log = createLogger('extension');

export function activate(context: vscode.ExtensionContext) {
  log.info('AI Agent IDE activating');

  const configManager = ConfigManager.initialize(context);
  const config = configManager.getConfig();
  log.info(`Config loaded: provider=${config.provider}, model=${config.model}`);

  configManager.migrateOldApiKey().catch((err) => {
    log.error(`Migration failed: ${err}`);
  });

  const chatProvider = new ChatViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('aiAgent.chat', chatProvider)
  );

  context.subscriptions.push(
    configManager.onConfigChange((newConfig) => {
      log.info(`Config changed: provider=${newConfig.provider}, model=${newConfig.model}`);
    })
  );

  registerCommands(context, chatProvider);

  log.info('AI Agent IDE activated');
}

export function deactivate() {}
