import * as http from 'http';
import * as vscode from 'vscode';
import { ConfigStore } from '../storage/ConfigStore';
import { ToolRouter } from './ToolRouter';

export class ToolServer {
  private server?: http.Server;
  private port?: number;
  private readonly router: ToolRouter;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
    config: ConfigStore
  ) {
    this.router = new ToolRouter(context, output, config);
  }

  async start(port = 18765): Promise<number> {
    if (this.server && this.port) {
      return this.port;
    }

    const token = await new ConfigStore(this.context).getSessionToken();
    this.server = http.createServer((request, response) => {
      void this.handleRequest(request, response, token);
    });
    await new Promise<void>((resolve) => {
      this.server!.listen(port, '127.0.0.1', () => resolve());
    });
    const address = this.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Tool server did not return a TCP address');
    }
    this.port = address.port;
    this.output.appendLine(`[tool-server] listening on 127.0.0.1:${this.port}`);
    return this.port;
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = undefined;
    this.port = undefined;
  }

  dispose(): void {
    void this.stop();
  }

  private async handleRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
    token: string
  ): Promise<void> {
    if (request.headers['x-agent-session'] !== token) {
      this.writeJson(response, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid session token' } });
      return;
    }

    if (request.method !== 'POST') {
      this.writeJson(response, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST is allowed' } });
      return;
    }

    if ((request.url ?? '').split('?')[0] !== '/tools/call') {
      this.writeJson(response, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown tool endpoint' } });
      return;
    }

    try {
      const body = await this.readJsonBody(request);
      const result = await this.router.handleToolCall(body);
      this.writeJson(response, 200, result);
    } catch (error) {
      this.writeJson(response, 400, {
        ok: false,
        error: {
          code: 'BAD_JSON',
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  private readJsonBody(request: http.IncomingMessage): Promise<{ tool: string; args?: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('error', reject);
      request.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve(text ? JSON.parse(text) : {});
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private writeJson(response: http.ServerResponse, statusCode: number, payload: unknown): void {
    response.writeHead(statusCode, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload));
  }
}
