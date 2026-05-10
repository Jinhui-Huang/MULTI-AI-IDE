import * as vscode from 'vscode';
import * as crypto from 'crypto';
export class ConfigStore {
  constructor(private context: vscode.ExtensionContext) {}
  async getSessionToken(): Promise<string> { let t = this.context.globalState.get<string>('sessionToken'); if (!t) { t = crypto.randomBytes(24).toString('hex'); await this.context.globalState.update('sessionToken', t); } return t; }
  async saveUiSettings(settings: any): Promise<void> { await this.context.globalState.update('uiSettings', settings); }
  getUiSettings(): any { return this.context.globalState.get('uiSettings') ?? {}; }
}
