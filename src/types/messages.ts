export type MessageDirection = 'webview-to-extension' | 'extension-to-webview';

export interface BaseMessage<T = unknown> {
  id: string;
  type: string;
  direction?: MessageDirection;
  payload?: T;
  timestamp?: number;
}

export interface ExtensionResponse<T = unknown> {
  id: string;
  type: 'response.ok' | 'response.error';
  ok: boolean;
  payload?: T;
  error?: { code: string; message: string; details?: unknown };
  timestamp: number;
}

export interface StreamEvent<T = unknown> {
  seq: number;
  type: string;
  taskId?: string;
  payload?: T;
  timestamp: number;
}

export type WebviewCommand =
  | 'task.create' | 'task.pause' | 'task.resume' | 'task.cancel' | 'task.rerunCurrentAgent' | 'task.switchAgent' | 'task.userMessage'
  | 'plan.approve' | 'plan.revise'
  | 'patch.openDiff' | 'patch.apply' | 'patch.reject' | 'patch.applyPartial' | 'patch.explain'
  | 'command.approveOnce' | 'command.addAllowlist' | 'command.reject'
  | 'agent.create' | 'agent.save' | 'agent.copy' | 'agent.delete' | 'agent.disable' | 'agent.test'
  | 'team.create' | 'team.save' | 'team.copy' | 'team.delete' | 'team.setDefault'
  | 'tool.permission.save' | 'tool.registry.save' | 'tool.test' | 'tool.safety.save'
  | 'workflow.save' | 'workflow.testRun' | 'workflow.importJson' | 'workflow.exportJson' | 'workflow.setDefault'
  | 'settings.save' | 'settings.model.test' | 'runtime.start' | 'runtime.stop' | 'runtime.restart' | 'runtime.health';
