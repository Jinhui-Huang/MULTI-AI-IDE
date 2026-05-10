# 00_项目总览与 MVP 范围详细设计

> 文档版本：v1.0  
> 适用项目：AutoGen + VS Code 插件式多 Agent 编程 IDE  
> 生成日期：2026-05-10  
> 当前文件定位：总览文档。它不是接口细节文档，而是定义项目边界、MVP 范围、模块拆分、联调主链路和后续文档生成顺序。

---

## 1. 资料检索依据

本设计基于以下公开资料方向整理：

| 资料方向 | 关键结论 | 对本项目的影响 |
|---|---|---|
| AutoGen 官方仓库 | AutoGen 是用于构建多 Agent AI 应用的框架；当前官方仓库提示已进入 maintenance mode，不再新增功能。 | 项目可以用 AutoGen 做 MVP 核心编排，但产品结构要保留可替换 Agent Runtime 的边界。 |
| AutoGen AgentChat 官方文档 | `AssistantAgent` 支持模型、工具、`run()` / `run_stream()` 等方式，适合构建多 Agent 应用。 | AutoGen Service 采用 Python 服务，Agent 执行使用流式事件转发给 VS Code Webview。 |
| AutoGen Teams 官方文档 | AgentChat 支持 team 概念，team 是多个 Agent 为共同目标协作；存在 RoundRobin、Selector 等 team preset。 | UI 需要 Team 页面，不能只有单 Agent Chat。 |
| AutoGen Studio 官方文档 | AutoGen Studio 是低代码界面，可快速创建 agents、挂工具、组成 teams 并交互执行任务。 | 本项目 UI 借鉴 Studio 的 Agent / Team / Workflow 管理思路，但不直接复用 Studio 作为 IDE 前端。 |
| VS Code Webview 官方文档 | Webview 内部通过 `acquireVsCodeApi().postMessage()` 向 Extension 发送消息，Extension 也可以向 Webview 发送消息。 | Webview UI 只做前端，所有 VS Code 能力通过 Extension Host 转发。 |
| VS Code Extension API 官方文档 | Extension 可使用 VS Code API 操作编辑器、终端、文件系统、命令等能力。 | AutoGen 不直接操作 VS Code，必须通过 Extension 暴露受控工具。 |
| VS Code Extension Storage 文档 | `globalStorageUri`、`storageUri` 可用于扩展本地读写存储，SecretStorage 用于敏感数据。 | 配置、任务历史、日志、API Key 分层存储。 |

参考链接集中列在文末。

---

## 2. 项目目标

本项目目标是开发一个 **VS Code 插件形式的 AutoGen 多 Agent 编程控制台**。

它不是单纯聊天插件，而是让用户在 VS Code 中：

1. 配置 AutoGen Agent；
2. 管理多 Agent Team；
3. 编排代码开发 Workflow；
4. 控制 Agent 调用文件、搜索、Diff、Terminal、Git 等 IDE 工具；
5. 查看任务执行过程、工具调用、Patch、测试结果；
6. 在关键风险点进行确认；
7. 将 Agent 生成的代码修改以 Diff / Patch 方式落地到当前工程。

一句话定位：

```text
VS Code Webview UI 负责可视化控制；
VS Code Extension 负责 IDE 能力和安全边界；
Python AutoGen Service 负责多 Agent 编排和 LLM 工具调用；
ToolGateway 负责把 AutoGen 的工具请求转换为受控 VS Code 操作。
```

---

## 3. 产品定位

### 3.1 不是做什么

本项目第一阶段不做：

| 不做项 | 原因 |
|---|---|
| 不直接魔改 Code-OSS | 成本高，启动慢，不利于 MVP 验证。 |
| 不直接做完整 Cursor 替代品 | Cursor 级别通用能力需要大量工程投入，MVP 应先聚焦 Java / 企业代码场景。 |
| 不直接用 AutoGen Studio 当 IDE UI | Studio 是低代码原型工具，不是代码编辑器集成界面。 |
| 不让 AutoGen 直接读写用户磁盘 | 安全风险高，必须由 VS Code Extension 做权限边界。 |
| 不让 Agent 自动执行危险命令 | IDE 插件必须支持命令白名单和用户确认。 |
| 不一开始支持所有语言 | 第一版建议聚焦 Java Spring Boot，后续扩展 Node / React / Python。 |

