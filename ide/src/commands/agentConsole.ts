import * as vscode from 'vscode';
import { createLogger } from '../core/logger';
import { DevAgent } from '../agent/devAgent';
import { ToolRegistry } from '../agent/toolRegistry';
import { readFileTool, writeFileTool, listDirTool, deleteFileTool } from '../agent/tools/fileTools';
import { execCommandTool, runNpmTool, runPnpmTool } from '../agent/tools/execTools';
import { gitStatusTool, gitDiffTool, gitCommitTool, gitLogTool } from '../agent/tools/gitTools';

const log = createLogger('agentConsole');

let agentConsolePanel: vscode.WebviewPanel | undefined;
let devAgent: DevAgent | undefined;

export function registerAgentConsoleCommand(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('aiAgent.openAgentConsole', async () => {
      await openAgentConsole(context);
    })
  );

  log.info('Agent Console command registered');
}

async function openAgentConsole(context: vscode.ExtensionContext) {
  if (agentConsolePanel) {
    agentConsolePanel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  // Initialize chat controller for AI interactions
  const chatController = new ChatController();

  // Initialize auto code editor
  const autoCodeEditor = new AutoCodeEditor(chatController);

  // Track current active editor for code modifications
  let currentFilePath: string | undefined;
  const updateCurrentFile = () => {
    const editor = vscode.window.activeTextEditor;
    currentFilePath = editor?.document.uri.fsPath;
    if (currentFilePath) {
      log.info(`Current active file: ${currentFilePath}`);
      // Send current file info to WebView
      agentConsolePanel?.webview.postMessage({
        type: 'current_file_changed',
        filePath: currentFilePath,
        fileName: editor?.document.fileName,
      });
    }
  };

  // Listen to editor changes
  vscode.window.onDidChangeActiveTextEditor(updateCurrentFile, undefined, context.subscriptions);
  updateCurrentFile(); // Initial update

  // Initialize tool registry
  const toolRegistry = new ToolRegistry();

  // Register file tools
  toolRegistry.register(readFileTool);
  toolRegistry.register(writeFileTool);
  toolRegistry.register(listDirTool);
  toolRegistry.register(deleteFileTool);

  // Register execution tools
  toolRegistry.register(execCommandTool);
  toolRegistry.register(runNpmTool);
  toolRegistry.register(runPnpmTool);

  // Register git tools
  toolRegistry.register(gitStatusTool);
  toolRegistry.register(gitDiffTool);
  toolRegistry.register(gitCommitTool);
  toolRegistry.register(gitLogTool);

  // Initialize dev agent
  devAgent = new DevAgent(toolRegistry);

  // Listen to task updates
  devAgent.onTaskUpdate((task) => {
    if (agentConsolePanel) {
      agentConsolePanel.webview.postMessage({
        type: 'task_update',
        task,
      });
    }
  });

  // Create webview panel
  agentConsolePanel = vscode.window.createWebviewPanel(
    'agentConsole',
    'Agent Console',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [],
    }
  );

  agentConsolePanel.webview.html = getAgentConsoleHtml();

  // Handle messages from WebView
  agentConsolePanel.webview.onDidReceiveMessage(
    async (message) => {
      if (message.type === 'submit_task') {
        log.info(`Agent task submitted: ${message.objective}`);

        // Check if this is a code edit request
        if (AutoCodeEditor.isCodeEditRequest(message.objective)) {
          log.info('Detected code edit request, using AutoCodeEditor');
          try {
            // Pass current file path if available
            const editResult = await autoCodeEditor.editCode(
              message.objective,
              currentFilePath
            );
            agentConsolePanel?.webview.postMessage({
              type: 'code_edit_result',
              success: editResult.success,
              intent: editResult.intent,
              modification: editResult.modification,
              applyResult: editResult.applyResult,
              error: editResult.error,
            });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            agentConsolePanel?.webview.postMessage({
              type: 'code_edit_error',
              error: errorMsg,
            });
          }
        } else if (devAgent) {
          // Use regular task execution for non-code-edit requests
          try {
            const result = await devAgent.submitTask(message.objective);
            agentConsolePanel?.webview.postMessage({
              type: 'task_result',
              result,
            });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            agentConsolePanel?.webview.postMessage({
              type: 'task_error',
              error: errorMsg,
            });
          }
        }
      } else if (message.type === 'get_tools' && devAgent) {
        const tools = devAgent
          .getToolRegistry()
          .getAll()
          .map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
          }));
        agentConsolePanel?.webview.postMessage({
          type: 'tools_list',
          tools,
        });
      } else if (message.type === 'cancel_task' && devAgent) {
        const cancelled = devAgent.cancelTask(message.taskId);
        agentConsolePanel?.webview.postMessage({
          type: 'cancel_result',
          success: cancelled,
        });
      }
    },
    undefined,
    context.subscriptions
  );

  // Clean up on panel close
  agentConsolePanel.onDidDispose(
    () => {
      agentConsolePanel = undefined;
    },
    undefined,
    context.subscriptions
  );

  log.info('Agent Console panel opened');
}

function getAgentConsoleHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Console</title>
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
      font-size: 20px;
      margin-bottom: 16px;
      color: var(--vscode-terminal-ansiBrightBlue);
    }

    .section {
      margin-bottom: 24px;
    }

    .section-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--vscode-terminal-ansiBrightCyan);
    }

    .input-area {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 20px;
    }

    textarea {
      padding: 8px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      resize: vertical;
      min-height: 80px;
    }

    textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    button {
      padding: 8px 16px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: background-color 0.2s;
    }

    button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    button:active {
      background-color: var(--vscode-button-background);
    }

    .button-group {
      display: flex;
      gap: 8px;
    }

    .tools-list {
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 20px;
      max-height: 200px;
      overflow-y: auto;
    }

    .tool-item {
      padding: 6px;
      font-size: 12px;
      margin-bottom: 4px;
      background-color: var(--vscode-input-background);
      border-radius: 3px;
      border-left: 3px solid var(--vscode-terminal-ansiBrightGreen);
    }

    .tool-id {
      font-weight: 600;
      color: var(--vscode-terminal-ansiBrightGreen);
    }

    .tool-desc {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
    }

    .task-list {
      margin-top: 20px;
    }

    .task-item {
      border: 1px solid var(--vscode-panel-border);
      padding: 12px;
      margin-bottom: 8px;
      border-radius: 4px;
      background-color: var(--vscode-editor-background);
    }

    .task-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .task-id {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .task-status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 600;
    }

    .status-pending {
      background-color: var(--vscode-terminal-ansiBrightYellow);
      color: #000;
    }

    .status-running {
      background-color: var(--vscode-terminal-ansiBrightBlue);
      color: #fff;
    }

    .status-completed {
      background-color: var(--vscode-terminal-ansiBrightGreen);
      color: #000;
    }

    .status-failed {
      background-color: var(--vscode-terminal-ansiBrightRed);
      color: #fff;
    }

    .task-objective {
      font-size: 12px;
      margin-bottom: 8px;
      color: var(--vscode-editor-foreground);
      word-break: break-word;
    }

    .task-details {
      font-size: 11px;
      background-color: var(--vscode-input-background);
      padding: 8px;
      border-radius: 3px;
      margin-bottom: 8px;
      overflow-x: auto;
    }

    .task-tools {
      display: flex;
      gap: 4px;
      margin-top: 8px;
    }

    .task-cancel {
      padding: 4px 8px;
      font-size: 11px;
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .task-cancel:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
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
  <h1>⚙️ Agent Console</h1>

  <div class="section" id="currentFileSection" style="display: none;">
    <div class="section-title">📄 Current File</div>
    <div style="padding: 8px; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; font-size: 12px;">
      <div id="currentFileName" style="color: var(--vscode-terminal-ansiBrightCyan); font-weight: 600;"></div>
      <div id="currentFilePath" style="color: var(--vscode-descriptionForeground); font-size: 11px; margin-top: 4px;"></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Available Tools</div>
    <div class="tools-list" id="toolsList">
      <div class="empty-state">Loading tools...</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Submit Task</div>
    <div class="input-area">
      <textarea id="objective" placeholder="Enter task objective...
Example: Read the file src/index.ts and show me the first 10 lines"></textarea>
      <div class="button-group">
        <button onclick="submitTask()">📤 Submit Task</button>
        <button onclick="clearInput()">🗑️ Clear</button>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Task History</div>
    <div class="task-list" id="taskList">
      <div class="empty-state">No tasks yet</div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const tasks = new Map();

    function submitTask() {
      const objective = document.getElementById('objective').value.trim();
      if (!objective) {
        alert('Please enter a task objective');
        return;
      }
      vscode.postMessage({ type: 'submit_task', objective });
      document.getElementById('objective').value = '';
    }

    function clearInput() {
      document.getElementById('objective').value = '';
    }

    function cancelTask(taskId) {
      vscode.postMessage({ type: 'cancel_task', taskId });
    }

    function formatTimestamp(ms) {
      return new Date(ms).toLocaleTimeString();
    }

    function renderTaskItem(task) {
      const statusClass = \`status-\${task.status}\`;
      const html = \`
        <div class="task-header">
          <div class="task-id">Task: \${task.id.substr(0, 12)}...</div>
          <span class="task-status \${statusClass}">\${task.status.toUpperCase()}</span>
        </div>
        <div class="task-objective">\${escapeHtml(task.objective)}</div>
        <div class="task-details">
          <div>📝 Messages: \${task.messages.length}</div>
          <div>🔧 Tools: \${task.toolCalls.length}</div>
          <div>⏱️ Created: \${formatTimestamp(task.createdAt)}</div>
          \${task.startedAt ? \`<div>▶️ Started: \${formatTimestamp(task.startedAt)}</div>\` : ''}
          \${task.completedAt ? \`<div>✓ Completed: \${formatTimestamp(task.completedAt)}</div>\` : ''}
          \${task.error ? \`<div style="color: var(--vscode-terminal-ansiBrightRed);">❌ Error: \${escapeHtml(task.error)}</div>\` : ''}
        </div>
        \${task.result ? \`<div class="task-details" style="background-color: var(--vscode-terminal-ansiBrightGreen); color: #000; margin-top: 8px;">\${escapeHtml(task.result)}</div>\` : ''}
        \${task.status === 'running' ? \`<button class="task-cancel" onclick="cancelTask('\${task.id}')">⏹️ Cancel</button>\` : ''}
      \`;
      return html;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function updateTaskUI() {
      const taskList = document.getElementById('taskList');
      if (tasks.size === 0) {
        taskList.innerHTML = '<div class="empty-state">No tasks yet</div>';
      } else {
        taskList.innerHTML = Array.from(tasks.values())
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(task => \`<div class="task-item">\${renderTaskItem(task)}</div>\`)
          .join('');
      }
    }

    // Request tools list on load
    window.addEventListener('load', () => {
      vscode.postMessage({ type: 'get_tools' });
    });

    // Handle messages from extension
    window.addEventListener('message', (event) => {
      const message = event.data;

      if (message.type === 'current_file_changed') {
        const fileName = message.fileName || 'Unknown';
        const filePath = message.filePath || '';

        const section = document.getElementById('currentFileSection');
        const nameEl = document.getElementById('currentFileName');
        const pathEl = document.getElementById('currentFilePath');

        if (fileName && filePath) {
          section.style.display = 'block';
          nameEl.textContent = fileName;
          pathEl.textContent = filePath;

          // Update placeholder to show user can modify current file
          const textarea = document.getElementById('objective');
          if (textarea && !textarea.placeholder.includes('directly')) {
            textarea.placeholder = \`Modify the current file: \${fileName}
Example: "改这个代码，添加一个方法"
Or specify another file: "改 src/chat.ts，改 X"\`;
          }
        } else {
          section.style.display = 'none';
        }
      } else if (message.type === 'tools_list') {
        const toolsList = document.getElementById('toolsList');
        if (message.tools && message.tools.length > 0) {
          toolsList.innerHTML = message.tools
            .map(tool => \`
              <div class="tool-item">
                <div class="tool-id">\${tool.id}</div>
                <div class="tool-desc">\${tool.name}: \${tool.description}</div>
              </div>
            \`)
            .join('');
        } else {
          toolsList.innerHTML = '<div class="empty-state">No tools available</div>';
        }
      } else if (message.type === 'task_update') {
        tasks.set(message.task.id, message.task);
        updateTaskUI();
      } else if (message.type === 'task_result') {
        console.log('Task completed:', message.result);
      } else if (message.type === 'task_error') {
        console.error('Task error:', message.error);
        alert('Task error: ' + message.error);
      } else if (message.type === 'code_edit_result') {
        console.log('Code edit completed:', message);
        if (message.success) {
          const resultMsg = \`✅ Code modification successful!
Intent: \${message.intent?.action}
File: \${message.intent?.fileName}
Lines affected: \${message.applyResult?.affectedLines?.start}-\${message.applyResult?.affectedLines?.end}
Build result: \${message.applyResult?.buildResult?.success ? 'PASSED ✓' : 'FAILED ✗'}\`;
          alert(resultMsg);
        } else {
          alert('❌ Code modification failed: ' + message.error);
        }
      } else if (message.type === 'code_edit_error') {
        console.error('Code edit error:', message.error);
        alert('Code edit error: ' + message.error);
      }
    });

    // Update UI on initial load
    updateTaskUI();
  </script>
</body>
</html>`;
}
