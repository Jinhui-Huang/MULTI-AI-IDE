# 03_Extension 与 AutoGen Service 通信接口详细设计

> 适用项目：AutoGen + VS Code 插件式多 Agent 代码 IDE  
> 文档范围：VS Code Extension Host（TypeScript/Node）与本地 Python AutoGen Service（FastAPI + WebSocket）之间的接口、协议、数据模型、错误处理、联调步骤。  
> 当前版本：v1.0  
> 生成时间：2026-05-10

---

## 0. 本文定位

前两份文档已经定义了：

- `01_VSCode插件前端Webview详细设计.md`：Webview UI 层怎么组织。
- `02_Webview与Extension通信协议详细设计.md`：Webview 和 VS Code Extension 怎么用 `postMessage` 通信。

本文继续往后一层，专门定义：

```text
VS Code Webview
    ↓ postMessage
VS Code Extension Host / Node
    ↓ HTTP + WebSocket
Python AutoGen Service
    ↓
AutoGen Agent / Team / WorkflowRunner / ToolGateway
```

也就是说，本文不再讨论 HTML UI 怎么画，而是讨论：

```text
Extension 收到 UI 事件后，
应该调用 AutoGen Service 的哪个接口，
请求体是什么，
返回体是什么，
实时事件怎么推送，
错误怎么处理，
如何和 VS Code 文件、Diff、Terminal、Git 工具联调。
```

---

## 1. 检索资料依据

### 1.1 AutoGen 官方资料

本文参考 AutoGen 官方 AgentChat 文档和 API 设计，主要依据如下：

1. AutoGen `AssistantAgent` 支持模型客户端、工具调用和 `run()` / `run_stream()` 执行方式。
2. AutoGen Agent 支持 streaming 模式，`run_stream()` 可以持续产出事件，最后返回 `TaskResult`。
3. AutoGen Teams 支持 `RoundRobinGroupChat`、`SelectorGroupChat` 等多 Agent team。
4. AutoGen tools 可以挂载到 Agent 上，由 Agent 通过 tool calling 调用。
5. AutoGen GitHub 当前已标注 maintenance mode，因此本文采用“AutoGen Service 隔离封装”的方式，降低未来迁移成本。

参考资料：

- AutoGen Agents 文档：https://microsoft.github.io/autogen/stable//user-guide/agentchat-user-guide/tutorial/agents.html
- AutoGen Agent API 参考：https://microsoft.github.io/autogen/stable//reference/python/autogen_agentchat.agents.html
- AutoGen Teams 文档：https://microsoft.github.io/autogen/stable//user-guide/agentchat-user-guide/tutorial/teams.html
- AutoGen Teams API 参考：https://microsoft.github.io/autogen/stable//reference/python/autogen_agentchat.teams.html
- AutoGen GitHub：https://github.com/microsoft/autogen

### 1.2 VS Code 官方资料

本文参考 VS Code Extension API 设计，主要依据如下：

1. Webview 与 Extension 之间通过 `acquireVsCodeApi().postMessage()`、`onDidReceiveMessage()` 和 `webview.postMessage()` 交互。
2. Extension Host 可以使用 Node.js API 管理本地进程、HTTP 请求、WebSocket 客户端、文件系统和 VS Code API。
3. VS Code Extension API 提供 workspace、terminal、diff editor、SecretStorage、globalStorageUri 等能力。

参考资料：

- VS Code Webview API：https://code.visualstudio.com/api/extension-guides/webview
- VS Code API Reference：https://code.visualstudio.com/api/references/vscode-api
- VS Code Webview UX Guidelines：https://code.visualstudio.com/api/ux-guidelines/webviews

### 1.3 FastAPI / WebSocket 官方资料

本文建议 Python AutoGen Service 使用 FastAPI 提供 HTTP API 和 WebSocket 推送。FastAPI 官方文档说明 WebSocket endpoint 可通过 `WebSocket` 对象收发消息，一个连接可以持续发送/接收多条消息。

参考资料：

- FastAPI WebSockets：https://fastapi.tiangolo.com/advanced/websockets/
- FastAPI WebSocket Reference：https://fastapi.tiangolo.com/reference/websockets/

---

## 2. 设计目标

### 2.1 核心目标

Extension 与 AutoGen Service 的通信接口需要满足：

```text
1. UI 所有按钮、下拉框、输入框、textarea 都能落到明确接口。
2. 任务执行支持流式消息推送。
3. Agent、Team、Tools、Workflow、Settings 配置可以读写。
4. VS Code 文件、Diff、Terminal、Git 能力可以作为 AutoGen 工具调用。
5. 敏感操作必须能暂停并等待用户确认。
6. 支持任务暂停、继续、终止、重试、回滚。
7. 接口结构清晰，后续可替换 AutoGen 为 Microsoft Agent Framework / LangGraph。
```

### 2.2 非目标

本文不负责：

```text
1. 具体 HTML/CSS 样式。
2. AutoGen 每个 Prompt 的完整内容。
3. 具体业务代码生成质量。
4. 完整插件发布流程。
5. 内置 Python Runtime 打包细节。
```

这些会在后续文档中拆开。

---

## 3. 总体通信架构

### 3.1 进程结构

推荐本地开发模式：

```text
VS Code Extension Host
  ├─ Webview 页面
  ├─ Extension Controller
  ├─ AutoGen Service Client
  ├─ Tool Server / ToolGateway
  └─ Process Manager
        ↓ 启动
Python AutoGen Service
  ├─ FastAPI HTTP API
  ├─ WebSocket Event Hub
  ├─ AgentFactory
  ├─ WorkflowRunner
  ├─ TaskStore
  ├─ ConfigStore
  └─ ToolClient / ToolGateway Adapter
```

### 3.2 通信通道

使用两种通道：

| 通道 | 方向 | 用途 |
|---|---|---|
| HTTP | Extension → AutoGen Service | 创建任务、保存配置、执行控制命令 |
| WebSocket | AutoGen Service → Extension | 实时推送 Agent 消息、工具调用、patch、测试结果 |
| HTTP Callback / WebSocket Request | AutoGen Service → Extension | 调用 VS Code 工具，例如 read_file、open_diff、run_command |

