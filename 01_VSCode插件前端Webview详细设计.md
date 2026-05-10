# 01_VSCode插件前端Webview详细设计

> 文档版本：v1.0  
> 适用范围：AutoGen + VS Code 插件项目的 Webview 前端 UI 实现  
> 对应 UI 原型：`autogen_full_control_ui_config_complete.html`  
> 目标读者：前端开发、VS Code 插件开发、Codex 开发执行者

---

## 0. 检索资料依据

本设计参考了以下公开资料和官方文档：

1. VS Code 官方 Webview API 文档：Webview 可以在 VS Code 内渲染自定义 HTML/CSS/JS，并通过 message passing 与扩展通信。官方文档明确把 webview 类比为 VS Code 内部受扩展控制的 iframe，并说明它可以用于复杂 UI，但应谨慎使用。  
   URL: https://code.visualstudio.com/api/extension-guides/webview

2. VS Code Webview UX Guidelines：官方建议只在必要时使用 Webview，元素应支持主题化、键盘导航和可访问性，并应保持与编辑器/工作区相关。  
   URL: https://code.visualstudio.com/api/ux-guidelines/webviews

3. VS Code Extension API 总览：VS Code Extension API 支持创建自定义视图、Webview、自定义命令、工作区能力等。  
   URL: https://code.visualstudio.com/api

4. VS Code API Reference：扩展端通过 TypeScript/JavaScript API 调用 VS Code 能力，事件监听通常返回 Disposable。  
   URL: https://code.visualstudio.com/api/references/vscode-api

5. VS Code Webview UI Toolkit 状态：官方 `vscode-webview-ui-toolkit` 项目已在 2025-01-06 归档，因此本项目不依赖该 Toolkit，而采用纯 HTML/CSS/JS + VS Code CSS 变量 + 自定义组件方式。  
   URL: https://github.com/microsoft/vscode-webview-ui-toolkit/issues/561

---

## 1. 本文档目标

本文档详细设计 VS Code 插件前端 Webview 层，覆盖以下内容：

```text
1. Webview 页面定位
2. 页面整体结构
3. 六个 Tab 的详细 UI 职责
4. 所有主要控件的前端状态设计
5. Webview 内部状态管理
6. Webview 与 Extension 的消息边界
7. WebSocket/流式消息渲染方式
8. 表单、弹窗、卡片、列表、权限矩阵实现方式
9. 安全与 CSP 设计
10. 主题适配与样式规范
11. 文件结构建议
12. Codex 可执行开发任务
13. 自检清单
```

本文档只设计 **Webview 前端页面**。  
不设计 Python AutoGen Service 的内部实现，不设计 Extension 后端具体工具实现。那些内容由后续文档负责。

---

## 2. Webview 页面定位

本项目的 Webview 不是普通聊天框，而是：

```text
AutoGen 多 Agent 控制台前端
```

它需要同时承担：

```text
1. 任务执行入口
2. 多 Agent 状态展示
3. Agent 配置编辑
4. Team 配置编辑
5. Tool 权限矩阵编辑
6. Workflow 编排配置
7. Model / Runtime / Safety 设置
8. Diff / 命令 / 人工确认交互
9. 任务日志和事件流展示
```

因此 Webview 应设计为一个单页应用：

```text
AutoGen Webview App
├─ Run Tab
├─ Agents Tab
├─ Team Tab
├─ Tools Tab
├─ Workflow Tab
└─ Settings Tab
```

---

## 3. 为什么使用 WebviewView，而不是 WebviewPanel

VS Code Webview 有多种承载方式：

```text
1. WebviewPanel：作为编辑器 Tab 打开
2. WebviewView：作为侧边栏或面板内的 View
3. Custom Editor：用于编辑特定文件类型
```

本项目建议第一版使用：

```text
WebviewViewProvider + Sidebar View
```

原因：

```text
1. 插件形态更接近 Claude Code / Cursor 类侧边任务面板
2. 用户可以一边看代码，一边与 Agent 交互
3. 不占用主编辑器 Tab
4. 适合显示 Run、Agents、Tools 等控制页
5. Extension 可在 Activity Bar 下注册 AutoGen 容器
```

