import * as vscode from 'vscode';
import type { ProviderConfig, AllProvidersConfig } from '../types/protocol';

export interface AIAgentConfig {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey?: string;
}

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    type: 'online',
    models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    defaultModel: 'claude-sonnet-4-6',
    enabled: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'online',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini'],
    defaultModel: 'gpt-4o',
    enabled: true,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    type: 'online',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    defaultModel: 'gemini-2.5-flash',
    enabled: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    type: 'local',
    baseUrl: 'http://localhost:11434/v1',
    models: ['qwen2.5-coder:7b', 'qwen2.5-coder:14b', 'llama2', 'mistral:7b'],
    defaultModel: 'qwen2.5-coder:7b',
    enabled: true,
  },
];

export class ConfigManager {
  private static instance: ConfigManager;
  private context: vscode.ExtensionContext;
  private onChangeEmitter = new vscode.EventEmitter<AIAgentConfig>();

  public readonly onConfigChange = this.onChangeEmitter.event;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;

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

  // --- Per-provider API Key management ---

  async getApiKeyForProvider(providerId: string): Promise<string | undefined> {
    return await this.context.secrets.get(`aiAgent.apiKey.${providerId}`);
  }

  async setApiKeyForProvider(providerId: string, key: string): Promise<void> {
    await this.context.secrets.store(`aiAgent.apiKey.${providerId}`, key);
    this.onChangeEmitter.fire(this.getConfig());
  }

  async deleteApiKeyForProvider(providerId: string): Promise<void> {
    await this.context.secrets.delete(`aiAgent.apiKey.${providerId}`);
  }

  // Legacy single key (for migration)
  async getApiKey(): Promise<string | undefined> {
    const activeProvider = this.getConfig().provider;
    return await this.getApiKeyForProvider(activeProvider);
  }

  async setApiKey(key: string): Promise<void> {
    const activeProvider = this.getConfig().provider;
    await this.setApiKeyForProvider(activeProvider, key);
  }

  // --- Provider configs ---

  async getProviderConfigs(): Promise<ProviderConfig[]> {
    const stored = this.context.globalState.get<ProviderConfig[]>('aiAgent.providers');
    if (!stored || stored.length === 0) {
      await this.context.globalState.update('aiAgent.providers', DEFAULT_PROVIDERS);
      return DEFAULT_PROVIDERS;
    }
    return stored;
  }

  async saveProviderConfig(provider: ProviderConfig): Promise<void> {
    const providers = await this.getProviderConfigs();
    const idx = providers.findIndex((p) => p.id === provider.id);
    if (idx >= 0) {
      providers[idx] = provider;
    } else {
      providers.push(provider);
    }
    await this.context.globalState.update('aiAgent.providers', providers);

    if (provider.apiKey) {
      await this.setApiKeyForProvider(provider.id, provider.apiKey);
    }

    this.onChangeEmitter.fire(this.getConfig());
  }

  async deleteProviderConfig(providerId: string): Promise<void> {
    const providers = await this.getProviderConfigs();
    const filtered = providers.filter((p) => p.id !== providerId);
    await this.context.globalState.update('aiAgent.providers', filtered);
    await this.deleteApiKeyForProvider(providerId);
  }

  async getAllProvidersConfig(): Promise<AllProvidersConfig> {
    const providers = await this.getProviderConfigs();
    const cfg = this.getConfig();

    const enriched: ProviderConfig[] = [];
    for (const p of providers) {
      const apiKey = p.type === 'online' ? await this.getApiKeyForProvider(p.id) : undefined;
      enriched.push({
        ...p,
        apiKey: apiKey ? '••••••••' : '',
      });
    }

    return {
      providers: enriched,
      activeProviderId: cfg.provider,
      activeModel: cfg.model,
    };
  }

  async setActiveProvider(providerId: string, model: string): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('aiAgent');
    await cfg.update('provider', providerId, vscode.ConfigurationTarget.Global);
    await cfg.update('model', model, vscode.ConfigurationTarget.Global);

    const providers = await this.getProviderConfigs();
    const provider = providers.find((p) => p.id === providerId);
    if (provider?.baseUrl) {
      await cfg.update('baseUrl', provider.baseUrl, vscode.ConfigurationTarget.Global);
    } else {
      await cfg.update('baseUrl', '', vscode.ConfigurationTarget.Global);
    }

    this.onChangeEmitter.fire(this.getConfig());
  }

  // --- System Prompt management ---

  async getSystemPrompt(): Promise<string> {
    const stored = this.context.globalState.get<string>('aiAgent.systemPrompt');
    return stored || 'You are a helpful AI assistant. Help the user with their coding questions and tasks.';
  }

  async setSystemPrompt(prompt: string): Promise<void> {
    await this.context.globalState.update('aiAgent.systemPrompt', prompt);
    this.onChangeEmitter.fire(this.getConfig());
  }

  // --- Migration from old single key ---

  async migrateOldApiKey(): Promise<void> {
    const oldKey = await this.context.secrets.get('aiAgent.apiKey');
    if (oldKey) {
      const provider = this.getConfig().provider;
      await this.setApiKeyForProvider(provider, oldKey);
      await this.context.secrets.delete('aiAgent.apiKey');
    }
  }
}