第一版建议：

```text
Extension → AutoGen Service:
  HTTP + WebSocket

AutoGen Service → Extension Tool:
  HTTP 调用 Extension 本地 Tool Server
```

也就是 Extension 里额外启动一个轻量本地 HTTP server：

```text
127.0.0.1:{extensionToolPort}
```

AutoGen Service 调用这个 server 来使用 VS Code 能力。

---

## 4. 端口与服务发现

### 4.1 默认端口

```json
{
  "autogenService": {
    "host": "127.0.0.1",
    "port": 8765
  },
  "extensionToolServer": {
    "host": "127.0.0.1",
    "port": 18765
  }
}
```

### 4.2 Extension 启动 AutoGen Service

Extension 启动时：

```text
1. 读取 Settings 中的 Python Path、Service URL、Port。
2. 调用 GET /api/runtime/health。
3. 如果服务不存在，根据配置 spawn Python 进程。
4. 等待 health ready。
5. 建立 WebSocket 控制通道。
6. 启动 Extension Tool Server。
7. 把 Tool Server URL 注册给 AutoGen Service。
```

### 4.3 AutoGen Service 启动参数

Extension 启动 Python 时传入环境变量：

```bash
AUTOGEN_SERVICE_HOST=127.0.0.1
AUTOGEN_SERVICE_PORT=8765
EXTENSION_TOOL_SERVER_URL=http://127.0.0.1:18765
AUTOGEN_WORKSPACE_STORAGE=/path/to/globalStorage
AUTOGEN_LOG_LEVEL=info
```

---

## 5. 统一 HTTP 规范

### 5.1 Content-Type

所有 HTTP 请求默认：

```http
Content-Type: application/json
Accept: application/json
```

### 5.2 统一成功响应

```json
{
  "ok": true,
  "requestId": "req_20260510_000001",
  "data": {},
  "message": "success"
}
```

### 5.3 统一失败响应

```json
{
  "ok": false,
  "requestId": "req_20260510_000001",
  "error": {
    "code": "MODEL_CONNECTION_FAILED",
    "message": "模型连接失败",
    "details": {
      "provider": "openai-compatible",
      "baseUrl": "http://localhost:11434/v1"
    }
  }
}
```

### 5.4 错误码

| 错误码 | 含义 | UI 处理 |
|---|---|---|
| `SERVICE_NOT_READY` | AutoGen Service 未启动 | 显示 Runtime 未就绪 |
| `MODEL_CONNECTION_FAILED` | 模型连接失败 | 跳转 Settings |
| `TASK_NOT_FOUND` | 任务不存在 | 刷新任务历史 |
| `TASK_ALREADY_RUNNING` | 任务已运行 | 禁用重复提交 |
| `TASK_PAUSED` | 任务暂停 | 显示继续按钮 |
| `PERMISSION_DENIED` | 工具权限禁止 | 显示权限原因 |
| `APPROVAL_REQUIRED` | 需要用户确认 | 弹出确认卡片 |
| `PATCH_APPLY_FAILED` | patch 应用失败 | 显示 stderr |
| `COMMAND_BLOCKED` | 命令被黑名单拦截 | 显示 Tools 配置入口 |
| `WORKSPACE_OUT_OF_SCOPE` | 访问 workspace 外路径 | 显示安全警告 |
| `CONFIG_VALIDATION_FAILED` | 配置校验失败 | 高亮字段 |

---

## 6. 统一 WebSocket 规范

### 6.1 连接地址

```text
ws://127.0.0.1:8765/ws/tasks/{taskId}
```

### 6.2 WebSocket 事件格式

```json
{
  "eventId": "evt_20260510_000001",
  "taskId": "task_001",
  "type": "agent.message",
  "timestamp": "2026-05-10T10:10:10+09:00",
  "payload": {}
}
```

### 6.3 常用事件类型

```text
task.status
workflow.step.started
workflow.step.completed
workflow.step.failed
agent.status
agent.message
agent.stream.delta
tool.call.requested
tool.call.completed
tool.call.failed
approval.required
approval.resolved
patch.proposed
patch.applied
patch.failed
command.requested
command.started
command.completed
test.result
runtime.log
error
```

### 6.4 断线重连

Extension 端需要实现：

```text
1. WebSocket 断开后 1s、2s、5s、10s 递增重连。
2. 重连时调用 GET /api/tasks/{taskId}/snapshot 获取当前快照。
3. 根据 snapshot 重建 UI。
4. 避免重复渲染 eventId 已处理的事件。
```

---

## 7. 核心数据模型

### 7.1 TaskCreateRequest

```ts
interface TaskCreateRequest {
  workspaceId: string;
  workspaceRoot: string;
  userRequest: string;

  teamId: string;
  workflowId: string;
  mode: "auto" | "semi_auto" | "manual";

  targetAgent?: string;

  contextRefs: {
    currentFile?: string;
    selection?: {
      file: string;
      startLine: number;
      endLine: number;
      text: string;
    };
    gitDiff?: boolean;
    terminalError?: boolean;
    files?: string[];
  };

  approvalPolicy: {
    plan: boolean;
    patch: boolean;
    command: boolean;
    toolCall?: boolean;
  };

  options: {
    stream: boolean;
    createCheckpoint: boolean;
    maxRounds?: number;
  };
}
```

### 7.2 TaskContext

```ts
interface TaskContext {
  taskId: string;
  workspaceId: string;
  workspaceRoot: string;
  userRequest: string;

  teamId: string;
  workflowId: string;
  mode: string;
  status: TaskStatus;
  currentStep?: string;
  currentAgent?: string;

  plan?: PlanResult;
  codebaseSummary?: CodebaseSummary;
  relatedFiles: RelatedFile[];
  patches: PatchProposal[];
  reviewComments: ReviewComment[];
  testResults: TestResult[];
  approvals: ApprovalRequest[];
  toolCalls: ToolCallRecord[];
  messages: AgentMessage[];

  createdAt: string;
  updatedAt: string;
}
```

