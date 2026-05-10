export interface ModelSettings {
  provider: 'openai-compatible' | 'openai' | 'azure-openai' | 'ollama' | 'mock';
  baseUrl?: string;
  model: string;
  fallbackModel?: string;
  apiKeySecretKey?: string;
  temperature?: number;
  maxTokens?: number;
}
export interface RuntimeSettings {
  runtimeProvider: 'autogen' | 'mock' | 'microsoft-agent-framework' | 'langgraph';
  serviceUrl: string;
  host: string;
  port: number;
  pythonPath: string;
  autogenPackage: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  workspaceStoragePath?: string;
  useSecretStorage: boolean;
}
export interface AppSettings { model: ModelSettings; runtime: RuntimeSettings; }
