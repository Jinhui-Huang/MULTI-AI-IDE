import * as vscode from 'vscode';
import { RuntimeManager } from '../runtime/RuntimeManager';
import { ExtensionApiClient } from '../runtime/ExtensionApiClient';
import { ConfigStore } from '../storage/ConfigStore';
import { SecretStore } from '../storage/SecretStore';
export interface WebviewMessage<T = any> { type: string; requestId?: string; payload?: T; timestamp?: number; }
export class MessageDispatcher {
  constructor(private context: vscode.ExtensionContext, private output: vscode.OutputChannel, private config: ConfigStore, private secret: SecretStore, private runtime: RuntimeManager, private api: ExtensionApiClient, private post: (m: unknown) => void) {}
  async handle(message: WebviewMessage): Promise<void> {
    this.output.appendLine('[webview] ' + message.type);
    switch (message.type) {
      case 'runtime.start': await this.runtime.start(); return this.ok(message, { started: true });
      case 'runtime.stop': await this.runtime.stop(); return this.ok(message, { stopped: true });
      case 'runtime.restart': await this.runtime.restart(); return this.ok(message, { restarted: true });
      case 'runtime.health': return this.ok(message, await this.api.health());
      case 'task.create': return this.createTask(message);
      case 'task.pause': return this.forward(message, 'POST', `/api/tasks/${(message.payload as any)?.taskId}/pause`);
      case 'task.resume': return this.forward(message, 'POST', `/api/tasks/${(message.payload as any)?.taskId}/resume`);
      case 'task.cancel': return this.forward(message, 'POST', `/api/tasks/${(message.payload as any)?.taskId}/cancel`);
      case 'plan.approve': return this.forward(message, 'POST', `/api/tasks/${(message.payload as any)?.taskId}/approve-plan`, message.payload);
      case 'patch.openDiff': return this.openDiff(message);
      case 'patch.apply': return this.forward(message, 'POST', `/api/tasks/${(message.payload as any)?.taskId}/apply-patch`, message.payload);
      case 'settings.save': await this.config.saveUiSettings(message.payload ?? {}); return this.ok(message, { saved: true });
      case 'settings.model.test': return this.forward(message, 'POST', '/api/settings/model/test', message.payload);
      case 'agent.save': return this.forward(message, 'PUT', '/api/agents/current', message.payload);
      case 'team.save': return this.forward(message, 'PUT', '/api/teams/current', message.payload);
      case 'tool.permissions.save': return this.forward(message, 'PUT', '/api/tools/permissions', message.payload);
      case 'workflow.save': return this.forward(message, 'PUT', '/api/workflows/current', message.payload);
      default: return this.post({ type: 'response.warn', requestId: message.requestId, payload: { message: 'Unhandled: ' + message.type }});
    }
  }
  private async createTask(message: WebviewMessage): Promise<void> { await this.runtime.ensureStarted(); const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath; const result = await this.api.request('POST', '/api/tasks', { ...(message.payload as any || {}), workspaceRoot }); this.post({ type: 'task.created', requestId: message.requestId, payload: result }); if (result?.taskId) this.api.connectTaskStream(result.taskId, e => this.post(e)); }
  private async openDiff(message: WebviewMessage): Promise<void> { const p: any = message.payload || {}; const patch = await this.api.request('GET', `/api/tasks/${p.taskId}/patches/${p.patchId}`); const doc = await vscode.workspace.openTextDocument({ content: patch?.patchText ?? '# no patch', language: 'diff' }); await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside }); this.ok(message, { opened: true }); }
  private async forward(message: WebviewMessage, method: string, path: string, body?: unknown): Promise<void> { this.ok(message, await this.api.request(method, path, body ?? message.payload)); }
  private ok(message: WebviewMessage, payload: unknown): void { this.post({ type: 'response.ok', requestId: message.requestId, payload }); }
}
