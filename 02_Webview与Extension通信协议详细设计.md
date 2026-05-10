
# 02 Webview 与 VS Code Extension 通信协议详细设计

版本：v1.0  
适用项目：AutoGen Code Agent VS Code 插件  
对应 UI：`autogen_full_control_ui_config_complete.html`  
文档目标：把 UI 层所有 Tab、按钮、下拉框、输入框、textarea 统一映射为 `Webview -> Extension` 与 `Extension -> Webview` 的消息协议，便于后续直接给 Codex / 开发者实现。

---

## 1. 资料检索与设计依据

本设计参考了以下官方资料和开发资料：

1. VS Code 官方 Webview API 文档  
   - 说明 Webview 可用于构建复杂自定义 UI。
   - Webview 内通过 `acquireVsCodeApi().postMessage()` 向扩展发送消息。
   - 扩展侧通过 `webview.onDidReceiveMessage()` 接收消息。
   - 扩展侧通过 `webview.postMessage()` 向 Webview 发送消息。  
   参考：https://code.visualstudio.com/api/extension-guides/webview

2. VS Code 官方 API Reference  
   - `WebviewViewProvider`
   - `Webview`
   - `WebviewView`
   - `ExtensionContext`
   - `SecretStorage`
   - `Memento`
   - `Uri`
   - `CancellationToken`  
   参考：https://code.visualstudio.com/api/references/vscode-api

3. VS Code Webview UX Guidelines  
   - Webview 应用于 VS Code 原生 API 不足以表达复杂 UI 的场景。
   - Webview UI 需要适配 VS Code 主题、布局、交互习惯。  
   参考：https://code.visualstudio.com/api/ux-guidelines/webviews

4. VS Code Common Capabilities  
   - `globalStorageUri` 适合保存扩展全局数据。
   - `storageUri` 适合保存工作区相关数据。
   - `SecretStorage` 适合保存 token / API key 等敏感数据。  
   参考：https://code.visualstudio.com/api/extension-capabilities/common-capabilities

5. VS Code Webview CSP 建议  
   - 官方更新记录强调 Webview 应设置 Content Security Policy。
   - 应尽量限制脚本、样式、图片来源，降低注入风险。  
   参考：https://code.visualstudio.com/updates/v1_38

6. Ansible VS Code Extension Webview Guide  
   - 说明 `acquireVsCodeApi()` 在 Webview 内只能调用一次，应保存实例复用。
   - 说明 Webview 与 Extension 的消息传递方式。  
   参考：https://docs.ansible.com/projects/vscode-ansible/development/webview_guide/

本项目采用：

```text
Webview HTML/JS
  ↓ acquireVsCodeApi().postMessage()
Extension Host TypeScript
  ↓ HTTP/WebSocket
Python AutoGen Service
```

本文档只覆盖：

```text
Webview ⇄ VS Code Extension
```

不直接覆盖：

```text
Extension ⇄ AutoGen Service
AutoGen ⇄ VS Code Tools
```

这些在后续文档中展开。

---

## 2. 通信设计目标

### 2.1 设计目标

Webview 与 Extension 的通信必须满足：

```text
1. 所有 UI 控件事件都有统一消息格式
2. 所有消息可追踪、可日志化、可调试
3. 所有请求都有 requestId
4. 所有请求都能收到成功或失败响应
5. 所有运行中事件可以由 Extension 主动推送给 Webview
6. 兼容异步任务、流式任务、弹窗确认、配置保存
7. 不在 Webview 内直接访问本地文件、终端、Git、AutoGen 服务
8. 敏感信息不在 Webview 长期保存
```

### 2.2 非目标

本文档不设计：

```text
1. AutoGen Python 服务内部实现
2. AgentFactory 创建 AssistantAgent 的细节
3. WorkflowRunner 执行节点逻辑
4. VS Code 文件系统工具具体实现
5. Diff Editor 具体实现
6. Python runtime 打包细节
```

---

## 3. 总体通信链路

### 3.1 Webview 发送命令到 Extension

```text
用户点击按钮 / 修改表单 / 切换 Tab
  ↓
Webview JS collect payload
  ↓
vscode.postMessage({
  id,
  type,
  payload,
  meta
})
  ↓
Extension webview.onDidReceiveMessage()
  ↓
MessageRouter.dispatch()
  ↓
对应 Controller 处理
  ↓
Extension 给 Webview 返回 ack / error / state patch
```

### 3.2 Extension 推送状态到 Webview

```text
AutoGen Service WebSocket 消息
  ↓
Extension 接收
  ↓
转换为 UIEvent
  ↓
webview.postMessage({
  id,
  type: "event.xxx",
  payload
})
  ↓
Webview window.addEventListener("message")
  ↓
更新 UI 状态
```

### 3.3 Extension 主动推送配置

```text
Webview 首次加载
  ↓
Webview 发送 ui.ready
  ↓
Extension 读取配置、状态、当前 workspace
  ↓
Extension 发送 state.init
  ↓
Webview 渲染六个 Tab 初始状态
```

---

## 4. 消息命名规范

### 4.1 命名格式

统一使用：

```text
domain.action
```

例如：

```text
task.create
task.pause
agent.save
team.save
tool.permission.save
workflow.node.add
settings.model.save
runtime.restart
patch.apply
command.approve
ui.ready
state.init
```

### 4.2 领域 domain

| domain | 含义 |
|---|---|
| `ui` | Webview 生命周期和 UI 行为 |
| `state` | Extension 向 Webview 下发状态 |
| `task` | 任务创建、暂停、继续、终止 |
| `plan` | 计划接受、调整、保存模板 |
| `patch` | Diff 查看、应用、拒绝、部分应用 |
| `command` | 命令执行确认、白名单、拒绝 |
| `agent` | Agent 配置 |
| `team` | Team 配置 |
| `tool` | 工具权限、工具注册、工具测试 |
| `workflow` | Workflow 配置和节点操作 |
| `settings` | 模型、安全、Runtime 配置 |
| `runtime` | AutoGen Service 生命周期 |
| `context` | 上下文选择和读取范围 |
| `history` | 任务历史 |
| `log` | 日志复制、清空、打开 |
| `error` | 错误消息 |

---

## 5. 通用消息结构

### 5.1 Webview -> Extension Request

