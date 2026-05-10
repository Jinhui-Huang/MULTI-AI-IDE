import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RuntimeManager } from '../runtime/RuntimeManager';
import { ExtensionApiClient } from '../runtime/ExtensionApiClient';
import { ConfigStore } from '../storage/ConfigStore';
import { SecretStore } from '../storage/SecretStore';
import { MessageDispatcher } from './MessageDispatcher';
export class AgentControlPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private dispatcher: MessageDispatcher;
  constructor(private context: vscode.ExtensionContext, private output: vscode.OutputChannel, config: ConfigStore, secret: SecretStore, runtime: RuntimeManager, api: ExtensionApiClient) {
    this.dispatcher = new MessageDispatcher(context, output, config, secret, runtime, api, msg => this.postMessage(msg));
  }
  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')] };
    view.webview.html = await this.buildHtml(view.webview);
    view.webview.onDidReceiveMessage(async message => { try { await this.dispatcher.handle(message); } catch (err: any) { this.postMessage({ type: 'response.error', requestId: message?.requestId, error: { code: 'EXTENSION_ERROR', message: String(err?.message ?? err) }}); } });
  }
  postMessage(message: unknown): void { void this.view?.webview.postMessage(message); }
  private async buildHtml(webview: vscode.Webview): Promise<string> {
    const htmlPath = path.join(this.context.extensionPath, 'media', 'webview.html');
    let html = await fs.readFile(htmlPath, 'utf8');
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const bridge = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview-bridge.js'));
    const csp = "default-src 'none'; img-src " + webview.cspSource + " data:; style-src " + webview.cspSource + " 'unsafe-inline'; script-src 'nonce-" + nonce + "'; font-src " + webview.cspSource;
    html = html.replace('</head>', `<meta http-equiv="Content-Security-Policy" content="${csp}"></head>`);
    html = html.replace('</body>', `<script nonce="${nonce}" src="${bridge}"></script></body>`);
    return html;
  }
}
