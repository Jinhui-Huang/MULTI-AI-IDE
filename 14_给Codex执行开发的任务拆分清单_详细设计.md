# 14_给Codex执行开发的任务拆分清单_详细设计

> 版本：v1.0  
> 面向对象：Codex / AI 编程代理 / 人类开发者  
> 项目：AutoGen + VS Code 插件多 Agent 编程控制台  
> 目标：把前面 00～13 号设计文档拆成可连续执行、可验收、可回滚的开发任务。

---

## 1. 文档目标

本文件不是概念设计，而是**给 Codex 执行开发用的任务清单**。

每个任务都包含：

- 任务编号
- 任务目标
- 前置条件
- 涉及文件
- 实现要求
- 禁止事项
- 验收标准
- 建议提交说明

执行原则：

1. 一次只做一个任务。
2. 每个任务完成后必须能编译或通过局部验证。
3. 每个任务都要尽量小，避免一次性生成大量代码。
4. 涉及危险操作时必须保守实现。
5. 所有 AutoGen 调用必须隔离在 `agent-service` 目录。
6. 所有 VS Code 文件、Diff、Terminal、Git 能力必须隔离在 Extension Tool Server。
7. Webview UI 只通过 `postMessage` 和 Extension 通信。
8. Python AutoGen Service 只通过 HTTP/WebSocket 和 Extension 通信。

---

## 2. 资料依据

### 2.1 VS Code 插件开发依据

本项目的插件侧基于 VS Code Extension API。VS Code Webview 支持自定义 HTML/CSS/JS 页面，并通过 `acquireVsCodeApi().postMessage()` 向 Extension 发送消息；Extension 侧使用 `webview.onDidReceiveMessage()` 接收消息，并可通过 `webview.postMessage()` 向 Webview 推送事件。

Extension 侧可以使用：

- `vscode.window.registerWebviewViewProvider`
- `vscode.workspace.fs`
- `vscode.commands.executeCommand('vscode.diff', ...)`
- `vscode.window.createTerminal`
- `context.globalState`
- `context.workspaceState`
- `context.secrets`
- `context.globalStorageUri`

### 2.2 AutoGen 运行时依据

AutoGen AgentChat 提供 `AssistantAgent`、tools、teams 和 `run_stream()` 等能力。`AssistantAgent` 可挂载工具函数；`run_stream()` 更适合 UI 实时展示，因为它可以把 Agent 消息、工具调用和最终结果逐步映射到 WebSocket 事件。

本项目不把 AutoGen 直接暴露给 UI，而是封装在：

```text
agent-service/
  autogen_runtime/
    adapters/
      autogen_adapter.py
```

### 2.3 Codex 执行方式依据

Codex CLI 是 OpenAI 的本地编码代理，可以在选定目录中读取、修改和运行代码。官方 Quickstart 说明 Codex 默认以 Agent mode 启动，可读取文件、运行命令、写入项目目录；Codex CLI 文档还提供配置、命令和交互模式说明。因此本清单以“让 Codex 在项目仓库根目录逐任务执行”为目标设计。

---

## 3. 期望项目目录结构

执行本清单后，项目最终结构建议如下：

```text
autogen-vscode-agent/
├─ package.json
├─ tsconfig.json
├─ README.md
├─ media/
│  └─ icon.svg
├─ src/
│  ├─ extension.ts
│  ├─ webview/
│  │  ├─ AgentWebviewProvider.ts
│  │  ├─ html.ts
│  │  ├─ messageTypes.ts
│  │  └─ webviewState.ts
│  ├─ api/
│  │  ├─ AutoGenServiceClient.ts
│  │  ├─ RuntimeClient.ts
│  │  ├─ TaskClient.ts
│  │  └─ ConfigClient.ts
│  ├─ runtime/
│  │  ├─ RuntimeManager.ts
│  │  ├─ PortManager.ts
│  │  └─ ProcessLogger.ts
│  ├─ tools/
│  │  ├─ ToolServer.ts
│  │  ├─ WorkspaceGuard.ts
│  │  ├─ FileTools.ts
│  │  ├─ SearchTools.ts
│  │  ├─ DiffTools.ts
│  │  ├─ PatchTools.ts
│  │  ├─ TerminalTools.ts
│  │  └─ GitTools.ts
│  ├─ store/
│  │  ├─ ConfigStore.ts
│  │  ├─ SecretStore.ts
│  │  ├─ TaskStore.ts
│  │  └─ EventStore.ts
│  └─ types/
│     ├─ config.ts
│     ├─ task.ts
│     ├─ events.ts
│     └─ tools.ts
├─ webview-ui/
│  ├─ autogen_full_control_ui_config_complete.html
│  └─ assets/
├─ agent-service/
│  ├─ pyproject.toml
│  ├─ requirements.lock
│  ├─ main.py
│  ├─ api/
│  │  ├─ runtime_api.py
│  │  ├─ task_api.py
│  │  ├─ config_api.py
│  │  └─ tool_proxy_api.py
│  ├─ autogen_runtime/
│  │  ├─ agent_factory.py
│  │  ├─ model_factory.py
│  │  ├─ workflow_runner.py
│  │  ├─ task_manager.py
│  │  ├─ output_parser.py
│  │  └─ adapters/
│  │     ├─ base.py
│  │     └─ autogen_adapter.py
│  ├─ schemas/
│  │  ├─ config.py
│  │  ├─ task.py
│  │  ├─ events.py
│  │  └─ tools.py
│  ├─ tools/
│  │  ├─ gateway.py
│  │  ├─ permission_guard.py
│  │  └─ approval_manager.py
│  └─ storage/
│     ├─ config_store.py
│     ├─ task_store.py
│     └─ event_store.py
└─ docs/
   └─ *.md
```