### 7.3 TaskStatus

```ts
type TaskStatus =
  | "created"
  | "planning"
  | "waiting_plan_approval"
  | "analyzing_codebase"
  | "developing_patch"
  | "reviewing_patch"
  | "waiting_patch_approval"
  | "applying_patch"
  | "testing"
  | "fixing"
  | "completed"
  | "failed"
  | "paused"
  | "cancelled";
```

### 7.4 AgentConfig

```ts
interface AgentConfig {
  id: string;
  name: string;
  role: string;
  description: string;
  enabled: boolean;

  model: string;
  temperature: number;
  maxTurns: number;
  maxToolCalls: number;
  timeoutSeconds: number;

  systemPrompt: string;
  responseFormat: "text" | "json" | "patch" | "markdown";
  stopCondition: string;
  outputJsonSchema?: object;

  tools: string[];
  contextScope: {
    currentFile: boolean;
    selection: boolean;
    gitDiff: boolean;
    terminalError: boolean;
    codebaseSummary: boolean;
    fullWorkspaceSearch: boolean;
  };
}
```

### 7.5 TeamConfig

```ts
interface TeamConfig {
  id: string;
  name: string;
  description: string;
  mode:
    | "sequential"
    | "round_robin"
    | "selector"
    | "manual"
    | "custom_workflow";

  default: boolean;
  maxTurns: number;
  retryLimit: number;
  termination: string;

  executionPolicy: "serial" | "parallel";
  modelOverridePolicy: "agent_default" | "team_override" | "fallback_only";
  modelOverride?: string;

  agents: {
    agentId: string;
    order: number;
    enabled: boolean;
    optional?: boolean;
  }[];
}
```

### 7.6 WorkflowConfig

```ts
interface WorkflowConfig {
  id: string;
  name: string;
  description: string;
  version: string;
  type: "code_edit" | "bug_fix" | "test_generation" | "explain_code";

  default: boolean;
  retryLimit: number;
  nodeTimeoutSeconds: number;
  confirmPolicy: {
    plan: boolean;
    patch: boolean;
    command: boolean;
  };

  failureStrategy:
    | "stop"
    | "retry_current"
    | "fallback_agent"
    | "rollback_and_retry";

  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
```

---

## 8. Runtime 接口

### 8.1 健康检查

```http
GET /api/runtime/health
```

响应：

```json
{
  "ok": true,
  "data": {
    "status": "running",
    "version": "0.1.0",
    "pythonVersion": "3.11.8",
    "autogenPackage": "autogen-agentchat",
    "autogenVersion": "0.4.x",
    "serviceUrl": "http://127.0.0.1:8765",
    "uptimeSeconds": 120,
    "currentTaskId": "task_001",
    "toolServerUrl": "http://127.0.0.1:18765"
  }
}
```

### 8.2 注册 Extension Tool Server

```http
POST /api/runtime/register-tool-server
```

请求：

```json
{
  "workspaceId": "mall-springboot",
  "toolServerUrl": "http://127.0.0.1:18765",
  "authToken": "local-dev-token"
}
```

用途：

```text
AutoGen Service 保存 VS Code Extension Tool Server 的地址。
之后 AutoGen 工具函数 read_file/open_diff/run_command 等不直接操作系统，
而是调用 Extension Tool Server。
```

### 8.3 Runtime 日志

```http
GET /api/runtime/logs?limit=200
```

响应：

```json
{
  "ok": true,
  "data": {
    "lines": [
      "[INFO] AutoGen Service started",
      "[INFO] Registered tool server http://127.0.0.1:18765"
    ]
  }
}
```

---

## 9. Task 接口

### 9.1 创建任务

```http
POST /api/tasks
```

请求：

```json
{
  "workspaceId": "mall-springboot",
  "workspaceRoot": "D:/projects/mall-springboot",
  "userRequest": "帮我给当前 Spring Boot 项目增加 JWT 登录接口",
  "teamId": "java-spring-team",
  "workflowId": "code-edit",
  "mode": "semi_auto",
  "targetAgent": "auto",
  "contextRefs": {
    "currentFile": "src/main/java/com/demo/UserController.java",
    "gitDiff": true,
    "terminalError": false,
    "files": []
  },
  "approvalPolicy": {
    "plan": true,
    "patch": true,
    "command": true
  },
  "options": {
    "stream": true,
    "createCheckpoint": true
  }
}
```

响应：

```json
{
  "ok": true,
  "data": {
    "taskId": "task_001",
    "status": "created",
    "websocketUrl": "ws://127.0.0.1:8765/ws/tasks/task_001"
  }
}
```

Extension 收到后：

```text
1. 保存 currentTaskId。
2. 建立 WebSocket。
3. Webview 显示任务已创建。
4. 等待 task.status / agent.message / tool.call 等事件。
```

### 9.2 获取任务快照

```http
GET /api/tasks/{taskId}/snapshot
```

用途：

```text
1. WebSocket 重连后重建 UI。
2. 用户切回任务历史时恢复界面。
3. Extension 重新加载后恢复当前任务。
```

响应：

```json
{
  "ok": true,
  "data": {
    "task": {},
    "messages": [],
    "toolCalls": [],
    "patches": [],
    "approvals": [],
    "testResults": []
  }
}
```

### 9.3 暂停任务

```http
POST /api/tasks/{taskId}/pause
```

后端行为：

```text
1. 设置 cancellation flag。
2. 当前 Agent 如果可以中断，则停止流式输出。
3. WorkflowRunner 保存当前上下文。
4. 推送 task.status = paused。
```

响应：

```json
{
  "ok": true,
  "data": {
    "taskId": "task_001",
    "status": "paused"
  }
}
```

### 9.4 继续任务

```http
POST /api/tasks/{taskId}/resume
```

请求：

```json
{
  "resumeFrom": "current_step"
}
```

后端行为：

