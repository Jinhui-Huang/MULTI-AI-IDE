import * as vscode from 'vscode';
import { MessageDispatcher } from './MessageDispatcher';
import { WebviewHtmlBuilder } from './WebviewHtmlBuilder';

export class AgentControlPanel {
  private panel?: vscode.WebviewPanel;
  private readonly dispatcher: MessageDispatcher;
  private readonly htmlBuilder: WebviewHtmlBuilder;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel
  ) {
    this.dispatcher = new MessageDispatcher(output);
    this.htmlBuilder = new WebviewHtmlBuilder(context.extensionUri, output);
  }

  async open(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const mediaUri = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    const panel = vscode.window.createWebviewPanel(
      'autogenAgent.controlPanelPanel',
      'AutoGen Control',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [mediaUri]
      }
    );
    this.panel = panel;
    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'icon.svg');
    panel.onDidDispose(() => {
      this.panel = undefined;
    }, null, this.context.subscriptions);
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      try {
        const response = await this.dispatcher.dispatch(message);
        await panel.webview.postMessage(response);
      } catch (err: unknown) {
        const requestId = this.getRequestId(message);
        await panel.webview.postMessage({
          ok: false,
          type: 'response.error',
          requestId,
          error: {
            code: 'EXTENSION_ERROR',
            message: err instanceof Error ? err.message : String(err)
          }
        });
      }
    }, null, this.context.subscriptions);

    try {
      panel.webview.html = await this.htmlBuilder.build(panel.webview);
      this.output.appendLine('[panel] webview html assigned');
    } catch (err: unknown) {
      this.output.appendLine(`[panel] Failed to build HTML: ${this.stringifyError(err)}`);
      panel.webview.html = this.htmlBuilder.getFallbackHtml(err);
    }
  }

  async postPlaceholderTaskCreate(userRequest: string): Promise<void> {
    await this.open();
    const response = this.dispatcher.createTaskPlaceholder({
      type: 'task.create',
      requestId: `command_${Date.now()}`,
      timestamp: Date.now(),
      payload: { userRequest }
    });
    await this.panel?.webview.postMessage(response);
  }

  private stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getRequestId(message: unknown): string | undefined {
    if (typeof message !== 'object' || message === null || !('requestId' in message)) {
      return undefined;
    }
    const requestId = (message as { requestId?: unknown }).requestId;
    return typeof requestId === 'string' ? requestId : undefined;
  }
}
