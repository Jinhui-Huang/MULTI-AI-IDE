import * as vscode from 'vscode';
export function buildCsp(webview: vscode.Webview): string {
  return [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${webview.cspSource} 'nonce-autogen'`,
    `font-src ${webview.cspSource}`
  ].join('; ');
}