### 3.2 要做什么

第一阶段要做：

| 要做项 | 说明 |
|---|---|
| VS Code Webview 控制台 | 使用已有 Claude 风格完整 UI。 |
| 多 Tab 配置页面 | Run / Agents / Team / Tools / Workflow / Settings。 |
| AutoGen Python Service | 本地启动 FastAPI + WebSocket 服务。 |
| 多 Agent MVP | PlannerAgent、CodebaseAgent、DeveloperAgent、ReviewerAgent、TesterAgent、SummaryAgent。 |
| 受控工具系统 | 文件读取、代码搜索、Patch 提案、Diff 打开、命令执行、Git diff。 |
| 半自动代码修改流程 | 用户输入需求 → Agent 生成计划 → 用户确认 → 生成 Patch → 用户确认 → 应用 → 测试。 |
| 配置持久化 | Agent、Team、Tool、Workflow、Model、Runtime、Safety 配置保存。 |
| 任务状态和历史 | 保存每次任务、消息、工具调用、Patch、命令输出。 |

---

## 4. 核心架构

### 4.1 运行架构

```text
┌──────────────────────────────────────────────┐
│ VS Code                                      │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ Webview UI                            │    │
│  │ - Run                                 │    │
│  │ - Agents                              │    │
│  │ - Team                                │    │
│  │ - Tools                               │    │
│  │ - Workflow                            │    │
│  │ - Settings                            │    │
│  └───────────────┬──────────────────────┘    │
│                  │ postMessage               │
│                  ↓                           │
│  ┌──────────────────────────────────────┐    │
│  │ VS Code Extension Host                │    │
│  │ - WebviewViewProvider                 │    │
│  │ - MessageDispatcher                   │    │
│  │ - ConfigStore                         │    │
│  │ - AutoGenServiceClient                │    │
│  │ - ToolServer                          │    │
│  │ - Diff / Terminal / Git Adapter       │    │
│  └───────────────┬──────────────────────┘    │
└──────────────────┼───────────────────────────┘
                   │ HTTP / WebSocket
                   ↓
┌──────────────────────────────────────────────┐
│ Python AutoGen Service                        │
│ - FastAPI HTTP API                            │
│ - WebSocket Event Stream                      │
│ - AgentFactory                                │
│ - WorkflowRunner                              │
│ - ToolGatewayClient                           │
│ - TaskStore                                   │
│ - ConfigStore                                 │
└──────────────────┬───────────────────────────┘
                   │ tool call request
                   ↓
┌──────────────────────────────────────────────┐
│ VS Code ToolGateway                           │
│ - read_file                                   │
│ - list_files                                  │
│ - search_code                                 │
│ - propose_patch                               │
│ - open_diff                                   │
│ - apply_patch                                 │
│ - run_command                                 │
│ - git_diff                                    │
│ - git_status                                  │
└──────────────────────────────────────────────┘
```

### 4.2 为什么不让 AutoGen 直接操作文件

AutoGen Service 技术上可以直接读取 workspace 文件，但产品上不建议这么做。

原因：

1. AutoGen 在 Python 进程中，如果传入 workspace path，它可以绕过 VS Code 权限控制；
2. 它可能读取 `.env`、私钥、生产配置等敏感文件；
3. 它可能直接写文件导致用户无法预览 Diff；
4. VS Code Remote / WSL / SSH / Codespaces 场景下，本地 Python 与远端 workspace 位置可能不一致；
5. IDE 操作应该由 Extension Host 统一审计和授权。

因此工具路径必须是：

```text
AutoGen Agent 想读文件
  ↓
调用 read_file 工具
  ↓
Python ToolGatewayClient 请求 VS Code Extension
  ↓
Extension 检查权限 / 黑名单 / workspace 边界
  ↓
Extension 使用 VS Code API 或 Node fs 读取
  ↓
返回脱敏后的结果
```

---

## 5. MVP 范围

### 5.1 MVP 目标

MVP 的目标不是“完整商业 IDE”，而是验证以下闭环：

```text
用户在 VS Code 插件页面输入开发需求
  ↓
AutoGen 多 Agent 分析当前项目
  ↓
生成开发计划
  ↓
用户确认计划
  ↓
Agent 读取相关文件
  ↓
生成 unified diff patch
  ↓
用户查看 Diff
  ↓
用户应用 Patch
  ↓
执行测试命令
  ↓
如果失败，将错误反馈给 DeveloperAgent 修复
  ↓
输出最终总结
```