```text
1. 读取 TaskContext。
2. 从暂停节点继续执行。
3. 建立新的 AutoGen 执行上下文或恢复 workflow 状态。
4. 推送 task.status = running。
```

### 9.5 终止任务

```http
POST /api/tasks/{taskId}/cancel
```

请求：

```json
{
  "reason": "用户手动终止"
}
```

后端行为：

```text
1. 终止当前执行。
2. task.status = cancelled。
3. 如果已创建 checkpoint 但未应用 patch，不回滚。
4. 如果用户选择回滚，单独调用 rollback 接口。
```

### 9.6 重跑当前 Agent

```http
POST /api/tasks/{taskId}/rerun-agent
```

请求：

```json
{
  "agentId": "developer_agent",
  "feedback": "不要改 SecurityConfig，先只新增 Controller 和 Service"
}
```

后端行为：

```text
1. 将 feedback 写入 TaskContext.decisions。
2. 清理当前 agent 上一次输出。
3. 使用相同输入重新运行该 Agent。
4. 生成新 patch 或新 review。
```

### 9.7 追加用户消息

```http
POST /api/tasks/{taskId}/messages
```

请求：

```json
{
  "targetAgent": "DeveloperAgent",
  "content": "请使用项目已有的 Result<T> 返回格式"
}
```

后端行为：

```text
1. 写入 task.messages。
2. 如果当前状态允许交互，触发 targetAgent 继续。
3. 如果任务已完成，则创建 follow-up step。
```

---

## 10. Approval 接口

### 10.1 审批请求模型

AutoGen Service 在需要用户确认时通过 WebSocket 推送：

```json
{
  "type": "approval.required",
  "payload": {
    "approvalId": "approval_001",
    "taskId": "task_001",
    "approvalType": "plan",
    "title": "PlannerAgent 请求确认计划",
    "summary": "将新增 AuthController、AuthService、JwtUtil、LoginRequest",
    "actions": ["approve", "revise", "reject"]
  }
}
```

### 10.2 处理审批

```http
POST /api/tasks/{taskId}/approvals/{approvalId}/resolve
```

请求：

```json
{
  "action": "approve",
  "comment": ""
}
```

或者：

```json
{
  "action": "revise",
  "comment": "不要新增 JwtUtil，项目已有 TokenService"
}
```

后端行为：

| action | 行为 |
|---|---|
| approve | 当前节点继续 |
| revise | 将 comment 加入上下文，重新运行当前/上一步 Agent |
| reject | 标记节点失败或终止 workflow |

---

## 11. Patch 接口

### 11.1 获取 patch

```http
GET /api/tasks/{taskId}/patches/{patchId}
```

响应：

```json
{
  "ok": true,
  "data": {
    "patchId": "patch_001",
    "status": "proposed",
    "summary": "新增 JWT 登录相关代码",
    "files": [
      {
        "path": "src/main/java/com/demo/AuthController.java",
        "changeType": "add",
        "additions": 42,
        "deletions": 0
      }
    ],
    "unifiedDiff": "diff --git ..."
  }
}
```

### 11.2 应用 patch

```http
POST /api/tasks/{taskId}/patches/{patchId}/apply
```

请求：

```json
{
  "mode": "all",
  "createCheckpoint": true
}
```

部分应用：

```json
{
  "mode": "partial",
  "files": [
    "src/main/java/com/demo/AuthController.java",
    "src/main/java/com/demo/AuthService.java"
  ],
  "createCheckpoint": true
}
```

后端行为：

```text
1. 校验 patch 路径都在 workspace 内。
2. 校验不触碰敏感文件。
3. 请求 Extension Tool Server 创建 checkpoint。
4. 请求 Extension Tool Server 应用 patch。
5. 更新 patch.status。
6. 如果成功，进入 TesterAgent。
```

### 11.3 拒绝 patch

```http
POST /api/tasks/{taskId}/patches/{patchId}/reject
```

请求：

```json
{
  "reason": "项目已有 TokenService，不要新增 JwtUtil"
}
```

后端行为：

```text
1. patch.status = rejected。
2. reason 写入 TaskContext.decisions。
3. 重新运行 DeveloperAgent。
```

### 11.4 解释 patch

```http
POST /api/tasks/{taskId}/patches/{patchId}/explain
```

请求：

```json
{
  "detailLevel": "normal"
}
```

后端行为：

```text
调用 ReviewerAgent 或 SummaryAgent 解释 diff。
```

---

## 12. Command 接口

### 12.1 命令审批

当 TesterAgent 请求执行命令时：

```json
{
  "type": "approval.required",
  "payload": {
    "approvalType": "command",
    "approvalId": "approval_cmd_001",
    "command": "mvn test",
    "risk": "low",
    "reason": "需要验证 JWT 登录接口是否编译通过"
  }
}
```

用户允许一次：

```http
POST /api/tasks/{taskId}/commands/{commandRequestId}/approve
```

请求：

```json
{
  "mode": "once"
}
```

加入白名单：

```json
{
  "mode": "allowlist",
  "scope": "workspace"
}
```

拒绝：

```http
POST /api/tasks/{taskId}/commands/{commandRequestId}/reject
```

请求：

```json
{
  "reason": "暂时不运行测试"
}
```

### 12.2 命令执行事件

```json
{
  "type": "command.started",
  "payload": {
    "commandId": "cmd_001",
    "command": "mvn test"
  }
}
```

```json
{
  "type": "command.completed",
  "payload": {
    "commandId": "cmd_001",
    "exitCode": 1,
    "stdoutTail": "...",
    "stderrTail": "...",
    "durationMs": 18230
  }
}
```

---

## 13. Agent 配置接口

### 13.1 获取 Agent 列表

```http
GET /api/agents
```

响应：

```json
{
  "ok": true,
  "data": {
    "agents": [
      {
        "id": "planner_agent",
        "name": "PlannerAgent",
        "role": "planner",
        "enabled": true,
        "model": "gpt-4.1-mini"
      }
    ]
  }
}
```

### 13.2 保存 Agent

```http
PUT /api/agents/{agentId}
```

请求：

