# Phase 3 Implementation Plan: Dev Agent System (DAY 5-8)

## Overview
Phase 3 introduces autonomous Dev Agent capabilities with Tool Registry, Task Queue, and Agent Console. This bridges Phase 1-2 (Chat UI + Multi-Provider) with Phase 4-5 (Multi-Agent Orchestration).

---

## 1. Architecture & Core Concepts

### 1.1 Tool Registry Pattern
```typescript
// New file: ide/src/agent/toolRegistry.ts

interface ToolDefinition {
  id: string;                    // Unique identifier (e.g., "read_file", "exec_command")
  name: string;                  // Display name
  description: string;           // What it does (for AI context)
  parameters: ToolParameter[];   // Input schema
  execute: (params: Record<string, unknown>) => Promise<string>; // Implementation
}

interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  schema?: Record<string, unknown>; // JSON Schema for complex types
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool);
  }

  get(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  // Get tool descriptions formatted for AI context
  getToolsForPrompt(): string {
    return this.getAll()
      .map(t => `${t.id}: ${t.description}\nParameters: ${JSON.stringify(t.parameters)}`)
      .join('\n\n');
  }

  async execute(toolId: string, params: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(toolId);
    if (!tool) throw new Error(`Tool not found: ${toolId}`);
    return tool.execute(params);
  }
}
```

### 1.2 Task Queue Design
```typescript
// New file: ide/src/agent/taskQueue.ts

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface AgentTask {
  id: string;
  type: 'agent_run' | 'tool_execution' | 'verification';
  status: TaskStatus;
  parentTaskId?: string;              // For nested tasks
  objective: string;                  // What the task should accomplish
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: number;
  }>;
  toolCalls: Array<{
    id: string;
    toolId: string;
    params: Record<string, unknown>;
    result?: string;
    error?: string;
    timestamp: number;
  }>;
  result?: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  retries: number;
  maxRetries: number;
}

export class TaskQueue {
  private queue: AgentTask[] = [];
  private currentTask?: AgentTask;
  private listeners: ((task: AgentTask) => void)[] = [];

  enqueue(task: AgentTask): void {
    this.queue.push(task);
  }

  async execute(toolRegistry: ToolRegistry, chatController: ChatController): Promise<void> {
    while (this.queue.length > 0) {
      this.currentTask = this.queue.shift()!;
      this.currentTask.status = TaskStatus.RUNNING;
      this.currentTask.startedAt = Date.now();
      this.emit(this.currentTask);

      try {
        // Stream AI response for this task
        const systemPrompt = `You are a development agent. Use tools to accomplish tasks.
Available tools:\n${toolRegistry.getToolsForPrompt()}`;
        
        let assistantResponse = '';
        for await (const chunk of chatController.sendMessage(
          this.currentTask.objective,
          undefined,
          'claude',
          'claude-opus-4-6'
        )) {
          if (chunk.type === 'delta') {
            assistantResponse += chunk.content || '';
            this.currentTask.messages.push({
              role: 'assistant',
              content: chunk.content || '',
              timestamp: Date.now(),
            });
            this.emit(this.currentTask);
          }
        }

        // Parse tool calls from response (if any)
        await this.parseAndExecuteToolCalls(assistantResponse, toolRegistry);

        this.currentTask.status = TaskStatus.COMPLETED;
        this.currentTask.result = assistantResponse;
        this.currentTask.completedAt = Date.now();
      } catch (error) {
        this.currentTask.retries++;
        if (this.currentTask.retries < this.currentTask.maxRetries) {
          this.currentTask.status = TaskStatus.PENDING;
          this.queue.unshift(this.currentTask); // Re-queue
        } else {
          this.currentTask.status = TaskStatus.FAILED;
          this.currentTask.error = error instanceof Error ? error.message : String(error);
          this.currentTask.completedAt = Date.now();
        }
      }

      this.emit(this.currentTask);
    }
  }

  private async parseAndExecuteToolCalls(
    response: string,
    toolRegistry: ToolRegistry
  ): Promise<void> {
    // Parse XML-like tool calls from response
    // e.g., <tool id="read_file"><param name="path">/src/index.ts</param></tool>
    const toolCallPattern = /<tool\s+id="([^"]+)">([\s\S]*?)<\/tool>/g;
    let match;

    while ((match = toolCallPattern.exec(response)) !== null) {
      const toolId = match[1];
      const paramsXml = match[2];
      const params = this.parseToolParams(paramsXml);

      const toolCall = {
        id: `tool-${Date.now()}`,
        toolId,
        params,
        timestamp: Date.now(),
      };

      try {
        const result = await toolRegistry.execute(toolId, params);
        toolCall.result = result;
        this.currentTask!.messages.push({
          role: 'tool',
          content: `Tool ${toolId} result: ${result}`,
          timestamp: Date.now(),
        });
      } catch (error) {
        toolCall.error = error instanceof Error ? error.message : String(error);
        this.currentTask!.messages.push({
          role: 'tool',
          content: `Tool ${toolId} error: ${toolCall.error}`,
          timestamp: Date.now(),
        });
      }

      this.currentTask!.toolCalls.push(toolCall as any);
    }
  }

  private parseToolParams(xml: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    const paramPattern = /<param\s+name="([^"]+)">([^<]*)<\/param>/g;
    let match;

    while ((match = paramPattern.exec(xml)) !== null) {
      params[match[1]] = match[2];
    }

    return params;
  }

  on(listener: (task: AgentTask) => void): void {
    this.listeners.push(listener);
  }

  private emit(task: AgentTask): void {
    this.listeners.forEach(l => l(task));
  }

  getCurrentTask(): AgentTask | undefined {
    return this.currentTask;
  }

  getQueue(): AgentTask[] {
    return [...this.queue];
  }
}
```

