import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { buildCsp } from './csp';
export function loadWebviewHtml(context: vscode.ExtensionContext, webview: vscode.Webview): string {
  const htmlPath = path.join(context.extensionPath, 'media', 'webview.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  const bridgeUri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'media', 'webview-bridge.js')));
  html = html.replace('</body>', `<script nonce="autogen">window.__AUTOGEN_BRIDGE__='${bridgeUri}';</script></body>`);
  return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" /><meta http-equiv="Content-Security-Policy" content="${buildCsp(webview)}">`);
}
