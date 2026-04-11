import * as vscode from 'vscode';

export interface AIAgentConfig {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey?: string;
}

export class ConfigManager {
  private static instance: ConfigManager;
  private context: vscode.ExtensionContext;
  private onChangeEmitter = new vscode.EventEmitter<AIAgentConfig>();

  public readonly onConfigChange = this.onChangeEmitter.event;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;

    // 监听配置变化
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('aiAgent')) {
        this.onChangeEmitter.fire(this.getConfig());
      }
    });
  }

  static initialize(context: vscode.ExtensionContext): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(context);
    }
    return ConfigManager.instance;
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      throw new Error('ConfigManager not initialized. Call initialize() first.');
    }
    return ConfigManager.instance;
  }

  getConfig(): AIAgentConfig {
    const cfg = vscode.workspace.getConfiguration('aiAgent');
    return {
      provider: cfg.get<string>('provider', 'anthropic'),
      model: cfg.get<string>('model', 'claude-sonnet-4-6'),
      baseUrl: cfg.get<string>('baseUrl', ''),
    };
  }

  async getApiKey(): Promise<string | undefined> {
    return await this.context.secrets.get('aiAgent.apiKey');
  }

  async setApiKey(key: string): Promise<void> {
    await this.context.secrets.store('aiAgent.apiKey', key);
    this.onChangeEmitter.fire(this.getConfig());
  }

  async deleteApiKey(): Promise<void> {
    await this.context.secrets.delete('aiAgent.apiKey');
    this.onChangeEmitter.fire(this.getConfig());
  }
}