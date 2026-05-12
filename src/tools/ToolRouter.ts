import * as vscode from 'vscode';
import { ConfigStore } from '../storage/ConfigStore';
import { FileTools } from './FileTools';
import { CommandStore } from './CommandStore';
import { DiffTools } from './DiffTools';
import { GitTools } from './GitTools';
import { PatchStore } from './PatchStore';
import { PatchTools } from './PatchTools';
import { SearchTools } from './SearchTools';
import { TerminalTools } from './TerminalTools';
import { createToolErrorResponse, ToolCallRequest, ToolCallResponse, ToolError } from './ToolTypes';
import { WorkspaceGuard } from './WorkspaceGuard';

export class ToolRouter {
  private readonly fileTools: FileTools;
  private readonly searchTools: SearchTools;
  private readonly patchTools: PatchTools;
  private readonly terminalTools: TerminalTools;
  private readonly gitTools: GitTools;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
    private readonly config: ConfigStore,
    patchStore = new PatchStore(),
    commandStore = new CommandStore()
  ) {
    const workspaceGuard = new WorkspaceGuard();
    const diffTools = new DiffTools(context);
    this.fileTools = new FileTools(config, workspaceGuard);
    this.searchTools = new SearchTools(config, workspaceGuard);
    this.patchTools = new PatchTools(config, workspaceGuard, diffTools, patchStore);
    this.terminalTools = new TerminalTools(config, workspaceGuard, commandStore);
    this.gitTools = new GitTools(workspaceGuard);
  }

  async handleToolCall(request: ToolCallRequest): Promise<ToolCallResponse> {
    try {
      const args = request.args ?? {};
      switch (request.tool) {
        case 'list_files':
          return this.success(await this.fileTools.listFiles({
            dir: this.getString(args, 'dir') || '.',
            maxFiles: this.getNumber(args, 'maxFiles'),
            includeHidden: args.includeHidden === true
          }));
        case 'read_file':
          return this.success(await this.fileTools.readFile(this.getRequiredString(args, 'path'), {
            maxBytes: this.getNumber(args, 'maxBytes')
          }));
        case 'search_code':
          return this.success(await this.searchTools.searchCode(this.getRequiredString(args, 'query'), {
            dir: this.getString(args, 'dir') || '.',
            maxResults: this.getNumber(args, 'maxResults'),
            includeHidden: args.includeHidden === true
          }));
        case 'propose_patch':
          return this.success(await this.patchTools.proposePatch(args));
        case 'open_diff':
          return this.success(await this.patchTools.openPatchDiff(this.getString(args, 'patchId') || undefined));
        case 'apply_patch':
          return this.success(await this.patchTools.applyPatch(this.getString(args, 'patchId') || undefined));
        case 'reject_patch':
          return this.success(await this.patchTools.rejectPatch(
            this.getString(args, 'patchId') || undefined,
            this.getString(args, 'reason') || undefined
          ));
        case 'run_command':
          return this.success({
            ok: true,
            message: 'Command approval required',
            command: await this.terminalTools.requestRunCommand(
              this.getRequiredString(args, 'command'),
              this.getString(args, 'reason') || undefined
            ),
            approvalRequired: true
          });
        case 'git_status':
          return this.success(await this.gitTools.gitStatus());
        case 'git_diff':
          return this.success(await this.gitTools.gitDiff({
            cached: args.cached === true,
            path: this.getString(args, 'path') || undefined,
            maxBytes: this.getNumber(args, 'maxBytes')
          }));
        default:
          return {
            ok: false,
            error: {
              code: 'UNKNOWN_TOOL',
              message: `Unknown tool: ${request.tool}`
            }
          };
      }
    } catch (error) {
      this.output.appendLine(`[tool-router] ${request.tool} failed: ${error instanceof Error ? error.message : String(error)}`);
      return createToolErrorResponse(error);
    }
  }

  async handle(url: string, body: unknown): Promise<ToolCallResponse> {
    if (url === '/tools/call') {
      return this.handleToolCall(this.normalizeToolCallRequest(body));
    }

    const legacyTool = url.replace('/tools/', '').replace(/^\//, '');
    return this.handleToolCall({
      tool: legacyTool,
      args: body && typeof body === 'object' ? body as Record<string, unknown> : {}
    });
  }

  private normalizeToolCallRequest(body: unknown): ToolCallRequest {
    if (!body || typeof body !== 'object') {
      throw new ToolError('TOOL_CALL_FAILED', 'Tool call body must be an object.');
    }
    const value = body as { tool?: unknown; args?: unknown };
    if (typeof value.tool !== 'string' || !value.tool.trim()) {
      throw new ToolError('UNKNOWN_TOOL', 'Unknown tool: ');
    }
    return {
      tool: value.tool,
      args: value.args && typeof value.args === 'object'
        ? value.args as Record<string, unknown>
        : {}
    };
  }

  private success(data: unknown): ToolCallResponse {
    return {
      ok: true,
      data
    };
  }

  private getRequiredString(args: Record<string, unknown>, key: string): string {
    const value = this.getString(args, key);
    if (!value) {
      throw new ToolError('TOOL_CALL_FAILED', `Tool argument is required: ${key}`);
    }
    return value;
  }

  private getString(args: Record<string, unknown>, key: string): string {
    const value = args[key];
    return typeof value === 'string' ? value : '';
  }

  private getNumber(args: Record<string, unknown>, key: string): number | undefined {
    const value = args[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : undefined;
    }
    return undefined;
  }
}
