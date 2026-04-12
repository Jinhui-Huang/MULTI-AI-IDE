import * as vscode from 'vscode';
import * as fs from 'fs';
import { ConfigManager } from '../core/config';
import { createLogger } from '../core/logger';

const log = createLogger('settingsPanel');

export class SettingsPanelProvider {
  private static currentPanel: SettingsPanelProvider | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.onDidReceiveMessage(async (msg: any) => {
      await this.handleMessage(msg);
    });

    this.panel.onDidDispose(() => {
      SettingsPanelProvider.currentPanel = undefined;
    });
  }

  private async handleMessage(msg: any) {
    switch (msg.type) {
      case 'ready':
        const config = await ConfigManager.getInstance().getAllProvidersConfig();
        this.panel.webview.postMessage({ type: 'settings/providers', payload: config });
        break;
      case 'settings/saveProvider':
        const providerData = { ...msg.payload };
        const realApiKey = providerData.apiKey;
        if (realApiKey && realApiKey !== '••••••••') {
          await ConfigManager.getInstance().setApiKeyForProvider(providerData.id, realApiKey);
        }
        providerData.apiKey = undefined;
        await ConfigManager.getInstance().saveProviderConfig(providerData);
        const updated = await ConfigManager.getInstance().getAllProvidersConfig();
        this.panel.webview.postMessage({ type: 'settings/providers', payload: updated });
        break;
      case 'settings/deleteProvider':
        await ConfigManager.getInstance().deleteProviderConfig(msg.payload.id);
        const updatedAfterDelete = await ConfigManager.getInstance().getAllProvidersConfig();
        this.panel.webview.postMessage({ type: 'settings/providers', payload: updatedAfterDelete });
        break;
      case 'settings/setActive':
        await ConfigManager.getInstance().setActiveProvider(msg.payload.providerId, msg.payload.model);
        const updatedConfig = await ConfigManager.getInstance().getAllProvidersConfig();
        this.panel.webview.postMessage({ type: 'settings/providers', payload: updatedConfig });
        break;
      case 'settings/getProviders':
        const allConfig = await ConfigManager.getInstance().getAllProvidersConfig();
        this.panel.webview.postMessage({ type: 'settings/providers', payload: allConfig });
        break;
    }
  }

  static async createOrShow(extensionUri: vscode.Uri) {
    if (SettingsPanelProvider.currentPanel) {
      SettingsPanelProvider.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'aiAgentSettings',
      'AI Agent Settings',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
      }
    );

    SettingsPanelProvider.currentPanel = new SettingsPanelProvider(panel, extensionUri);
    SettingsPanelProvider.currentPanel.updateWebviewContent();
  }

  private updateWebviewContent() {
    const isDev = process.env.VITE_DEV === 'true';
    const nonce = getNonce();

    if (isDev) {
      const cspSource = this.panel.webview.cspSource;
      this.panel.webview.html = `<!DOCTYPE html>
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
      const scriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'main.js'));
      const cssPath = vscode.Uri.joinPath(distUri, 'main.css');
      const hasCss = fs.existsSync(cssPath.fsPath);
      const styleTag = hasCss
        ? `<link rel="stylesheet" href="${this.panel.webview.asWebviewUri(cssPath)}" />`
        : '';

      this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${this.panel.webview.cspSource} 'unsafe-inline';
             img-src ${this.panel.webview.cspSource} data: blob:;
             script-src 'nonce-${nonce}';" />
  ${styleTag}
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    this.panel.webview.postMessage({ type: 'ready' });
  }
}

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