```json
{
  "name": "DeveloperAgent",
  "role": "developer",
  "description": "负责生成代码 patch",
  "enabled": true,
  "model": "gpt-4.1",
  "temperature": 0.2,
  "maxTurns": 8,
  "maxToolCalls": 30,
  "timeoutSeconds": 180,
  "systemPrompt": "你是企业 Java 项目开发 Agent...",
  "responseFormat": "json",
  "stopCondition": "patch_proposed",
  "outputJsonSchema": {
    "type": "object",
    "properties": {
      "summary": { "type": "string" },
      "changedFiles": { "type": "array" },
      "patch": { "type": "string" }
    },
    "required": ["summary", "changedFiles", "patch"]
  },
  "tools": ["read_file", "search_code", "propose_patch"],
  "contextScope": {
    "currentFile": true,
    "selection": true,
    "gitDiff": true,
    "terminalError": false,
    "codebaseSummary": true,
    "fullWorkspaceSearch": true
  }
}
```

### 13.3 测试 Agent

```http
POST /api/agents/{agentId}/test
```

请求：

```json
{
  "prompt": "请说明你能做什么",
  "mockContext": true
}
```

响应：

```json
{
  "ok": true,
  "data": {
    "output": "我是 DeveloperAgent，负责基于项目上下文生成 patch。",
    "latencyMs": 1200,
    "tokens": {
      "input": 300,
      "output": 80
    }
  }
}
```

---

## 14. Team 接口

### 14.1 获取 Team 列表

```http
GET /api/teams
```

### 14.2 保存 Team

```http
PUT /api/teams/{teamId}
```

请求：

```json
{
  "name": "Java Spring Boot Team",
  "mode": "custom_workflow",
  "default": true,
  "maxTurns": 20,
  "retryLimit": 2,
  "termination": "completed_or_user_cancelled",
  "executionPolicy": "serial",
  "modelOverridePolicy": "agent_default",
  "agents": [
    { "agentId": "planner_agent", "order": 1, "enabled": true },
    { "agentId": "codebase_agent", "order": 2, "enabled": true },
    { "agentId": "developer_agent", "order": 3, "enabled": true },
    { "agentId": "reviewer_agent", "order": 4, "enabled": true },
    { "agentId": "tester_agent", "order": 5, "enabled": true }
  ]
}
```

### 14.3 删除 Team

```http
DELETE /api/teams/{teamId}
```

规则：

```text
1. 默认 Team 不允许直接删除。
2. 被正在运行 task 使用的 Team 不允许删除。
3. 删除前 UI 二次确认。
```

---

## 15. Tools 接口

### 15.1 获取工具权限

```http
GET /api/tools/permissions
```

### 15.2 保存工具权限

```http
PUT /api/tools/permissions
```

请求：

```json
{
  "permissions": {
    "developer_agent": {
      "read_file": "allow",
      "search_code": "allow",
      "propose_patch": "allow",
      "apply_patch": "confirm",
      "run_command": "deny"
    },
    "tester_agent": {
      "run_command": "confirm",
      "read_terminal": "allow"
    }
  }
}
```

权限值：

```text
deny
allow
confirm
readonly
whitelist
```

### 15.3 保存安全策略

```http
PUT /api/tools/safety
```

请求：

```json
{
  "denyWorkspaceOutsideAccess": true,
  "denyDirectWriteFile": true,
  "forceApplyPatchApproval": true,
  "forceRunCommandApproval": true,
  "globalDangerousToolBlock": true,
  "logToolCallDetail": true,
  "sensitiveFilePatterns": [
    ".env",
    "*.pem",
    "id_rsa",
    "credentials.json",
    "application-prod.yml"
  ]
}
```

### 15.4 保存命令白名单 / 黑名单

```http
PUT /api/tools/command-policy
```

请求：

```json
{
  "allowlist": [
    "mvn test",
    "mvn -q test",
    "npm test",
    "pnpm build"
  ],
  "blocklist": [
    "rm",
    "del",
    "format",
    "curl",
    "wget",
    "ssh",
    "git push",
    "npm publish",
    "powershell"
  ]
}
```

---

## 16. Workflow 接口

### 16.1 获取 Workflow

```http
GET /api/workflows
```

### 16.2 保存 Workflow

```http
PUT /api/workflows/{workflowId}
```

请求：

```json
{
  "name": "Code Edit Workflow",
  "description": "代码修改流程",
  "version": "1.0.0",
  "type": "code_edit",
  "default": true,
  "retryLimit": 2,
  "nodeTimeoutSeconds": 180,
  "confirmPolicy": {
    "plan": true,
    "patch": true,
    "command": true
  },
  "failureStrategy": "fallback_agent",
  "nodes": [
    {
      "id": "planner",
      "type": "agent",
      "agentId": "planner_agent",
      "input": ["userRequest", "workspaceSummary"],
      "output": ["plan"]
    },
    {
      "id": "plan_approval",
      "type": "human_approval",
      "approvalType": "plan"
    },
    {
      "id": "codebase",
      "type": "agent",
      "agentId": "codebase_agent",
      "input": ["plan", "workspaceRoot"],
      "output": ["codebaseSummary", "relatedFiles"]
    },
    {
      "id": "developer",
      "type": "agent",
      "agentId": "developer_agent",
      "input": ["plan", "codebaseSummary", "relatedFiles"],
      "output": ["patch"]
    },
    {
      "id": "reviewer",
      "type": "agent",
      "agentId": "reviewer_agent",
      "input": ["patch"],
      "output": ["review"]
    },
    {
      "id": "patch_approval",
      "type": "human_approval",
      "approvalType": "patch"
    },
    {
      "id": "tester",
      "type": "agent",
      "agentId": "tester_agent",
      "input": ["appliedPatch"],
      "output": ["testResult"]
    }
  ],
  "edges": [
    { "from": "planner", "to": "plan_approval" },
    { "from": "plan_approval", "to": "codebase" },
    { "from": "codebase", "to": "developer" },
    { "from": "developer", "to": "reviewer" },
    { "from": "reviewer", "to": "patch_approval" },
    { "from": "patch_approval", "to": "tester" }
  ]
}
```