---

## 4. 开发阶段总览

建议分 9 个阶段执行：

| 阶段 | 目标 | 结果 |
|---|---|---|
| Phase 0 | 初始化 VS Code 插件骨架 | 能 F5 启动插件 |
| Phase 1 | 接入 Webview UI | 能看到完整控制台页面 |
| Phase 2 | Webview ⇄ Extension 消息协议 | 按钮能发消息、收到 mock 响应 |
| Phase 3 | 配置存储与 SecretStorage | Settings/Agents/Tools 能保存 |
| Phase 4 | Python AutoGen Service Runtime | Extension 能启动/停止/健康检查服务 |
| Phase 5 | HTTP/WebSocket 联调 | Run 页能创建任务并接收事件 |
| Phase 6 | VS Code Tool Server | 文件、搜索、Diff、Terminal、Git 工具可用 |
| Phase 7 | AutoGen 多 Agent Workflow | 完成代码修改闭环 |
| Phase 8 | 安全、打包、验收 | VSIX 可打包，MVP 可演示 |

---

# Phase 0：初始化项目与插件骨架

---

## Task 0.1 初始化 VS Code Extension 项目

### 目标

创建一个 TypeScript VS Code Extension 项目，可在 Extension Development Host 中启动。

### 前置条件

- Node.js 已安装
- npm / pnpm 可用
- VS Code 可用

### 涉及文件

```text
package.json
tsconfig.json
src/extension.ts
README.md
media/icon.svg
```

### 实现要求

1. 创建 TypeScript extension 项目。
2. `package.json` 中声明基础插件信息。
3. `src/extension.ts` 中实现 `activate()` 和 `deactivate()`。
4. 注册一个命令：

```text
autogenAgent.openConsole
```

5. 命令执行时显示提示：

```text
AutoGen Agent Console activated
```

### 禁止事项

- 不要在这个任务里接入 Webview。
- 不要启动 Python 服务。
- 不要引入复杂依赖。

### 验收标准

- `npm install` 成功。
- `npm run compile` 成功。
- F5 启动 Extension Development Host。
- 命令面板可执行 `AutoGen Agent: Open Console`。

### 建议提交说明

```text
chore: initialize VS Code extension project
```

---

## Task 0.2 配置 package.json contributes

### 目标

补充 Activity Bar 和 WebviewView 占位配置。

### 涉及文件

```text
package.json
media/icon.svg
```

### 实现要求

在 `package.json` 中添加：

```json
{
  "activationEvents": [
    "onView:autogenAgent.consoleView",
    "onCommand:autogenAgent.openConsole"
  ],
  "contributes": {
    "commands": [
      {
        "command": "autogenAgent.openConsole",
        "title": "AutoGen Agent: Open Console"
      }
    ],
    "viewsContainers": {
      "activitybar": [
        {
          "id": "autogenAgent",
          "title": "AutoGen",
          "icon": "media/icon.svg"
        }
      ]
    },
    "views": {
      "autogenAgent": [
        {
          "id": "autogenAgent.consoleView",
          "name": "Agent Console"
        }
      ]
    }
  }
}
```

### 验收标准

- 左侧 Activity Bar 出现 AutoGen 图标。
- 点击后有 Agent Console 视图容器。

### 建议提交说明

```text
feat: register AutoGen activity view container
```

---

# Phase 1：接入 Webview UI

---

## Task 1.1 创建 AgentWebviewProvider

### 目标

实现 VS Code WebviewViewProvider，把 HTML 控制台挂到侧边栏视图。

### 涉及文件

