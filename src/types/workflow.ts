export type WorkflowNodeType = 'agent' | 'team' | 'tool' | 'human_approval' | 'condition' | 'summary';
export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  agentId?: string;
  toolName?: string;
  inputKeys?: string[];
  outputKey?: string;
  requireApproval?: boolean;
  timeoutSeconds?: number;
  retryLimit?: number;
  onFailure?: string;
}
export interface WorkflowEdge { from: string; to: string; condition?: string; }
export interface WorkflowConfig {
  id: string;
  name: string;
  description?: string;
  version: string;
  defaultWorkflow?: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  failureStrategy: 'stop' | 'retry' | 'fallback' | 'ask_user';
  confirmPolicy: 'none' | 'plan' | 'patch' | 'command' | 'all';
}
