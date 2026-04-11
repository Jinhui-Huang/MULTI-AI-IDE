import * as vscode from 'vscode';
import { ChatViewProvider } from './chat/chatViewProvider';
import { registerCommands } from './commands';
import { createLogger } from './core/logger';
import { ConfigManager } from './core/config';

const log = createLogger('extension');

export function activate(context: vscode.ExtensionContext) {
  log.info('AI Agent IDE activating');

  // 初始化配置管理器
  const configManager = ConfigManager.initialize(context);
  const config = configManager.getConfig();
  log.info(`Config loaded: provider=${config.provider}, model=${config.model}`);

  const chatProvider = new ChatViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('aiAgent.chat', chatProvider)
  );

  // 监听配置变化
  context.subscriptions.push(
    configManager.onConfigChange((newConfig) => {
      log.info(`Config changed: provider=${newConfig.provider}, model=${newConfig.model}`);
    })
  );

  registerCommands(context, chatProvider);

  log.info('AI Agent IDE activated');
}

export function deactivate() {}