```ts
export interface WebviewRequest<TPayload = unknown> {
  id: string;                 // UUID 或递增 ID
  type: string;               // domain.action
  payload: TPayload;
  meta: {
    tab: "run" | "agents" | "team" | "tools" | "workflow" | "settings";
    workspaceId?: string;
    taskId?: string;
    timestamp: number;
    uiVersion: string;
  };
}
```

示例：

```json
{
  "id": "req_1710000000001_abcd",
  "type": "task.create",
  "payload": {
    "userRequest": "帮我增加 JWT 登录接口",
    "teamId": "java-spring-team",
    "workflowId": "code-edit",
    "mode": "semi-auto"
  },
  "meta": {
    "tab": "run",
    "workspaceId": "ws_001",
    "timestamp": 1710000000001,
    "uiVersion": "1.0.0"
  }
}
```

### 5.2 Extension -> Webview Response

```ts
export interface ExtensionResponse<TPayload = unknown> {
  id: string;                 // 对应 request id
  type: "response.success" | "response.error";
  requestType: string;        // 原始 request type
  payload?: TPayload;
  error?: {
    code: string;
    message: string;
    detail?: unknown;
    recoverable: boolean;
  };
  meta: {
    timestamp: number;
  };
}
```

成功：

```json
{
  "id": "req_1710000000001_abcd",
  "type": "response.success",
  "requestType": "task.create",
  "payload": {
    "taskId": "task_001",
    "status": "created"
  },
  "meta": {
    "timestamp": 1710000000100
  }
}
```

失败：

```json
{
  "id": "req_1710000000001_abcd",
  "type": "response.error",
  "requestType": "task.create",
  "error": {
    "code": "NO_WORKSPACE",
    "message": "请先打开一个项目目录",
    "recoverable": true
  },
  "meta": {
    "timestamp": 1710000000100
  }
}
```

### 5.3 Extension -> Webview Event

```ts
export interface ExtensionEvent<TPayload = unknown> {
  id: string;
  type: string;               // event.xxx 或 state.xxx
  payload: TPayload;
  meta: {
    source: "extension" | "autogen" | "tool" | "runtime";
    taskId?: string;
    timestamp: number;
  };
}
```

示例：

```json
{
  "id": "evt_001",
  "type": "event.agent.status",
  "payload": {
    "agentId": "developer_agent",
    "agentName": "DeveloperAgent",
    "status": "running"
  },
  "meta": {
    "source": "autogen",
    "taskId": "task_001",
    "timestamp": 1710000000200
  }
}
```

---

## 6. Webview 端通信基础实现

### 6.1 acquireVsCodeApi 只调用一次

Webview 内只允许调用一次 `acquireVsCodeApi()`，需要封装为单例：

```js
const vscode = acquireVsCodeApi();

const client = {
  pending: new Map(),

  request(type, payload = {}, meta = {}) {
    const id = `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const message = {
      id,
      type,
      payload,
      meta: {
        tab: state.activeTab,
        workspaceId: state.workspace?.id,
        taskId: state.currentTaskId,
        timestamp: Date.now(),
        uiVersion: "1.0.0",
        ...meta
      }
    };

    vscode.postMessage(message);

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, type, createdAt: Date.now() });

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Request timeout: ${type}`));
        }
      }, 30000);
    });
  }
};
```

### 6.2 接收 Extension 消息

```js
window.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "response.success" || message.type === "response.error") {
    handleResponse(message);
    return;
  }

  if (message.type.startsWith("state.")) {
    handleStateMessage(message);
    return;
  }

  if (message.type.startsWith("event.")) {
    handleRuntimeEvent(message);
    return;
  }
});
```

### 6.3 响应处理

```js
function handleResponse(message) {
  const pending = client.pending.get(message.id);
  if (!pending) {
    console.warn("Unknown response", message);
    return;
  }

  client.pending.delete(message.id);

  if (message.type === "response.success") {
    pending.resolve(message.payload);
  } else {
    showToast(message.error.message, "error");
    pending.reject(message.error);
  }
}
```

---

## 7. Extension 端通信基础实现

### 7.1 WebviewViewProvider

```ts
export class AutoGenWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "autogenCodeAgent.controlView";

  private view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly router: WebviewMessageRouter
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
        vscode.Uri.joinPath(this.context.extensionUri, "dist")
      ]
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      const response = await this.router.dispatch(message);
      if (response) {
        webviewView.webview.postMessage(response);
      }
    });
  }

  postEvent(event: ExtensionEvent) {
    this.view?.webview.postMessage(event);
  }
}
```

### 7.2 MessageRouter

```ts
export class WebviewMessageRouter {
  constructor(
    private readonly taskController: TaskController,
    private readonly agentController: AgentController,
    private readonly teamController: TeamController,
    private readonly toolController: ToolController,
    private readonly workflowController: WorkflowController,
    private readonly settingsController: SettingsController,
    private readonly runtimeController: RuntimeController
  ) {}

  async dispatch(message: WebviewRequest): Promise<ExtensionResponse> {
    try {
      const payload = await this.route(message);
      return {
        id: message.id,
        type: "response.success",
        requestType: message.type,
        payload,
        meta: { timestamp: Date.now() }
      };
    } catch (err: any) {
      return {
        id: message.id,
        type: "response.error",
        requestType: message.type,
        error: {
          code: err.code || "UNKNOWN_ERROR",
          message: err.message || "未知错误",
          detail: err.detail,
          recoverable: err.recoverable ?? true
        },
        meta: { timestamp: Date.now() }
      };
    }
  }

  private async route(message: WebviewRequest): Promise<unknown> {
    switch (message.type) {
      case "ui.ready":
        return this.runtimeController.getInitialState();

      case "task.create":
        return this.taskController.createTask(message.payload);

      case "task.pause":
        return this.taskController.pauseTask(message.payload);

      case "agent.save":
        return this.agentController.saveAgent(message.payload);

      default:
        throw new Error(`Unsupported message type: ${message.type}`);
    }
  }
}
```

---

## 8. UI 生命周期协议

### 8.1 ui.ready

Webview HTML 加载完成后发送。

```ts
type: "ui.ready"
payload: {
  activeTab: string;
  htmlVersion: string;
}
```

示例：

```json
{
  "type": "ui.ready",
  "payload": {
    "activeTab": "run",
    "htmlVersion": "1.0.0"
  }
}
```

Extension 返回：

