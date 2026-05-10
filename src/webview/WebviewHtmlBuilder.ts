import * as vscode from 'vscode';

export class WebviewHtmlBuilder {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly output: vscode.OutputChannel
  ) {}

  async build(webview: vscode.Webview): Promise<string> {
    const mediaUri = vscode.Uri.joinPath(this.extensionUri, 'media');
    const htmlUri = vscode.Uri.joinPath(mediaUri, 'webview.html');
    const cssFiles = [
      'base.css',
      'components.css',
      'tools.css',
      'run.css',
      'entities.css',
      'responsive.css'
    ];
    const scriptFiles = [
      vscode.Uri.joinPath(mediaUri, 'scripts', 'i18n.js'),
      vscode.Uri.joinPath(mediaUri, 'scripts', 'app.js'),
      vscode.Uri.joinPath(mediaUri, 'webview-bridge.js')
    ];
    const panelFiles = [
      ['PANEL_RUN', 'run.html'],
      ['PANEL_AGENTS', 'agents.html'],
      ['PANEL_TEAM', 'team.html'],
      ['PANEL_TOOLS', 'tools.html'],
      ['PANEL_WORKFLOW', 'workflow.html'],
      ['PANEL_SETTINGS', 'settings.html']
    ] as const;

    this.log(`loading html from: ${htmlUri.fsPath}`);
    let html = await this.readText(htmlUri);
    for (const [placeholderName, fileName] of panelFiles) {
      const panelHtml = await this.readText(vscode.Uri.joinPath(mediaUri, 'partials', fileName));
      html = this.replaceRequiredPlaceholder(html, `<!-- ${placeholderName} -->`, panelHtml);
    }

    const css = (
      await Promise.all(
        cssFiles.map((fileName) => this.readText(vscode.Uri.joinPath(mediaUri, 'styles', fileName)))
      )
    ).join('\n\n');
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const scriptTags = scriptFiles
      .map((scriptUri) => {
        const scriptWebviewUri = webview.asWebviewUri(scriptUri);
        this.log(`script uri created: ${scriptWebviewUri.toString()}`);
        return `<script nonce="${nonce}" src="${scriptWebviewUri}"></script>`;
      })
      .join('\n');

    const csp = `default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
    const styleTag = `<style nonce="${nonce}">\n${css}\n</style>`;

    const missingPlaceholders = [
      '<!-- CSP_PLACEHOLDER -->',
      '<!-- STYLE_PLACEHOLDER -->',
      '<!-- SCRIPT_PLACEHOLDER -->'
    ].filter((placeholder) => !html.includes(placeholder));

    if (missingPlaceholders.length > 0) {
      const message = `media/webview.html is missing placeholders: ${missingPlaceholders.join(', ')}`;
      console.warn(message);
      this.output.appendLine(`[webview] ${message}`);
      throw new Error(
        'media/webview.html must include CSP_PLACEHOLDER, STYLE_PLACEHOLDER, and SCRIPT_PLACEHOLDER comments'
      );
    }

    html = html.replace('<!-- CSP_PLACEHOLDER -->', cspMeta);
    html = html.replace('<!-- STYLE_PLACEHOLDER -->', styleTag);
    html = html.replace('<!-- SCRIPT_PLACEHOLDER -->', scriptTags);
    return html;
  }

  getFallbackHtml(error: unknown): string {
    const escaped = this.stringifyError(error)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 16px;
      background: #191817;
      color: #f4eee7;
      font-family: var(--vscode-font-family, sans-serif);
    }
    pre {
      white-space: pre-wrap;
      color: #e87979;
    }
  </style>
</head>
<body>
  <h2>AutoGen Webview failed to load</h2>
  <p>Error message:</p>
  <pre>${escaped}</pre>
</body>
</html>`;
  }

  private async readText(uri: vscode.Uri): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8');
  }

  private replaceRequiredPlaceholder(html: string, placeholder: string, replacement: string): string {
    if (!html.includes(placeholder)) {
      throw new Error(`media/webview.html is missing placeholder: ${placeholder}`);
    }
    return html.replace(placeholder, replacement);
  }

  private stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private log(message: string): void {
    console.log(`[AutoGen Webview] ${message}`);
    this.output.appendLine(`[webview] ${message}`);
  }
}