后续可补充：

```text
WebviewPanel
```

用于打开更大的 Diff Review、Workflow Visual Editor、日志详情页。

---

## 4. package.json 贡献点设计

### 4.1 Activity Bar 容器

```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "autogenCode",
          "title": "AutoGen",
          "icon": "media/autogen.svg"
        }
      ]
    }
  }
}
```

### 4.2 Webview View 注册

```json
{
  "contributes": {
    "views": {
      "autogenCode": [
        {
          "type": "webview",
          "id": "autogenCode.controlView",
          "name": "AutoGen Code"
        }
      ]
    }
  }
}
```

### 4.3 命令注册

```json
{
  "contributes": {
    "commands": [
      {
        "command": "autogenCode.openControl",
        "title": "AutoGen: Open Control Panel"
      },
      {
        "command": "autogenCode.startTask",
        "title": "AutoGen: Start Task"
      },
      {
        "command": "autogenCode.restartRuntime",
        "title": "AutoGen: Restart Runtime"
      }
    ]
  }
}
```

### 4.4 Activation Events

```json
{
  "activationEvents": [
    "onView:autogenCode.controlView",
    "onCommand:autogenCode.openControl",
    "onCommand:autogenCode.startTask"
  ]
}
```

---

## 5. Webview 总体布局设计

Webview 页面内部采用六 Tab 结构：

```text
┌───────────────────────────────────────┐
│ Header                                │
│ AutoGen Code | Project | Runtime      │
├───────────────────────────────────────┤
│ Tabs                                  │
│ Run Agents Team Tools Workflow Settings│
├───────────────────────────────────────┤
│ Current Tab Body                      │
│                                       │
├───────────────────────────────────────┤
│ Toast / Modal / Drawer Layer          │
└───────────────────────────────────────┘
```

页面不显示 VS Code 外壳，不显示 Activity Bar，不显示 Explorer。  
Webview 只显示插件自己的控制面板。

---

## 6. 页面设计原则

### 6.1 Claude 风格

当前 UI 风格应保持：

```text
1. 暖色暗色背景
2. 柔和卡片
3. 圆角按钮
4. 低对比边框
5. 橙色/琥珀色强调色
6. 类 Claude Code 的任务卡片和工具调用卡片
```

### 6.2 VS Code Webview 适配

虽然视觉参考 Claude，但运行在 VS Code 内，因此必须：

```text
1. 使用 VS Code CSS 变量兼容主题
2. 不使用外部 CDN
3. 不访问远程资源
4. 支持缩窄宽度
5. 支持键盘操作
6. 所有按钮有 title 或 aria-label
```

建议 CSS 变量：

```css
:root {
  --app-bg: var(--vscode-sideBar-background, #191714);
  --panel-bg: var(--vscode-editor-background, #211f1b);
  --text-main: var(--vscode-foreground, #f4efe7);
  --text-muted: var(--vscode-descriptionForeground, #a99f91);
  --border: var(--vscode-panel-border, #3a342b);
  --accent: #d97706;
  --accent-soft: rgba(217, 119, 6, 0.16);
}
```

---

## 7. 前端技术选型

### 7.1 MVP 推荐

```text
纯 HTML + CSS + TypeScript 编译后的 JS
```

原因：

```text
1. Webview UI 不是复杂业务前端
2. 不依赖 React，减少打包复杂度
3. VS Code Webview UI Toolkit 已归档，不建议依赖
4. 便于 Codex 直接生成和维护
```

### 7.2 进阶版本

如果后续 UI 复杂，可以改为：

```text
Vite + React + Zustand + CSS Modules
```

但第一版不建议。

---

## 8. Webview 文件结构设计

建议目录：

```text
src/
├─ extension.ts
├─ webview/
│  ├─ ControlViewProvider.ts
│  ├─ assets/
│  │  ├─ autogen.svg
│  │  └─ codicons.css
│  ├─ ui/
│  │  ├─ index.html
│  │  ├─ app.css
│  │  ├─ app.js
│  │  ├─ state.js
│  │  ├─ messages.js
│  │  ├─ render.js
│  │  ├─ components.js
│  │  └─ validators.js
│  └─ templates/
│     └─ controlHtml.ts
```