### 5.2 MVP 支持场景

优先支持：

| 场景 | 说明 |
|---|---|
| Java Spring Boot 接口开发 | 最贴合用户技术背景，便于验证。 |
| Bug 修复 | 基于终端错误、当前文件、Git diff 生成修复。 |
| 测试生成 | 根据已有 Controller / Service 生成测试。 |
| 代码解释 | 读取当前文件或选中代码，输出结构解释。 |
| 小范围重构 | 对单文件或少量文件提出 Patch。 |

暂不支持：

| 暂不支持 | 原因 |
|---|---|
| 大型跨仓库改造 | 上下文和安全风险过高。 |
| 自动 Git push | 高风险操作。 |
| 自动发布 npm / Maven 包 | 高风险操作。 |
| 任意 Shell 命令 | 必须白名单。 |
| 无确认自动写文件 | 必须走 Diff / Patch。 |

### 5.3 MVP 内置 Agent

| Agent | 职责 | 是否需要工具 | 第一版模型建议 |
|---|---|---|---|
| PlannerAgent | 拆分用户需求，生成执行计划 | 否 | 低成本模型 |
| CodebaseAgent | 分析项目结构、读取文件、定位相关代码 | 是 | 中等模型 |
| DeveloperAgent | 生成代码修改 Patch | 是 | 强代码模型 |
| ReviewerAgent | 审查 Patch 风险、编译问题、风格问题 | 可选 | 强模型 |
| TesterAgent | 决定测试命令、分析测试失败日志 | 是 | 中等模型 |
| SummaryAgent | 总结修改内容、风险、后续建议 | 否 | 低成本模型 |

### 5.4 MVP 内置 Workflow

#### Code Edit Workflow

```text
1. UserRequest
2. PlannerAgent
3. Human Plan Approval
4. CodebaseAgent
5. DeveloperAgent
6. ReviewerAgent
7. Human Patch Approval
8. ApplyPatch Tool
9. TesterAgent
10. If failed → DeveloperAgent 修复
11. SummaryAgent
```

#### Bug Fix Workflow

```text
1. UserRequest + terminal error / selected error
2. CodebaseAgent
3. DeveloperAgent
4. ReviewerAgent
5. Human Patch Approval
6. TesterAgent
7. SummaryAgent
```

#### Explain Code Workflow

```text
1. User selected current file / selection
2. CodebaseAgent
3. SummaryAgent / ExplainerAgent
```

### 5.5 MVP 内置工具

| 工具 | 说明 | 默认权限 |
|---|---|---|
| list_files | 列出 workspace 内文件 | Codebase/Developer 允许 |
| read_file | 读取 workspace 内文件 | 需要黑名单过滤 |
| search_code | 使用 rg / VS Code search 搜索代码 | 允许 |
| get_current_file | 获取当前打开文件 | 允许 |
| get_selection | 获取当前选中代码 | 允许 |
| get_git_diff | 获取当前 Git diff | 允许 |
| propose_patch | Agent 只提出 Patch，不写文件 | 允许 |
| open_diff | VS Code 打开 Diff 预览 | 用户触发 |
| apply_patch | 应用 Patch | 必须确认 |
| run_command | 执行测试/构建命令 | 必须确认 + 白名单 |
| read_terminal_output | 读取终端输出 | 用户允许后 |
| create_checkpoint | 应用 Patch 前创建 checkpoint | 自动 |
| rollback_checkpoint | 回滚到任务开始前 | 必须确认 |

---

## 6. UI 范围

当前完整 UI 已定义 6 个 Tab：

```text
Run
Agents
Team
Tools
Workflow
Settings
```

### 6.1 Run Tab

负责任务执行与人工确认。

必须支持：

- 输入用户需求；
- 选择 Team；
- 选择 Workflow；
- 选择执行模式；
- 指定目标 Agent；
- 选择上下文；
- 显示 Agent 消息；
- 显示工具调用；
- 显示计划确认；
- 显示 Patch / Diff；
- 显示命令执行确认；
- 支持暂停、继续、终止、重跑、切换 Agent；
- 支持追加用户消息。