```json
{
  "workspace": {
    "id": "ws_001",
    "name": "mall-springboot",
    "root": "D:/projects/mall-springboot",
    "language": "java",
    "framework": "spring-boot",
    "gitBranch": "feature/auth"
  },
  "runtime": {
    "status": "running",
    "serviceUrl": "http://127.0.0.1:8765",
    "port": 8765
  },
  "settings": {},
  "agents": [],
  "teams": [],
  "workflows": [],
  "tools": [],
  "currentTask": null
}
```

### 8.2 ui.tab.change

用户切换 Tab 时发送，用于懒加载数据。

```json
{
  "type": "ui.tab.change",
  "payload": {
    "tab": "agents"
  }
}
```

Extension 可以返回该 Tab 所需数据：

```json
{
  "tab": "agents",
  "agents": [
    {
      "id": "planner_agent",
      "name": "PlannerAgent"
    }
  ]
}
```

### 8.3 ui.theme.changed

可选。如果 Extension 监听 VS Code 主题变化，可主动推送：

```json
{
  "type": "state.theme.changed",
  "payload": {
    "kind": "dark",
    "themeName": "Default Dark Modern"
  }
}
```

---

## 9. Run Tab 通信协议

Run Tab 是任务执行主界面。

### 9.1 控件清单

| 控件 | 类型 | 消息类型 |
|---|---|---|
| Team 选择 | select | `run.form.changed` |
| Workflow 选择 | select | `run.form.changed` |
| Mode 选择 | select | `run.form.changed` |
| Target Agent 选择 | select | `run.form.changed` |
| 任务输入 | textarea | 本地状态，发送时带入 |
| 历史按钮 | button | `history.open` |
| 上下文按钮 | button | `context.open` |
| 发送给 AutoGen Team | button | `task.create` |
| 继续 | button | `task.resume` |
| 暂停 | button | `task.pause` |
| 终止 | button | `task.cancel` |
| 重跑当前 Agent | button | `task.rerunCurrentAgent` |
| 切换 Agent | button | `task.switchAgent.open` / `task.switchAgent.confirm` |
| 复制日志 | button | `log.copyCurrentTask` |
| 接受计划 | button | `plan.approve` |
| 调整计划 | button + textarea | `plan.revise` |
| 保存为模板 | button + modal | `plan.saveAsTemplate` |
| 查看 Diff | button | `patch.openDiff` |
| 应用 Patch | button | `patch.apply` |
| 拒绝并说明 | button + textarea | `patch.reject` |
| 部分应用 | button + checkbox list | `patch.applyPartial` |
| 让 AI 解释 | button | `patch.explain` |
| 允许一次 | button | `command.approveOnce` |
| 加入白名单 | button | `command.addToAllowlist` |
| 拒绝命令 | button | `command.reject` |
| 底部追加消息 | input/textarea | `task.userMessage` |

### 9.2 run.form.changed

表单改动一般可以不发给 Extension，只保存在 Webview 本地。  
如果需要跨刷新恢复，则发送：

```json
{
  "type": "run.form.changed",
  "payload": {
    "teamId": "java-spring-team",
    "workflowId": "code-edit",
    "mode": "semi-auto",
    "targetAgent": "current"
  }
}
```

Extension 处理：

```text
保存到 workspaceState，作为下次默认值。
```

### 9.3 task.create

触发：点击「发送给 AutoGen Team」

```json
{
  "type": "task.create",
  "payload": {
    "userRequest": "帮我增加 JWT 登录接口",
    "teamId": "java-spring-team",
    "workflowId": "code-edit",
    "mode": "semi-auto",
    "targetAgent": "team",
    "contextRefs": [
      "current_file",
      "selection",
      "git_diff"
    ],
    "approvalPolicy": {
      "plan": true,
      "patch": true,
      "command": true
    }
  }
}
```

Extension 处理：

```text
1. 校验 workspace 是否存在
2. 收集当前文件、选中代码、Git diff 等上下文引用
3. 调用 AutoGen Service: POST /api/tasks
4. 建立 task WebSocket
5. 返回 taskId
6. UI 切换到 running 状态
```

成功响应：

```json
{
  "taskId": "task_001",
  "status": "created",
  "wsPath": "/ws/tasks/task_001"
}
```

### 9.4 task.pause

```json
{
  "type": "task.pause",
  "payload": {
    "taskId": "task_001"
  }
}
```

Extension 处理：

```text
POST /api/tasks/task_001/pause
```

UI 更新：

```text
任务状态：paused
按钮：暂停变继续
当前 Agent 状态：paused
```

### 9.5 task.resume

```json
{
  "type": "task.resume",
  "payload": {
    "taskId": "task_001"
  }
}
```

Extension 处理：

```text
POST /api/tasks/task_001/resume
```

### 9.6 task.cancel

```json
{
  "type": "task.cancel",
  "payload": {
    "taskId": "task_001",
    "reason": "用户手动终止"
  }
}
```

Extension 处理：

```text
POST /api/tasks/task_001/cancel
必要时关闭 WebSocket 或标记任务完成。
```

### 9.7 task.rerunCurrentAgent

```json
{
  "type": "task.rerunCurrentAgent",
  "payload": {
    "taskId": "task_001",
    "agentId": "developer_agent",
    "reason": "用户要求重新生成"
  }
}
```

Extension 处理：

```text
POST /api/tasks/task_001/rerun-agent
```

### 9.8 task.switchAgent.open

触发：点击「切换 Agent」

```json
{
  "type": "task.switchAgent.open",
  "payload": {
    "taskId": "task_001"
  }
}
```

Extension 返回可切换 Agent：

```json
{
  "agents": [
    {
      "id": "planner_agent",
      "name": "PlannerAgent"
    },
    {
      "id": "developer_agent",
      "name": "DeveloperAgent"
    }
  ]
}
```

### 9.9 task.switchAgent.confirm

```json
{
  "type": "task.switchAgent.confirm",
  "payload": {
    "taskId": "task_001",
    "agentId": "reviewer_agent",
    "instruction": "请先审查当前 patch"
  }
}
```

### 9.10 plan.approve

```json
{
  "type": "plan.approve",
  "payload": {
    "taskId": "task_001",
    "planId": "plan_001"
  }
}
```

Extension 处理：

```text
POST /api/tasks/task_001/approve-plan
```

### 9.11 plan.revise

```json
{
  "type": "plan.revise",
  "payload": {
    "taskId": "task_001",
    "planId": "plan_001",
    "feedback": "不要修改 SecurityConfig，先只增加 Controller 和 Service"
  }
}
```

### 9.12 plan.saveAsTemplate

