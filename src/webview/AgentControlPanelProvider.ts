import * as vscode from 'vscode';
import { ConfigStore } from '../storage/ConfigStore';
import { SecretStore } from '../storage/SecretStore';
import { MessageDispatcher } from './MessageDispatcher';
import { WebviewHtmlBuilder } from './WebviewHtmlBuilder';

export class AgentControlPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private readonly dispatcher: MessageDispatcher;
  private readonly htmlBuilder: WebviewHtmlBuilder;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel
  ) {
    this.dispatcher = new MessageDispatcher(output, new ConfigStore(context), new SecretStore(context));
    this.htmlBuilder = new WebviewHtmlBuilder(context.extensionUri, output);
  }

  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    this.log('resolveWebviewView called');
    this.view = view;
    const mediaUri = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaUri]
    };
    try {
      view.webview.html = await this.htmlBuilder.build(view.webview);
      this.log('webview html assigned');
    } catch (err: unknown) {
      this.log(`Failed to build HTML: ${this.stringifyError(err)}`);
      view.webview.html = this.htmlBuilder.getFallbackHtml(err);
    }
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
    if (!this.view) {
      void vscode.window.showInformationMessage('请先打开 AutoGen Control 面板');
      return;
    }

    const response = this.dispatcher.createTaskPlaceholder({
      type: 'task.create',
      requestId: `command_${Date.now()}`,
      timestamp: Date.now(),
      payload: { userRequest }
    });
    this.postMessage(response);
  }

  private stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private log(message: string): void {
    console.log(`[AutoGen Webview] ${message}`);
    this.output.appendLine(`[webview] ${message}`);
  }

  private getRequestId(message: unknown): string | undefined {
    if (typeof message !== 'object' || message === null || !('requestId' in message)) {
      return undefined;
    }
    const requestId = (message as { requestId?: unknown }).requestId;
    return typeof requestId === 'string' ? requestId : undefined;
  }
}
