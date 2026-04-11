import * as vscode from 'vscode';
import { ExtToWebMsg, WebToExtMsg } from '../types/protocol';
import { createLogger } from '../core/logger';

const log = createLogger('chatViewProvider');

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dist'),
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
        this.postMessage({
          type: 'init',
          payload: { theme: vscode.window.activeColorTheme.kind === 1 ? 'light' : 'dark' },
        });
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
    const distUri = vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dist');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'main.js'));
    const styleUri  = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'main.css'));
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}