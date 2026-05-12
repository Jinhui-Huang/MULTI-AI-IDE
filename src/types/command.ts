export type CommandStatus = 'pending' | 'approved' | 'rejected' | 'running' | 'completed' | 'failed';

export interface PendingCommand {
  id: string;
  command: string;
  cwd: string;
  status: CommandStatus;
  createdAt: string;
  reason: string;
  source: string;
  rejectedReason?: string;
}

export interface CommandResult {
  id: string;
  command: string;
  cwd: string;
  status: CommandStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
}