如果不用 bundler：

```text
media/
├─ autogen-control.html
├─ autogen-control.css
└─ autogen-control.js
```

Extension 启动时读取 HTML 模板，并替换资源 URI。

---

## 9. Webview 初始化流程

### 9.1 Extension 侧

```ts
export class ControlViewProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media')
      ]
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this.dispatcher.handle(message, webviewView.webview);
    });
  }
}
```

### 9.2 Webview 侧

```js
const vscode = acquireVsCodeApi();

const state = {
  activeTab: 'run',
  runtime: null,
  project: null,
  currentTask: null,
  agents: [],
  teams: [],
  tools: [],
  workflows: [],
  settings: {},
  ui: {
    loading: false,
    modal: null,
    toast: null
  }
};

send('webview.ready');
```

### 9.3 初始化消息

Webview 首次加载后发送：

```json
{
  "type": "webview.ready",
  "payload": {}
}
```

Extension 返回：

```json
{
  "type": "bootstrap.data",
  "payload": {
    "project": {},
    "runtime": {},
    "agents": [],
    "teams": [],
    "tools": [],
    "workflows": [],
    "settings": {},
    "recentTasks": []
  }
}
```

---

## 10. Webview 内部状态管理

### 10.1 AppState

```ts
type AppState = {
  activeTab: 'run' | 'agents' | 'team' | 'tools' | 'workflow' | 'settings';
  project: ProjectState | null;
  runtime: RuntimeState | null;
  currentTask: TaskState | null;
  agents: AgentConfig[];
  teams: TeamConfig[];
  tools: ToolConfig[];
  workflows: WorkflowConfig[];
  settings: SettingsConfig;
  selected: {
    agentId?: string;
    teamId?: string;
    workflowId?: string;
    toolId?: string;
    nodeId?: string;
    patchId?: string;
  };
  ui: {
    loading: boolean;
    modal?: ModalState;
    drawer?: DrawerState;
    toast?: ToastState;
    dirty: Record<string, boolean>;
  };
};
```

### 10.2 状态持久化

Webview 内部可以使用：

```js
vscode.setState(stateSnapshot);
const previous = vscode.getState();
```

注意：Webview 的 `getState/setState` 只用于轻量 UI 状态，例如当前 Tab、选中项、未提交表单草稿。  
真实配置必须保存到 Extension / AutoGen Service。

建议保存：

```text
1. activeTab
2. selectedAgentId
3. selectedTeamId
4. selectedWorkflowId
5. 当前输入框草稿
6. 折叠/展开状态
```

不保存：

```text
1. API Key
2. 完整任务日志
3. 大文件内容
4. 完整 patch
```

---

## 11. Tab 切换设计

### 11.1 Tab 列表

```text
Run
Agents
Team
Tools
Workflow
Settings
```

### 11.2 Tab 切换事件

Webview 内部事件：

```js
function switchTab(tab) {
  state.activeTab = tab;
  persistUiState();
  render();
  send('ui.tab.changed', { tab });
}
```

Extension 不一定需要处理 `ui.tab.changed`，但可用于遥测和懒加载。

### 11.3 Tab 懒加载

建议：

```text
Run：首次 bootstrap 加载
Agents：点击时加载最新 Agent Config
Team：点击时加载 Team Config
Tools：点击时加载工具权限
Workflow：点击时加载 Workflow Config
Settings：点击时加载 Runtime/Settings
```

---

## 12. Run Tab 详细设计

Run Tab 是任务执行页，负责：

```text
1. 创建任务
2. 显示任务执行流
3. 显示 Agent 状态
4. 显示工具调用
5. 显示计划确认
6. 显示 patch / diff 确认
7. 显示 command 执行确认
8. 追加用户反馈
```

### 12.1 Run Tab 区块结构