### 16.3 测试运行 Workflow

```http
POST /api/workflows/{workflowId}/dry-run
```

请求：

```json
{
  "mock": true,
  "userRequest": "生成一个示例登录接口"
}
```

响应：

```json
{
  "ok": true,
  "data": {
    "steps": [
      { "node": "planner", "status": "ok" },
      { "node": "plan_approval", "status": "requires_approval" }
    ],
    "validation": []
  }
}
```

### 16.4 导入 / 导出 JSON

```http
GET /api/workflows/{workflowId}/export
POST /api/workflows/import
```

---

## 17. Settings 接口

### 17.1 获取设置

```http
GET /api/settings
```

### 17.2 保存模型设置

```http
PUT /api/settings/model
```

请求：

```json
{
  "provider": "openai-compatible",
  "baseUrl": "http://localhost:11434/v1",
  "model": "qwen2.5-coder:7b",
  "fallbackModel": "gpt-4.1-mini",
  "apiKeyRef": "secret://autogen.openai.apiKey",
  "stream": true,
  "timeoutSeconds": 120
}
```

注意：

```text
API Key 不建议直接明文持久化在 AutoGen Service。
推荐由 VS Code Extension 存入 SecretStorage。
AutoGen Service 运行时通过 Extension 注入环境变量或短期 token。
```

### 17.3 测试模型连接

```http
POST /api/settings/model/test
```

请求：

```json
{
  "provider": "openai-compatible",
  "baseUrl": "http://localhost:11434/v1",
  "model": "qwen2.5-coder:7b"
}
```

响应：

```json
{
  "ok": true,
  "data": {
    "latencyMs": 500,
    "sampleOutput": "pong"
  }
}
```

### 17.4 保存 Runtime 设置

```http
PUT /api/settings/runtime
```

请求：

```json
{
  "serviceUrl": "http://127.0.0.1:8765",
  "host": "127.0.0.1",
  "port": 8765,
  "pythonPath": "D:/runtime/python/python.exe",
  "autogenPackage": "autogen-agentchat",
  "logLevel": "info",
  "workspaceStoragePath": "D:/AI-IDE/storage",
  "useVSCodeSecretStorage": true
}
```

### 17.5 导入 / 导出配置

```http
GET /api/settings/export
POST /api/settings/import
```

导出配置必须脱敏：

```json
{
  "model": {
    "provider": "openai-compatible",
    "baseUrl": "http://localhost:11434/v1",
    "model": "qwen2.5-coder:7b",
    "apiKey": "***"
  }
}
```

---

## 18. Extension Tool Server 接口

这部分是 AutoGen Service 调用 VS Code 能力的关键。

### 18.1 Tool Server 基础设计

Extension 启动一个本地 HTTP server：

```text
http://127.0.0.1:18765
```

只监听 localhost。

所有请求必须带 token：

```http
Authorization: Bearer local-dev-token
```

### 18.2 读取文件

```http
POST /tools/read-file
```

请求：

```json
{
  "workspaceId": "mall-springboot",
  "path": "src/main/java/com/demo/UserController.java",
  "maxBytes": 200000
}
```

响应：

```json
{
  "ok": true,
  "data": {
    "path": "src/main/java/com/demo/UserController.java",
    "content": "...",
    "encoding": "utf-8",
    "truncated": false
  }
}
```

Extension 必须检查：

```text
1. path 是否在 workspace 内。
2. 是否命中敏感文件黑名单。
3. 文件大小是否超过 maxBytes。
```

### 18.3 列文件

```http
POST /tools/list-files
```

请求：

```json
{
  "path": "src/main/java",
  "maxFiles": 500,
  "exclude": [".git", "node_modules", "target", "build"]
}
```

### 18.4 搜索代码

```http
POST /tools/search-code
```

请求：

```json
{
  "query": "@RestController",
  "path": "src/main/java",
  "maxResults": 50
}
```

第一版可以使用 `ripgrep`。

### 18.5 打开 Diff

```http
POST /tools/open-diff
```

请求：

```json
{
  "title": "AutoGen Patch Preview",
  "originalPath": "src/main/java/com/demo/AuthController.java",
  "modifiedContent": "..."
}
```

Extension 实现：

```text
1. 用 TextDocumentContentProvider 提供 modified 虚拟文档。
2. 调用 vscode.commands.executeCommand("vscode.diff", originalUri, modifiedUri, title)。
```

### 18.6 应用 Patch

```http
POST /tools/apply-patch
```

请求：

```json
{
  "unifiedDiff": "diff --git ...",
  "mode": "all",
  "files": [],
  "createCheckpoint": true
}
```

Extension 实现：

```text
1. 写临时 patch 文件。
2. 执行 git apply --check。
3. 如果通过，执行 git apply。
4. 返回 stdout/stderr。
```

### 18.7 运行命令

```http
POST /tools/run-command
```

请求：

```json
{
  "command": "mvn test",
  "cwd": ".",
  "timeoutSeconds": 120,
  "captureOutput": true
}
```

Extension 实现建议：

```text
第一版：
  使用 child_process.execFile / spawn 捕获输出。

第二版：
  同时在 VS Code Terminal 展示可见执行过程。
```

### 18.8 Git Diff

```http
POST /tools/git-diff
```

请求：

```json
{
  "scope": "workspace"
}
```

返回：

```json
{
  "ok": true,
  "data": {
    "diff": "diff --git ..."
  }
}
```

### 18.9 创建 checkpoint

```http
POST /tools/create-checkpoint
```

实现方案：

```text
优先：
  git stash push -u -m "autogen-checkpoint-task_001"

如果不是 git 仓库：
  复制修改文件到 .autogen/checkpoints/task_001/
```

### 18.10 回滚 checkpoint

```http
POST /tools/rollback-checkpoint
```

---

## 19. AutoGen Service 内部模块设计

### 19.1 目录结构

