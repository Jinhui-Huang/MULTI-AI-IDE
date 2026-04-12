import * as vscode from 'vscode';
import { ChatViewProvider } from './chat/chatViewProvider';
import { RightChatPanelProvider } from './chat/rightChatPanelProvider';
import { registerCommands } from './commands';
import { createLogger } from './core/logger';
import { ConfigManager } from './core/config';
import { runAutomatedTests } from './chat/chatViewProvider.test';

const log = createLogger('extension');

export function activate(context: vscode.ExtensionContext) {
  log.info('AI Agent IDE activating');

  const configManager = ConfigManager.initialize(context);
  const config = configManager.getConfig();
  log.info(`Config loaded: provider=${config.provider}, model=${config.model}`);

  // 运行自动化测试
  log.info('Running automated tests...');
  runAutomatedTests().catch((err) => {
    log.error(`Automated tests failed: ${err}`);
  });

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

  // Register command to open right chat panel
  context.subscriptions.push(
    vscode.commands.registerCommand('aiAgent.openRightChat', async () => {
      await RightChatPanelProvider.createOrShow(context.extensionUri);
    })
  );

  log.info('AI Agent IDE activated');
}

export function deactivate() {}