```json
{
  "type": "plan.saveAsTemplate",
  "payload": {
    "taskId": "task_001",
    "planId": "plan_001",
    "templateName": "Spring Boot JWT 登录接口模板",
    "description": "用于生成登录接口的标准流程"
  }
}
```

Extension 处理：

```text
保存到 workflow template 或 plan template 配置目录。
```

### 9.13 patch.openDiff

```json
{
  "type": "patch.openDiff",
  "payload": {
    "taskId": "task_001",
    "patchId": "patch_001",
    "mode": "vscode-diff"
  }
}
```

Extension 处理：

```text
1. GET /api/tasks/task_001/patches/patch_001
2. 解析 unified diff
3. 使用 vscode.diff 打开对应文件 diff
4. 或打开 Webview 内 Diff 预览
```

### 9.14 patch.apply

```json
{
  "type": "patch.apply",
  "payload": {
    "taskId": "task_001",
    "patchId": "patch_001",
    "createCheckpoint": true
  }
}
```

### 9.15 patch.reject

```json
{
  "type": "patch.reject",
  "payload": {
    "taskId": "task_001",
    "patchId": "patch_001",
    "reason": "项目已有 TokenService，不需要新增 JwtUtil"
  }
}
```

### 9.16 patch.applyPartial

```json
{
  "type": "patch.applyPartial",
  "payload": {
    "taskId": "task_001",
    "patchId": "patch_001",
    "files": [
      "src/main/java/com/demo/AuthController.java",
      "src/main/java/com/demo/AuthService.java"
    ],
    "createCheckpoint": true
  }
}
```

### 9.17 patch.explain

```json
{
  "type": "patch.explain",
  "payload": {
    "taskId": "task_001",
    "patchId": "patch_001",
    "target": "all"
  }
}
```

Extension 处理：

```text
发送给 AutoGen Service，让 ReviewerAgent 或 SummaryAgent 解释 diff。
```

### 9.18 command.approveOnce

```json
{
  "type": "command.approveOnce",
  "payload": {
    "taskId": "task_001",
    "approvalId": "approval_001",
    "command": "mvn test"
  }
}
```

### 9.19 command.addToAllowlist

```json
{
  "type": "command.addToAllowlist",
  "payload": {
    "command": "mvn test",
    "scope": "workspace"
  }
}
```

### 9.20 command.reject

```json
{
  "type": "command.reject",
  "payload": {
    "taskId": "task_001",
    "approvalId": "approval_001",
    "reason": "现在不执行测试"
  }
}
```

### 9.21 task.userMessage

```json
{
  "type": "task.userMessage",
  "payload": {
    "taskId": "task_001",
    "targetAgent": "developer_agent",
    "content": "Controller 命名改成 LoginController"
  }
}
```

---

## 10. Agents Tab 通信协议

### 10.1 控件清单

| 控件 | 类型 | 消息类型 |
|---|---|---|
| 新增 Agent | button | `agent.create` |
| 导入 | button | `agent.import` |
| Agent 卡片点击 | card | `agent.select` |
| 编辑 | button | `agent.select` |
| 复制 | button | `agent.copy` |
| 禁用 | button | `agent.disable` |
| 删除 | button | `agent.delete` |
| 重置 | button | `agent.reset` |
| 保存 Agent | button | `agent.save` |
| 测试 Agent | button | `agent.test` |
| Agent Name | input | `agent.form.local` |
| Role | select/input | `agent.form.local` |
| Description | textarea/input | `agent.form.local` |
| Model | select | `agent.form.local` |
| Temperature | input | `agent.form.local` |
| Max Turns | input | `agent.form.local` |
| Max Tool Calls | input | `agent.form.local` |
| Timeout | input | `agent.form.local` |
| System Prompt | textarea | `agent.form.local` |
| Response Format | select | `agent.form.local` |
| Stop Condition | input/select | `agent.form.local` |
| Output JSON Schema | textarea | `agent.form.local` |
| Tools 选择 | checkbox | `agent.form.local` |
| Context Scope | checkbox | `agent.form.local` |

### 10.2 agent.create

```json
{
  "type": "agent.create",
  "payload": {
    "template": "assistant",
    "name": "NewAgent"
  }
}
```

### 10.3 agent.select

```json
{
  "type": "agent.select",
  "payload": {
    "agentId": "developer_agent"
  }
}
```

Extension 返回：

```json
{
  "agent": {
    "id": "developer_agent",
    "name": "DeveloperAgent",
    "role": "developer",
    "description": "负责生成代码 patch",
    "model": "gpt-4.1",
    "temperature": 0.2,
    "maxTurns": 8,
    "maxToolCalls": 20,
    "timeoutSeconds": 180,
    "systemPrompt": "...",
    "responseFormat": "json",
    "stopCondition": "PATCH_PROPOSED",
    "outputJsonSchema": "{}",
    "tools": ["read_file", "search_code", "propose_patch"],
    "contextScope": ["plan", "codebaseSummary", "relatedFiles"]
  }
}
```

### 10.4 agent.save

```json
{
  "type": "agent.save",
  "payload": {
    "id": "developer_agent",
    "name": "DeveloperAgent",
    "role": "developer",
    "description": "负责生成代码 patch",
    "model": "gpt-4.1",
    "temperature": 0.2,
    "maxTurns": 8,
    "maxToolCalls": 20,
    "timeoutSeconds": 180,
    "systemPrompt": "你是开发 Agent...",
    "responseFormat": "json",
    "stopCondition": "PATCH_PROPOSED",
    "outputJsonSchema": "{...}",
    "tools": ["read_file", "search_code", "propose_patch"],
    "contextScope": ["userRequest", "plan", "relatedFiles"]
  }
}
```

Extension 处理：

```text
1. 校验 name 不为空
2. 校验 prompt 不为空
3. 校验 JSON Schema 可解析
4. 保存到 agent config
5. 如果当前任务运行中，提示“下次任务生效”
```

### 10.5 agent.copy

```json
{
  "type": "agent.copy",
  "payload": {
    "agentId": "developer_agent",
    "newName": "DeveloperAgent Copy"
  }
}
```

### 10.6 agent.disable

```json
{
  "type": "agent.disable",
  "payload": {
    "agentId": "developer_agent",
    "disabled": true
  }
}
```

### 10.7 agent.delete

```json
{
  "type": "agent.delete",
  "payload": {
    "agentId": "developer_agent",
    "confirm": true
  }
}
```

### 10.8 agent.test