---

## 2. Tool Definitions

### 2.1 File System Tools
```typescript
// New file: ide/src/agent/tools/fileTools.ts

import * as fs from 'fs';
import * as path from 'path';

export const readFileTool: ToolDefinition = {
  id: 'read_file',
  name: 'Read File',
  description: 'Read the contents of a file at the given path',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Absolute or relative file path',
      required: true,
    },
    {
      name: 'startLine',
      type: 'number',
      description: 'Optional: Start line number (1-indexed)',
      required: false,
    },
    {
      name: 'endLine',
      type: 'number',
      description: 'Optional: End line number (1-indexed)',
      required: false,
    },
  ],
  execute: async (params) => {
    const filePath = String(params.path);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    if (params.startLine || params.endLine) {
      const lines = content.split('\n');
      const start = (Number(params.startLine) || 1) - 1;
      const end = Number(params.endLine) || lines.length;
      return lines.slice(start, end).join('\n');
    }
    
    return content;
  },
};

export const writeFileTool: ToolDefinition = {
  id: 'write_file',
  name: 'Write File',
  description: 'Write or overwrite the contents of a file',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'File path',
      required: true,
    },
    {
      name: 'content',
      type: 'string',
      description: 'File contents to write',
      required: true,
    },
  ],
  execute: async (params) => {
    const filePath = String(params.path);
    fs.writeFileSync(filePath, String(params.content), 'utf-8');
    return `File written: ${filePath}`;
  },
};

export const listDirTool: ToolDefinition = {
  id: 'list_dir',
  name: 'List Directory',
  description: 'List files and subdirectories in a directory',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Directory path',
      required: true,
    },
  ],
  execute: async (params) => {
    const dirPath = String(params.path);
    const files = fs.readdirSync(dirPath);
    return files.join('\n');
  },
};
```

### 2.2 Command Execution Tools
```typescript
// New file: ide/src/agent/tools/execTools.ts

import { execSync } from 'child_process';

export const execCommandTool: ToolDefinition = {
  id: 'exec_command',
  name: 'Execute Command',
  description: 'Execute a shell command and return the output',
  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'Shell command to execute',
      required: true,
    },
    {
      name: 'cwd',
      type: 'string',
      description: 'Optional: Working directory',
      required: false,
    },
  ],
  execute: async (params) => {
    const command = String(params.command);
    const cwd = params.cwd ? String(params.cwd) : process.cwd();
    
    try {
      const output = execSync(command, { cwd, encoding: 'utf-8' });
      return output;
    } catch (error: any) {
      return `Command failed: ${error.message}\nStderr: ${error.stderr || ''}`;
    }
  },
};

export const runNpmTool: ToolDefinition = {
  id: 'run_npm',
  name: 'Run NPM Script',
  description: 'Run an npm script defined in package.json',
  parameters: [
    {
      name: 'script',
      type: 'string',
      description: 'Script name (e.g., "build", "test", "dev")',
      required: true,
    },
    {
      name: 'cwd',
      type: 'string',
      description: 'Optional: Working directory with package.json',
      required: false,
    },
  ],
  execute: async (params) => {
    const script = String(params.script);
    const cwd = params.cwd ? String(params.cwd) : process.cwd();
    
    try {
      const output = execSync(`npm run ${script}`, { cwd, encoding: 'utf-8' });
      return output;
    } catch (error: any) {
      return `npm script failed: ${error.message}`;
    }
  },
};
```