```text
src/webview/AgentWebviewProvider.ts
src/webview/html.ts
src/extension.ts
```

### 实现要求

1. 创建 `AgentWebviewProvider` 类。
2. 实现 `resolveWebviewView()`。
3. 设置：

```ts
webviewView.webview.options = {
  enableScripts: true,
  localResourceRoots: [context.extensionUri]
};
```

4. HTML 内容先返回简单页面：

```html
<h1>AutoGen Console</h1>
```

5. 在 `extension.ts` 中注册：

```ts
vscode.window.registerWebviewViewProvider(
  'autogenAgent.consoleView',
  provider
)
```

### 禁止事项

- 不要在这个任务里接入完整 HTML。
- 不要写业务逻辑。

### 验收标准

- 左侧 Agent Console 显示 `AutoGen Console`。

### 建议提交说明

```text
feat: add WebviewViewProvider for AutoGen console
```

---

## Task 1.2 接入完整 Claude 风格 HTML

### 目标

把 `autogen_full_control_ui_config_complete.html` 接入 Webview。

### 涉及文件

```text
webview-ui/autogen_full_control_ui_config_complete.html
src/webview/html.ts
src/webview/AgentWebviewProvider.ts
```

### 实现要求

1. 将 HTML 文件放入 `webview-ui/`。
2. `html.ts` 中读取该 HTML。
3. 替换其中静态资源路径为 Webview URI。
4. 添加 CSP。
5. 保证页面在 VS Code Webview 中正常显示。

### CSP 建议

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${nonce};">
```

如果当前 HTML 是纯静态无 JS，可以先不注入脚本 nonce。后续加 JS 时再补。

### 验收标准

- Webview 显示完整 UI。
- Run / Agents / Team / Tools / Workflow / Settings 六个 Tab 可见。
- 页面无空白。
- Developer Tools 无 CSP 报错。

### 建议提交说明

```text
feat: embed complete AutoGen console webview UI
```

---

## Task 1.3 实现 Tab 切换

### 目标

让 Webview 内 6 个 Tab 可切换。

### 涉及文件

```text
src/webview/html.ts
webview-ui/autogen_full_control_ui_config_complete.html
```

### 实现要求

1. 为 6 个 Tab 添加 `data-tab`。
2. 每个页面区域添加 `data-panel`。
3. 点击 Tab 时：
   - 激活当前 Tab。
   - 显示对应 panel。
   - 隐藏其他 panel。
4. 默认显示 Run。

### 禁止事项

- 不要引入 React/Vue。
- 不要改动整体样式。

### 验收标准

- 点击 Run/Agents/Team/Tools/Workflow/Settings 正常切换。
- 页面不刷新。

### 建议提交说明

```text
feat: implement webview tab switching
```

---

# Phase 2：Webview ⇄ Extension 消息协议

---

## Task 2.1 定义 Webview 消息类型

### 目标

建立统一的 Webview → Extension 消息类型定义。

### 涉及文件

```text
src/webview/messageTypes.ts
src/types/events.ts
```

### 实现要求

定义基础消息：

```ts
export interface WebviewRequest<T = any> {
  id: string;
  type: string;
  payload: T;
  timestamp: number;
}

export interface WebviewResponse<T = any> {
  id: string;
  ok: boolean;
  type: string;
  payload?: T;
  error?: {
    code: string;
    message: string;
    detail?: any;
  };
  timestamp: number;
}
```

定义主要 type 常量：

```ts
export const WebviewMessageTypes = {
  TaskCreate: 'task.create',
  TaskPause: 'task.pause',
  TaskResume: 'task.resume',
  TaskCancel: 'task.cancel',
  AgentSave: 'agent.save',
  TeamSave: 'team.save',
  ToolsSavePermissions: 'tools.permissions.save',
  WorkflowSave: 'workflow.save',
  SettingsSaveModel: 'settings.model.save',
  RuntimeStart: 'runtime.start',
  RuntimeStop: 'runtime.stop',
  RuntimeRestart: 'runtime.restart'
} as const;
```

### 验收标准

- TypeScript 编译通过。
- 后续任务可复用类型。

### 建议提交说明

```text
feat: define webview message protocol types
```

---

## Task 2.2 实现 Webview 侧 send() 方法

### 目标

在 Webview HTML 中注入统一 `send(type, payload)` 方法。

### 涉及文件

```text
src/webview/html.ts
webview-ui/autogen_full_control_ui_config_complete.html
```

### 实现要求

Webview JS：

```js
const vscode = acquireVsCodeApi();

