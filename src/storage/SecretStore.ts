import * as vscode from 'vscode';
const KEY = 'autogenAgent.apiKey';
export class SecretStore { constructor(private context: vscode.ExtensionContext) {} getApiKey(): Thenable<string | undefined> { return this.context.secrets.get(KEY); } setApiKey(v: string): Thenable<void> { return this.context.secrets.store(KEY, v); } deleteApiKey(): Thenable<void> { return this.context.secrets.delete(KEY); } }
