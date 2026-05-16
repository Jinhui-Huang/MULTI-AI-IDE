import * as vscode from 'vscode';
import { ConfigStore } from '../storage/ConfigStore';

export class ExtensionApiClient {
  constructor(
    private readonly config: ConfigStore,
    private readonly output: vscode.OutputChannel
  ) {}

  baseUrl(): string {
    return 'http://127.0.0.1:8765';
  }

  async health(serviceUrl = this.baseUrl()): Promise<unknown> {
    return this.request('GET', `${serviceUrl.replace(/\/$/, '')}/api/runtime/health`, undefined, 3000);
  }

  async createTask(serviceUrl: string, payload: unknown): Promise<unknown> {
    return this.request('POST', `${serviceUrl.replace(/\/$/, '')}/api/tasks`, payload, 5000);
  }

  async getTask(serviceUrl: string, taskId: string): Promise<unknown> {
    return this.request('GET', `${serviceUrl.replace(/\/$/, '')}/api/tasks/${encodeURIComponent(taskId)}`, undefined, 5000);
  }

  async toolHealth(serviceUrl: string): Promise<unknown> {
    return this.request('GET', `${serviceUrl.replace(/\/$/, '')}/api/tools/health`, undefined, 5000);
  }

  async callToolViaService(serviceUrl: string, payload: unknown): Promise<unknown> {
    return this.request('POST', `${serviceUrl.replace(/\/$/, '')}/api/tools/call`, payload, 5000);
  }

  async getModelConfigSafe(serviceUrl: string): Promise<unknown> {
    return this.request('GET', `${serviceUrl.replace(/\/$/, '')}/api/model/config-safe`, undefined, 5000);
  }

  async modelHealth(serviceUrl: string): Promise<unknown> {
    return this.request('POST', `${serviceUrl.replace(/\/$/, '')}/api/model/health`, { message: 'ping' }, 20000);
  }

  async runAgentOnce(serviceUrl: string, payload: unknown): Promise<unknown> {
    return this.request('POST', `${serviceUrl.replace(/\/$/, '')}/api/agent/run-once`, payload, 60000);
  }

  async runAgentWithTools(serviceUrl: string, payload: unknown): Promise<unknown> {
    return this.request('POST', `${serviceUrl.replace(/\/$/, '')}/api/agent/run-with-tools`, payload, 120000);
  }

  async runAgentSequence(serviceUrl: string, payload: unknown): Promise<unknown> {
    return this.request('POST', `${serviceUrl.replace(/\/$/, '')}/api/agent/run-sequence`, payload, 180000);
  }

  async get(path: string): Promise<unknown> {
    return this.request('GET', this.toUrl(path));
  }

  async post(path: string, body?: unknown): Promise<unknown> {
    return this.request('POST', this.toUrl(path), body);
  }

  async put(path: string, body?: unknown): Promise<unknown> {
    return this.request('PUT', this.toUrl(path), body);
  }

  private async request(method: string, url: string, body?: unknown, timeoutMs = 3000): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Session': await this.config.getSessionToken()
        },
        body: method === 'GET' ? undefined : JSON.stringify(body ?? {})
      });

      if (!response.ok) {
        throw new Error(`${method} ${url} failed: ${response.status} ${await response.text()}`);
      }

      return response.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`[api] ${method} ${url} failed: ${message}`);
      throw new Error(message);
    } finally {
      clearTimeout(timeout);
    }
  }

  private toUrl(path: string): string {
    if (/^https?:\/\//.test(path)) {
      return path;
    }
    return `${this.baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  }
}