```text
Run Tab
├─ Task Toolbar
│  ├─ Team Select
│  ├─ Workflow Select
│  ├─ Mode Select
│  └─ Target Agent Select
├─ Task Input Card
├─ Runtime Control Bar
├─ Agent Status Strip
├─ Conversation / Event Stream
├─ Proposed Changes Card
├─ Command Approval Card
├─ Bottom User Message Input
└─ Modals
   ├─ Revise Plan Modal
   ├─ Reject Patch Modal
   ├─ Partial Patch Modal
   ├─ Switch Agent Modal
   └─ Save Template Modal
```

### 12.2 控件清单

| 控件 | 类型 | 前端字段 | 事件 |
|---|---|---|---|
| Team | select | selected.teamId | `run.team.select` |
| Workflow | select | selected.workflowId | `run.workflow.select` |
| Mode | select | runMode | `run.mode.select` |
| Target Agent | select | targetAgentId | `run.targetAgent.select` |
| 任务输入 | textarea | draft.userRequest | - |
| 发送任务 | button | - | `task.create` |
| 历史 | button | - | `task.history.open` |
| 上下文 | button | - | `context.open` |
| 继续 | button | - | `task.resume` |
| 暂停 | button | - | `task.pause` |
| 终止 | button | - | `task.cancel` |
| 重跑当前 Agent | button | - | `task.rerunCurrentAgent` |
| 切换 Agent | button | - | `task.switchAgent.open` |
| 接受计划 | button | - | `plan.approve` |
| 调整计划 | button | - | `plan.revise.open` |
| 查看 Diff | button | - | `patch.openDiff` |
| 应用 Patch | button | - | `patch.apply` |
| 拒绝并说明 | button | - | `patch.reject.open` |
| 部分应用 | button | - | `patch.partial.open` |
| 让 AI 解释 | button | - | `patch.explain` |
| 允许一次 | button | - | `command.approveOnce` |
| 加入白名单 | button | - | `command.addAllowlist` |
| 拒绝命令 | button | - | `command.reject` |
| 追加消息输入 | textarea/input | draft.followup | - |
| 追加发送 | button | - | `task.userMessage` |

### 12.3 创建任务 Payload

```ts
type CreateTaskPayload = {
  userRequest: string;
  teamId: string;
  workflowId: string;
  mode: 'auto' | 'semi-auto' | 'manual';
  targetAgentId?: string;
  contextRefs: Array<'current_file' | 'selection' | 'git_diff' | 'terminal_error' | 'opened_tabs'>;
  approvalPolicy: {
    plan: boolean;
    patch: boolean;
    command: boolean;
  };
};
```

Webview 发出：

```js
send('task.create', collectCreateTaskPayload());
```

### 12.4 事件流卡片类型

Run Tab 的消息流不要只显示纯文本，应按类型渲染卡片。

```ts
type RunEventCard =
  | AgentMessageCard
  | ToolCallCard
  | ToolResultCard
  | ApprovalRequiredCard
  | PatchProposedCard
  | CommandResultCard
  | ErrorCard;
```

#### AgentMessageCard

显示：

```text
Agent 名称
时间
消息内容
是否可折叠
复制按钮
```

#### ToolCallCard

显示：

```text
工具名
调用 Agent
参数摘要
权限状态
查看完整参数
```

#### PatchProposedCard

显示：

```text
变更文件数量
新增 / 修改 / 删除统计
风险等级
查看 Diff
应用 Patch
部分应用
拒绝并说明
```

#### CommandApprovalCard

显示：

```text
命令内容
执行目录
请求 Agent
风险等级
允许一次
加入白名单
拒绝
```

---

## 13. Agents Tab 详细设计

Agents Tab 用于管理单个 AutoGen Agent 配置。

### 13.1 页面结构

```text
Agents Tab
├─ Header Actions
│  ├─ New Agent
│  ├─ Import
│  └─ Save All
├─ Agent List
│  ├─ Agent Card
│  └─ Agent Status
└─ Agent Editor
   ├─ Basic Info
   ├─ Model Config
   ├─ Prompt Editor
   ├─ Tool Selection
   ├─ Context Scope
   ├─ Output Format
   ├─ JSON Schema
   └─ Actions
```

