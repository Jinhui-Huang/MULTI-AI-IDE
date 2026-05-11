export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  description: string;
  model: string;
  temperature: number;
  maxTurns: number;
  maxToolCalls: number;
  timeoutSeconds: number;
  systemPrompt: string;
  responseFormat: 'text' | 'json' | 'json_schema' | 'markdown';
  stopCondition: string;
  outputJsonSchema: string;
  tools: AgentToolFlags;
  context: AgentContextFlags;
  enabled: boolean;
}

export interface AgentToolFlags {
  list_files: boolean;
  read_file: boolean;
  search_code: boolean;
  propose_patch: boolean;
  run_command: boolean;
  git_diff: boolean;
}

export interface AgentContextFlags {
  currentFile: boolean;
  selection: boolean;
  gitDiff: boolean;
  terminalError: boolean;
  projectSummary: boolean;
  ragResults: boolean;
}
