import * as vscode from 'vscode';
import * as fs from 'fs';
import { ExtToWebMsg, WebToExtMsg } from '../types/protocol';
import { createLogger } from '../core/logger';
import { ConfigManager } from '../core/config';
import { ChatController } from './chatController';

const log = createLogger('rightChatPanel');

export class RightChatPanelProvider {
  private static currentPanel: RightChatPanelProvider | undefined;
  private panel: vscode.WebviewPanel;
  private configManager: ConfigManager;
  private chatController = new ChatController();
  // 右边 panel 独立的配置状态（不受全局影响）
  private localProvider: string = '';
  private localModel: string = '';

  private constructor(panel: vscode.WebviewPanel, private readonly extensionUri: vscode.Uri) {
    this.panel = panel;
    this.configManager = ConfigManager.getInstance();
    // 初始化本地配置
    const config = this.configManager.getConfig();
    this.localProvider = config.provider;
    this.localModel = config.model;
    log.info(`[RIGHT PANEL] Initialized with local config: provider=${this.localProvider}, model=${this.localModel}`);

    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
    };

    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage((msg: WebToExtMsg) => {
      this.handleMessage(msg);
    });

    this.panel.onDidDispose(() => {
      RightChatPanelProvider.currentPanel = undefined;
    });
  }

  static async createOrShow(extensionUri: vscode.Uri) {
    if (RightChatPanelProvider.currentPanel) {
      RightChatPanelProvider.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'aiAgentChatRight',
      'AI Agent Chat (Right)',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
      }
    );

    RightChatPanelProvider.currentPanel = new RightChatPanelProvider(panel, extensionUri);
  }

  private postMessage(msg: ExtToWebMsg) {
    this.panel.webview.postMessage(msg);
  }

  private async handleMessage(msg: WebToExtMsg) {
    switch (msg.type) {
      case 'ready': {
        this.postMessage({
          type: 'init',
          payload: {
            theme: vscode.window.activeColorTheme.kind === 1 ? 'light' : 'dark',
            config: {
              provider: this.localProvider,
              model: this.localModel,
            },
          },
        });
        break;
      }
      case 'ping':
        log.info('Received ping from Right Chat WebView');
        this.postMessage({ type: 'pong' });
        break;
      case 'chat/send':
        log.info(`User (Right): ${msg.payload.text}${msg.payload.images?.length ? ` [+${msg.payload.images.length} images]` : ''}`);
        this.handleChatSend(msg.payload.text, msg.payload.images);
        break;
      case 'chat/cancel':
        this.chatController.cancel();
        break;

      // Settings handlers
      case 'settings/getProviders': {
        const allConfig = await this.configManager.getAllProvidersConfig();
        // 返回本地配置的 activeProviderId，而不是全局配置
        const configForWebView = {
          ...allConfig,
          activeProviderId: this.localProvider,
          activeModel: this.localModel,
        };
        log.info(`[RIGHT PANEL] Sending settings/providers: activeProviderId=${this.localProvider} (local), global=${allConfig.activeProviderId}`);
        this.postMessage({ type: 'settings/providers', payload: configForWebView });
        break;
      }
      case 'settings/saveProvider': {
        const providerData = { ...msg.payload };
        const realApiKey = providerData.apiKey;
        if (realApiKey && realApiKey !== '••••••••') {
          await this.configManager.setApiKeyForProvider(providerData.id, realApiKey);
        }
        providerData.apiKey = undefined;
        await this.configManager.saveProviderConfig(providerData);
        const updated = await this.configManager.getAllProvidersConfig();
        this.postMessage({ type: 'settings/providers', payload: updated });
        break;
      }
      case 'settings/deleteProvider': {
        await this.configManager.deleteProviderConfig(msg.payload.id);
        const updated = await this.configManager.getAllProvidersConfig();
        this.postMessage({ type: 'settings/providers', payload: updated });
        break;
      }
      case 'settings/setActive': {
        // 更新右边 panel 的本地配置（不影响全局）
        this.localProvider = msg.payload.providerId;
        this.localModel = msg.payload.model;
        log.info(`[RIGHT PANEL] Provider changed: ${this.localProvider}/${this.localModel}`);

        this.postMessage({
          type: 'init',
          payload: {
            theme: vscode.window.activeColorTheme.kind === 1 ? 'light' : 'dark',
            config: { provider: this.localProvider, model: this.localModel },
          },
        });

        // 获取全局配置，但替换 activeProviderId 为本地配置
        const updatedConfig = await this.configManager.getAllProvidersConfig();
        const configForWebView = {
          ...updatedConfig,
          activeProviderId: this.localProvider,  // ← 关键：使用本地配置
          activeModel: this.localModel,
        };
        this.postMessage({ type: 'settings/providers', payload: configForWebView });
        break;
      }
      case 'settings/testProvider': {
        await this.handleTestProvider(msg.payload.providerId);
        break;
      }
      case 'settings/detectLocalModels': {
        await this.handleDetectLocalModels(msg.payload.baseUrl || 'http://localhost:11434/v1');
        break;
      }
      case 'settings/open':
        break;
    }
  }

  private async handleDetectLocalModels(baseUrl: string) {
    try {
      const ollamaBaseUrl = baseUrl.replace(/\/v1\/?$/, '');
      const tagsUrl = `${ollamaBaseUrl}/api/tags`;

      log.info(`Detecting local models from: ${tagsUrl}`);

      const response = await fetch(tagsUrl, { timeout: 5000 });
      if (!response.ok) {
        this.postMessage({ type: 'settings/detectResult', payload: { success: false, message: `Failed to detect models: ${response.statusText}` } });
        return;
      }

      const data = (await response.json()) as { models: Array<{ name: string }> };
      const models = data.models?.map((m) => m.name) ?? [];

      if (models.length === 0) {
        this.postMessage({ type: 'settings/detectResult', payload: { success: false, message: 'No models found running on Ollama' } });
        return;
      }

      log.info(`Detected ${models.length} models: ${models.join(', ')}`);

      const providers = models.map((modelName) => ({
        id: modelName,
        name: modelName,
        type: 'local' as const,
        baseUrl: baseUrl,
        models: [modelName],
        defaultModel: modelName,
        enabled: true,
      }));

      this.postMessage({ type: 'settings/detectResult', payload: { success: true, providers, message: `Found ${models.length} models` } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Failed to detect local models: ${message}`);
      this.postMessage({ type: 'settings/detectResult', payload: { success: false, message: `Connection failed: ${message}` } });
    }
  }

  private async handleTestProvider(providerId: string) {
    try {
      const providers = await this.configManager.getProviderConfigs();
      const provider = providers.find((p) => p.id === providerId);
      if (!provider) {
        this.postMessage({ type: 'settings/testResult', payload: { providerId, success: false, message: 'Provider not found' } });
        return;
      }

      const apiKey = provider.type === 'online' ? await this.configManager.getApiKeyForProvider(providerId) : undefined;
      if (provider.type === 'online' && !apiKey) {
        this.postMessage({ type: 'settings/testResult', payload: { providerId, success: false, message: 'API Key not configured' } });
        return;
      }

      const { AIGateway } = await import('../../../ai-gateway/src');
      const gateway = new AIGateway();
      const abortController = new AbortController();
      setTimeout(() => abortController.abort(), 10000);

      const stream = gateway.chatStream(
        providerId,
        { messages: [{ role: 'user', content: 'Hi' }], model: provider.defaultModel, maxTokens: 10 },
        apiKey || 'ollama',
        provider.baseUrl || undefined,
        abortController.signal,
      );

      for await (const chunk of stream) {
        if (chunk.type === 'delta' || chunk.type === 'done') {
          this.postMessage({ type: 'settings/testResult', payload: { providerId, success: true, message: 'Connection successful' } });
          abortController.abort();
          return;
        }
        if (chunk.type === 'error') {
          this.postMessage({ type: 'settings/testResult', payload: { providerId, success: false, message: chunk.error || 'Unknown error' } });
          return;
        }
      }
      this.postMessage({ type: 'settings/testResult', payload: { providerId, success: true, message: 'Connection successful' } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('aborted')) {
        this.postMessage({ type: 'settings/testResult', payload: { providerId, success: true, message: 'Connection successful' } });
      } else {
        this.postMessage({ type: 'settings/testResult', payload: { providerId, success: false, message } });
      }
    }
  }

  private async handleChatSend(text: string, images?: import('../types/protocol').ImageAttachment[]) {
    const id = `msg-${Date.now()}`;
    try {
      // 使用右边 panel 的本地配置发送消息
      for await (const chunk of this.chatController.sendMessage(text, images, this.localProvider, this.localModel)) {
        if (chunk.type === 'delta') {
          this.postMessage({ type: 'chat/stream', payload: { id, delta: chunk.content ?? '' } });
        } else if (chunk.type === 'done') {
          this.postMessage({ type: 'chat/done', payload: { id } });
        } else if (chunk.type === 'error') {
          this.postMessage({ type: 'chat/error', payload: { id, message: chunk.error ?? 'Unknown error' } });
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: 'chat/error', payload: { id, message } });
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const isDev = process.env.VITE_DEV === 'true';
    const nonce = getNonce();

    if (isDev) {
      const cspSource = webview.cspSource;
      return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${cspSource} 'unsafe-inline';
             img-src ${cspSource} data: blob:;
             script-src 'nonce-${nonce}' http://localhost:5173 ws://localhost:5173 'unsafe-inline';" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="http://localhost:5173/@vite/client"></script>
  <script type="module" nonce="${nonce}" src="http://localhost:5173/src/main.tsx"></script>
</body>
</html>`;
    } else {
      const distUri = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
      const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'main.js'));
      const cssPath = vscode.Uri.joinPath(distUri, 'main.css');
      const hasCss = fs.existsSync(cssPath.fsPath);
      const styleTag = hasCss
        ? `<link rel="stylesheet" href="${webview.asWebviewUri(cssPath)}" />`
        : '';

      return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             img-src ${webview.cspSource} data: blob:;
             script-src 'nonce-${nonce}';" />
  ${styleTag}
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
  }
}

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