### 13.2 Agent Card

字段：

```text
1. Agent 名称
2. Role
3. Model
4. Enabled/Disabled
5. Tools 数量
6. Prompt 是否修改
```

操作：

```text
编辑
复制
禁用/启用
删除
测试
```

### 13.3 Agent Editor 控件

| 控件 | 类型 | 字段 |
|---|---|---|
| Agent Name | input | agent.name |
| Role | select/input | agent.role |
| Description | textarea | agent.description |
| Model | select | agent.model |
| Temperature | number input | agent.temperature |
| Max Turns | number input | agent.maxTurns |
| Max Tool Calls | number input | agent.maxToolCalls |
| Timeout Seconds | number input | agent.timeoutSeconds |
| System Prompt | textarea | agent.systemPrompt |
| Response Format | select | agent.responseFormat |
| Stop Condition | input/select | agent.stopCondition |
| Output JSON Schema | textarea | agent.outputJsonSchema |
| Tools | checkbox group | agent.tools |
| Context Scope | checkbox group | agent.contextScopes |

### 13.4 Response Format

选项：

```text
text
json
patch
markdown
structured-review
```

推荐默认：

```text
PlannerAgent: json
CodebaseAgent: json
DeveloperAgent: patch + json summary
ReviewerAgent: structured-review
TesterAgent: json
SummaryAgent: markdown
```

### 13.5 Stop Condition

UI 提供：

```text
1. Max Turns Reached
2. Text Mentioned: TERMINATE
3. Tool Result Success
4. Approval Required
5. Workflow Step Done
```

### 13.6 Agent 保存事件

```js
send('agent.save', collectAgentEditorPayload());
```

Payload：

```ts
type AgentSavePayload = {
  id: string;
  name: string;
  role: string;
  description: string;
  model: string;
  temperature: number;
  maxTurns: number;
  maxToolCalls: number;
  timeoutSeconds: number;
  systemPrompt: string;
  responseFormat: string;
  stopCondition: string;
  outputJsonSchema: string;
  tools: string[];
  contextScopes: string[];
  enabled: boolean;
};
```

---

## 14. Team Tab 详细设计

Team Tab 用于配置多 Agent 组合方式。

### 14.1 页面结构

```text
Team Tab
├─ Team Header
│  ├─ New Team
│  ├─ Copy Team
│  ├─ Delete Team
│  ├─ Set Default
│  └─ Save Team
├─ Team Basic Config
│  ├─ Team Name
│  ├─ Team Mode
│  ├─ Execution Strategy
│  ├─ Model Override Strategy
│  ├─ Max Turns
│  ├─ Retry Limit
│  └─ Termination
├─ Agent Order List
└─ Team Templates
```

### 14.2 Team Mode

选项：

```text
sequential
round_robin
selector
manual
swarm
custom_workflow
```

第一版推荐默认：

```text
sequential
```

因为 IDE 修改代码更需要可控流程，不建议一开始使用完全自由的多 Agent 对话。

### 14.3 Execution Strategy

选项：

```text
serial
parallel_readonly
parallel_review
manual_next
```

说明：

```text
serial：严格顺序执行
parallel_readonly：只读分析 Agent 可并行
parallel_review：Reviewer / SecurityReviewer 可并行
manual_next：用户手动选择下一 Agent
```

### 14.4 Model Override Strategy

选项：

```text
agent_default
team_model_override
cost_saving_mixed
high_quality_all
local_first_fallback_cloud
```

### 14.5 Agent 顺序控件

每个 Agent 行显示：

```text
1. 顺序编号
2. Agent 名称
3. Role
4. Enabled
5. 上移
6. 下移
7. 移除
```

操作事件：

```text
team.agent.add
team.agent.remove
team.agent.moveUp
team.agent.moveDown
team.agent.toggle
```

---

## 15. Tools Tab 详细设计

Tools Tab 用于管理 AutoGen 可调用的 VS Code/本地工具，以及每个 Agent 的权限。

