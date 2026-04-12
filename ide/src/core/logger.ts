import * as vscode from 'vscode';

const channel = vscode.window.createOutputChannel('AI Agent IDE');

export function createLogger(ns: string) {
  return {
    debug: (msg: string) => channel.appendLine(`[DEBUG][${ns}] ${msg}`),
    info: (msg: string) => channel.appendLine(`[INFO][${ns}] ${msg}`),
    warn: (msg: string) => channel.appendLine(`[WARN][${ns}] ${msg}`),
    error: (msg: string, err?: unknown) =>
      channel.appendLine(`[ERROR][${ns}] ${msg} ${err ?? ''}`),
  };
}