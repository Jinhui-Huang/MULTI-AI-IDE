import * as vscode from 'vscode';
export class Logger {
  constructor(private readonly output: vscode.OutputChannel) {}
  debug(message: string, data?: unknown): void { this.write('DEBUG', message, data); }
  info(message: string, data?: unknown): void { this.write('INFO', message, data); }
  warn(message: string, data?: unknown): void { this.write('WARN', message, data); }
  error(message: string, data?: unknown): void { this.write('ERROR', message, data); }
  private write(level: string, message: string, data?: unknown): void {
    const line = `[${new Date().toISOString()}] [${level}] ${message}`;
    this.output.appendLine(data === undefined ? line : `${line} ${safeStringify(data)}`);
  }
}
function safeStringify(data: unknown): string {
  return JSON.stringify(data, (_k, v) => typeof v === 'string' && v.length > 2000 ? `${v.slice(0, 2000)}...` : v, 2);
}