### 15.1 页面结构

```text
Tools Tab
├─ Global Safety
├─ Permission Matrix
├─ Tool Registry
├─ Tool Schema Editor
├─ Command Allowlist
├─ Command Blocklist
└─ Sensitive File Blocklist
```

### 15.2 Global Safety 开关

必须提供：

```text
[x] 禁止访问 workspace 外文件
[x] 禁止直接写文件，只允许 propose_patch
[x] apply_patch 必须用户确认
[x] run_command 必须用户确认
[x] 危险工具全局禁止
[x] 工具调用完整日志记录
[x] 工具结果自动脱敏
```

### 15.3 权限矩阵状态

每个格子有 5 种状态：

```text
deny       禁止
allow      允许
confirm    需要用户确认
readonly   只读
whitelist  白名单参数允许
```

点击格子循环切换：

```text
deny → allow → confirm → readonly → whitelist → deny
```

### 15.4 Tool Registry

字段：

```text
Tool Name
Description
Category
Enabled
Require Approval
Input Schema
Output Schema
Risk Level
```

### 15.5 内置工具列表

MVP 内置：

```text
list_files
read_file
read_files
search_code
get_current_file
get_selection
get_git_diff
get_git_status
propose_patch
open_diff
apply_patch
run_command
read_terminal
create_checkpoint
rollback_checkpoint
```

---

## 16. Workflow Tab 详细设计

Workflow Tab 用于编辑任务流程。

### 16.1 页面结构

```text
Workflow Tab
├─ Workflow Basic Info
│  ├─ Workflow Name
│  ├─ Description
│  ├─ JSON Version
│  ├─ Type
│  └─ Default Flag
├─ Execution Policy
│  ├─ Failure Strategy
│  ├─ Retry Limit
│  ├─ Node Timeout
│  └─ Confirm Policy
├─ Node List / Visual Flow
├─ Node Editor
├─ JSON Preview
└─ Actions
```

### 16.2 Workflow Actions

```text
Save Workflow
Save As Template
Set Default
Test Run
Import JSON
Export JSON
Add Agent Node
Add Human Approval
Add Condition Branch
Delete Node
Move Node Up
Move Node Down
```

### 16.3 Workflow Node 类型

```text
agent
human_approval
tool_action
condition
loop
summary
```

### 16.4 Node Editor 字段

```text
Node ID
Node Type
Agent ID
Input Fields
Output Fields
On Success
On Failure
Requires Approval
Timeout
Retry Limit
```

---

## 17. Settings Tab 详细设计

Settings Tab 用于模型、Runtime、安全策略和配置导入导出。

### 17.1 页面结构

```text
Settings Tab
├─ Model Provider
├─ Runtime Settings
├─ Context & Safety
├─ Storage Settings
├─ Import / Export
└─ Danger Zone
```

### 17.2 Model Provider 控件

```text
Provider
Base URL
Model
Fallback Model
API Key
Use VS Code SecretStorage
Test Connection
Save Settings
```

Provider 选项：

```text
openai
azure_openai
anthropic
ollama
lmstudio
openai_compatible
custom
```

### 17.3 Runtime Settings 控件

```text
Service URL
Host
Port
Python Path
AutoGen Package
Log Level
Workspace Storage Path
Start Runtime
Stop Runtime
Restart Runtime
Health Check
View Logs
Save Runtime
```

### 17.4 Context & Safety 控件

```text
Max Files Read
Max Context Tokens
Max File Size KB
Sensitive File Patterns
Require Patch Approval
Require Command Approval
Create Checkpoint Before Apply
Enable Tool Result Redaction
```

### 17.5 Storage

```text
Config Storage: globalStorageUri / workspaceState
Secret Storage: SecretStorage
Task History Storage: JSONL / SQLite
Logs Storage: extension global storage path
```

---

## 18. Modal / Drawer 设计

### 18.1 Modal 类型

```text
revise_plan
reject_patch
partial_patch
switch_agent
save_template
view_diff
explain_diff
command_detail
tool_schema_editor
runtime_logs
workflow_json_import
```