```text
agent-service/
├─ main.py
├─ api/
│  ├─ runtime_api.py
│  ├─ task_api.py
│  ├─ agent_api.py
│  ├─ team_api.py
│  ├─ tool_api.py
│  ├─ workflow_api.py
│  └─ settings_api.py
├─ runtime/
│  ├─ autogen_factory.py
│  ├─ workflow_runner.py
│  ├─ event_mapper.py
│  └─ cancellation.py
├─ store/
│  ├─ config_store.py
│  ├─ task_store.py
│  └─ secret_proxy.py
├─ tools/
│  ├─ tool_gateway.py
│  ├─ file_tools.py
│  ├─ patch_tools.py
│  ├─ command_tools.py
│  └─ git_tools.py
└─ ws/
   ├─ ws_manager.py
   └─ event_models.py
```

### 19.2 AgentFactory

职责：

```text
1. 读取 AgentConfig。
2. 创建模型客户端。
3. 根据工具权限注入 tools。
4. 创建 AssistantAgent。
5. 设置 system_message。
```

伪代码：

```python
def create_assistant_agent(agent_config, model_client, tool_registry):
    tools = []
    for tool_name in agent_config.tools:
        if permission_store.is_allowed(agent_config.id, tool_name):
            tools.append(tool_registry.get(tool_name, agent_config.id))

    return AssistantAgent(
        name=agent_config.name,
        model_client=model_client,
        tools=tools,
        system_message=agent_config.system_prompt,
        reflect_on_tool_use=True,
    )
```

### 19.3 WorkflowRunner

职责：

```text
1. 根据 WorkflowConfig 按节点执行。
2. 负责暂停、继续、终止。
3. 负责人工确认节点。
4. 负责失败重试和 fallback。
5. 把 AutoGen run_stream 事件转成 WebSocket 事件。
```

伪代码：

```python
async def run_workflow(task_ctx):
    for node in workflow.nodes:
        if node.type == "agent":
            await run_agent_node(task_ctx, node)

        elif node.type == "human_approval":
            await create_approval(task_ctx, node)
            await wait_for_approval(task_ctx, node)

        elif node.type == "condition":
            next_node = evaluate_condition(task_ctx, node)
            jump_to(next_node)
```

### 19.4 ToolGateway

职责：

```text
1. 接收 Agent tool call。
2. 检查工具权限。
3. 检查安全策略。
4. 如果需要用户确认，暂停并推送 approval.required。
5. 调用 Extension Tool Server。
6. 记录 tool_call_log。
7. 返回结果给 AutoGen Agent。
```

---

## 20. AutoGen run_stream 事件映射

AutoGen `run_stream()` 会产出不同类型消息。UI 不应该直接依赖 AutoGen 原始对象，而应该统一映射为内部事件。

### 20.1 映射原则

```text
AutoGen 原始事件
  ↓
event_mapper.py
  ↓
内部 WebSocket 事件
  ↓
Extension
  ↓
Webview
```

### 20.2 事件示例

AutoGen 消息：

```text
DeveloperAgent: I will create a patch...
```

映射为：

```json
{
  "type": "agent.message",
  "payload": {
    "agent": "DeveloperAgent",
    "content": "I will create a patch..."
  }
}
```

工具调用请求：

```json
{
  "type": "tool.call.requested",
  "payload": {
    "agent": "CodebaseAgent",
    "tool": "read_file",
    "args": {
      "path": "pom.xml"
    }
  }
}
```

最终结果：

```json
{
  "type": "workflow.step.completed",
  "payload": {
    "stepId": "developer",
    "outputRef": "patch_001"
  }
}
```

---

## 21. TypeScript Extension Client 设计

### 21.1 AutoGenServiceClient

```ts
export class AutoGenServiceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenProvider: () => Promise<string | undefined>
  ) {}

  async health(): Promise<RuntimeHealth> {
    return this.get("/api/runtime/health");
  }

  async createTask(req: TaskCreateRequest): Promise<TaskCreateResponse> {
    return this.post("/api/tasks", req);
  }

  async pauseTask(taskId: string): Promise<void> {
    return this.post(`/api/tasks/${taskId}/pause`, {});
  }

  async resumeTask(taskId: string): Promise<void> {
    return this.post(`/api/tasks/${taskId}/resume`, {});
  }

  async saveAgent(agentId: string, config: AgentConfig): Promise<void> {
    return this.put(`/api/agents/${agentId}`, config);
  }

  async saveTeam(teamId: string, config: TeamConfig): Promise<void> {
    return this.put(`/api/teams/${teamId}`, config);
  }

  async saveWorkflow(workflowId: string, config: WorkflowConfig): Promise<void> {
    return this.put(`/api/workflows/${workflowId}`, config);
  }
}
```

### 21.2 TaskWebSocketClient

```ts
export class TaskWebSocketClient {
  private ws?: WebSocket;
  private processedEventIds = new Set<string>();

  connect(taskId: string, url: string) {
    this.ws = new WebSocket(url);

    this.ws.onmessage = (raw) => {
      const event = JSON.parse(raw.data.toString());
      if (this.processedEventIds.has(event.eventId)) return;
      this.processedEventIds.add(event.eventId);
      this.onEvent(event);
    };

    this.ws.onclose = () => {
      this.reconnect(taskId);
    };
  }

  onEvent(event: AutoGenWsEvent) {
    // 转发给 webview
  }
}
```

---

## 22. Python FastAPI 骨架

```python
from fastapi import FastAPI, WebSocket
from pydantic import BaseModel

app = FastAPI()

@app.get("/api/runtime/health")
async def health():
    return {
        "ok": True,
        "data": {
            "status": "running"
        }
    }

@app.post("/api/tasks")
async def create_task(req: TaskCreateRequest):
    task_id = task_store.create(req)
    asyncio.create_task(workflow_runner.run(task_id))
    return {
        "ok": True,
        "data": {
            "taskId": task_id,
            "status": "created",
            "websocketUrl": f"ws://127.0.0.1:8765/ws/tasks/{task_id}"
        }
    }

@app.websocket("/ws/tasks/{task_id}")
async def task_ws(websocket: WebSocket, task_id: str):
    await ws_manager.connect(task_id, websocket)
    try:
        while True:
            message = await websocket.receive_text()
            await ws_manager.handle_client_message(task_id, message)
    finally:
        ws_manager.disconnect(task_id, websocket)
```

