import { CommandResult, CommandStatus, PendingCommand } from '../types/command';

export class CommandStore {
  private readonly commands = new Map<string, PendingCommand>();
  private readonly results = new Map<string, CommandResult>();

  createPendingCommand(input: {
    command: string;
    cwd: string;
    reason?: string;
    source?: string;
  }): PendingCommand {
    const command: PendingCommand = {
      id: this.createCommandId(),
      command: input.command,
      cwd: input.cwd,
      status: 'pending',
      createdAt: new Date().toISOString(),
      reason: input.reason || 'Command approval requested',
      source: input.source || 'run_command'
    };
    this.commands.set(command.id, command);
    return command;
  }

  getCommand(commandId: string): PendingCommand | undefined {
    return this.commands.get(commandId);
  }

  getLatestPendingCommand(): PendingCommand | undefined {
    return Array.from(this.commands.values()).reverse().find((command) => command.status === 'pending');
  }

  updateStatus(commandId: string, status: CommandStatus): PendingCommand {
    const command = this.commands.get(commandId);
    if (!command) {
      throw new Error('COMMAND_NOT_FOUND');
    }
    command.status = status;
    this.commands.set(commandId, command);
    return command;
  }

  saveResult(commandId: string, result: CommandResult): CommandResult {
    if (!this.commands.has(commandId)) {
      throw new Error('COMMAND_NOT_FOUND');
    }
    this.results.set(commandId, result);
    return result;
  }

  getResult(commandId: string): CommandResult | undefined {
    return this.results.get(commandId);
  }

  private createCommandId(): string {
    const random = Math.random().toString(36).slice(2, 8);
    return `cmd_${Date.now()}_${random}`;
  }
}