### 18.2 ModalState

```ts
type ModalState = {
  type: string;
  title: string;
  payload?: any;
};
```

### 18.3 Partial Patch Modal

显示：

```text
文件列表
每个文件 checkbox
新增 / 修改 / 删除标识
风险提示
[只应用选中文件]
```

Payload：

```ts
type PartialPatchPayload = {
  taskId: string;
  patchId: string;
  selectedFiles: string[];
};
```

---

## 19. Webview 与 Extension 消息设计概要

本文件只说明前端如何发消息，完整协议见 `02_Webview与Extension通信协议设计.md`。

### 19.1 send 方法

```js
function send(type, payload = {}) {
  vscode.postMessage({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    type,
    payload,
    timestamp: Date.now()
  });
}
```

### 19.2 接收消息

```js
window.addEventListener('message', (event) => {
  const message = event.data;
  handleExtensionMessage(message);
});
```

### 19.3 常见返回消息

```text
bootstrap.data
operation.success
operation.error
task.event
runtime.status
config.updated
```

---

## 20. 流式事件渲染设计

Extension 从 AutoGen Service 接收 WebSocket 事件后，转发给 Webview。

Webview 处理：

```js
function handleTaskEvent(event) {
  state.currentTask.events.push(event);

  if (event.type === 'agent_status') {
    updateAgentStatus(event.agentId, event.status);
  }

  if (event.type === 'patch_proposed') {
    state.selected.patchId = event.patchId;
  }

  renderRunEvent(event);
}
```

事件类型：

```text
task_status
agent_status
agent_message
tool_call
tool_result
approval_required
patch_proposed
patch_applied
command_result
test_result
error
```

---

## 21. 前端校验规则

### 21.1 task.create

必须校验：

```text
userRequest 非空
teamId 非空
workflowId 非空
mode 非空
```

### 21.2 agent.save

必须校验：

```text
name 非空
systemPrompt 非空
maxTurns > 0
timeoutSeconds > 0
responseFormat 合法
JSON Schema 如果不为空必须是合法 JSON
```

### 21.3 settings.save

必须校验：

```text
Provider 非空
Model 非空
Base URL 对 openai_compatible / ollama / lmstudio 必填
Port 为 1-65535
Python Path 非空
API Key 不直接显示明文
```

---

## 22. CSP 与资源安全设计

VS Code Webview 必须设置 CSP。

示例：

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  img-src ${webview.cspSource} data:;
  style-src ${webview.cspSource} 'unsafe-inline';
  script-src 'nonce-${nonce}';
