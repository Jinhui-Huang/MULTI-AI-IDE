import * as vscode from 'vscode';
import * as fs from 'fs';
import { ExtToWebMsg, WebToExtMsg } from '../types/protocol';
import { createLogger } from '../core/logger';
import { ConfigManager } from '../core/config';

const log = createLogger('chatViewProvider');

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private configManager: ConfigManager;

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

  private handleMessage(msg: WebToExtMsg) {
    switch (msg.type) {
      case 'ready':
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
      case 'ping':
        log.info('Received ping from WebView');
        this.postMessage({ type: 'pong' });
        break;
      case 'chat/send':
        log.info(`User: ${msg.payload.text}`);
        // Phase 2: 接入 AI API
        break;
      case 'chat/cancel':
        break;
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const isDev = process.env.VITE_DEV === 'true';
    const nonce = getNonce();

    if (isDev) {
      // 开发模式：连接本地 Vite dev server
      const cspSource = webview.cspSource;
      return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}' http://localhost:5173 ws://localhost:5173 'unsafe-inline';" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="http://localhost:5173/@vite/client"></script>
  <script type="module" nonce="${nonce}" src="http://localhost:5173/src/main.tsx"></script>
</body>
</html>`;
    } else {
      // 生产模式：加载编译产物
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