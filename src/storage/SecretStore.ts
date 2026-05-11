import * as vscode from 'vscode';

const API_KEY_SECRET_KEY = 'autogenAgent.apiKey';

export class SecretStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async saveApiKey(value: string): Promise<void> {
    if (!value.trim()) {
      return;
    }
    await this.context.secrets.store(API_KEY_SECRET_KEY, value);
  }

  async hasApiKey(): Promise<boolean> {
    const value = await this.getApiKey();
    return typeof value === 'string' && value.length > 0;
  }

  async deleteApiKey(): Promise<void> {
    await this.context.secrets.delete(API_KEY_SECRET_KEY);
  }

  async getApiKey(): Promise<string | undefined> {
    return this.context.secrets.get(API_KEY_SECRET_KEY);
  }

  async setApiKey(value: string): Promise<void> {
    await this.saveApiKey(value);
  }
}