```json
{
  "type": "agent.test",
  "payload": {
    "agentId": "developer_agent",
    "testInput": "请根据这个需求生成 patch 计划",
    "mockContext": true
  }
}
```

---

## 11. Team Tab 通信协议

### 11.1 控件清单

| 控件 | 类型 | 消息类型 |
|---|---|---|
| 新增 Team | button | `team.create` |
| 复制 Team | button | `team.copy` |
| 删除 Team | button | `team.delete` |
| 设为默认 Team | button | `team.setDefault` |
| Team Name | input | 本地状态 |
| Team Mode | select | 本地状态 |
| Max Turns | input | 本地状态 |
| Retry Limit | input | 本地状态 |
| Termination | select/input | 本地状态 |
| 执行策略 串行/并行 | select | 本地状态 |
| Team 级模型覆盖策略 | select | 本地状态 |
| 添加 Agent | button | `team.agent.add` |
| 移除选中 | button | `team.agent.remove` |
| 上移 | button | `team.agent.moveUp` |
| 下移 | button | `team.agent.moveDown` |
| 保存 Team | button | `team.save` |
| 恢复默认 | button | `team.restoreDefault` |
| 使用模板 | button | `team.useTemplate` |

### 11.2 team.save

```json
{
  "type": "team.save",
  "payload": {
    "id": "java-spring-team",
    "name": "Java Spring Boot Team",
    "mode": "sequential",
    "maxTurns": 20,
    "retryLimit": 2,
    "termination": {
      "type": "textMention",
      "text": "TASK_DONE"
    },
    "executionPolicy": "serial",
    "modelOverridePolicy": "agent-level",
    "agents": [
      {
        "agentId": "planner_agent",
        "order": 1,
        "enabled": true
      },
      {
        "agentId": "codebase_agent",
        "order": 2,
        "enabled": true
      }
    ]
  }
}
```

### 11.3 team.agent.add

```json
{
  "type": "team.agent.add",
  "payload": {
    "teamId": "java-spring-team",
    "agentId": "reviewer_agent",
    "position": "end"
  }
}
```

### 11.4 team.agent.moveUp

```json
{
  "type": "team.agent.moveUp",
  "payload": {
    "teamId": "java-spring-team",
    "agentId": "developer_agent"
  }
}
```

### 11.5 team.setDefault

```json
{
  "type": "team.setDefault",
  "payload": {
    "teamId": "java-spring-team"
  }
}
```

---

## 12. Tools Tab 通信协议

### 12.1 控件清单

| 控件 | 类型 | 消息类型 |
|---|---|---|
| 权限矩阵格子 | button/cell | `tool.permission.toggle` |
| 批量编辑 | button | `tool.permission.batchEdit` |
| 保存权限 | button | `tool.permission.save` |
| 新增工具 | button | `tool.create` |
| 测试工具 | button | `tool.test` |
| 工具参数 Schema | textarea | 本地状态 |
| 工具返回值预览 | readonly textarea | `tool.test` 返回 |
| 工具日志开关 | checkbox | `tool.logging.save` |
| Command Allowlist | textarea | `tool.commandAllowlist.save` |
| Command Blocklist | textarea | `tool.commandBlocklist.save` |
| Sensitive File Blocklist | textarea | `tool.sensitiveFiles.save` |
| Global Safety 开关 | checkbox | `tool.globalSafety.save` |

### 12.2 tool.permission.toggle

```json
{
  "type": "tool.permission.toggle",
  "payload": {
    "agentId": "developer_agent",
    "toolName": "run_command",
    "nextPermission": "confirm"
  }
}
```

权限枚举：

```ts
type ToolPermission =
  | "deny"
  | "allow"
  | "confirm"
  | "readonly"
  | "whitelist";
```

### 12.3 tool.permission.save

```json
{
  "type": "tool.permission.save",
  "payload": {
    "matrix": {
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
}
```

### 12.4 tool.globalSafety.save

```json
{
  "type": "tool.globalSafety.save",
  "payload": {
    "denyOutsideWorkspace": true,
    "denyDirectWrite": true,
    "forceConfirmApplyPatch": true,
    "forceConfirmRunCommand": true,
    "denyDangerousTools": true,
    "redactSecretsInLogs": true
  }
}
```

### 12.5 tool.commandAllowlist.save

```json
{
  "type": "tool.commandAllowlist.save",
  "payload": {
    "scope": "workspace",
    "commands": [
      "mvn test",
      "mvn -q test",
      "npm test",
      "pnpm build"
    ]
  }
}
```

### 12.6 tool.commandBlocklist.save

```json
{
  "type": "tool.commandBlocklist.save",
  "payload": {
    "commands": [
      "rm -rf",
      "del /s",
      "format",
      "git push",
      "npm publish",
      "ssh",
      "scp",
      "powershell"
    ]
  }
}
```

### 12.7 tool.sensitiveFiles.save

```json
{
  "type": "tool.sensitiveFiles.save",
  "payload": {
    "patterns": [
      ".env",
      "*.pem",
      "id_rsa",
      "credentials.json",
      "application-prod.yml"
    ]
  }
}
```

### 12.8 tool.test

```json
{
  "type": "tool.test",
  "payload": {
    "toolName": "read_file",
    "args": {
      "path": "pom.xml"
    }
  }
}
```

返回：

```json
{
  "ok": true,
  "resultPreview": "读取成功，4210 chars",
  "elapsedMs": 32
}
```

---

## 13. Workflow Tab 通信协议

### 13.1 控件清单

| 控件 | 类型 | 消息类型 |
|---|---|---|
| Workflow Name | input | 本地状态 |
| Workflow Description | textarea/input | 本地状态 |
| Workflow Type | select | 本地状态 |
| JSON Version | input | 本地状态 |
| Failure Strategy | select | 本地状态 |
| Retry Limit | input | 本地状态 |
| Node Timeout | input | 本地状态 |
| Confirm Policy | select | 本地状态 |
| 流程节点点击 | card | `workflow.node.select` |
| 编辑节点 | button | `workflow.node.edit` |
| 添加后置 | button | `workflow.node.addAfter` |
| 条件分支 | button | `workflow.node.addCondition` |
| 上移 | button | `workflow.node.moveUp` |
| 下移 | button | `workflow.node.moveDown` |
| 添加 Agent 节点 | button | `workflow.node.addAgent` |
| 添加人工确认 | button | `workflow.node.addHumanApproval` |
| 添加条件分支 | button | `workflow.node.addCondition` |
| 删除选中节点 | button | `workflow.node.delete` |
| 测试运行 | button | `workflow.testRun` |
| 导入 JSON | button/file | `workflow.importJson` |
| 导出 JSON | button | `workflow.exportJson` |
| 设为默认 | button | `workflow.setDefault` |
| 另存模板 | button | `workflow.saveAsTemplate` |
| 保存 Workflow | button | `workflow.save` |