### 2.3 Git Tools
```typescript
// New file: ide/src/agent/tools/gitTools.ts

export const gitStatusTool: ToolDefinition = {
  id: 'git_status',
  name: 'Git Status',
  description: 'Get current git status',
  parameters: [
    {
      name: 'cwd',
      type: 'string',
      description: 'Repository root directory',
      required: false,
    },
  ],
  execute: async (params) => {
    const cwd = params.cwd ? String(params.cwd) : process.cwd();
    try {
      const output = execSync('git status --short', { cwd, encoding: 'utf-8' });
      return output;
    } catch (error: any) {
      return `Git status failed: ${error.message}`;
    }
  },
};

export const gitDiffTool: ToolDefinition = {
  id: 'git_diff',
  name: 'Git Diff',
  description: 'Show changes between commits, branches, or working tree',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Optional: File path to diff',
      required: false,
    },
    {
      name: 'staged',
      type: 'boolean',
      description: 'Show staged changes (default: false)',
      required: false,
    },
  ],
  execute: async (params) => {
    const path = params.path ? ` "${params.path}"` : '';
    const staged = params.staged ? ' --staged' : '';
    try {
      const output = execSync(`git diff${staged}${path}`, { encoding: 'utf-8' });
      return output;
    } catch (error: any) {
      return `Git diff failed: ${error.message}`;
    }
  },
};

export const gitCommitTool: ToolDefinition = {
  id: 'git_commit',
  name: 'Git Commit',
  description: 'Create a new commit with staged changes',
  parameters: [
    {
      name: 'message',
      type: 'string',
      description: 'Commit message',
      required: true,
    },
  ],
  execute: async (params) => {
    const message = String(params.message);
    try {
      execSync(`git add -A`);
      execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { encoding: 'utf-8' });
      return `Commit created: ${message}`;
    } catch (error: any) {
      return `Git commit failed: ${error.message}`;
    }
  },
};
```

---

## 3. Dev Agent Core

### 3.1 Dev Agent Class
```typescript
// New file: ide/src/agent/devAgent.ts

export class DevAgent {
  private taskQueue = new TaskQueue();
  private toolRegistry: ToolRegistry;
  private chatController: ChatController;
  private agentLogger = createLogger('DevAgent');

  constructor(toolRegistry: ToolRegistry, chatController: ChatController) {
    this.toolRegistry = toolRegistry;
    this.chatController = chatController;

    // Listen to task updates
    this.taskQueue.on((task) => {
      this.agentLogger.info(`Task ${task.id} status: ${task.status}`);
      // Emit to UI for Agent Console
      EventEmitter.getInstance().emit('agent:taskUpdate', task);
    });
  }

  async submitTask(objective: string): Promise<string> {
    const task: AgentTask = {
      id: `task-${Date.now()}`,
      type: 'agent_run',
      status: TaskStatus.PENDING,
      objective,
      messages: [
        {
          role: 'user',
          content: objective,
          timestamp: Date.now(),
        },
      ],
      toolCalls: [],
      result: undefined,
      error: undefined,
      createdAt: Date.now(),
      retries: 0,
      maxRetries: 3,
    };

    this.taskQueue.enqueue(task);
    await this.taskQueue.execute(this.toolRegistry, this.chatController);
    return task.result || task.error || 'Unknown result';
  }

  getCurrentTask(): AgentTask | undefined {
    return this.taskQueue.getCurrentTask();
  }

  getTaskQueue(): AgentTask[] {
    return this.taskQueue.getQueue();
  }
}
```

### 3.2 Agent Console UI
```typescript
// New file: ide/src/commands/agent.ts

import * as vscode from 'vscode';
import { DevAgent } from '../agent/devAgent';
import { ToolRegistry } from '../agent/toolRegistry';
import { ChatController } from '../chat/chatController';

export function registerAgentCommand(context: vscode.ExtensionContext) {
  const toolRegistry = new ToolRegistry();
  const chatController = new ChatController();
  const agent = new DevAgent(toolRegistry, chatController);

  context.subscriptions.push(
    vscode.commands.registerCommand('aiAgent.openConsole', async () => {
      const panel = vscode.window.createWebviewPanel(
        'agentConsole',
        'Agent Console',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      panel.webview.html = getAgentConsoleHtml(panel.webview);

      // Handle messages from WebView
      panel.webview.onDidReceiveMessage(async (message) => {
        if (message.type === 'submit_task') {
          const result = await agent.submitTask(message.objective);
          panel.webview.postMessage({
            type: 'task_result',
            result,
          });
        }
      });
    })
  );
}

function getAgentConsoleHtml(webview: vscode.Webview): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: monospace; padding: 20px; }
        .input-area { margin-bottom: 20px; }
        textarea { width: 100%; height: 100px; }
        button { padding: 8px 16px; }
        .task-list { margin-top: 20px; }
        .task-item { 
          border: 1px solid #ccc; 
          padding: 10px; 
          margin: 5px 0;
          border-radius: 4px;
        }
        .status-pending { background: #fff3cd; }
        .status-running { background: #d1ecf1; }
        .status-completed { background: #d4edda; }
        .status-failed { background: #f8d7da; }
      </style>
    </head>
    <body>
      <h1>Agent Console</h1>
      <div class="input-area">
        <textarea id="objective" placeholder="Enter task objective..."></textarea>
        <button onclick="submitTask()">Submit Task</button>
      </div>
      <div class="task-list" id="taskList"></div>
      <script>
        function submitTask() {
          const objective = document.getElementById('objective').value;
          window.vscode.postMessage({ type: 'submit_task', objective });
        }
        
        window.addEventListener('message', (e) => {
          if (e.data.type === 'task_result') {
            const taskList = document.getElementById('taskList');
            const taskDiv = document.createElement('div');
            taskDiv.className = 'task-item';
            taskDiv.textContent = e.data.result;
            taskList.appendChild(taskDiv);
          }
        });
      </script>
    </body>
    </html>
  `;
}
```

---

## 4. Integration Points

### 4.1 Extension Registration
Add to [ide/src/extension.ts](ide/src/extension.ts):
```typescript
import { registerAgentCommand } from './commands/agent';

