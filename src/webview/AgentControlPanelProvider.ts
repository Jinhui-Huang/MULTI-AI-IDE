import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { MessageDispatcher } from './MessageDispatcher';

export class AgentControlPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private readonly dispatcher: MessageDispatcher;

  constructor(private readonly context: vscode.ExtensionContext, private readonly output: vscode.OutputChannel) {
    this.dispatcher = new MessageDispatcher(output);
  }

  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.context.extensionUri,
        vscode.Uri.joinPath(this.context.extensionUri, 'media')
      ]
    };
    view.webview.html = await this.buildHtml(view.webview);
    view.webview.onDidReceiveMessage(async (message: unknown) => {
      try {
        const response = await this.dispatcher.dispatch(message);
        await view.webview.postMessage(response);
      } catch (err: unknown) {
        const requestId = this.getRequestId(message);
        await view.webview.postMessage({
          ok: false,
          type: 'response.error',
          requestId,
          error: {
            code: 'EXTENSION_ERROR',
            message: err instanceof Error ? err.message : String(err)
          }
        });
      }
    });
  }

  postMessage(message: unknown): void {
    void this.view?.webview.postMessage(message);
  }

  postPlaceholderTaskCreate(userRequest: string): void {
    const response = this.dispatcher.createTaskPlaceholder({
      type: 'task.create',
      requestId: `command_${Date.now()}`,
      timestamp: Date.now(),
      payload: { userRequest }
    });
    this.postMessage(response);
  }

  private async buildHtml(webview: vscode.Webview): Promise<string> {
    const htmlUri = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview.html');
    let html = await fs.readFile(htmlUri.fsPath, 'utf8');
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const bridge = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview-bridge.js'));
    const csp = "default-src 'none'; img-src " + webview.cspSource + " data:; style-src " + webview.cspSource + " 'unsafe-inline'; script-src 'nonce-" + nonce + "'; font-src " + webview.cspSource;
    html = html.replace('</head>', `<meta http-equiv="Content-Security-Policy" content="${csp}"></head>`);
    html = html.replace('</body>', `<script nonce="${nonce}" src="${bridge}"></script></body>`);
    return html;
  }

  private getRequestId(message: unknown): string | undefined {
    if (typeof message !== 'object' || message === null || !('requestId' in message)) {
      return undefined;
    }
    const requestId = (message as { requestId?: unknown }).requestId;
    return typeof requestId === 'string' ? requestId : undefined;
  }
}
