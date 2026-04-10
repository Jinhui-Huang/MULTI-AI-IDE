import * as vscode from 'vscode';

export function getConfig() {
  const cfg = vscode.workspace.getConfiguration('aiAgent');
  return {
    provider: cfg.get<string>('provider', 'anthropic'),
    model:    cfg.get<string>('model', 'claude-sonnet-4-6'),
    baseUrl:  cfg.get<string>('baseUrl', ''),
    // API key 存在 SecretStorage，此处不读取
  };
}