">
```

要求：

```text
1. 不加载外部 CDN
2. JS 使用 nonce
3. 图片使用 asWebviewUri
4. CSS 使用本地资源或内联
5. 不把 API Key 写入 HTML
6. 不使用 eval
```

---

## 23. 主题与响应式设计

### 23.1 宽度适配

Webview 可能在侧边栏窄宽度运行。

断点：

```text
< 360px：单列紧凑模式
360px - 600px：默认侧边栏模式
> 600px：双列详情模式
```

### 23.2 VS Code 主题变量

必须使用：

```css
color: var(--vscode-foreground);
background: var(--vscode-sideBar-background);
border-color: var(--vscode-panel-border);
font-family: var(--vscode-font-family);
```

### 23.3 可访问性

```text
按钮有 aria-label
输入框有 label
Tab 可键盘切换
Modal 支持 Esc 关闭
焦点不丢失
颜色对比不依赖单一颜色
```

---

## 24. Error / Toast 设计

### 24.1 Toast 类型

```text
success
warning
error
info
```

### 24.2 操作返回统一处理

Extension 返回：

```json
{
  "type": "operation.error",
  "requestId": "xxx",
  "payload": {
    "message": "保存 Agent 失败",
    "detail": "systemPrompt cannot be empty"
  }
}
```

Webview 显示：

```text
Toast: 保存 Agent 失败
详情可展开
```

---

## 25. Codex 开发任务拆分

### Task 1：接入 WebviewViewProvider

目标：注册 AutoGen Webview 侧边栏。

修改文件：

```text
package.json
src/extension.ts
src/webview/ControlViewProvider.ts
```

验收：

```text
VS Code Activity Bar 出现 AutoGen
点击后打开 Webview
Webview 显示完整 HTML
```

### Task 2：拆分 HTML/CSS/JS

目标：把当前单文件 HTML 拆成可维护结构。

文件：

```text
media/autogen-control.html
media/autogen-control.css
media/autogen-control.js
```

验收：

```text
页面显示不变
无外部资源依赖
```

### Task 3：实现 Tab 切换状态

目标：六个 Tab 可以切换并保持状态。

验收：

```text
切换 Tab 后表单草稿不丢失
刷新 Webview 后恢复最后 Tab
```

### Task 4：实现 postMessage 基础通道

目标：Webview 发送 `webview.ready`，Extension 返回 `bootstrap.data`。

验收：

```text
控制台能看到消息
UI 显示项目名、runtime 状态
```

### Task 5：实现 Run 页 task.create 表单收集

目标：点击发送按钮，能产生完整 payload。

验收：

```text
Extension 收到 task.create
payload 包含 userRequest/team/workflow/mode/context
```

### Task 6：实现 Agents 页表单保存

目标：保存 Agent 配置。

验收：

```text
点击保存 Agent 后 Extension 收到 agent.save
JSON Schema 校验错误能显示 Toast
```

### Task 7：实现 Tools 权限矩阵前端切换

目标：矩阵格子可以循环状态。

验收：

```text
deny/allow/confirm/readonly/whitelist 可切换
保存时发送完整权限矩阵
```

### Task 8：实现 Modal 系统

目标：复用统一 Modal 渲染。

验收：

```text
计划调整、拒绝 Patch、部分应用、切换 Agent 都用统一 Modal
Esc 可关闭
```

---

## 26. 自检清单

### 26.1 资料依据自检

- [x] 检索并参考 VS Code Webview 官方文档
- [x] 检索并参考 VS Code Webview UX Guidelines
- [x] 检索并确认 Webview UI Toolkit 已归档，不作为依赖
- [x] 设计中未依赖不稳定的第三方 UI Toolkit

### 26.2 UI 完整性自检

- [x] 覆盖 Run Tab
- [x] 覆盖 Agents Tab
- [x] 覆盖 Team Tab
- [x] 覆盖 Tools Tab
- [x] 覆盖 Workflow Tab
- [x] 覆盖 Settings Tab
- [x] 覆盖 Modal / Toast / Drawer
- [x] 覆盖流式事件卡片

### 26.3 联调准备自检

- [x] 定义 Webview 初始化流程
- [x] 定义 `webview.ready` / `bootstrap.data`
- [x] 定义 Run 页核心事件
- [x] 定义 Agent 保存 payload
- [x] 定义权限矩阵前端状态
- [x] 定义流式事件渲染方式

### 26.4 安全自检

- [x] 不使用外部 CDN
- [x] 设计 CSP
- [x] API Key 不进入 HTML
- [x] localResourceRoots 限制资源目录
- [x] 使用 VS Code 主题变量

### 26.5 待后续文档展开

- [ ] `02_Webview与Extension通信协议设计.md` 详细定义所有 postMessage 事件
- [ ] `03_Extension与AutoGenService通信接口设计.md` 详细定义 HTTP/WebSocket API
- [ ] `08_VSCode文件_Diff_Terminal_Git工具联调设计.md` 详细定义 VS Code 端工具实现

---

## 27. 本文档结论

本 Webview 前端设计采用：

```text
WebviewViewProvider + 单页六 Tab 控制台 + 纯 HTML/CSS/JS + VS Code CSS 变量
```

第一版不使用 React，不使用 Webview UI Toolkit，不加载外部资源。  
前端只负责：

```text
1. 展示 UI
2. 收集表单
3. 发出 postMessage
4. 渲染 Extension 转发的任务事件
5. 做轻量状态保存
```

真正的文件操作、AutoGen 调用、Runtime 管理、工具权限执行都必须放在 Extension / AutoGen Service 层。

