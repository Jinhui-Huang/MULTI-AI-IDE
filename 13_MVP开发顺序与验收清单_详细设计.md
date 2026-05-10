# 13_MVP开发顺序与验收清单_详细设计

> 项目：AutoGen + VS Code 多 Agent 编程插件  
> 文档目标：把前面 00～12 的架构、UI、通信、运行时、工具、安全、打包设计，整理成一份可执行的 MVP 开发顺序、任务拆分、阶段验收和回归检查清单。  
> 适用对象：你本人、Codex、前端插件开发、Python AutoGen Service 开发、联调测试。

---

## 0. 资料依据与设计约束

### 0.1 参考资料

本 MVP 顺序基于以下已确认资料和前序文档：

1. VS Code Extension 支持 Webview 自定义 HTML/CSS/JS UI，Webview 通过 `acquireVsCodeApi().postMessage()` 向 Extension 发送消息，Extension 通过 `webview.postMessage()` 回推消息。
2. VS Code Extension 测试需要在 Extension Development Host 中运行，集成测试可访问完整 VS Code API。
3. VS Code Extension 可使用 `vsce` 打包发布为 VSIX。
4. AutoGen AgentChat 提供 `AssistantAgent`、tools、`run()` / `run_stream()`。
5. AutoGen 支持多 Agent Teams，例如 `RoundRobinGroupChat`、`SelectorGroupChat`，但 IDE 产品中建议由自研 `WorkflowRunner` 控制主流程。
6. AutoGen 当前官方仓库显示 maintenance mode，后续需要用 `AgentRuntimeAdapter` 预留替换空间。

### 0.2 MVP 总原则

MVP 的目标不是一次性做完整 AI IDE，而是先跑通这条闭环：

```text
VS Code Webview 输入任务
  ↓
Extension 接收 task.create
  ↓
Extension 启动 / 调用 Python AutoGen Service
  ↓
AutoGen Planner / Codebase / Developer / Reviewer 执行
  ↓
ToolGateway 请求 VS Code 读取文件 / 搜索代码
  ↓
Developer 生成 patch
  ↓
Webview 展示 patch / diff
  ↓
用户确认应用
  ↓
Extension apply_patch
  ↓
Tester 执行测试命令
  ↓
结果回推 UI
```

第一版只要能稳定完成这个闭环，就算 MVP 成功。

### 0.3 MVP 必须坚持的边界

```text
1. AutoGen 不直接操作 workspace 外文件。
2. 代码修改默认只生成 patch，不直接写文件。
3. apply_patch 必须用户确认。
4. run_command 必须用户确认或命令白名单通过。
5. API Key 必须走 SecretStorage，不写入普通 JSON。
6. UI 不直接连接 AutoGen，必须经过 Extension Host。
7. Python AutoGen Service 只监听 127.0.0.1。
8. 所有任务事件必须可追踪、可回放、可诊断。
```

---

## 1. MVP 范围定义

### 1.1 第一版必须实现

| 模块 | MVP 功能 | 是否必须 |
|---|---|---|
| VS Code 插件 | 加载 Webview 控制台 | 必须 |
| Webview UI | Run / Settings 两个 Tab 可用，其他 Tab 可静态展示 | 必须 |
| Webview 通信 | `task.create` / `settings.save` / `patch.apply` / `command.approve` | 必须 |
| Runtime 管理 | 启动 / 停止 / 健康检查 Python Service | 必须 |
| AutoGen Service | FastAPI + WebSocket + AgentFactory + WorkflowRunner | 必须 |
| Agent | Planner / Codebase / Developer / Reviewer / Tester | 必须 |
| Tools | list_files / read_file / search_code / propose_patch / apply_patch / run_command | 必须 |
| Diff | 能打开 patch 或 diff 预览 | 必须 |
| 安全 | workspace 路径限制、敏感文件黑名单、命令白名单 | 必须 |
| 配置 | Model Provider / Base URL / Model / API Key | 必须 |
| 日志 | task event log / runtime log | 必须 |

### 1.2 第一版可以暂缓

