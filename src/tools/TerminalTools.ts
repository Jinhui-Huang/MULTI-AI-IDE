import { spawn } from 'child_process';
import * as path from 'path';
import { ConfigStore } from '../storage/ConfigStore';
import { CommandResult, PendingCommand } from '../types/command';
import { CommandGuard } from './CommandGuard';
import { CommandStore } from './CommandStore';
import { ToolError } from './ToolTypes';
import { WorkspaceGuard } from './WorkspaceGuard';

const OUTPUT_LIMIT = 20000;
const COMMAND_TIMEOUT_MS = 60000;

export class TerminalTools {
  private readonly commandGuard = new CommandGuard();

  constructor(
    private readonly configStore: ConfigStore,
    private readonly workspaceGuard: WorkspaceGuard,
    private readonly commandStore: CommandStore
  ) {}

  async requestRunCommand(command: string, reason?: string): Promise<PendingCommand | CommandResult> {
    const cwd = this.workspaceGuard.requireWorkspaceRoot().fsPath;
    const normalized = this.commandGuard.normalizeCommand(command);
    const toolsConfig = await this.configStore.loadToolsConfig();
    this.commandGuard.assertCommandAllowed(normalized, toolsConfig);

    if (toolsConfig.globalSafety.confirmRunCommand !== false) {
      return this.commandStore.createPendingCommand({
        command: normalized,
        cwd,
        reason,
        source: 'run_command'
      });
    }

    return this.runCommandDirect(normalized);
  }

  async approveAndRun(commandId?: string): Promise<CommandResult> {
    const command = this.getCommandOrLatest(commandId);
    const toolsConfig = await this.configStore.loadToolsConfig();
    this.commandGuard.assertCommandAllowed(command.command, toolsConfig);
    this.commandStore.updateStatus(command.id, 'approved');
    this.commandStore.updateStatus(command.id, 'running');
    const result = await this.runCommandDirect(command.command, command.id);
    this.commandStore.updateStatus(command.id, result.status);
    return this.commandStore.saveResult(command.id, result);
  }

  async rejectCommand(commandId?: string, reason?: string): Promise<PendingCommand> {
    const command = this.getCommandOrLatest(commandId);
    command.rejectedReason = reason || 'User rejected';
    return this.commandStore.updateStatus(command.id, 'rejected');
  }

  async addCommandToAllowlist(commandId?: string): Promise<unknown> {
    const command = this.getCommandOrLatest(commandId);
    const toolsConfig = await this.configStore.loadToolsConfig();
    const allowlist = toolsConfig.commandAllowlist.includes(command.command)
      ? toolsConfig.commandAllowlist
      : [...toolsConfig.commandAllowlist, command.command];
    const nextConfig = await this.configStore.saveCommandAllowlist(allowlist);
    return {
      ok: true,
      message: 'Command added to allowlist',
      command,
      allowlist: nextConfig.commandAllowlist
    };
  }

  async runCommandDirect(command: string, commandId?: string): Promise<CommandResult> {
    const workspaceRoot = this.workspaceGuard.requireWorkspaceRoot();
    this.workspaceGuard.assertInsideWorkspace(workspaceRoot);
    const normalized = this.commandGuard.normalizeCommand(command);
    const parsed = this.commandGuard.parseCommand(normalized);
    const executable = this.resolveExecutable(parsed.executable);
    const startedAt = Date.now();

    return new Promise<CommandResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let truncated = false;
      let settled = false;
      const child = spawn(executable, parsed.args, {
        cwd: workspaceRoot.fsPath,
        shell: false,
        windowsHide: true
      });

      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        truncated = true;
        child.kill();
        settled = true;
        resolve({
          id: commandId || `cmd_direct_${Date.now()}`,
          command: normalized,
          cwd: workspaceRoot.fsPath,
          status: 'failed',
          exitCode: null,
          stdout,
          stderr: this.appendLimited(stderr, 'Command timed out.', OUTPUT_LIMIT),
          durationMs: Date.now() - startedAt,
          truncated
        });
      }, COMMAND_TIMEOUT_MS);

      child.stdout.on('data', (chunk) => {
        const result = this.appendOutput(stdout, chunk.toString('utf8'));
        stdout = result.value;
        truncated = truncated || result.truncated;
      });

      child.stderr.on('data', (chunk) => {
        const result = this.appendOutput(stderr, chunk.toString('utf8'));
        stderr = result.value;
        truncated = truncated || result.truncated;
      });

      child.on('error', (error) => {
        if (settled) {
          return;
        }
        clearTimeout(timeout);
        settled = true;
        resolve({
          id: commandId || `cmd_direct_${Date.now()}`,
          command: normalized,
          cwd: workspaceRoot.fsPath,
          status: 'failed',
          exitCode: null,
          stdout,
          stderr: this.appendLimited(stderr, error.message, OUTPUT_LIMIT),
          durationMs: Date.now() - startedAt,
          truncated
        });
      });

      child.on('close', (exitCode) => {
        if (settled) {
          return;
        }
        clearTimeout(timeout);
        settled = true;
        resolve({
          id: commandId || `cmd_direct_${Date.now()}`,
          command: normalized,
          cwd: workspaceRoot.fsPath,
          status: exitCode === 0 ? 'completed' : 'failed',
          exitCode,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
          truncated
        });
      });
    });
  }

  private getCommandOrLatest(commandId?: string): PendingCommand {
    const command = commandId ? this.commandStore.getCommand(commandId) : this.commandStore.getLatestPendingCommand();
    if (!command) {
      throw new ToolError('COMMAND_NOT_FOUND', 'Command not found');
    }
    return command;
  }

  private resolveExecutable(executable: string): string {
    if (process.platform !== 'win32' || path.extname(executable)) {
      return executable;
    }

    const mapping: Record<string, string> = {
      npm: 'npm.cmd',
      pnpm: 'pnpm.cmd',
      npx: 'npx.cmd',
      mvn: 'mvn.cmd',
      gradle: 'gradle.bat'
    };
    return mapping[executable.toLowerCase()] || executable;
  }

  private appendOutput(current: string, chunk: string): { value: string; truncated: boolean } {
    const next = current + chunk;
    if (next.length <= OUTPUT_LIMIT) {
      return { value: next, truncated: false };
    }
    return { value: next.slice(0, OUTPUT_LIMIT), truncated: true };
  }

  private appendLimited(current: string, message: string, maxLength: number): string {
    const separator = current && !current.endsWith('\n') ? '\n' : '';
    return (current + separator + message).slice(0, maxLength);
  }
}
