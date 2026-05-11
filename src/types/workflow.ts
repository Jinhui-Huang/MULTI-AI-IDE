export type WorkflowNodeType = 'agent' | 'human_approval' | 'condition' | 'tool' | 'summary';

export interface WorkflowNode {
  id: string;
  name: string;
  type: WorkflowNodeType;
  agentId?: string;
  inputFields: string[];
  outputFields: string[];
  onFailure: string;
  maxRetries: number;
  timeoutSeconds: number;
  enabled: boolean;
}

export interface WorkflowConfig {
  id: string;
  name: string;
  description: string;
  type: string;
  failureStrategy: string;
  retryLimit: number;
  nodeTimeoutSeconds: number;
  confirmPolicy: string;
  jsonVersion: number;
  default: boolean;
  enabled: boolean;
  nodes: WorkflowNode[];
  jsonPreview?: string;
}
