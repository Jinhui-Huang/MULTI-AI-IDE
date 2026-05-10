import * as vscode from 'vscode';
import { ConfigStore } from '../storage/ConfigStore';
export class ExtensionApiClient {
  constructor(private config: ConfigStore, private output: vscode.OutputChannel) {}
  baseUrl(): string { const c = vscode.workspace.getConfiguration('autogenAgent'); return `http://${c.get<string>('serviceHost') || '127.0.0.1'}:${c.get<number>('servicePort') || 8765}`; }
  async health(): Promise<any> { return this.request('GET', '/health'); }
  async request(method: string, path: string, body?: unknown): Promise<any> { const r = await fetch(this.baseUrl()+path, { method, headers: { 'Content-Type': 'application/json', 'X-Agent-Session': await this.config.getSessionToken() }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) }); if (!r.ok) throw new Error(`${method} ${path} failed: ${r.status} ${await r.text()}`); return r.json(); }
  connectTaskStream(taskId: string, onEvent: (event: unknown) => void): void { const ws = new WebSocket(this.baseUrl().replace('http://','ws://') + `/ws/tasks/${taskId}`); ws.onmessage = e => { try { onEvent(JSON.parse(e.data.toString())); } catch { onEvent({ type: 'raw', payload: e.data }); } }; ws.onopen = () => this.output.appendLine('[ws] connected ' + taskId); ws.onclose = () => this.output.appendLine('[ws] closed ' + taskId); }
}