| 功能 | 暂缓原因 |
|---|---|
| 完整拖拽 Workflow Builder | MVP 可用固定 workflow |
| 多 Team 模板库 | 先固定 Java Spring Team |
| SelectorGroupChat 自由多 Agent | 先用 WorkflowRunner 顺序控制 |
| 语义代码索引 / RAG | 先用 `rg` / 文件搜索 |
| 内置 Python Runtime | 先用外部 Python；正式版再内置 |
| Marketplace 发布 | 先本地 VSIX / Extension Development Host |
| 多平台安装器 | 先 Windows 开发验证 |
| 复杂 checkpoint rollback | 先保存 git diff / patch log |
| 部分应用 patch | 先应用整个 patch |
| 可视化 Token / Cost 统计 | 后续增强 |

---

## 2. 开发阶段总览

建议分 8 个阶段。

```text
Phase 0：仓库初始化与工程骨架
Phase 1：Webview UI 接入 VS Code 插件
Phase 2：Webview ⇄ Extension 通信打通
Phase 3：AutoGen Service 启动与健康检查
Phase 4：Extension ⇄ AutoGen Service HTTP / WebSocket 打通
Phase 5：VS Code Tool Server 打通文件 / 搜索 / Diff / Terminal / Git
Phase 6：AutoGen 多 Agent Workflow 跑通代码修改闭环
Phase 7：安全、配置、日志、任务历史补强
Phase 8：VSIX 打包与 MVP 验收
```

每个阶段结束都要有明确验收标准。

---

## 3. Phase 0：仓库初始化与工程骨架

### 3.1 目标

创建完整项目目录，保证 VS Code 插件、Webview 静态资源、Python AutoGen Service、文档、脚本分离。

### 3.2 目录结构

```text
autogen-vscode-agent/
├─ package.json
├─ tsconfig.json
├─ src/
│  ├─ extension.ts
│  ├─ webview/
│  │  ├─ WebviewProvider.ts
│  │  ├─ MessageRouter.ts
│  │  └─ WebviewStateBridge.ts
│  ├─ runtime/
│  │  ├─ RuntimeManager.ts
│  │  └─ AutoGenServiceClient.ts
│  ├─ tools/
│  │  ├─ WorkspaceGuard.ts
│  │  ├─ FileTools.ts
│  │  ├─ SearchTools.ts
│  │  ├─ DiffTools.ts
│  │  ├─ PatchTools.ts
│  │  ├─ TerminalTools.ts
│  │  └─ GitTools.ts
│  ├─ config/
│  │  ├─ ConfigStore.ts
│  │  └─ SecretStore.ts
│  └─ common/
│     ├─ types.ts
│     └─ errors.ts
├─ media/
│  ├─ autogen_full_control_ui_config_complete.html
│  ├─ webview.css
│  └─ webview.js
├─ agent-service/
│  ├─ main.py
│  ├─ requirements.txt
│  ├─ app/
│  │  ├─ api/
│  │  ├─ runtime/
│  │  ├─ workflows/
│  │  ├─ tools/
│  │  ├─ config/
│  │  └─ schemas.py
│  └─ tests/
├─ docs/
└─ scripts/
```

### 3.3 任务拆分

#### Task 0.1 初始化 VS Code Extension

```bash
npm install -g yo generator-code
npx --package yo --package generator-code -- yo code
```

选择：

```text
New Extension (TypeScript)
```

#### Task 0.2 初始化 Python Service

```bash
cd agent-service
python -m venv .venv
.venv\Scripts\activate
pip install fastapi uvicorn pydantic httpx autogen-agentchat autogen-ext[openai]
pip freeze > requirements.txt
```

#### Task 0.3 添加基础脚本

`package.json`：

```json
{
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "dev:agent": "python agent-service/main.py",
    "package": "vsce package",
    "lint": "eslint src --ext ts"
  }
}
```

### 3.4 验收标准

```text
[ ] npm install 成功
[ ] npm run compile 成功
[ ] VS Code F5 可打开 Extension Development Host
[ ] agent-service/main.py 可启动 FastAPI
[ ] GET /health 返回 ok
[ ] 项目目录符合设计
```

---

## 4. Phase 1：Webview UI 接入 VS Code 插件

### 4.1 目标

把现有 `autogen_full_control_ui_config_complete.html` 作为 VS Code Webview 页面加载出来。

### 4.2 package.json contributes

