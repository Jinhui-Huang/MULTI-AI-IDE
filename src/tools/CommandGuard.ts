import { ToolsConfig } from '../types/tool';
import { ToolError } from './ToolTypes';

const UNSAFE_TOKENS = ['&&', '||', ';', '|', '>>', '>', '<', '`'];
const SHELL_WRAPPERS = new Set(['powershell', 'powershell.exe', 'cmd', 'cmd.exe', 'bash', 'sh', 'sh.exe']);

export class CommandGuard {
  normalizeCommand(command: string): string {
    const normalized = (command || '').trim().replace(/\s+/g, ' ');
    if (!normalized) {
      throw new ToolError('COMMAND_EMPTY', 'Command is empty');
    }
    if (normalized.length > 500) {
      throw new ToolError('COMMAND_TOO_LONG', 'Command is too long');
    }
    if (/[\r\n]/.test(command)) {
      throw new ToolError('COMMAND_UNSAFE_SYNTAX', 'Command must not contain line breaks');
    }
    return normalized;
  }

  isBlocked(command: string, blocklist: string[]): boolean {
    const normalized = command.toLowerCase();
    const executable = this.getExecutable(command).toLowerCase();
    return blocklist.some((item) => {
      const blocked = item.trim().toLowerCase();
      return Boolean(blocked)
        && (normalized === blocked || normalized.startsWith(`${blocked} `) || executable === blocked);
    });
  }

  isAllowed(command: string, allowlist: string[]): boolean {
    return allowlist.some((item) => item.trim() === command);
  }

  assertCommandAllowed(command: string, toolsConfig: ToolsConfig): void {
    const normalized = this.normalizeCommand(command);
    this.assertSafeSyntax(normalized);

    if (this.isBlocked(normalized, toolsConfig.commandBlocklist)) {
      throw new ToolError('COMMAND_BLOCKED', `Command is blocked: ${normalized}`);
    }

    const parsed = this.parseCommand(normalized);
    if (SHELL_WRAPPERS.has(parsed.executable.toLowerCase()) && !this.isAllowed(normalized, toolsConfig.commandAllowlist)) {
      throw new ToolError('COMMAND_UNSAFE_SYNTAX', `Shell wrapper command is not allowed: ${parsed.executable}`);
    }

    if (!this.isAllowed(normalized, toolsConfig.commandAllowlist)) {
      throw new ToolError('COMMAND_NOT_ALLOWLISTED', `Command is not allowlisted: ${normalized}`);
    }
  }

  parseCommand(command: string): { executable: string; args: string[] } {
    const normalized = this.normalizeCommand(command);
    const parts = this.splitCommand(normalized);
    const executable = parts.shift();
    if (!executable) {
      throw new ToolError('COMMAND_EMPTY', 'Command is empty');
    }
    return { executable, args: parts };
  }

  private assertSafeSyntax(command: string): void {
    if (UNSAFE_TOKENS.some((token) => command.includes(token))) {
      throw new ToolError('COMMAND_UNSAFE_SYNTAX', `Command contains unsafe syntax: ${command}`);
    }
  }

  private getExecutable(command: string): string {
    try {
      return this.parseCommand(command).executable;
    } catch {
      return '';
    }
  }

  private splitCommand(command: string): string[] {
    const parts: string[] = [];
    let current = '';
    let quote: '"' | "'" | '' = '';

    for (let index = 0; index < command.length; index += 1) {
      const char = command[index];
      if ((char === '"' || char === "'") && !quote) {
        quote = char;
        continue;
      }
      if (char === quote) {
        quote = '';
        continue;
      }
      if (/\s/.test(char) && !quote) {
        if (current) {
          parts.push(current);
          current = '';
        }
        continue;
      }
      current += char;
    }

    if (quote) {
      throw new ToolError('COMMAND_UNSAFE_SYNTAX', 'Command contains an unterminated quote');
    }
    if (current) {
      parts.push(current);
    }
    return parts;
  }
}
