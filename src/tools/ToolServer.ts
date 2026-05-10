import * as vscode from 'vscode';
import * as http from 'http';
import { ToolRouter } from './ToolRouter';
import { ConfigStore } from '../storage/ConfigStore';
export class ToolServer {
  private server?: http.Server; private port?: number; private router: ToolRouter;
  constructor(private context: vscode.ExtensionContext, private output: vscode.OutputChannel, config: ConfigStore) { this.router = new ToolRouter(context, output, config); }
  async start(): Promise<number> { if (this.server && this.port) return this.port; const token = await new ConfigStore(this.context).getSessionToken(); this.server = http.createServer((req,res)=>{ if (req.headers['x-agent-session'] !== token) { res.writeHead(401); return res.end(JSON.stringify({error:'bad token'})); } const chunks: Buffer[]=[]; req.on('data', c=>chunks.push(Buffer.from(c))); req.on('end', async()=>{ try { const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; const result = await this.router.handle(req.url || '/', body); res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify(result)); } catch(e:any) { res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:String(e?.message ?? e)})); }}); }); await new Promise<void>(resolve => this.server!.listen(0, '127.0.0.1', () => resolve())); this.port = (this.server.address() as any).port; this.output.appendLine('[tool-server] ' + this.port); return this.port; }
  async stop(): Promise<void> { if (!this.server) return; await new Promise<void>(resolve => this.server!.close(()=>resolve())); this.server = undefined; this.port = undefined; }
  dispose(): void { void this.stop(); }
}