```json
{
  "activationEvents": [
    "onView:autogenAgent.controlView",
    "onCommand:autogenAgent.openControl"
  ],
  "contributes": {
    "commands": [
      {
        "command": "autogenAgent.openControl",
        "title": "AutoGen Agent: Open Control Panel"
      }
    ],
    "viewsContainers": {
      "activitybar": [
        {
          "id": "autogenAgent",
          "title": "Agent",
          "icon": "media/icon.svg"
        }
      ]
    },
    "views": {
      "autogenAgent": [
        {
          "id": "autogenAgent.controlView",
          "name": "AutoGen Control"
        }
      ]
    }
  }
}
```

### 4.3 WebviewProvider

```ts
export class WebviewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView) {
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
    };

    view.webview.html = this.loadHtml(view.webview);
  }

  private loadHtml(webview: vscode.Webview): string {
    // 读取 media/autogen_full_control_ui_config_complete.html
    // 替换资源 URI
    return html;
  }
}
```

### 4.4 验收标准

```text
[ ] VS Code 左侧出现 Agent 图标
[ ] 点击后显示 Claude 风格控制台 UI
[ ] Run / Agents / Team / Tools / Workflow / Settings Tab 可切换
[ ] 页面没有外部 CDN 依赖
[ ] 页面适配 VS Code 暗色主题
[ ] Developer Tools 无 CSP 重大报错
```

---

## 5. Phase 2：Webview ⇄ Extension 通信打通

### 5.1 目标

所有按钮先不真正调用 AutoGen，而是统一发送 `postMessage` 到 Extension，并由 Extension 回显结果。

### 5.2 Webview 统一发送函数

```js
const vscode = acquireVsCodeApi();

function send(type, payload = {}) {
  vscode.postMessage({
    id: crypto.randomUUID(),
    type,
    payload,
    ts: Date.now()
  });
}
```

### 5.3 必须先绑定的事件

```text
task.create
task.pause
task.resume
task.cancel
task.rerunCurrentAgent
plan.approve
plan.revise
patch.openDiff
patch.apply
patch.reject
command.approveOnce
command.reject
settings.model.save
settings.model.test
runtime.start
runtime.stop
runtime.restart
runtime.health
```

### 5.4 Extension MessageRouter

```ts
export class MessageRouter {
  async handle(message: WebviewRequest) {
    switch (message.type) {
      case 'task.create':
        return this.mockReply('task.created', message.payload);
      case 'settings.model.save':
        return this.configStore.saveModel(message.payload);
      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }
}
```

### 5.5 回推 UI 事件

```ts
view.webview.postMessage({
  type: 'toast.show',
  payload: {
    level: 'success',
    message: 'Extension received task.create'
  }
});
```

### 5.6 验收标准

```text
[ ] 点击“发送给 AutoGen Team”后 Extension 控制台收到 task.create
[ ] 点击“暂停/继续/终止”后收到对应事件
[ ] Settings 保存按钮能收到表单 payload
[ ] Extension 可回推 toast 到 Webview
[ ] Webview 可追加一条 mock agent_message
[ ] 所有消息都有 requestId
[ ] 未知消息类型有错误提示
```

---

## 6. Phase 3：AutoGen Service 启动与健康检查

### 6.1 目标

Extension 能启动 Python AutoGen Service，并检测 `/health`。

### 6.2 Python FastAPI 最小服务

```python
from fastapi import FastAPI

app = FastAPI()

@app.get('/health')
async def health():
    return {
        'ok': True,
        'service': 'autogen-agent-service',
        'version': '0.1.0'
    }
```

### 6.3 RuntimeManager

```ts
export class RuntimeManager {
  private process?: ChildProcessWithoutNullStreams;

  async start() {
    const pythonPath = await this.config.getPythonPath();
    const serviceMain = this.context.asAbsolutePath('agent-service/main.py');
    this.process = spawn(pythonPath, [serviceMain], {
      cwd: path.dirname(serviceMain),
      env: { ...process.env, AGENT_SERVICE_PORT: '8765' }
    });
  }

  async health() {
    return fetch('http://127.0.0.1:8765/health');
  }
}
```

### 6.4 端口策略

MVP 默认端口：

```text
8765
```

如果端口被占用：

```text
1. 检测是否已有自己的 AutoGen Service
2. 如果是，复用
3. 如果不是，尝试 8766～8799
4. 保存实际端口到 globalState
```

### 6.5 验收标准

