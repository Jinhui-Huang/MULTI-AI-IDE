import * as vscode from 'vscode';
import { createLogger } from '../core/logger';
import { CodeEditAgent } from '../codeEdit/codeEditAgent';
import { ChatController } from '../chat/chatController';
import { ConfigManager } from '../core/config';

const log = createLogger('DevAgentPanel');

let devAgentPanel: vscode.WebviewPanel | undefined;
let codeEditAgent: CodeEditAgent | undefined;
let chatController: ChatController | undefined;

export function registerDevAgentPanelCommand(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('aiAgent.openDevAgentPanel', async () => {
      await openDevAgentPanel(context);
    })
  );

  log.info('Dev Agent Panel command registered');
}

async function openDevAgentPanel(context: vscode.ExtensionContext) {
  if (devAgentPanel) {
    devAgentPanel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  // 初始化代码编辑代理
  const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  chatController = new ChatController();
  codeEditAgent = new CodeEditAgent(projectRoot, chatController);
  const configManager = ConfigManager.getInstance();
  const config = configManager.getConfig();

  // 跟踪当前打开的文件
  let currentFilePath: string | undefined;
  const updateCurrentFile = () => {
    const editor = vscode.window.activeTextEditor;
    currentFilePath = editor?.document.uri.fsPath;
    if (currentFilePath && devAgentPanel) {
      devAgentPanel.webview.postMessage({
        type: 'current_file_changed',
        filePath: currentFilePath,
        fileName: editor?.document.fileName,
      });
    }
  };

  // 创建 WebView
  devAgentPanel = vscode.window.createWebviewPanel(
    'devAgentPanel',
    '🤖 Dev Agent',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [],
    }
  );

  devAgentPanel.webview.html = getDevAgentPanelHtml();

  // 监听编辑器变化
  vscode.window.onDidChangeActiveTextEditor(updateCurrentFile, undefined, context.subscriptions);
  updateCurrentFile(); // 初始更新

  // 处理 WebView 消息
  devAgentPanel.webview.onDidReceiveMessage(
    async (message) => {
      if (message.type === 'submit_request' && codeEditAgent) {
        log.info(`User request: ${message.request}`);

        try {
          // 发送开始消息
          devAgentPanel?.webview.postMessage({
            type: 'agent_start',
            message: '🤖 代码编辑代理启动中...',
          });

          // 处理请求
          const result = await codeEditAgent.analyze({
            userText: message.request,
            currentFilePath,
            provider: config.provider,
            model: config.model,
          });

          // 发送完成消息
          if (result.success) {
            devAgentPanel?.webview.postMessage({
              type: 'agent_result',
              success: true,
              output: `生成了 ${result.diffs?.length || 0} 个代码修改建议`,
            });
          } else {
            devAgentPanel?.webview.postMessage({
              type: 'agent_result',
              success: false,
              error: result.error,
            });
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          log.error(`Agent error: ${errorMsg}`);
          devAgentPanel?.webview.postMessage({
            type: 'agent_error',
            error: errorMsg,
          });
        }
      }
    },
    undefined,
    context.subscriptions
  );

  // 清理
  devAgentPanel.onDidDispose(
    () => {
      devAgentPanel = undefined;
      codeEditAgent = undefined;
      chatController = undefined;
    },
    undefined,
    context.subscriptions
  );

  log.info('Dev Agent Panel opened');
}

function getDevAgentPanelHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dev Agent</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      padding: 16px;
      line-height: 1.5;
    }

    h1 {
      font-size: 18px;
      margin-bottom: 16px;
      color: var(--vscode-terminal-ansiBrightGreen);
    }

    .section {
      margin-bottom: 20px;
    }

    .section-title {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--vscode-terminal-ansiBrightCyan);
      text-transform: uppercase;
    }

    .current-file {
      padding: 8px;
      background-color: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-size: 12px;
      margin-bottom: 12px;
    }

    .file-name {
      font-weight: 600;
      color: var(--vscode-terminal-ansiBrightYellow);
    }

    .file-path {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }

    textarea {
      width: 100%;
      padding: 8px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      resize: vertical;
      min-height: 80px;
      margin-bottom: 8px;
    }

    textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    .button-group {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }

    button {
      flex: 1;
      padding: 8px 16px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: background-color 0.2s;
    }

    button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .output {
      background-color: var(--vscode-input-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 12px;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      max-height: 400px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .message {
      padding: 8px;
      margin-bottom: 8px;
      border-left: 3px solid var(--vscode-terminal-ansiBrightBlue);
      background-color: var(--vscode-editor-background);
    }

    .message.error {
      border-left-color: var(--vscode-terminal-ansiBrightRed);
      color: var(--vscode-terminal-ansiBrightRed);
    }

    .message.success {
      border-left-color: var(--vscode-terminal-ansiBrightGreen);
      color: var(--vscode-terminal-ansiBrightGreen);
    }

    .message.info {
      border-left-color: var(--vscode-terminal-ansiBrightCyan);
      color: var(--vscode-terminal-ansiBrightCyan);
    }

    .loading {
      display: inline-block;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .empty-state {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      padding: 20px;
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>🤖 Dev Agent</h1>

  <div class="section">
    <div class="section-title">📄 Current File</div>
    <div id="currentFileSection" class="current-file" style="display: none;">
      <div class="file-name" id="currentFileName"></div>
      <div class="file-path" id="currentFilePath"></div>
    </div>
    <div class="empty-state" id="noFileMessage">Open a file to get started</div>
  </div>

  <div class="section">
    <div class="section-title">✍️ Request</div>
    <textarea id="request" placeholder="Tell me what you want to do...
Examples:
- 改这个文件，加个新方法
- 修改 taskQueue.ts，添加错误处理
- 执行 npm build 验证编译
- 为项目添加 TypeScript 配置"></textarea>
    <div class="button-group">
      <button id="submitBtn" onclick="submitRequest()">🚀 Send</button>
      <button onclick="clearInput()">🗑️ Clear</button>
    </div>
  </div>

  <div class="section">
    <div class="section-title">📋 Output</div>
    <div class="output" id="output">
      <div class="empty-state">Output will appear here...</div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let isProcessing = false;

    function submitRequest() {
      const request = document.getElementById('request').value.trim();
      if (!request) {
        alert('Please enter a request');
        return;
      }

      if (isProcessing) {
        alert('Agent is already processing, please wait');
        return;
      }

      isProcessing = true;
      updateSubmitButton();
      clearOutput();

      appendMessage('Agent processing...', 'info');
      vscode.postMessage({ type: 'submit_request', request });
    }

    function clearInput() {
      document.getElementById('request').value = '';
    }

    function clearOutput() {
      document.getElementById('output').innerHTML = '';
    }

    function appendMessage(text, type = 'info') {
      const output = document.getElementById('output');
      if (output.querySelector('.empty-state')) {
        output.innerHTML = '';
      }
      const div = document.createElement('div');
      div.className = \`message \${type}\`;
      div.textContent = text;
      output.appendChild(div);
      output.scrollTop = output.scrollHeight;
    }

    function updateSubmitButton() {
      const btn = document.getElementById('submitBtn');
      if (isProcessing) {
        btn.disabled = true;
        btn.textContent = '⏳ Processing...';
      } else {
        btn.disabled = false;
        btn.textContent = '🚀 Send';
      }
    }

    // Handle messages from extension
    window.addEventListener('message', (event) => {
      const message = event.data;

      if (message.type === 'current_file_changed') {
        const fileName = message.fileName || 'Unknown';
        const filePath = message.filePath || '';

        const section = document.getElementById('currentFileSection');
        const noFileMsg = document.getElementById('noFileMessage');

        if (fileName && filePath) {
          section.style.display = 'block';
          noFileMsg.style.display = 'none';
          document.getElementById('currentFileName').textContent = fileName;
          document.getElementById('currentFilePath').textContent = filePath;
        } else {
          section.style.display = 'none';
          noFileMsg.style.display = 'block';
        }
      } else if (message.type === 'agent_start') {
        appendMessage(message.message, 'info');
      } else if (message.type === 'agent_result') {
        if (message.success) {
          appendMessage('✅ Agent completed successfully', 'success');
          if (message.output) {
            appendMessage(message.output, 'info');
          }
        } else {
          appendMessage('❌ Agent failed', 'error');
          if (message.error) {
            appendMessage(message.error, 'error');
          }
        }
        isProcessing = false;
        updateSubmitButton();
      } else if (message.type === 'agent_error') {
        appendMessage(\`❌ Error: \${message.error}\`, 'error');
        isProcessing = false;
        updateSubmitButton();
      }
    });
  </script>
</body>
</html>`;
}