### 6.2 Agents Tab

负责单 Agent 配置。

必须支持：

- 新建 / 复制 / 删除 / 禁用 Agent；
- 编辑 Agent Name；
- 编辑 Description；
- 编辑 Role；
- 选择 Model；
- 配置 Temperature；
- 配置 Max Turns；
- 配置 Max Tool Calls；
- 配置 Timeout；
- 编辑 System Prompt；
- 配置 Response Format；
- 配置 Stop Condition；
- 配置 Output JSON Schema；
- 配置可用 Tools；
- 配置上下文范围；
- 测试单个 Agent。

### 6.3 Team Tab

负责多 Agent 组合。

必须支持：

- 新建 / 复制 / 删除 Team；
- 设置默认 Team；
- 编辑 Team Name；
- 设置 Team Mode；
- 设置 Max Turns；
- 设置 Retry Limit；
- 设置 Termination；
- 设置串行 / 并行策略；
- 设置 Team 级模型覆盖策略；
- 添加 / 移除 Agent；
- 上移 / 下移 Agent 顺序；
- 保存 Team；
- 使用模板。

### 6.4 Tools Tab

负责工具注册与权限。

必须支持：

- 工具权限矩阵；
- 工具权限状态：deny / allow / confirm / readonly / whitelist；
- 批量编辑；
- 保存权限；
- Tool Registry；
- 新增工具；
- 编辑工具参数 Schema；
- 工具返回值预览；
- 测试工具；
- 命令白名单；
- 命令黑名单；
- 敏感文件黑名单；
- Global Safety 开关；
- 工具调用日志开关。

### 6.5 Workflow Tab

负责执行流程编排。

必须支持：

- Workflow Name；
- Workflow Description；
- Workflow JSON Version；
- Workflow Type；
- Failure Strategy；
- Retry Limit；
- Node Timeout；
- Confirm Policy；
- 节点列表；
- 编辑节点；
- 添加 Agent 节点；
- 添加人工确认节点；
- 添加条件分支；
- 删除节点；
- 上移 / 下移节点；
- 测试运行 Workflow；
- 导入 / 导出 JSON；
- 保存 Workflow；
- 另存为模板；
- 设为默认。

### 6.6 Settings Tab

负责模型、Runtime、存储、安全。

必须支持：

- Provider；
- Base URL；
- Model；
- Fallback Model；
- API Key；
- 是否使用 VS Code SecretStorage；
- 测试模型连接；
- 保存模型设置；
- Service URL；
- Host；
- Port；
- Python Path；
- AutoGen Package；
- Log Level；
- Workspace Storage Path；
- 启动 / 停止 / 重启 Runtime；
- Health Check；
- 查看 Runtime 日志；
- 导入 / 导出配置；
- 恢复默认；
- 清空任务历史；
- 保存安全策略。

---

## 7. 模块边界

### 7.1 Webview UI

职责：

- 展示数据；
- 收集表单；
- 响应用户点击；
- 通过 `postMessage` 向 Extension 发送事件；
- 接收 Extension 发送的状态更新；
- 不直接调用 Node fs；
- 不直接调用 Python Service；
- 不直接保存 API Key；
- 不直接访问 workspace 文件。

Webview 只能做：

```text
UI state + interaction + rendering
```

### 7.2 VS Code Extension Host

职责：

- 创建 Webview；
- 注入 Webview HTML / CSS / JS；
- 处理 Webview `postMessage`；
- 调用 Python AutoGen Service；
- 维护 WebSocket 连接；
- 转发 AutoGen 事件给 Webview；
- 实现 VS Code 工具；
- 保存配置；
- 保存 Secret；
- 控制 Runtime 启停；
- 打开 Diff；
- 执行 Terminal；
- 读写 workspace 文件；
- 管理 Patch 应用和回滚。

Extension Host 是整个系统安全边界。

### 7.3 Python AutoGen Service

职责：

- 提供 HTTP API；
- 提供 WebSocket 事件流；
- 创建 AutoGen Agent；
- 创建 Team；
- 执行 WorkflowRunner；
- 管理 TaskContext；
- 调用 ToolGateway；
- 发送 agent_message、tool_call、patch_proposed、approval_required 等事件；
- 不直接访问 workspace，除非开发模式允许。

### 7.4 ToolGateway

职责：