---

## 23. 联调流程

### 23.1 Runtime 联调

```text
1. Extension 启动。
2. 调用 GET /api/runtime/health。
3. 如果失败，spawn Python。
4. 再次 health。
5. 启动 Extension Tool Server。
6. 调用 POST /api/runtime/register-tool-server。
7. Webview Settings 页显示 running。
```

验收：

```text
Settings 页能显示：
- Service URL
- Python Path
- Port
- AutoGen Package
- Log Level
- Health OK
```

### 23.2 Task 联调

```text
1. Run 页输入需求。
2. 点击发送。
3. Webview postMessage task.create。
4. Extension 调用 POST /api/tasks。
5. AutoGen Service 返回 taskId + websocketUrl。
6. Extension 连接 WebSocket。
7. AutoGen Service 推送 agent.message。
8. Webview 显示消息卡片。
```

验收：

```text
Run 页能看到：
- PlannerAgent running
- Agent 消息流
- Tool call 卡片
- patch proposed 卡片
```

### 23.3 Tool 联调

```text
1. CodebaseAgent 调用 read_file。
2. ToolGateway 检查权限。
3. ToolGateway 调用 Extension Tool Server /tools/read-file。
4. Extension 用 VS Code API 或 Node FS 读取 workspace 文件。
5. 返回内容给 AutoGen Service。
6. AutoGen Agent 继续。
```

验收：

```text
Tools 日志里能看到 read_file 调用。
Run 页能看到 tool.call.completed。
敏感文件读取被拒绝。
workspace 外路径被拒绝。
```

### 23.4 Patch 联调

```text
1. DeveloperAgent 生成 patch。
2. AutoGen Service 保存 patch。
3. 推送 patch.proposed。
4. UI 点击查看 Diff。
5. Extension 调用 GET patch。
6. Extension 打开 VS Code diff。
7. UI 点击应用 Patch。
8. AutoGen Service 调用 Extension Tool Server apply-patch。
9. 应用成功后进入 TesterAgent。
```

验收：

```text
Diff 能打开。
patch 能应用。
失败时显示 stderr。
应用前生成 checkpoint。
```

---

## 24. 安全设计

### 24.1 本地服务绑定

AutoGen Service 和 Extension Tool Server 均只绑定：

```text
127.0.0.1
```

禁止监听 `0.0.0.0`。

### 24.2 Token

Extension 启动时生成随机 token：

```text
localToken = crypto.randomUUID()
```

传给 AutoGen Service。

所有 Tool Server 请求必须带：

```http
Authorization: Bearer {localToken}
```

### 24.3 文件安全

默认禁止：

```text
workspace 外路径
.env
*.pem
id_rsa
credentials.json
application-prod.yml
```

### 24.4 命令安全

默认禁止：

```text
rm
del
format
curl
wget
ssh
scp
powershell
git push
npm publish
```

### 24.5 API Key

推荐：

```text
VS Code SecretStorage 保存 API Key。
AutoGen Service 不落盘保存 API Key。
运行时通过环境变量或一次性 token 传递。
```

---

## 25. 自检清单

### 25.1 接口覆盖自检

| 模块 | 是否覆盖 | 说明 |
|---|---:|---|
| Runtime health | 是 | `/api/runtime/health` |
| Tool server register | 是 | `/api/runtime/register-tool-server` |
| Task create | 是 | `/api/tasks` |
| Task pause/resume/cancel | 是 | 已定义 |
| Task snapshot | 是 | 用于重连恢复 |
| Approval resolve | 是 | plan/patch/command 通用 |
| Patch get/apply/reject/explain | 是 | 已定义 |
| Command approve/reject | 是 | 已定义 |
| Agent CRUD/Test | 是 | 详细定义 |
| Team CRUD | 是 | 详细定义 |
| Tool permissions/safety | 是 | 详细定义 |
| Workflow save/dry-run/import/export | 是 | 详细定义 |
| Settings model/runtime | 是 | 详细定义 |
| Extension Tool Server | 是 | 文件、搜索、Diff、Patch、Terminal、Git |

### 25.2 UI 对应自检

| UI 页面 | 接口覆盖 |
|---|---|
| Run | task / approval / patch / command |
| Agents | agent CRUD / test |
| Team | team save / delete / default |
| Tools | permission / safety / command-policy |
| Workflow | workflow save / dry-run / import/export |
| Settings | model / runtime / safety |

### 25.3 安全自检

| 安全项 | 是否设计 |
|---|---:|
| localhost 绑定 | 是 |
| Tool Server Token | 是 |
| workspace 外访问禁止 | 是 |
| 敏感文件黑名单 | 是 |
| 命令黑名单 | 是 |
| patch 确认 | 是 |
| command 确认 | 是 |
| API Key SecretStorage | 是 |

### 25.4 可落地性自检

| 项目 | 结论 |
|---|---|
| 是否可以给 Codex 开发 | 可以 |
| 是否有明确接口路径 | 有 |
| 是否有请求/响应示例 | 有 |
| 是否能支持流式 UI | 能 |
| 是否能对接 AutoGen run_stream | 能 |
| 是否能后续替换 AutoGen | 能，因 Service 层隔离 |

---

## 26. 下一份文档建议

下一份建议生成：

```text
04_AutoGen多Agent运行时详细设计.md
```

重点写：

```text
1. Python AutoGen Service 目录结构
2. AgentFactory 实现
3. ModelClientFactory 实现
4. WorkflowRunner 详细执行逻辑
5. AutoGen run_stream 事件映射
6. ToolGateway 详细实现
7. 人工确认节点实现
8. 暂停/继续/终止实现
9. 多 Agent Team 创建方式
10. 与本文 HTTP/WebSocket 接口的代码级对接
```