function send(type, payload = {}) {
  vscode.postMessage({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
    type,
    payload,
    timestamp: Date.now()
  });
}
```

为关键按钮绑定：

- 发送任务 → `task.create`
- 暂停 → `task.pause`
- 继续 → `task.resume`
- 终止 → `task.cancel`
- 保存 Agent → `agent.save`
- 保存 Team → `team.save`
- 保存权限 → `tools.permissions.save`
- 保存 Workflow → `workflow.save`
- 保存设置 → `settings.save`
- 启动 Runtime → `runtime.start`
- 停止 Runtime → `runtime.stop`
- 重启 Runtime → `runtime.restart`

### 验收标准

- 点击按钮后 Extension 能收到消息。
- 消息包含 id、type、payload、timestamp。

### 建议提交说明

```text
feat: add webview postMessage dispatcher
```

---

## Task 2.3 实现 Extension 消息路由器

### 目标

Extension 侧集中处理 Webview 消息。

### 涉及文件

```text
src/webview/AgentWebviewProvider.ts
src/webview/WebviewMessageRouter.ts
```

### 实现要求

1. 创建 `WebviewMessageRouter`。
2. 根据 `message.type` 分发。
3. 未实现的 type 返回 mock 成功响应。
4. 错误返回统一格式。

示例：

```ts
switch (message.type) {
  case 'task.create':
    return this.handleTaskCreate(message);
  default:
    return this.reply(message.id, false, message.type, undefined, {
      code: 'UNSUPPORTED_MESSAGE_TYPE',
      message: `Unsupported message type: ${message.type}`
    });
}
```

### 验收标准

- 点击任何已绑定按钮不会报错。
- Webview 能收到 response。
- 未实现消息返回清晰错误。

### 建议提交说明

```text
feat: implement webview message router
```

---

# Phase 3：配置存储与 SecretStorage

---

## Task 3.1 实现配置类型定义

### 目标

定义 Agent、Team、Workflow、Tools、Settings 的 TypeScript 类型。

### 涉及文件

```text
src/types/config.ts
```

### 实现要求

至少定义：

```ts
export interface AgentConfig {}
export interface TeamConfig {}
export interface WorkflowConfig {}
export interface ToolPermissionConfig {}
export interface RuntimeSettings {}
export interface ModelSettings {}
export interface SafetySettings {}
export interface FullConfig {}
```

字段参考前面 05、06、07、10 号文档。

### 验收标准

- TypeScript 编译通过。
- 后续 ConfigStore 可引用。

### 建议提交说明

```text
feat: define configuration model types
```

---

## Task 3.2 实现 ConfigStore

### 目标

实现配置读写。

### 涉及文件

```text
src/store/ConfigStore.ts
src/store/defaultConfig.ts
```

### 实现要求

1. 使用 `context.globalStorageUri` 保存全局配置 JSON。
2. 使用 `context.workspaceState` 保存当前 workspace 选择项。
3. 提供：

```ts
loadFullConfig(): Promise<FullConfig>
saveFullConfig(config: FullConfig): Promise<void>
saveAgent(agent: AgentConfig): Promise<void>
saveTeam(team: TeamConfig): Promise<void>
saveWorkflow(workflow: WorkflowConfig): Promise<void>
saveToolPermissions(config: ToolPermissionConfig): Promise<void>
saveRuntimeSettings(settings: RuntimeSettings): Promise<void>
```

4. 第一次启动时写入默认配置。

### 验收标准

- 修改设置后重启 VS Code 仍能读取。
- 配置文件存在于 globalStorageUri。

### 建议提交说明

```text
feat: implement extension configuration store
```

---

## Task 3.3 实现 SecretStore

### 目标

使用 VS Code SecretStorage 保存 API Key。

### 涉及文件

```text
src/store/SecretStore.ts
src/store/ConfigStore.ts
```

### 实现要求

提供：

```ts
setApiKey(provider: string, value: string): Promise<void>
getApiKey(provider: string): Promise<string | undefined>
deleteApiKey(provider: string): Promise<void>
```

API Key 不得写入普通 JSON 配置。

### 验收标准

- Settings 页保存 API Key 后，配置文件中没有明文 key。
- 重启后 SecretStorage 可读回。

### 建议提交说明

```text
feat: store provider API keys in VS Code SecretStorage
```

---

# Phase 4：Python AutoGen Service Runtime

---

## Task 4.1 创建 agent-service FastAPI 项目

### 目标

初始化 Python AutoGen Service。

### 涉及文件

```text
agent-service/pyproject.toml
agent-service/main.py
agent-service/api/runtime_api.py
agent-service/schemas/config.py
agent-service/schemas/task.py
```

### 实现要求

1. 使用 FastAPI。
2. 提供：

```http
GET /health
GET /api/runtime/info
```

3. `/health` 返回：

```json
{
  "ok": true,
  "service": "autogen-agent-service",
  "version": "0.1.0"
}
```

### 验收标准

- `python main.py` 能启动。
- `GET /health` 返回 ok。

### 建议提交说明

```text
feat: initialize Python AutoGen FastAPI service
```

---

## Task 4.2 实现 RuntimeManager 启动 Python 服务

### 目标

Extension 能启动、停止、重启本地 Python AutoGen Service。

### 涉及文件

```text
src/runtime/RuntimeManager.ts
src/runtime/PortManager.ts
src/runtime/ProcessLogger.ts
src/api/RuntimeClient.ts
```

### 实现要求

1. 根据 Settings 中 Python Path 启动：

```text
python agent-service/main.py --port {port}
```

2. 启动前检查端口。
3. 启动后轮询 `/health`。
4. stdout/stderr 写入日志。
5. 支持 stop/restart。

### 验收标准

- Settings 页点击 Start Runtime 后服务启动。
- Health Check 返回 ok。
- Stop Runtime 后进程退出。

### 建议提交说明

```text
feat: add runtime manager for local AutoGen service
```

---

# Phase 5：HTTP/WebSocket 联调

---

## Task 5.1 实现 AutoGenServiceClient

### 目标

Extension 通过 HTTP 调用 AutoGen Service。

### 涉及文件

```text
src/api/AutoGenServiceClient.ts
src/api/TaskClient.ts
src/api/ConfigClient.ts
```

### 实现要求

封装：

```ts
getHealth()
createTask(payload)
pauseTask(taskId)
resumeTask(taskId)
cancelTask(taskId)
approvePlan(taskId, approvalId)
applyPatch(taskId, patchId)
saveConfig(config)
```

### 验收标准

- Extension 可以调用 `/health`。
- Run 页发送任务能调用 `/api/tasks`。

### 建议提交说明

```text
feat: implement AutoGen service HTTP client
```

---

## Task 5.2 实现任务创建 Mock API

### 目标

AutoGen Service 先返回 mock 任务事件，不接入真实 AutoGen。

### 涉及文件

```text
agent-service/api/task_api.py
agent-service/storage/task_store.py
agent-service/storage/event_store.py
```

### 实现要求

1. `POST /api/tasks` 创建 task。
2. 返回：

```json
{
  "taskId": "task_xxx",
  "status": "running"
}
```

3. 启动后台 mock 事件：

- `task.created`
- `agent.started`
- `agent.message`
- `tool.call`
- `tool.result`
- `patch.proposed`
- `approval.required`

### 验收标准

- Run 页点击发送后出现 mock Agent 消息。
- UI 状态能更新。

### 建议提交说明

```text
feat: implement mock task creation and events
```

---

## Task 5.3 实现 WebSocket 事件转发

### 目标

AutoGen Service → Extension → Webview 实时推送事件。

### 涉及文件

```text
agent-service/api/task_api.py
agent-service/storage/event_store.py
src/api/TaskEventSocket.ts
src/webview/AgentWebviewProvider.ts
```

### 实现要求

1. Python 提供：

```text
WS /ws/tasks/{taskId}
```

2. Extension 连接 WebSocket。
3. 收到事件后转发给 Webview：

```ts
webview.postMessage({ type: 'task.event', payload: event })
```

4. Webview 根据 event 渲染 timeline/message/tool cards。

### 验收标准

- Run 页可实时显示 mock 事件。
- 断开后不导致 Extension 崩溃。

### 建议提交说明

```text
feat: stream task events from service to webview
```

---

# Phase 6：VS Code Tool Server

---

## Task 6.1 实现 WorkspaceGuard

### 目标

所有文件工具必须限制在当前 workspace 内。

### 涉及文件

```text
src/tools/WorkspaceGuard.ts
```

### 实现要求

提供：

```ts
resolveInsideWorkspace(relativePath: string): vscode.Uri
isBlockedSensitivePath(relativePath: string): boolean
assertReadable(relativePath: string): void
assertWritable(relativePath: string): void
```

规则：

- 禁止 `../` 跳出 workspace。
- 禁止绝对路径访问 workspace 外。
- 默认禁止 `.env`、`id_rsa`、`*.pem`、`credentials.json`。

### 验收标准

- 访问 workspace 外文件会抛错。
- 敏感文件默认拒绝。

### 建议提交说明

```text
feat: add workspace path and sensitive file guard
```

---

## Task 6.2 实现 FileTools

### 目标

实现 list/read 文件工具。

### 涉及文件

```text
src/tools/FileTools.ts
src/tools/ToolServer.ts
```

### 实现要求

提供工具：

```text
list_files
read_file
read_files
```

返回统一格式：

```json
{
  "ok": true,
  "content": "...",
  "metadata": {}
}
```

### 验收标准

- AutoGen Service 可通过 Tool Server 调用 read_file。
- 大文件截断并提示。

### 建议提交说明

```text
feat: implement VS Code file tools
```

---

## Task 6.3 实现 SearchTools

### 目标

实现代码搜索。

### 涉及文件

```text
src/tools/SearchTools.ts
```

### 实现要求

优先使用：

```text
vscode.workspace.findFiles
```

如果本机存在 `rg`，可增强搜索。

工具：

```text
search_code
search_symbol
```

### 验收标准

- 能搜索 `@RestController`。
- 返回文件路径、行号、上下文片段。

### 建议提交说明

```text
feat: implement code search tools
```

---

## Task 6.4 实现 DiffTools

### 目标

打开 VS Code Diff 预览。

### 涉及文件

```text
src/tools/DiffTools.ts
```

### 实现要求

1. 支持 `open_diff`。
2. 使用 virtual document provider 显示 AI 修改后的内容。
3. 调用：

```ts
vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title)
```

### 验收标准

- 点击 查看 Diff 后打开 VS Code diff editor。
- 原文件和 AI 修改预览可比较。

### 建议提交说明

```text
feat: implement diff preview tool
```

---

## Task 6.5 实现 PatchTools

### 目标

支持 propose/apply/reject patch。

### 涉及文件

```text
src/tools/PatchTools.ts
```

### 实现要求

1. `propose_patch` 保存 patch。
2. `apply_patch` 使用安全检查后执行 `git apply` 或内部 patch apply。
3. `reject_patch` 记录原因。
4. 应用前创建 checkpoint。

### 验收标准

- proposed patch 能显示在 Run 页。
- apply patch 后 workspace 文件变化。
- 应用失败返回错误。

### 建议提交说明

```text
feat: implement patch proposal and application tools
```

---

## Task 6.6 实现 TerminalTools

### 目标

支持受控命令执行。

### 涉及文件

```text
src/tools/TerminalTools.ts
```

### 实现要求

1. 支持 `run_command`。
2. 默认只能执行白名单命令。
3. 非白名单命令触发 approval。
4. 捕获 stdout/stderr/exitCode。

### 验收标准

- `mvn test` 或 `npm test` 可执行。
- 危险命令被拒绝。

### 建议提交说明

```text
feat: implement guarded terminal command tool
```

---

## Task 6.7 实现 GitTools 与 checkpoint

### 目标

支持 git 状态、diff、checkpoint、rollback。

### 涉及文件

```text
src/tools/GitTools.ts
```

### 实现要求

工具：

```text
git_status
git_diff
create_checkpoint
rollback_checkpoint
```

MVP checkpoint 可用 patch 文件保存当前 diff。

### 验收标准

- 应用 patch 前自动 checkpoint。
- rollback 能恢复应用前状态。

### 建议提交说明

```text
feat: implement git tools and checkpoint rollback
```

---

# Phase 7：AutoGen 多 Agent Workflow

---

## Task 7.1 实现 Python 数据模型

### 目标

定义 AgentConfig、TeamConfig、WorkflowConfig、TaskContext 等 Pydantic 模型。

### 涉及文件

```text
agent-service/schemas/config.py
agent-service/schemas/task.py
agent-service/schemas/events.py
agent-service/schemas/tools.py
```

### 实现要求

模型字段对齐前面设计文档。

### 验收标准

- FastAPI OpenAPI schema 能正常生成。
- 请求数据可校验。

### 建议提交说明

```text
feat: define AutoGen service pydantic schemas
```

---

## Task 7.2 实现 ToolGateway

### 目标

Python AutoGen Service 通过 Extension Tool Server 调用 VS Code 工具。

### 涉及文件

```text
agent-service/tools/gateway.py
agent-service/tools/permission_guard.py
agent-service/tools/approval_manager.py
```

### 实现要求

1. ToolGateway 封装 HTTP 调用 Extension Tool Server。
2. PermissionGuard 检查工具权限。
3. confirm 权限触发 approval_required 事件。

### 验收标准

- Python 可调用 read_file 工具。
- 被拒绝工具返回清晰错误。

### 建议提交说明

```text
feat: implement tool gateway with permission checks
```

---

## Task 7.3 实现 AgentFactory

### 目标

根据 UI 配置创建 AutoGen AssistantAgent。

### 涉及文件

```text
agent-service/autogen_runtime/agent_factory.py
agent-service/autogen_runtime/model_factory.py
```

### 实现要求

1. 根据 AgentConfig 创建 AssistantAgent。
2. 根据 tools 权限注入工具函数。
3. 根据 ModelSettings 创建 OpenAI-compatible model client。
4. 不要在业务层到处直接 import AutoGen。

### 验收标准

- 可创建 PlannerAgent / DeveloperAgent。
- tools 可被 Agent 调用。

### 建议提交说明

```text
feat: add AutoGen agent and model factories
```

---

## Task 7.4 实现 WorkflowRunner 顺序流程

### 目标

先实现 Code Edit Workflow 的顺序执行。

### 涉及文件

```text
agent-service/autogen_runtime/workflow_runner.py
agent-service/autogen_runtime/task_manager.py
```

### 实现要求

流程：

```text
Planner → HumanApproval → Codebase → Developer → Reviewer → PatchApproval → Tester → Summary
```

支持：

- 暂停
- 继续
- 取消
- 用户确认
- 失败回退一次

### 验收标准

- Run 页发送任务后按流程推送事件。
- 到 plan approval 处会等待 UI 点击。
- 到 patch approval 处会等待 UI 点击。

### 建议提交说明

```text
feat: implement sequential code edit workflow runner
```

---

## Task 7.5 实现 AutoGen run_stream 事件映射

### 目标

把 AutoGen stream 事件转成统一 WebSocket 事件。

### 涉及文件

```text
agent-service/autogen_runtime/adapters/autogen_adapter.py
agent-service/storage/event_store.py
```

### 实现要求

映射：

```text
AutoGen message       → agent.message
Tool call request     → tool.call
Tool call result      → tool.result
Final TaskResult      → agent.completed
Exception             → agent.failed
```

### 验收标准

- UI 能实时显示 Agent 输出。
- Tool call 能显示成卡片。

### 建议提交说明

```text
feat: map AutoGen stream events to task websocket events
```

---

## Task 7.6 实现 OutputParser

### 目标

解析 Agent 输出中的结构化 JSON / patch / review / test summary。

### 涉及文件

```text
agent-service/autogen_runtime/output_parser.py
```

### 实现要求

支持：

- Planner 输出 plan JSON
- Developer 输出 patch
- Reviewer 输出 review JSON
- Tester 输出 test result JSON
- Summary 输出 summary JSON

### 验收标准

- DeveloperAgent 输出 patch 后能创建 patch_proposed 事件。
- Reviewer 输出风险后 UI 能显示风险等级。

### 建议提交说明

```text
feat: parse structured agent outputs for workflow state
```

---

# Phase 8：安全、打包、验收

---

## Task 8.1 实现 Workspace Trust 检查

### 目标

不可信工作区禁用写文件和命令执行。

### 涉及文件

```text
src/extension.ts
src/tools/ToolServer.ts
```

### 实现要求

1. 检查 `vscode.workspace.isTrusted`。
2. 如果不可信：
   - 禁用 apply_patch。
   - 禁用 run_command。
   - UI 显示警告。

### 验收标准

- 不可信 workspace 下危险操作被拒绝。

### 建议提交说明

```text
feat: respect VS Code workspace trust for dangerous tools
```

---

## Task 8.2 实现日志脱敏

### 目标

日志中不输出 API Key、token、敏感文件内容。

### 涉及文件

```text
src/runtime/ProcessLogger.ts
src/store/EventStore.ts
agent-service/storage/event_store.py
```

### 实现要求

脱敏：

```text
OPENAI_API_KEY
Authorization
Bearer xxx
.env 内容
id_rsa 内容
```

### 验收标准

- 日志中不出现 API Key 明文。

### 建议提交说明

```text
feat: redact secrets from logs and task events
```

---

## Task 8.3 实现 VSIX 打包脚本

### 目标

可打包 VS Code 插件。

### 涉及文件

```text
package.json
.vscodeignore
scripts/build.js
```

### 实现要求

1. 添加：

```json
{
  "scripts": {
    "compile": "tsc -p ./",
    "package": "vsce package"
  }
}
```

2. `.vscodeignore` 排除开发无关文件。
3. 确保 webview-ui 和 agent-service 被包含。

### 验收标准

- `npm run package` 生成 `.vsix`。
- 安装 VSIX 后 UI 可打开。

### 建议提交说明

```text
chore: add VSIX packaging configuration
```

---

## Task 8.4 MVP 端到端验收

### 目标

验证完整链路。

### 验收场景 A：解释项目

输入：

```text
请阅读当前项目结构并总结主要模块。
```

期望：

- Planner 输出计划。
- Codebase 调用 list_files/read_file。
- Summary 输出项目结构总结。
- 不产生 patch。

### 验收场景 B：生成小改动 patch

输入：

```text
请给 README.md 增加一段项目启动说明。
```

期望：

- Developer 输出 patch。
- UI 显示 proposed changes。
- 点击 Diff 可查看。
- 点击 Apply 后文件变化。

### 验收场景 C：执行测试

输入：

```text
运行项目测试并总结失败原因。
```

期望：

- Tester 请求 run_command。
- 非白名单命令需要确认。
- 终端结果显示在 UI。

### 验收场景 D：危险操作拒绝

输入：

```text
删除整个项目目录。
```

期望：

- Agent 不能执行危险命令。
- UI 显示安全拒绝。

### 验收场景 E：服务重启

操作：

- Settings → Restart Runtime

期望：

- Runtime 停止后重新启动。
- Health Check 正常。
- UI 状态更新。

### 建议提交说明

```text
test: complete MVP end-to-end validation
```

---

## 5. Codex 执行提示词模板

每次让 Codex 执行任务时，建议这样给：

```text
你正在开发一个 VS Code Extension + Python AutoGen Service 项目。
请只执行任务 Task X.X，不要顺手实现后续任务。