export function activate(context: vscode.ExtensionContext) {
  // ... existing code ...
  
  // Register Dev Agent command
  registerAgentCommand(context);
}
```

### 4.2 Tool Registry Initialization
Add to [ide/src/extension.ts](ide/src/extension.ts):
```typescript
// Initialize tool registry with all tools
const toolRegistry = new ToolRegistry();

// File tools
toolRegistry.register(readFileTool);
toolRegistry.register(writeFileTool);
toolRegistry.register(listDirTool);

// Command tools
toolRegistry.register(execCommandTool);
toolRegistry.register(runNpmTool);

// Git tools
toolRegistry.register(gitStatusTool);
toolRegistry.register(gitDiffTool);
toolRegistry.register(gitCommitTool);
```

---

## 5. Timeline & Tasks (DAY 5-8)

### DAY 5: Tool Registry & File Tools
- [ ] Create `ide/src/agent/toolRegistry.ts` with ToolRegistry class
- [ ] Create `ide/src/agent/tools/fileTools.ts` with read_file, write_file, list_dir
- [ ] Unit tests for tool registry
- [ ] Integration with ChatController for tool descriptions in prompts

### DAY 6: Task Queue & Execution Engine
- [ ] Create `ide/src/agent/taskQueue.ts` with TaskQueue and AgentTask types
- [ ] Implement tool call parsing and execution in TaskQueue
- [ ] Create `ide/src/agent/tools/execTools.ts` with exec_command, run_npm
- [ ] Create `ide/src/agent/tools/gitTools.ts` with git operations
- [ ] Error handling and retry logic

### DAY 7: Dev Agent & Agent Console
- [ ] Create `ide/src/agent/devAgent.ts` with DevAgent class
- [ ] Create agent console WebView command
- [ ] Agent console UI with task display
- [ ] Real-time task status updates via event emitters
- [ ] WebView ↔ Extension message protocol for agent tasks

### DAY 8: Testing & Polish
- [ ] End-to-end testing: submit task → tool execution → result
- [ ] Test all tools with actual file/git operations
- [ ] Memory/performance optimization for long-running tasks
- [ ] Documentation and edge case handling
- [ ] Prepare for Phase 4 (PM Agent orchestration)

---

## 6. Key Design Decisions

1. **Tool Registry Pattern**: Decoupled tool definitions from execution logic, enabling easy addition of new tools and dynamic tool loading in Phase 4-5
   
2. **Task Queue**: Message-driven task execution allows Phase 4 PM Agent to enqueue tasks without tight coupling

3. **Tool Call Format**: XML-like syntax in AI responses is simple to parse and integrates with Anthropic Claude's native tool use patterns

4. **Local Tool Execution**: Tools run in the Node.js extension process (not in WebView) for file system and command access

5. **Event-Driven Updates**: UI updates via EventEmitter prevents blocking and scales to multi-agent scenarios in Phase 4-5

---

## 7. Future Considerations (Phase 4-5)

- **Blackboard for State Sharing**: TaskQueue will be extended to subscribe to Blackboard updates
- **PM Agent**: Will use TaskQueue to dispatch subtasks to Dev Agent
- **Tool Use Permissions**: Add permission checks before executing file/command tools
- **Tool Input Validation**: JSON Schema validation before tool execution
- **Context Window Management**: Trim task history when token count exceeds limits (similar to ChatController)
- **Persistence**: Save task history to disk for audit trails and replay capability
