import * as vscode from 'vscode';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import { ConfigStore } from '../storage/ConfigStore';
import { SecretStore } from '../storage/SecretStore';
import { ToolServer } from '../tools/ToolServer';
export class RuntimeManager {
  private proc?: ChildProcessWithoutNullStreams;
  constructor(private context: vscode.ExtensionContext, private output: vscode.OutputChannel, private config: ConfigStore, private secret: SecretStore, private toolServer: ToolServer) {}
  async ensureStarted(): Promise<void> { if (!this.proc) await this.start(); }
  async start(): Promise<void> { if (this.proc) return; const c = vscode.workspace.getConfiguration('autogenAgent'); const python = c.get<string>('pythonPath') || 'python'; const main = path.join(this.context.extensionPath, 'agent-service', 'main.py'); const toolPort = await this.toolServer.start(); this.proc = spawn(python, [main], { cwd: path.dirname(main), env: { ...process.env, AGENT_SERVICE_PORT: String(c.get<number>('servicePort') || 8765), TOOL_SERVER_PORT: String(toolPort), AUTOGEN_RUNTIME_PROVIDER: c.get<string>('runtimeProvider') || 'autogen', AUTOGEN_BASE_URL: c.get<string>('baseUrl') || '', AUTOGEN_MODEL: c.get<string>('model') || 'gpt-4.1', AUTOGEN_FALLBACK_MODEL: c.get<string>('fallbackModel') || 'gpt-4.1-mini', OPENAI_API_KEY: await this.secret.getApiKey() || '', AGENT_SESSION_TOKEN: await this.config.getSessionToken() }}); this.proc.stdout.on('data', d => this.output.append(d.toString())); this.proc.stderr.on('data', d => this.output.append('[runtime stderr] ' + d.toString())); this.proc.on('exit', code => { this.output.appendLine('[runtime exited] ' + code); this.proc = undefined; }); }
  async stop(): Promise<void> { if (this.proc) { this.proc.kill(); this.proc = undefined; } await this.toolServer.stop(); }
  async restart(): Promise<void> { await this.stop(); await this.start(); }
}