### 13.2 workflow.save

```json
{
  "type": "workflow.save",
  "payload": {
    "id": "code-edit",
    "name": "Code Edit Workflow",
    "description": "用于代码修改、patch 审查、测试执行的标准流程",
    "type": "code-edit",
    "jsonVersion": "1.0",
    "failureStrategy": "return-to-developer",
    "retryLimit": 2,
    "nodeTimeoutSeconds": 180,
    "confirmPolicy": {
      "plan": true,
      "patch": true,
      "command": true
    },
    "nodes": [
      {
        "id": "planner",
        "type": "agent",
        "agentId": "planner_agent",
        "input": ["userRequest"],
        "output": ["plan"]
      },
      {
        "id": "human_plan_approval",
        "type": "human_approval",
        "approvalType": "plan"
      }
    ],
    "edges": [
      {
        "from": "planner",
        "to": "human_plan_approval"
      }
    ]
  }
}
```

### 13.3 workflow.node.edit

```json
{
  "type": "workflow.node.edit",
  "payload": {
    "workflowId": "code-edit",
    "node": {
      "id": "developer",
      "type": "agent",
      "agentId": "developer_agent",
      "input": ["plan", "relatedFiles"],
      "output": ["patch"],
      "timeoutSeconds": 240,
      "retryLimit": 1
    }
  }
}
```

### 13.4 workflow.testRun

```json
{
  "type": "workflow.testRun",
  "payload": {
    "workflowId": "code-edit",
    "dryRun": true,
    "sampleTask": "帮我增加一个测试接口"
  }
}
```

Extension 处理：

```text
调用 AutoGen Service 的 dry-run 接口。
不修改文件，不执行命令，只验证节点顺序和配置可用性。
```

### 13.5 workflow.exportJson

```json
{
  "type": "workflow.exportJson",
  "payload": {
    "workflowId": "code-edit"
  }
}
```

Extension 处理：

```text
打开保存文件对话框，写出 workflow JSON。
```

### 13.6 workflow.importJson

```json
{
  "type": "workflow.importJson",
  "payload": {
    "json": "{...}"
  }
}
```

---

## 14. Settings Tab 通信协议

### 14.1 控件清单

| 控件 | 类型 | 消息类型 |
|---|---|---|
| Provider | select | 本地状态 |
| Base URL | input | 本地状态 |
| Model | input/select | 本地状态 |
| Fallback Model | input/select | 本地状态 |
| API Key | password input | 本地状态，不持久保存到 Webview state |
| 测试连接 | button | `settings.model.test` |
| 保存设置 | button | `settings.model.save` |
| Service URL | input | 本地状态 |
| Host | input | 本地状态 |
| Port | input | 本地状态 |
| Python Path | input | 本地状态 |
| AutoGen Package | input | 本地状态 |
| Log Level | select | 本地状态 |
| Workspace Storage Path | input | 本地状态 |
| SecretStorage 开关 | checkbox | 本地状态 |
| 保存 Runtime | button | `settings.runtime.save` |
| 启动 | button | `runtime.start` |
| 停止 | button | `runtime.stop` |
| 重启 | button | `runtime.restart` |
| 健康检查 | button | `runtime.health` |
| 查看 Runtime 日志 | button | `runtime.openLogs` |
| 打开配置目录 | button | `runtime.openConfigDir` |
| 恢复默认 | button | `settings.restoreDefault` |
| 保存安全策略 | button | `settings.safety.save` |
| 导入配置 | button | `settings.import` |
| 导出配置 | button | `settings.export` |
| 清空任务历史 | button | `history.clear` |
| Max Files Read | input | 本地状态 |
| Max Context Tokens | input | 本地状态 |

### 14.2 settings.model.save

```json
{
  "type": "settings.model.save",
  "payload": {
    "provider": "openai-compatible",
    "baseUrl": "http://localhost:11434/v1",
    "model": "qwen2.5-coder:7b",
    "fallbackModel": "gpt-4.1-mini",
    "apiKey": "sk-***",
    "storeApiKeyInSecretStorage": true
  }
}
```

Extension 处理：

```text
1. 普通配置保存到 globalState / globalStorageUri
2. apiKey 如果启用 SecretStorage，则保存到 context.secrets
3. 不把 apiKey 回传到 Webview
4. 保存后提示需要重启 runtime 或下次任务生效
```

### 14.3 settings.model.test

```json
{
  "type": "settings.model.test",
  "payload": {
    "provider": "openai-compatible",
    "baseUrl": "http://localhost:11434/v1",
    "model": "qwen2.5-coder:7b",
    "apiKeyRef": "secret://model.apiKey"
  }
}
```

Extension 处理：

```text
调用 AutoGen Service /api/model/test 或临时发起模型连接测试。
```

### 14.4 settings.runtime.save

```json
{
  "type": "settings.runtime.save",
  "payload": {
    "serviceUrl": "http://127.0.0.1:8765",
    "host": "127.0.0.1",
    "port": 8765,
    "pythonPath": "C:/Python311/python.exe",
    "autogenPackage": "autogen-agentchat",
    "logLevel": "info",
    "workspaceStoragePath": "${globalStorageUri}/autogen",
    "useSecretStorage": true
  }
}
```

### 14.5 runtime.start

```json
{
  "type": "runtime.start",
  "payload": {
    "useSavedSettings": true
  }
}
```

Extension 处理：

```text
1. 检查端口是否占用
2. 使用 pythonPath 启动 agent-service/main.py
3. 等待 /health
4. 推送 runtime status
```

### 14.6 runtime.stop

```json
{
  "type": "runtime.stop",
  "payload": {
    "force": false
  }
}
```

### 14.7 runtime.restart

```json
{
  "type": "runtime.restart",
  "payload": {
    "reason": "user-request"
  }
}
```

### 14.8 runtime.health

```json
{
  "type": "runtime.health",
  "payload": {}
}
```

返回：

```json
{
  "status": "running",
  "serviceUrl": "http://127.0.0.1:8765",
  "pid": 12345,
  "version": {
    "python": "3.11.8",
    "autogen": "0.x"
  }
}
```