```text
[ ] 点击 Runtime Start 可启动 Python 进程
[ ] /health 返回 ok
[ ] 点击 Runtime Stop 可停止进程
[ ] 点击 Restart 可重启
[ ] 端口占用时有明确错误或自动切换
[ ] stdout / stderr 写入 runtime.log
[ ] Webview 显示 Runtime running / stopped
```

---

## 7. Phase 4：Extension ⇄ AutoGen Service HTTP / WebSocket 打通

### 7.1 目标

Extension 能调用 Python Service 创建任务，并通过 WebSocket 接收任务流事件。

### 7.2 HTTP 接口

```http
POST /api/tasks
GET  /api/tasks/{taskId}
POST /api/tasks/{taskId}/pause
POST /api/tasks/{taskId}/resume
POST /api/tasks/{taskId}/cancel
```

### 7.3 WebSocket 接口

```text
ws://127.0.0.1:8765/ws/tasks/{taskId}?sinceSeq=0
```

### 7.4 AutoGenServiceClient

```ts
export class AutoGenServiceClient {
  async createTask(payload: CreateTaskRequest): Promise<CreateTaskResponse> {
    return this.http.post('/api/tasks', payload);
  }

  connectTaskEvents(taskId: string, onEvent: (event: AgentEvent) => void) {
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws/tasks/${taskId}`);
    ws.onmessage = e => onEvent(JSON.parse(e.data));
  }
}
```

### 7.5 WebSocket 最小事件

```json
{
  "seq": 1,
  "type": "task.status",
  "taskId": "task_001",
  "status": "running"
}
```

```json
{
  "seq": 2,
  "type": "agent.message",
  "taskId": "task_001",
  "agentId": "planner_agent",
  "content": "我将先分析任务并生成计划。"
}
```

### 7.6 验收标准

```text
[ ] Webview 点击创建任务
[ ] Extension POST /api/tasks 成功
[ ] 返回 taskId
[ ] Extension 自动连接 /ws/tasks/{taskId}
[ ] Webview 实时收到 task.status
[ ] Webview 实时显示 agent.message
[ ] 断线后能重连并 sinceSeq 补发
```

---

## 8. Phase 5：VS Code Tool Server 打通

### 8.1 目标

Python AutoGen Service 不能直接乱读文件，而是通过 Extension Tool Server 调用 VS Code 能力。

### 8.2 工具调用链路

```text
AutoGen Tool Function
  ↓ HTTP /tool/request
Extension Tool Server
  ↓ WorkspaceGuard / PermissionGuard
VS Code API / Node fs / git CLI
  ↓
返回 ToolResult
```

### 8.3 MVP 必须实现工具

| 工具 | 说明 | MVP 实现 |
|---|---|---|
| list_files | 列出 workspace 文件 | `vscode.workspace.findFiles` 或 Node fs |
| read_file | 读取文件 | `workspace.fs.readFile` |
| search_code | 搜索代码 | `rg` 或 `workspace.findTextInFiles` |
| propose_patch | 接收 patch 并记录 | Extension 存储 patch |
| open_diff | 打开 diff 预览 | `vscode.diff` 或 diff 文档 |
| apply_patch | 应用 patch | `git apply` |
| run_command | 执行测试命令 | `child_process.spawn` 或 Terminal |
| git_diff | 获取 diff | `git diff` |

### 8.4 WorkspaceGuard 验收

```text
[ ] 读取 workspace 内文件成功
[ ] 读取 ../ 外部文件失败
[ ] 读取 .env 默认失败
[ ] 读取 id_rsa 默认失败
[ ] 路径大小写 / symlink 处理正确
```

### 8.5 run_command 验收

```text
[ ] mvn test 可请求执行
[ ] npm test 可请求执行
[ ] git push 被拒绝
[ ] rm -rf 被拒绝
[ ] powershell 默认被拒绝
[ ] 命令执行前 UI 弹确认
[ ] stdout / stderr 能返回并显示
```

---

## 9. Phase 6：AutoGen 多 Agent Workflow 跑通代码修改闭环

### 9.1 目标

使用固定 Code Edit Workflow 跑通一次真实任务。

### 9.2 MVP Workflow

```text
1. PlannerAgent 生成计划
2. 等待用户接受计划
3. CodebaseAgent 调用 list_files / read_file / search_code
4. DeveloperAgent 生成 unified diff patch
5. ReviewerAgent 审查 patch
6. 等待用户应用 patch
7. TesterAgent 请求 run_command
8. SummaryAgent 总结
```

### 9.3 AgentFactory

```python
class AgentFactory:
    def create_assistant_agent(self, config: AgentConfig, tools: list):
        return AssistantAgent(
            name=config.name,
            model_client=self.model_client_factory.create(config.model),
            tools=tools,
            system_message=config.system_prompt
        )
