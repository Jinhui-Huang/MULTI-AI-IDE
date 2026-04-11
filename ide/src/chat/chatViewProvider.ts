import * as vscode from 'vscode';
import * as fs from 'fs';
import { ExtToWebMsg, WebToExtMsg } from '../types/protocol';
import { createLogger } from '../core/logger';
import { ConfigManager } from '../core/config';
import { ChatController } from './chatController';

const log = createLogger('chatViewProvider');

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private configManager: ConfigManager;
  private chatController = new ChatController();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.configManager = ConfigManager.getInstance();
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: WebToExtMsg) => {
      this.handleMessage(msg);
    });
  }

  postMessage(msg: ExtToWebMsg) {
    this.view?.webview.postMessage(msg);
  }

  private async handleMessage(msg: WebToExtMsg) {
    switch (msg.type) {
      case 'ready': {
        const config = this.configManager.getConfig();
        this.postMessage({
          type: 'init',
          payload: {
            theme: vscode.window.activeColorTheme.kind === 1 ? 'light' : 'dark',
            config: {
              provider: config.provider,
              model: config.model,
            },
          },
        });
        break;
      }
      case 'ping':
        log.info('Received ping from WebView');
        this.postMessage({ type: 'pong' });
        break;
      case 'chat/send':
        log.info(`User: ${msg.payload.text}${msg.payload.images?.length ? ` [+${msg.payload.images.length} images]` : ''}`);
        this.handleChatSend(msg.payload.text, msg.payload.images);
        break;
      case 'chat/cancel':
        this.chatController.cancel();
        break;

      // Settings handlers
      case 'settings/getProviders': {
        const allConfig = await this.configManager.getAllProvidersConfig();
        this.postMessage({ type: 'settings/providers', payload: allConfig });
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
        await this.configManager.setActiveProvider(msg.payload.providerId, msg.payload.model);
        const config = this.configManager.getConfig();
        this.postMessage({
          type: 'init',
          payload: {
            theme: vscode.window.activeColorTheme.kind === 1 ? 'light' : 'dark',
            config: { provider: config.provider, model: config.model },
          },
        });
        const updatedConfig = await this.configManager.getAllProvidersConfig();
        this.postMessage({ type: 'settings/providers', payload: updatedConfig });
        break;
      }
      case 'settings/testProvider': {
        await this.handleTestProvider(msg.payload.providerId);
        break;
      }
      case 'settings/open':
        break;
    }
  }

  clearHistory() {
    this.chatController.clearHistory();
    this.postMessage({ type: 'chat/clear' });
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
      for await (const chunk of this.chatController.sendMessage(text, images)) {
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
      const distUri = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
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