### 14.9 settings.safety.save

```json
{
  "type": "settings.safety.save",
  "payload": {
    "maxFilesRead": 30,
    "maxContextTokens": 64000,
    "autoCreateCheckpoint": true,
    "requirePatchApproval": true,
    "requireCommandApproval": true,
    "redactSecretsInLogs": true
  }
}
```

### 14.10 settings.export

```json
{
  "type": "settings.export",
  "payload": {
    "includeSecrets": false
  }
}
```

### 14.11 settings.import

```json
{
  "type": "settings.import",
  "payload": {
    "configJson": "{...}",
    "overwrite": false
  }
}
```

---

## 15. Extension -> Webview 流式事件协议

这些事件主要由 AutoGen Service 或 Extension 工具层触发。

### 15.1 event.task.status

```json
{
  "type": "event.task.status",
  "payload": {
    "taskId": "task_001",
    "status": "running",
    "currentStep": "developer"
  }
}
```

### 15.2 event.agent.status

```json
{
  "type": "event.agent.status",
  "payload": {
    "agentId": "developer_agent",
    "agentName": "DeveloperAgent",
    "status": "running"
  }
}
```

Agent 状态枚举：

```ts
type AgentStatus =
  | "idle"
  | "waiting"
  | "running"
  | "tool_call"
  | "blocked"
  | "paused"
  | "done"
  | "failed"
  | "skipped";
```

### 15.3 event.agent.message

```json
{
  "type": "event.agent.message",
  "payload": {
    "agentId": "developer_agent",
    "agentName": "DeveloperAgent",
    "role": "assistant",
    "content": "我准备新增 AuthController 和 AuthService。",
    "streaming": false
  }
}
```

### 15.4 event.agent.message.delta

用于流式文字：

```json
{
  "type": "event.agent.message.delta",
  "payload": {
    "messageId": "msg_001",
    "agentId": "developer_agent",
    "delta": "正在分析 "
  }
}
```

Webview 处理：

```text
如果 messageId 已存在，则追加 delta。
如果不存在，则创建流式消息卡片。
```

### 15.5 event.tool.call

```json
{
  "type": "event.tool.call",
  "payload": {
    "toolCallId": "tool_001",
    "agentId": "codebase_agent",
    "toolName": "read_file",
    "args": {
      "path": "pom.xml"
    }
  }
}
```

### 15.6 event.tool.result

```json
{
  "type": "event.tool.result",
  "payload": {
    "toolCallId": "tool_001",
    "status": "success",
    "summary": "读取成功，4210 chars",
    "resultPreview": "<project>...</project>"
  }
}
```

### 15.7 event.approval.required

```json
{
  "type": "event.approval.required",
  "payload": {
    "approvalId": "approval_001",
    "approvalType": "command",
    "title": "TesterAgent 请求执行命令",
    "command": "mvn test",
    "risk": "low"
  }
}
```

Approval 类型：

```ts
type ApprovalType =
  | "plan"
  | "patch"
  | "command"
  | "tool"
  | "file_write"
  | "external_request";
```

### 15.8 event.patch.proposed

```json
{
  "type": "event.patch.proposed",
  "payload": {
    "patchId": "patch_001",
    "taskId": "task_001",
    "summary": "新增 JWT 登录接口",
    "files": [
      {
        "path": "src/main/java/com/demo/AuthController.java",
        "changeType": "add"
      },
      {
        "path": "pom.xml",
        "changeType": "modify"
      }
    ],
    "risk": "medium"
  }
}
```

### 15.9 event.patch.applied

```json
{
  "type": "event.patch.applied",
  "payload": {
    "patchId": "patch_001",
    "checkpointId": "checkpoint_001",
    "filesChanged": 5
  }
}
```

### 15.10 event.command.output

```json
{
  "type": "event.command.output",
  "payload": {
    "commandId": "cmd_001",
    "stream": "stdout",
    "chunk": "[INFO] Running tests..."
  }
}
```

### 15.11 event.command.finished

```json
{
  "type": "event.command.finished",
  "payload": {
    "commandId": "cmd_001",
    "command": "mvn test",
    "exitCode": 0,
    "summary": "测试通过"
  }
}
```

### 15.12 event.error

```json
{
  "type": "event.error",
  "payload": {
    "code": "AUTOGEN_SERVICE_DOWN",
    "message": "AutoGen Service 未运行",
    "recoverable": true,
    "action": "runtime.start"
  }
}
```

---

## 16. 状态同步策略

### 16.1 Webview 本地状态

Webview 只保存：

```text
1. 当前激活 Tab
2. 当前表单临时输入
3. 当前选中的 Agent / Team / Workflow
4. 当前展开的卡片状态
5. 当前 modal 状态
6. request pending 状态
```

不保存：

```text
1. API Key 明文
2. 真实文件内容缓存
3. 完整工具结果
4. 大型日志
5. 完整 patch 历史
```

### 16.2 Extension 权威状态

Extension 负责：

```text
1. 当前 workspace 信息
2. 当前任务 ID
3. WebSocket 连接
4. 配置缓存
5. SecretStorage
6. globalStorageUri / storageUri 文件存储
7. 当前 AutoGen runtime 状态
```

### 16.3 AutoGen Service 权威状态

AutoGen Service 负责：

```text
1. TaskContext
2. Agent 执行状态
3. ToolCall 结果
4. Patch proposal
5. Command execution result
6. Workflow runner progress
```

---

## 17. 错误码设计

| 错误码 | 含义 | UI 处理 |
|---|---|---|
| `NO_WORKSPACE` | 未打开工作区 | Toast + 禁用 task.create |
| `RUNTIME_NOT_RUNNING` | AutoGen 服务未运行 | 显示启动按钮 |
| `RUNTIME_START_FAILED` | 服务启动失败 | 展示日志入口 |
| `MODEL_TEST_FAILED` | 模型连接失败 | 高亮 Settings |
| `INVALID_CONFIG` | 配置校验失败 | 高亮字段 |
| `INVALID_JSON_SCHEMA` | JSON Schema 不合法 | 高亮 textarea |
| `TASK_NOT_FOUND` | 任务不存在 | 返回历史页 |
| `PATCH_APPLY_FAILED` | patch 应用失败 | 显示错误详情 |
| `COMMAND_DENIED` | 命令被策略拒绝 | 显示权限原因 |
| `TOOL_DENIED` | 工具被权限矩阵拒绝 | 显示 Tools 页入口 |
| `SECRET_REQUIRED` | 缺少 API Key | 跳转 Settings |
| `UNSUPPORTED_MESSAGE` | 未支持消息类型 | 开发错误提示 |

