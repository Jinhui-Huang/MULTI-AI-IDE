export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  description?: string;
  model: string;
  temperature?: number;
  maxTurns?: number;
  maxToolCalls?: number;
  timeoutSeconds?: number;
  systemPrompt: string;
  responseFormat?: 'text' | 'json' | 'markdown' | 'patch-json';
  stopCondition?: string;
  outputJsonSchema?: Record<string, unknown>;
  tools: string[];
  contextScope: string[];
  enabled: boolean;
}