- 定义工具协议；
- 权限校验；
- 参数校验；
- 请求 VS Code Extension 执行具体工具；
- 返回工具结果；
- 记录工具调用日志；
- 处理用户确认。

### 7.5 ConfigStore

职责：

- 保存 Agent Config；
- 保存 Team Config；
- 保存 Tool Permission；
- 保存 Workflow Config；
- 保存 Model Settings；
- 保存 Runtime Settings；
- 保存 Safety Settings；
- 保存任务历史索引；
- Secret 使用 VS Code SecretStorage。

---

## 8. 任务状态机总览

MVP 任务状态：

```text
idle
created
planning
waiting_plan_approval
analyzing_codebase
developing_patch
reviewing_patch
waiting_patch_approval
applying_patch
testing
fixing
summarizing
completed
paused
cancelled
failed
```

### 8.1 状态与按钮关系

| 状态 | Run 页允许按钮 |
|---|---|
| created | 暂停 / 终止 |
| planning | 暂停 / 终止 |
| waiting_plan_approval | 接受计划 / 调整计划 / 终止 |
| analyzing_codebase | 暂停 / 终止 |
| developing_patch | 暂停 / 终止 / 重跑当前 Agent |
| reviewing_patch | 暂停 / 终止 |
| waiting_patch_approval | 查看 Diff / 应用 Patch / 拒绝 / 部分应用 |
| applying_patch | 暂停禁用 / 终止谨慎 |
| testing | 允许一次 / 加入白名单 / 拒绝命令 |
| fixing | 暂停 / 终止 |
| paused | 继续 / 终止 |
| completed | 新任务 / 保存模板 / 查看历史 |
| failed | 重试 / 查看日志 / 回滚 |
| cancelled | 新任务 / 查看日志 |

---

## 9. 联调主流程

### 9.1 Webview 到 Extension

```text
用户点击按钮
  ↓
Webview 调用 vscode.postMessage({
  type: "task.create",
  payload: {...}
})
  ↓
Extension 的 WebviewViewProvider 接收消息
  ↓
MessageDispatcher 根据 type 调用对应 handler
```

### 9.2 Extension 到 AutoGen Service

```text
MessageDispatcher
  ↓
AutoGenServiceClient
  ↓
HTTP POST /api/tasks
  ↓
返回 taskId
  ↓
Extension 建立 /ws/tasks/{taskId}
```

### 9.3 AutoGen Service 到 Extension

```text
WorkflowRunner 执行 Agent
  ↓
AutoGen run_stream() 产生消息
  ↓
转换为 UI 事件
  ↓
WebSocket 推送给 Extension
```

### 9.4 Extension 到 Webview

```text
Extension 收到 WebSocket 消息
  ↓
webview.postMessage({
  type: "agent_message",
  payload: {...}
})
  ↓
Webview 渲染 Timeline / Message / ToolCard
```

### 9.5 AutoGen 工具调用 VS Code

```text
AutoGen Agent 调用 read_file 工具
  ↓
Python ToolGatewayClient 请求 Extension ToolServer
  ↓
Extension 做权限检查
  ↓
Extension 使用 VS Code API / Node fs 读取文件
  ↓
返回工具结果
  ↓
AutoGen 继续推理
```

---

## 10. 数据对象总览

### 10.1 TaskContext

```json
{
  "taskId": "task_001",
  "workspaceId": "workspace_001",
  "workspaceRoot": "D:/projects/mall-springboot",
  "userRequest": "帮我增加 JWT 登录接口",
  "teamId": "java-spring-team",
  "workflowId": "code-edit",
  "mode": "semi-auto",
  "targetAgent": "auto",
  "status": "developing_patch",
  "plan": {},
  "codebaseSummary": {},
  "relatedFiles": [],
  "patches": [],
  "reviews": [],
  "testResults": [],
  "toolCalls": [],
  "approvals": [],
  "messages": [],
  "decisions": []
}
```

### 10.2 AgentConfig

```json
{
  "id": "developer_agent",
  "name": "DeveloperAgent",
  "description": "生成代码修改 Patch",
  "role": "developer",
  "model": "gpt-4.1",
  "temperature": 0.2,
  "maxTurns": 8,
  "maxToolCalls": 30,
  "timeoutSeconds": 180,
  "systemPrompt": "...",
  "responseFormat": "json",
  "stopCondition": "patch_proposed",
  "outputJsonSchema": {},
  "tools": ["read_file", "search_code", "propose_patch"],
  "contextScopes": ["current_file", "git_diff", "selected_code"]
}
```