---

## 18. 安全设计

### 18.1 Webview 安全

必须：

```text
1. 使用 CSP
2. 禁止加载任意远程脚本
3. JS/CSS 使用 nonce
4. 资源用 webview.asWebviewUri
5. 不在 DOM 中注入未转义 HTML
6. 不把 API Key 放入 localStorage
7. 不把完整文件内容长期缓存到 Webview
```

CSP 示例：

```html
<meta http-equiv="Content-Security-Policy"
  content="
    default-src 'none';
    img-src ${webview.cspSource} https:;
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}';
  ">
```

### 18.2 Message 校验

Extension 必须校验：

```text
1. message.type 是否在白名单
2. payload 是否符合 schema
3. taskId 是否属于当前 workspace
4. patchId 是否属于当前 task
5. 工具权限是否允许
6. 命令是否在白名单或需要确认
```

### 18.3 敏感数据处理

```text
1. API Key 使用 SecretStorage
2. Webview 只显示 masked key
3. 日志脱敏
4. 工具结果中检测 token/password/secret 字段
5. 导出配置默认不包含 secrets
```

---

## 19. Extension 目录结构建议

```text
src/
├─ extension.ts
├─ webview/
│  ├─ AutoGenWebviewProvider.ts
│  ├─ getWebviewHtml.ts
│  ├─ WebviewMessageRouter.ts
│  ├─ protocol.ts
│  └─ controllers/
│     ├─ TaskController.ts
│     ├─ AgentController.ts
│     ├─ TeamController.ts
│     ├─ ToolController.ts
│     ├─ WorkflowController.ts
│     ├─ SettingsController.ts
│     ├─ RuntimeController.ts
│     └─ HistoryController.ts
├─ services/
│  ├─ AutoGenServiceClient.ts
│  ├─ AutoGenRuntimeManager.ts
│  ├─ ConfigStore.ts
│  ├─ SecretStore.ts
│  ├─ WorkspaceContextService.ts
│  └─ TaskWebSocketBridge.ts
├─ tools/
│  ├─ FileToolService.ts
│  ├─ DiffToolService.ts
│  ├─ TerminalToolService.ts
│  └─ GitToolService.ts
└─ types/
   ├─ AgentConfig.ts
   ├─ TeamConfig.ts
   ├─ WorkflowConfig.ts
   ├─ ToolConfig.ts
   └─ TaskTypes.ts
```

---

## 20. Codex 开发任务拆分

### Task 1：建立 protocol.ts

目标：

```text
定义 WebviewRequest、ExtensionResponse、ExtensionEvent 类型。
定义所有 message type 常量。
```

验收：

```text
npm run compile 通过。
所有 Controller 使用统一类型。
```

### Task 2：实现 WebviewClient

目标：

```text
在 Webview JS 中封装 request/response/pending timeout。
```

验收：

```text
点击按钮能发送消息。
超时能显示 toast。
```

### Task 3：实现 WebviewMessageRouter

目标：

```text
统一分发 message.type 到不同 Controller。
```

验收：

```text
ui.ready / task.create / settings.model.save 至少可跑通。
```

### Task 4：实现 ui.ready + state.init

目标：

```text
Webview 加载后获取初始状态。
```

验收：

```text
UI 能显示当前 workspace、runtime 状态、默认 team。
```

### Task 5：实现 Run Tab 消息

目标：

```text
task.create、pause、resume、cancel、plan.approve、patch.openDiff。
```

验收：

```text
Run 页主要按钮有响应。
```

### Task 6：实现 Settings Tab 消息

目标：

```text
settings.model.save、settings.runtime.save、runtime.health。
```

验收：

```text
配置可保存，API key 进 SecretStorage。
```

### Task 7：实现 Agents / Team / Tools / Workflow 保存

目标：

```text
配置页面保存到本地 JSON。
```

验收：

```text
刷新 Webview 后配置不丢。
```

---

## 21. 自我检查清单

### 21.1 完整性检查

| 检查项 | 状态 |
|---|---|
| 覆盖 Run Tab 所有关键按钮 | 通过 |
| 覆盖 Agents Tab 所有关键控件 | 通过 |
| 覆盖 Team Tab 所有关键控件 | 通过 |
| 覆盖 Tools Tab 所有关键控件 | 通过 |
| 覆盖 Workflow Tab 所有关键控件 | 通过 |
| 覆盖 Settings Tab 所有关键控件 | 通过 |
| 定义通用 Request / Response / Event 结构 | 通过 |
| 定义 Webview -> Extension 请求协议 | 通过 |
| 定义 Extension -> Webview 事件协议 | 通过 |
| 定义错误码 | 通过 |
| 定义安全策略 | 通过 |
| 给出 TypeScript 代码骨架 | 通过 |
| 给出 Codex 任务拆分 | 通过 |

### 21.2 和官方资料一致性检查

| 检查项 | 状态 |
|---|---|
| 使用 `acquireVsCodeApi().postMessage()` | 通过 |
| 使用 `webview.onDidReceiveMessage()` | 通过 |
| 使用 `webview.postMessage()` 推送消息 | 通过 |
| 考虑 CSP | 通过 |
| 考虑 SecretStorage | 通过 |
| 考虑 globalStorageUri / workspace storage | 通过 |
| 没有让 Webview 直接访问本地文件 | 通过 |

### 21.3 可开发性检查

| 检查项 | 状态 |
|---|---|
| 消息类型命名统一 | 通过 |
| payload 结构明确 | 通过 |
| Extension Controller 边界明确 | 通过 |
| Webview 状态职责明确 | 通过 |
| Extension 状态职责明确 | 通过 |
| AutoGen Service 状态职责明确 | 通过 |
| 可按任务拆分交给 Codex 实现 | 通过 |

---

## 22. 下一份文档建议

下一份应生成：

```text
03_Extension与AutoGenService通信接口详细设计.md
```

重点内容：

```text
1. Extension 如何启动 Python AutoGen Service
2. HTTP API 详细设计
3. WebSocket 任务事件桥接
4. AutoGen Service Client TypeScript 封装
5. Runtime 健康检查和重启
6. task.create / patch / command / settings 等 API
7. 错误处理和超时重试
```
