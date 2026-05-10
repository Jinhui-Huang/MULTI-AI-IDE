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
  private readonly placeholderActions = new Set([
    'task.create',
    'task.pause',
    'task.resume',
    'task.cancel',
    'task.rerunCurrentAgent',
    'task.switchAgent',
    'task.openHistory',
    'task.openContext',
    'task.copyLog',
    'task.userMessage',
    'plan.approve',
    'plan.revise',
    'plan.saveAsTemplate',
    'patch.openDiff',
    'patch.apply',
    'patch.reject',
    'patch.applyPartial',
    'patch.explain',
    'command.approveOnce',
    'command.addAllowlist',
    'command.reject',
    'agent.create',
    'agent.import',
    'agent.copy',
    'agent.disable',
    'agent.delete',
    'agent.reset',
    'agent.save',
    'agent.test',
    'team.create',
    'team.copy',
    'team.delete',
    'team.setDefault',
    'team.addAgent',
    'team.removeAgent',
    'team.moveAgentUp',
    'team.moveAgentDown',
    'team.save',
    'team.restoreDefault',
    'team.useTemplate',
    'tool.permission.save',
    'tool.permission.batchEdit',
    'tool.create',
    'tool.test',
    'tool.schema.save',
    'tool.allowlist.save',
    'tool.blocklist.save',
    'tool.sensitiveFiles.save',
    'tool.globalSafety.save',
    'workflow.save',
    'workflow.saveAsTemplate',
    'workflow.setDefault',
    'workflow.testRun',
    'workflow.exportJson',
    'workflow.importJson',
    'workflow.node.select',
    'workflow.node.edit',
    'workflow.node.addAfter',
    'workflow.node.moveUp',
    'workflow.node.moveDown',
    'workflow.node.delete',
    'workflow.node.addAgent',
    'workflow.node.addHumanApproval',
    'workflow.node.addCondition',
    'settings.save',
    'settings.testModel',
    'settings.import',
    'settings.export',
    'settings.restoreDefault',
    'settings.safety.save',
    'settings.runtime.save',
    'runtime.start',
    'runtime.stop',
    'runtime.restart',
    'runtime.health',
    'runtime.openLogs',
    'runtime.openConfigDir',
    'taskHistory.clear'
  ]);

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
    if (this.placeholderActions.has(message.type)) {
      return this.createPlaceholderResponse(message);
    }

    return {
      ok: false,
      type: 'error',
      requestId: message.requestId,
      error: {
        code: 'UNKNOWN_ACTION',
        message: `Unknown action: ${message.type}`
      }
    };
  }

  createTaskPlaceholder(message: WebviewMessage<TaskCreatePayload>): WebviewResponse {
    return this.createPlaceholderResponse(message);
  }

  private createPlaceholderResponse(message: WebviewMessage): WebviewResponse {
    return {
      ok: true,
      type: `${message.type}.result`,
      requestId: message.requestId,
      payload: {
        message: `Placeholder handled: ${message.type}`,
        receivedPayload: message.payload ?? {}
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