要求：
1. 只修改任务中列出的文件；如果必须修改其他文件，请先说明原因。
2. 保持 TypeScript 编译通过。
3. 保持 Python 服务可启动。
4. 不要引入大型框架。
5. 不要改动 UI 整体样式，除非任务明确要求。
6. 所有危险操作必须走权限检查。
7. 完成后列出修改文件和验证方式。

任务内容：
【粘贴 Task X.X】
```

---

## 6. Codex 每次完成后的检查清单

Codex 完成每个任务后必须输出：

```text
完成情况：
- [ ] 实现了任务目标
- [ ] 只修改了允许的文件
- [ ] TypeScript 编译通过
- [ ] Python 服务可启动，若涉及 Python
- [ ] 没有明文输出 API Key
- [ ] 没有绕过 WorkspaceGuard
- [ ] 没有直接执行危险命令
- [ ] 给出手动验证步骤
```

---

## 7. 人类开发者复查清单

人类每次 review Codex 结果时，重点看：

```text
1. 有没有越权修改文件？
2. 有没有把 API Key 写到配置文件？
3. 有没有绕过 ToolGateway？
4. 有没有直接让 AutoGen 访问磁盘？
5. 有没有 UI 直接调用 Python Service？
6. 有没有让 Webview 直接执行危险脚本？
7. 有没有破坏 Tab 结构？
8. 有没有把 AutoGen API 写散到多个地方？
9. 有没有缺少错误处理？
10. 有没有无法编译？
```

---

## 8. 任务执行顺序建议

严格顺序：

```text
0.1 → 0.2
1.1 → 1.2 → 1.3
2.1 → 2.2 → 2.3
3.1 → 3.2 → 3.3
4.1 → 4.2
5.1 → 5.2 → 5.3
6.1 → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7
7.1 → 7.2 → 7.3 → 7.4 → 7.5 → 7.6
8.1 → 8.2 → 8.3 → 8.4
```

不建议跳过：

```text
WorkspaceGuard
SecretStorage
ToolGateway
ApprovalManager
EventStore
```

这几个是后期稳定性和安全边界的核心。

---

## 9. 自检清单

| 检查项 | 结果 |
|---|---|
| 是否按阶段拆分任务 | 是 |
| 是否每个任务都有目标 | 是 |
| 是否每个任务都有涉及文件 | 是 |
| 是否每个任务都有实现要求 | 是 |
| 是否每个任务都有验收标准 | 是 |
| 是否覆盖 Webview | 是 |
| 是否覆盖 Extension 通信 | 是 |
| 是否覆盖 Config / SecretStorage | 是 |
| 是否覆盖 Python AutoGen Service | 是 |
| 是否覆盖 HTTP / WebSocket | 是 |
| 是否覆盖 VS Code Tool Server | 是 |
| 是否覆盖文件 / 搜索 / Diff / Terminal / Git | 是 |
| 是否覆盖 AutoGen AgentFactory / WorkflowRunner | 是 |
| 是否覆盖安全 / Workspace Trust / 日志脱敏 | 是 |
| 是否覆盖 VSIX 打包 | 是 |
| 是否适合逐任务交给 Codex 执行 | 是 |

---

## 10. 后续文档

下一份建议生成：

```text
15_AutoGen后期升级维护与迁移策略详细设计.md
```

该文档需要覆盖：

- AutoGenAdapter 抽象
- RuntimeProvider 设计
- Microsoft Agent Framework 迁移预留
- LangGraph / 自研 WorkflowRunner 替换策略
- 版本锁定
- 兼容性测试
- Prompt 版本管理
- Tool 协议稳定性
- UI 事件协议稳定性
- 灰度迁移和回滚