### 10.3 TeamConfig

```json
{
  "id": "java-spring-team",
  "name": "Java Spring Boot Team",
  "mode": "sequential",
  "maxTurns": 30,
  "retryLimit": 2,
  "termination": "summary_done",
  "executionPolicy": "serial",
  "modelOverride": "none",
  "agents": [
    "planner_agent",
    "codebase_agent",
    "developer_agent",
    "reviewer_agent",
    "tester_agent",
    "summary_agent"
  ],
  "isDefault": true
}
```

### 10.4 WorkflowConfig

```json
{
  "id": "code-edit",
  "name": "Code Edit Workflow",
  "description": "半自动代码修改流程",
  "version": "1.0.0",
  "type": "code_edit",
  "failureStrategy": "back_to_developer",
  "retryLimit": 2,
  "nodeTimeoutSeconds": 180,
  "confirmPolicy": "plan_patch_command",
  "nodes": [],
  "edges": [],
  "isDefault": true
}
```

---

## 11. 技术选型

### 11.1 VS Code 插件

| 项目 | 选型 |
|---|---|
| 语言 | TypeScript |
| UI | Webview HTML / CSS / JS |
| 消息通信 | Webview postMessage |
| 存储 | globalState / workspaceState / globalStorageUri / SecretStorage |
| Diff | `vscode.diff` 命令 |
| Terminal | `vscode.window.createTerminal` 或 pseudoterminal |
| 文件操作 | `vscode.workspace.fs` 优先，必要时 Node fs |
| 搜索 | ripgrep / VS Code workspace search |
| 打包 | VSIX |

### 11.2 AutoGen Service

| 项目 | 选型 |
|---|---|
| 语言 | Python |
| Web 框架 | FastAPI |
| 实时通信 | WebSocket |
| Agent 框架 | AutoGen AgentChat |
| 模型客户端 | OpenAI-compatible client |
| 配置 | JSON / SQLite |
| 日志 | JSONL |
| 后台进程 | Extension 启动和监控 |

---

## 12. 项目里程碑

### Milestone 1：UI 接入 VS Code Webview

目标：

- Webview 能加载当前 HTML；
- Tab 切换可用；
- 所有按钮能发 postMessage；
- Extension 能打印收到的事件；
- Settings 能保存到 VS Code 配置。

验收：

```text
点击任意按钮，Extension Output Channel 能看到事件 type 和 payload。
```

### Milestone 2：AutoGen Service 启动与健康检查

目标：

- Extension 能启动 Python Service；
- `/health` 返回 OK；
- Settings Runtime 页面能显示状态；
- Runtime 日志能查看。

验收：

```text
点击 Start Runtime 后，UI 显示 running，日志面板能看到服务启动输出。
```

### Milestone 3：Task Create + WebSocket 消息流

目标：

- Run 页发送任务；
- Python Service 创建 task；
- WebSocket 推送 agent_message；
- UI 渲染 Agent 消息。

验收：

```text
输入“解释当前项目结构”，Run 页能显示 PlannerAgent / CodebaseAgent 消息。
```

### Milestone 4：工具联调

目标：

- read_file；
- list_files；
- search_code；
- git_diff；
- propose_patch。

验收：

```text
CodebaseAgent 可以通过工具读取 pom.xml，并在 UI ToolCall 卡片显示调用过程。
```

### Milestone 5：Patch / Diff / Apply

目标：

- DeveloperAgent 生成 patch；
- UI 显示 Proposed Changes；
- 点击 View Diff 打开 VS Code diff；
- 点击 Apply Patch 应用修改；
- 可回滚。

验收：

```text
对测试项目生成一个简单 Controller 文件，用户确认后文件真实落盘。
```

### Milestone 6：测试命令闭环

目标：

- TesterAgent 请求执行 `mvn test`；
- UI 显示命令确认卡片；
- 用户允许；
- Extension 执行终端命令；
- 日志返回 AutoGen；
- 失败时 DeveloperAgent 修复。

验收：

```text
测试失败日志能被 Agent 读取并生成二次修复 Patch。
```

