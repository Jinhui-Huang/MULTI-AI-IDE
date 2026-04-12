/**
 * Agent system types and interfaces
 */

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  schema?: Record<string, unknown>;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, unknown>) => Promise<string>;
}

export interface AgentTask {
  id: string;
  type: 'agent_run' | 'tool_execution' | 'verification';
  status: TaskStatus;
  parentTaskId?: string;
  objective: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: number;
  }>;
  toolCalls: Array<{
    id: string;
    toolId: string;
    params: Record<string, unknown>;
    result?: string;
    error?: string;
    timestamp: number;
  }>;
  result?: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  retries: number;
  maxRetries: number;
}

export type TaskEventListener = (task: AgentTask) => void;
