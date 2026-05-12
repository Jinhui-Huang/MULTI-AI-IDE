import * as vscode from 'vscode';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigStore } from '../storage/ConfigStore';
import { ExtensionApiClient } from './ExtensionApiClient';
import { WebSocketClient } from './WebSocketClient';

export interface RuntimeStatus {
  running: boolean;
  pid?: number;
  serviceUrl: string;
  message: string;
  health?: unknown;
}

export class RuntimeManagerError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'RuntimeManagerError';
  }
}

interface RuntimeSettings {
  pythonPath: string;
  host: string;
  port: number;
  serviceUrl: string;
}

export class RuntimeManager {
  private proc?: ChildProcessWithoutNullStreams;
  private lastSettings?: RuntimeSettings;
  private readonly apiClient: ExtensionApiClient;
  private readonly taskEventsClient = new WebSocketClient();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
    private readonly configStore: ConfigStore
  ) {
    this.apiClient = new ExtensionApiClient(configStore, output);
  }

  async ensureStarted(): Promise<void> {
    const status = await this.start();
    if (!status.running) {
      throw new Error(status.message);
    }
  }

  async start(): Promise<RuntimeStatus> {
    const settings = await this.getRuntimeSettings();
    this.lastSettings = settings;

    if (this.isRunning()) {
      return {
        running: true,
        pid: this.proc?.pid,
        serviceUrl: settings.serviceUrl,
        message: 'Runtime already running'
      };
    }

    const mainPath = path.join(this.context.extensionPath, 'agent-service', 'main.py');
    if (!fs.existsSync(mainPath)) {
      return this.createStatus(false, settings, `agent-service/main.py not found: ${mainPath}`);
    }

    try {
      const proc = spawn(settings.pythonPath, [
        mainPath,
        '--host',
        settings.host,
        '--port',
        String(settings.port)
      ], {
        cwd: this.context.extensionPath,
        stdio: 'pipe',
        shell: false
      });

      this.proc = proc;
      proc.stdout.on('data', (data: Buffer) => this.output.append(data.toString()));
      proc.stderr.on('data', (data: Buffer) => this.output.append(`[runtime stderr] ${data.toString()}`));
      proc.on('exit', (code) => {
        this.output.appendLine(`[runtime exited] ${code ?? 'unknown'}`);
        if (this.proc === proc) {
          this.proc = undefined;
        }
      });

      const spawnError = await this.waitForSpawnError(proc);
      if (spawnError) {
        this.proc = undefined;
        return this.createStatus(false, settings, spawnError);
      }

      const health = await this.waitForHealthy(settings.serviceUrl);
      if (health.ok) {
        return this.createStatus(true, settings, 'Runtime started', health.payload);
      }

      this.proc?.kill();
      this.proc = undefined;
      return this.createStatus(false, settings, health.message);
    } catch (error) {
      this.proc = undefined;
      return this.createStatus(false, settings, this.errorMessage(error));
    }
  }

  async stop(): Promise<RuntimeStatus> {
    const settings = this.lastSettings ?? await this.getRuntimeSettings();
    this.disconnectTaskEvents();
    if (!this.proc) {
      return this.createStatus(false, settings, 'Runtime stopped');
    }

    const proc = this.proc;
    this.proc = undefined;
    proc.kill();
    return this.createStatus(false, settings, 'Runtime stopped');
  }

  async restart(): Promise<RuntimeStatus> {
    await this.stop();
    return this.start();
  }

  async health(): Promise<RuntimeStatus> {
    const settings = this.lastSettings ?? await this.getRuntimeSettings();
    try {
      const health = await this.apiClient.health(settings.serviceUrl);
      return this.createStatus(true, settings, 'Runtime health checked', health);
    } catch (error) {
      return this.createStatus(this.isRunning(), settings, `Runtime health failed: ${this.errorMessage(error)}`);
    }
  }

  async getServiceUrl(): Promise<string> {
    const settings = this.lastSettings ?? await this.getRuntimeSettings();
    if (!settings.serviceUrl.trim()) {
      throw new RuntimeManagerError('SERVICE_URL_EMPTY', 'Runtime serviceUrl is empty.');
    }
    return settings.serviceUrl;
  }

  isRunning(): boolean {
    return this.proc !== undefined && this.proc.exitCode === null && !this.proc.killed;
  }

  async createTask(payload: unknown): Promise<unknown> {
    const serviceUrl = await this.getServiceUrl();
    if (!await this.canReachRuntime(serviceUrl)) {
      throw new RuntimeManagerError('RUNTIME_NOT_RUNNING', 'Runtime is not running. Please start Runtime first.');
    }
    return this.apiClient.createTask(serviceUrl, payload);
  }

  async getTask(taskId: string): Promise<unknown> {
    const serviceUrl = await this.getServiceUrl();
    if (!await this.canReachRuntime(serviceUrl)) {
      throw new RuntimeManagerError('RUNTIME_NOT_RUNNING', 'Runtime is not running. Please start Runtime first.');
    }
    return this.apiClient.getTask(serviceUrl, taskId);
  }

  async connectTaskEvents(taskId: string, onEvent: (event: unknown) => void, onError?: (error: Error) => void): Promise<void> {
    const serviceUrl = await this.getServiceUrl();
    if (!await this.canReachRuntime(serviceUrl)) {
      throw new RuntimeManagerError('RUNTIME_NOT_RUNNING', 'Runtime is not running. Please start Runtime first.');
    }
    this.taskEventsClient.connect(this.toWebSocketTaskUrl(serviceUrl, taskId), onEvent, onError);
  }

  disconnectTaskEvents(): void {
    this.taskEventsClient.close();
  }

  async dispose(): Promise<void> {
    this.disconnectTaskEvents();
    await this.stop();
  }

  private async getRuntimeSettings(): Promise<RuntimeSettings> {
    const settings = await this.configStore.loadSettings();
    const host = this.getString(settings, 'settings.host', '127.0.0.1');
    const port = this.getNumber(settings, 'settings.port', 8765);
    const defaultServiceUrl = `http://${host}:${port}`;
    return {
      pythonPath: this.getString(settings, 'settings.pythonPath', 'python') || 'python',
      host,
      port,
      serviceUrl: this.getString(settings, 'settings.serviceUrl', defaultServiceUrl) || defaultServiceUrl
    };
  }

  private waitForSpawnError(proc: ChildProcessWithoutNullStreams): Promise<string | undefined> {
    return new Promise((resolve) => {
      let settled = false;
      const done = (message?: string): void => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(message);
      };

      proc.once('error', (error) => done(this.errorMessage(error)));
      proc.once('exit', (code) => {
        if (code !== null && code !== 0) {
          done(`Runtime process exited early with code ${code}. The port may be occupied or Python dependencies may be missing.`);
        }
      });
      setTimeout(() => done(), 150);
    });
  }

  private async waitForHealthy(serviceUrl: string): Promise<{ ok: boolean; payload?: unknown; message: string }> {
    let lastError = 'Runtime health check timed out';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (!this.isRunning()) {
        return {
          ok: false,
          message: 'Runtime process stopped before health check completed. The port may be occupied or Python dependencies may be missing.'
        };
      }

      try {
        const payload = await this.apiClient.health(serviceUrl);
        return { ok: true, payload, message: 'Runtime healthy' };
      } catch (error) {
        lastError = this.errorMessage(error);
        await this.delay(300);
      }
    }
    return { ok: false, message: `Runtime health check failed: ${lastError}` };
  }

  private createStatus(
    running: boolean,
    settings: RuntimeSettings,
    message: string,
    health?: unknown
  ): RuntimeStatus {
    return {
      running,
      pid: running ? this.proc?.pid : undefined,
      serviceUrl: settings.serviceUrl,
      message,
      health
    };
  }

  private getString(settings: Record<string, unknown>, key: string, fallback: string): string {
    const value = settings[key];
    return typeof value === 'string' ? value : fallback;
  }

  private getNumber(settings: Record<string, unknown>, key: string, fallback: number): number {
    const value = settings[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private async canReachRuntime(serviceUrl: string): Promise<boolean> {
    if (this.isRunning()) {
      return true;
    }

    try {
      await this.apiClient.health(serviceUrl);
      return true;
    } catch {
      return false;
    }
  }

  private toWebSocketTaskUrl(serviceUrl: string, taskId: string): string {
    const baseUrl = serviceUrl.replace(/\/$/, '');
    const wsUrl = baseUrl.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
    return `${wsUrl}/ws/tasks/${encodeURIComponent(taskId)}`;
  }
}