---

## 13. 风险与规避

| 风险 | 说明 | 规避 |
|---|---|---|
| AutoGen maintenance mode | 后续功能更新不活跃 | 抽象 AgentRuntime 接口，后续可替换 LangGraph / Agent Framework |
| Agent 乱读文件 | 可能读取敏感文件 | Extension 层强制 workspace 边界和黑名单 |
| Agent 乱执行命令 | 可能执行危险操作 | 命令白名单 + 用户确认 |
| Patch 应用失败 | AI 生成 diff 不稳定 | 先 git apply --check，再应用；失败返回 DeveloperAgent |
| Token 成本高 | 多 Agent 会多轮调用 | MVP 控制 maxTurns / maxToolCalls / context 文件数 |
| Webview 状态复杂 | 六个 Tab 配置多 | 前端状态统一 store 管理 |
| Python Runtime 打包复杂 | 用户环境差异大 | 开发期用系统 Python，产品期再内置 Runtime |
| VS Code Remote 场景复杂 | Extension Host 与 Python 所在环境不同 | MVP 先支持本地 workspace，后续单独支持 remote |

---

## 14. 后续文档拆分顺序

后续每次只生成一个详细文件，推荐顺序：

```text
01_VSCode插件前端Webview详细设计.md
02_Webview与Extension通信协议设计.md
03_Extension与AutoGenService通信接口设计.md
04_AutoGen多Agent运行时详细设计.md
05_Agent配置与Prompt模板设计.md
06_Team与Workflow编排设计.md
07_Tools工具系统与权限控制设计.md
08_VSCode文件_Diff_Terminal_Git工具联调设计.md
09_Task任务状态机与WebSocket事件设计.md
10_配置存储与SecretStorage设计.md
11_安全边界与沙箱策略设计.md
12_插件打包发布与内置PythonRuntime设计.md
13_MVP开发顺序与验收清单.md
14_给Codex执行开发的任务拆分清单.md
```

每份文档都必须包含：

1. 模块定位；
2. 资料依据；
3. 详细功能；
4. 数据结构；
5. 接口设计；
6. UI 映射；
7. 关键流程；
8. 异常处理；
9. 自检清单。

---

## 15. 自检清单

| 检查项 | 结果 |
|---|---|
| 是否基于公开 AutoGen / VS Code 资料重新梳理 | 通过 |
| 是否明确项目不是单纯 Chat UI | 通过 |
| 是否定义了 VS Code Webview / Extension / AutoGen Service / ToolGateway 边界 | 通过 |
| 是否定义了 MVP 支持和不支持范围 | 通过 |
| 是否覆盖 6 个 UI Tab 的定位 | 通过 |
| 是否说明 AutoGen 不应直接操作 workspace | 通过 |
| 是否定义任务状态机总览 | 通过 |
| 是否定义核心数据对象 | 通过 |
| 是否给出里程碑和验收标准 | 通过 |
| 是否列出后续文档生成顺序 | 通过 |
| 是否仍有未展开的模块 | 有，后续文件逐个展开 |
| 是否适合直接交给 Codex 作为项目总览 | 基本适合，但 Codex 还需要后续 01-14 的细化文档 |

---

## 16. 参考链接

1. AutoGen GitHub：  
   https://github.com/microsoft/autogen

2. AutoGen 官方文档首页：  
   https://microsoft.github.io/autogen/stable/

3. AutoGen AgentChat Agents 文档：  
   https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/agents.html

4. AutoGen AgentChat Teams 文档：  
   https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/teams.html

5. AutoGen Studio 文档：  
   https://microsoft.github.io/autogen/dev/user-guide/autogenstudio-user-guide/index.html

6. AutoGen Studio Microsoft Research Blog：  
   https://www.microsoft.com/en-us/research/blog/introducing-autogen-studio-a-low-code-interface-for-building-multi-agent-workflows/

7. VS Code Webview API：  
   https://code.visualstudio.com/api/extension-guides/webview

8. VS Code Extension API：  
   https://code.visualstudio.com/api/references/vscode-api

9. VS Code Extension Capabilities / Storage：  
   https://code.visualstudio.com/api/extension-capabilities/common-capabilities

10. VS Code Remote Extension 注意事项：  
   https://code.visualstudio.com/api/advanced-topics/remote-extensions
