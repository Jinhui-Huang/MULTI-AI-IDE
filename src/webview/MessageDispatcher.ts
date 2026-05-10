import * as vscode from 'vscode';

export interface TaskCreatePayload {
  userRequest?: string;
}

export interface WebviewMessage<T = unknown> {
  type: string;
  requestId?: string;
  payload?: T;
  timestamp?: number;
}

export interface WebviewResponse {
  ok: boolean;
  type: string;
  requestId?: string;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export class MessageDispatcher {
  constructor(private readonly output: vscode.OutputChannel) {}

  async dispatch(message: unknown): Promise<WebviewResponse> {
    if (!this.isWebviewMessage(message)) {
      return {
        ok: false,
        type: 'response.error',
        error: {
          code: 'INVALID_MESSAGE',
          message: 'Webview message must include a string type'
        }
      };
    }

    this.output.appendLine(`[webview] ${message.type}`);
    switch (message.type) {
      case 'task.create':
        return this.createTaskPlaceholder(message as WebviewMessage<TaskCreatePayload>);
      default:
        return {
          ok: false,
          type: 'response.error',
          requestId: message.requestId,
          error: {
            code: 'UNKNOWN_MESSAGE',
            message: `Unknown webview message type: ${message.type}`
          }
        };
    }
  }

  createTaskPlaceholder(message: WebviewMessage<TaskCreatePayload>): WebviewResponse {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return {
      ok: true,
      type: 'task.create.result',
      requestId: message.requestId,
      payload: {
        message: 'Task create placeholder received',
        userRequest: message.payload?.userRequest ?? '',
        workspaceRoot,
        receivedAt: new Date().toISOString()
      }
    };
  }

  private isWebviewMessage(message: unknown): message is WebviewMessage {
    return typeof message === 'object'
      && message !== null
      && 'type' in message
      && typeof (message as { type?: unknown }).type === 'string';
  }
}