```

### 9.4 WorkflowRunner

```python
async def run_code_edit(ctx):
    await run_planner(ctx)
    await wait_approval(ctx, 'plan')
    await run_codebase(ctx)
    await run_developer(ctx)
    await run_reviewer(ctx)
    await wait_approval(ctx, 'patch')
    await run_tester(ctx)
    await run_summary(ctx)
```

### 9.5 Developer 输出格式

```json
{
  "type": "patch_proposal",
  "summary": "新增 JWT 登录接口",
  "changedFiles": [
    "src/main/java/.../AuthController.java"
  ],
  "patch": "diff --git ...",
  "riskLevel": "medium",
  "needsApproval": true
}
```

### 9.6 验收标准

```text
[ ] Planner 输出计划
[ ] UI 能接受计划
[ ] CodebaseAgent 读取至少 3 个项目文件
[ ] DeveloperAgent 生成 unified diff patch
[ ] ReviewerAgent 给出审查意见
[ ] UI 能查看 diff
[ ] UI 能应用 patch
[ ] TesterAgent 请求执行测试命令
[ ] 用户确认后命令执行
[ ] SummaryAgent 输出任务总结
```

---

## 10. Phase 7：安全、配置、日志、任务历史补强

### 10.1 Settings 必须落地

```text
[ ] Provider 保存
[ ] Base URL 保存
[ ] Model 保存
[ ] API Key 保存到 SecretStorage
[ ] Python Path 保存
[ ] Service Port 保存
[ ] Log Level 保存
[ ] Safety Settings 保存
```

### 10.2 任务历史

MVP 可用 JSONL：

```text
globalStorage/tasks/task_001/events.jsonl
globalStorage/tasks/task_001/context.json
globalStorage/tasks/task_001/patches/patch_001.diff
globalStorage/tasks/task_001/commands/cmd_001.log
```

### 10.3 日志

```text
runtime.log
extension.log
tool_calls.jsonl
events.jsonl
commands/*.log
```

### 10.4 验收标准

```text
[ ] 重启 VS Code 后 Settings 仍存在
[ ] API Key 不出现在普通配置文件
[ ] 任务历史可查看
[ ] 每个 tool call 有日志
[ ] 每个 patch 有文件记录
[ ] 错误可导出诊断包
```

---

## 11. Phase 8：VSIX 打包与 MVP 验收

### 11.1 打包命令

```bash
npm install -g @vscode/vsce
npm run compile
vsce package
```

### 11.2 VSIX 安装测试

```bash
code --install-extension autogen-vscode-agent-0.1.0.vsix
```

### 11.3 打包验收

```text
[ ] VSIX 可安装
[ ] 安装后左侧出现 Agent 图标
[ ] Webview 可打开
[ ] Settings 可保存
[ ] Python Service 可启动
[ ] 任务可创建
[ ] WebSocket 可推送事件
[ ] 工具调用可执行
[ ] Patch 可预览并应用
[ ] 卸载插件后不残留运行进程
```

---

## 12. MVP 最小验收用例

### 12.1 用例 A：解释当前项目

输入：

```text
请分析当前项目结构，并说明这是一个什么技术栈的项目。
```

期望：

```text
[ ] PlannerAgent 生成计划
[ ] CodebaseAgent 调用 list_files
[ ] CodebaseAgent 读取 pom.xml / package.json 等关键文件
[ ] SummaryAgent 输出项目结构说明
[ ] 不产生 patch
[ ] 不执行命令
```

### 12.2 用例 B：生成小型代码修改

输入：

```text
给当前 Spring Boot 项目新增一个 GET /api/health 接口，返回 ok。
```

期望：

```text
[ ] DeveloperAgent 生成 patch
[ ] patch 只涉及 1～2 个文件
[ ] UI 可打开 diff
[ ] 用户确认后 patch 应用成功
[ ] git diff 可看到修改
```

### 12.3 用例 C：执行测试命令

输入：

```text
应用修改后运行 mvn test。
```

期望：

```text
[ ] TesterAgent 请求 run_command
[ ] UI 出现命令确认卡片
[ ] 用户点击允许一次
[ ] 命令执行输出显示到 UI
[ ] 退出码被记录
```

### 12.4 用例 D：危险命令拦截

输入：

```text
删除整个项目重新生成。
```

期望：

```text
[ ] run_command rm/del 被拒绝
[ ] delete_file 未授权
[ ] UI 显示安全拒绝原因
[ ] 日志记录 SECURITY_BLOCKED
```

### 12.5 用例 E：敏感文件保护

输入：

```text
读取 .env 看看里面有什么配置。
```

期望：

```text
[ ] read_file .env 被 SensitiveFileGuard 拒绝
[ ] Agent 收到“敏感文件不可读取”结果
[ ] UI 显示 tool.denied
[ ] 日志不记录 .env 内容
```

---

## 13. 按模块验收清单

### 13.1 Webview UI

```text
[ ] 六个 Tab 可切换
[ ] Run 页核心按钮可点击
[ ] Settings 表单可填写
[ ] Modal 可打开关闭
[ ] Toast 可显示成功/失败
[ ] Agent message 可追加渲染
[ ] Tool call 卡片可渲染
[ ] Patch 卡片可渲染
[ ] 命令确认卡片可渲染
```

### 13.2 Extension 通信

```text
[ ] Webview -> Extension postMessage 正常
[ ] Extension -> Webview postMessage 正常
[ ] 所有消息有 requestId
[ ] 错误消息能回显 UI
[ ] 未知事件不会导致插件崩溃
```

### 13.3 Runtime

```text
[ ] Runtime start
[ ] Runtime stop
[ ] Runtime restart
[ ] Runtime health
[ ] Runtime log
[ ] 端口冲突处理
[ ] 进程退出检测
```

### 13.4 AutoGen Service

```text
[ ] /health
[ ] /api/tasks
[ ] /ws/tasks/{taskId}
[ ] AgentFactory
[ ] WorkflowRunner
[ ] ToolGateway client
[ ] OutputParser
[ ] ApprovalManager
```

### 13.5 Tools

```text
[ ] list_files
[ ] read_file
[ ] search_code
[ ] propose_patch
[ ] open_diff
[ ] apply_patch
[ ] run_command
[ ] git_diff
[ ] WorkspaceGuard
[ ] SensitiveFileGuard
[ ] CommandGuard
```

### 13.6 安全

```text
[ ] workspace 外访问禁止
[ ] 敏感文件禁止
[ ] 直接写文件禁止
[ ] patch 必须确认
[ ] 命令必须确认
[ ] 危险命令禁止
[ ] API Key 进入 SecretStorage
[ ] 日志脱敏
```

---

## 14. Codex 开发任务顺序

给 Codex 执行时，不要一次让它做完整项目。建议按以下顺序拆。

### Batch 1：插件骨架

```text
Task 1：初始化 VS Code Extension TypeScript 项目
Task 2：添加 WebviewViewProvider
Task 3：加载现有 HTML 到 Webview
Task 4：实现 Tab 切换 JS
Task 5：实现 Webview send(type,payload)
Task 6：实现 Extension MessageRouter mock 响应
```

### Batch 2：Runtime

```text
Task 7：创建 agent-service FastAPI /health
Task 8：实现 RuntimeManager.start/stop/restart/health
Task 9：Settings 页保存 Python Path / Port
Task 10：Runtime 日志写入 logUri
```

### Batch 3：HTTP / WebSocket

```text
Task 11：实现 AutoGenServiceClient
Task 12：实现 POST /api/tasks mock
Task 13：实现 /ws/tasks/{taskId} mock 事件流
Task 14：Webview 渲染 task.status / agent.message
```

### Batch 4：VS Code 工具

```text
Task 15：实现 WorkspaceGuard
Task 16：实现 list_files
Task 17：实现 read_file
Task 18：实现 search_code
Task 19：实现 open_diff
Task 20：实现 apply_patch
Task 21：实现 run_command + confirm
```

### Batch 5：AutoGen Runtime

```text
Task 22：安装 AutoGen 依赖
Task 23：实现 ModelClientFactory
Task 24：实现 AgentFactory
Task 25：实现 PlannerAgent
Task 26：实现 CodebaseAgent 工具调用
Task 27：实现 DeveloperAgent patch 输出
Task 28：实现 ReviewerAgent
Task 29：实现 TesterAgent
Task 30：实现 WorkflowRunner
```

### Batch 6：安全和验收

```text
Task 31：实现 SensitiveFileGuard
Task 32：实现 CommandGuard
Task 33：实现 SecretStorage
Task 34：实现 TaskStore JSONL
Task 35：实现诊断包导出
Task 36：跑 MVP 验收用例 A～E
Task 37：打包 VSIX
```

---

## 15. 失败处理策略

### 15.1 AutoGen Service 启动失败

UI 显示：

```text
AutoGen Service 启动失败。
请检查 Python Path、依赖安装和端口占用。
```

操作按钮：

```text
[查看 Runtime 日志]
[重新启动]
[打开 Settings]
```

### 15.2 模型连接失败

UI 显示：

```text
模型连接失败：401 Unauthorized / Connection refused
```

操作按钮：

```text
[测试连接]
[检查 API Key]
[检查 Base URL]
```

### 15.3 Tool 调用失败

Tool result：

```json
{
  "ok": false,
  "errorCode": "TOOL_WORKSPACE_OUTSIDE",
  "message": "禁止访问 workspace 外路径"
}
```

Agent 应收到安全失败结果，而不是让任务崩溃。

### 15.4 Patch 应用失败

UI 显示：

```text
Patch 应用失败，可能原因：文件已变化、patch 格式错误、冲突。
```

操作按钮：

```text
[查看错误]
[让 AI 重生成 patch]
[复制 patch]
```

---

## 16. MVP 完成定义

满足以下条件，可以认为 MVP 完成：

```text
[ ] VS Code 插件可安装并打开控制台
[ ] 可配置模型连接
[ ] 可启动 AutoGen Service
[ ] 可创建代码任务
[ ] Agent 消息可实时显示
[ ] Agent 能读取项目文件
[ ] Agent 能生成 patch
[ ] UI 能预览 diff
[ ] 用户能确认应用 patch
[ ] Agent 能请求执行测试命令
[ ] 命令执行结果能回传 UI
[ ] 安全策略能拦截敏感文件和危险命令
[ ] 任务历史和日志可查看
[ ] VSIX 可打包
```

---

## 17. 自检清单

### 17.1 文档完整性自检

```text
[x] 覆盖 Phase 0～8 开发顺序
[x] 覆盖 VS Code Webview 接入
[x] 覆盖 Webview ⇄ Extension 通信
[x] 覆盖 Extension ⇄ AutoGen Service 通信
[x] 覆盖 AutoGen 多 Agent Workflow
[x] 覆盖 VS Code 文件 / Diff / Terminal / Git 工具
[x] 覆盖安全边界
[x] 覆盖配置和日志
[x] 覆盖 VSIX 打包
[x] 覆盖 MVP 验收用例
[x] 覆盖 Codex 任务拆分
```

### 17.2 可执行性自检

```text
[x] 每个阶段都有明确目标
[x] 每个阶段都有验收标准
[x] 每个任务可以交给 Codex 分批执行
[x] 没有要求一次性实现完整大系统
[x] 避免直接让 AutoGen 控制 VS Code
[x] 保留 Runtime Adapter 可替换空间
```

### 17.3 风险自检

```text
[x] AutoGen maintenance mode 风险已通过 Adapter 思路规避
[x] 文件安全风险已通过 WorkspaceGuard 规避
[x] 命令执行风险已通过 CommandGuard 规避
[x] API Key 泄漏风险已通过 SecretStorage 规避
[x] Patch 误写风险已通过用户确认规避
```

---

## 18. 下一份文档建议

下一份应生成：

```text
14_给Codex执行开发的任务拆分清单_详细设计.md
```

重点从本文的 Codex Batch 拆分继续细化到：

```text
1. 每个任务的输入文件
2. 每个任务的输出文件
3. 具体修改点
4. 代码骨架
5. 验收命令
6. 禁止事项
7. 失败回滚方式
```
