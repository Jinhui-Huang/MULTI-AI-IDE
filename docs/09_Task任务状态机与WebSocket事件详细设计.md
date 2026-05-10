# 09_Task任务状态机与WebSocket事件详细设计

> 文档编号：09  
> 文档名称：Task 任务状态机与 WebSocket 事件详细设计  
> 适用项目：AutoGen + VS Code 插件式多 Agent 编程 IDE  
> 适用范围：VS Code Webview UI、Extension Host、Python AutoGen Service、WorkflowRunner、TaskStore、WebSocket 推送层  
> 版本：v1.0  
> 生成日期：2026-05-10

---

## 1. 资料依据与设计前提

### 1.1 资料依据

本设计参考以下公开资料与前序文档：

1. AutoGen AgentChat 官方文档  
   - `run_stream()` 会返回异步消息流，逐条产出 Agent 消息，最后产出 `TaskResult`。
   - Agent 可以使用 tools，并在执行过程中产生工具调用相关事件。
   - AutoGen Agent / Team 的执行结果适合被转换成前端可消费的统一事件流。

2. FastAPI WebSocket 官方文档  
   - FastAPI 支持通过 `WebSocket` 对象建立双向通信。
   - 服务端可以维护连接管理器，实现同一任务多客户端订阅、广播、断开处理。
   - `WebSocketDisconnect` 需要被捕获并清理连接。

3. VS Code Webview 官方文档  
   - Webview 内部使用 `acquireVsCodeApi().postMessage()` 向 Extension 发送消息。
   - Extension 侧使用 `webview.onDidReceiveMessage()` 接收消息。
   - Extension 侧使用 `webview.postMessage()` 向 Webview 推送 UI 事件。
   - Webview 是 UI 容器，不应直接访问本地文件系统或直接调用 AutoGen Service。

4. 前序文档  
   - `02_Webview与Extension通信协议详细设计.md`
   - `03_Extension与AutoGenService通信接口详细设计.md`
   - `04_AutoGen多Agent运行时详细设计.md`
   - `06_Team与Workflow编排详细设计.md`
   - `07_Tools工具系统与权限控制详细设计.md`
   - `08_VSCode文件_Diff_Terminal_Git工具联调详细设计.md`

### 1.2 设计前提

本项目采用三层通信模型：

```text
VS Code Webview UI
  ↓ postMessage
VS Code Extension Host
  ↓ HTTP / WebSocket
Python AutoGen Service
  ↓ ToolGateway
VS Code 文件 / Diff / Terminal / Git 工具
```

任务状态机由 Python AutoGen Service 内的 `TaskManager + WorkflowRunner` 维护。

Webview 不直接维护真实状态，只维护 UI 快照状态。真实状态以 AutoGen Service 返回和 WebSocket 推送为准。

---

## 2. 设计目标

本文件要解决以下问题：

```text
1. 一个 AI 编程任务从创建到结束有哪些状态？
2. 每个状态下 UI 上哪些按钮可用？
3. 每个状态由哪个事件触发进入或退出？
4. AutoGen run_stream 事件如何映射成统一 WebSocket 事件？
5. WebSocket 事件如何转发到 VS Code Webview？
6. 断线重连、事件重放、任务恢复怎么处理？
7. 任务暂停、继续、取消、失败、重试怎么设计？
8. 多 Agent、多工具调用、多用户确认节点如何在状态机中表示？
```

最终目标是让 UI 可以稳定展示：

```text
任务状态
Agent 状态
Workflow 步骤状态
工具调用过程
Patch 生成与确认
命令执行确认
测试结果
错误与重试
历史事件回放
```

---

## 3. 核心概念

### 3.1 Task

Task 是用户发起的一次 AI 编程任务。

示例：

```text
帮我给当前 Spring Boot 项目增加 JWT 登录接口
```

Task 会经过：

```text
创建 → 计划 → 分析代码 → 生成 patch → 审查 → 用户确认 → 应用 patch → 测试 → 总结
```

### 3.2 Workflow Step

Workflow Step 是任务流程中的一个节点。

例如：

```text
PlannerAgent
HumanApproval(plan)
CodebaseAgent
DeveloperAgent
ReviewerAgent
HumanApproval(patch)
ApplyPatch
TesterAgent
SummaryAgent
```

### 3.3 Agent Run

Agent Run 是某个 Agent 的一次执行。

例如：

```text
DeveloperAgent 根据 CodebaseAgent 的上下文生成 patch
```

### 3.4 Tool Call

Tool Call 是 Agent 调用某个工具的动作。

例如：

```text
read_file("pom.xml")
search_code("@RestController")
propose_patch(...)
run_command("mvn test")
```

### 3.5 Approval

Approval 是用户确认节点。

例如：

```text
确认计划
确认执行命令
确认应用 patch
确认访问敏感文件
```

### 3.6 Event

Event 是系统状态变化的最小记录单元。

例如：

```text
task.created
agent.started
tool.call.started
approval.required
patch.proposed
task.completed
```

所有 Event 都应该可以持久化、重放和转发到 UI。

---

## 4. Task 状态机总览

### 4.1 TaskStatus 枚举

```ts
type TaskStatus =
  | "created"
  | "queued"
  | "running"
  | "planning"
  | "waiting_plan_approval"
  | "analyzing_codebase"
  | "developing_patch"
  | "reviewing_patch"
  | "waiting_patch_approval"
  | "applying_patch"
  | "testing"
  | "fixing"
  | "summarizing"
  | "paused"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "completed";
```

### 4.2 状态说明

| 状态 | 含义 | 是否终态 | UI 主提示 |
|---|---|---:|---|
| created | 任务已创建但未开始 | 否 | 任务已创建 |
| queued | 等待执行队列调度 | 否 | 排队中 |
| running | 通用运行中状态 | 否 | 执行中 |
| planning | PlannerAgent 正在生成计划 | 否 | 正在制定计划 |
| waiting_plan_approval | 等待用户确认计划 | 否 | 需要确认计划 |
| analyzing_codebase | CodebaseAgent 正在分析项目 | 否 | 正在读取项目 |
| developing_patch | DeveloperAgent 正在生成 patch | 否 | 正在生成代码变更 |
| reviewing_patch | ReviewerAgent 正在审查 patch | 否 | 正在审查变更 |
| waiting_patch_approval | 等待用户确认 patch | 否 | 需要确认 Diff |
| applying_patch | 正在应用 patch | 否 | 正在应用变更 |
| testing | TesterAgent 正在测试 | 否 | 正在执行测试 |
| fixing | 根据失败结果修复 | 否 | 正在修复问题 |
| summarizing | SummaryAgent 正在总结 | 否 | 正在生成总结 |
| paused | 用户暂停任务 | 否 | 已暂停 |
| cancelling | 正在取消 | 否 | 正在停止 |
| cancelled | 已取消 | 是 | 已取消 |
| failed | 执行失败 | 是 | 执行失败 |
| completed | 执行完成 | 是 | 已完成 |

### 4.3 主状态流

```text
created
  ↓
queued
  ↓
planning
  ↓
waiting_plan_approval
  ↓
analyzing_codebase
  ↓
developing_patch
  ↓
reviewing_patch
  ↓
waiting_patch_approval
  ↓
applying_patch
  ↓
testing
  ↓
summarizing
  ↓
completed
```

### 4.4 失败修复流

```text
testing
  ↓ test failed
fixing
  ↓
developing_patch
  ↓
reviewing_patch
  ↓
waiting_patch_approval
  ↓
applying_patch
  ↓
testing
```

### 4.5 中断流

```text
running state
  ↓ pause
paused
  ↓ resume
previous state
```

```text
running state
  ↓ cancel
cancelling
  ↓
cancelled
```

---

## 5. 状态转换表

### 5.1 核心转换

| 当前状态 | 触发事件 | 下一个状态 | 触发来源 |
|---|---|---|---|
| created | task.enqueue | queued | TaskManager |
| queued | task.start | planning | WorkflowRunner |
| planning | planner.completed | waiting_plan_approval | PlannerAgent |
| waiting_plan_approval | plan.approved | analyzing_codebase | UI |
| waiting_plan_approval | plan.revise | planning | UI |
| analyzing_codebase | codebase.completed | developing_patch | CodebaseAgent |
| developing_patch | patch.generated | reviewing_patch | DeveloperAgent |
| reviewing_patch | review.passed | waiting_patch_approval | ReviewerAgent |
| reviewing_patch | review.failed | developing_patch | ReviewerAgent |
| waiting_patch_approval | patch.approved | applying_patch | UI |
| waiting_patch_approval | patch.rejected | developing_patch | UI |
| applying_patch | patch.applied | testing | PatchTool |
| applying_patch | patch.apply_failed | failed | PatchTool |
| testing | test.passed | summarizing | TesterAgent |
| testing | test.failed | fixing | TesterAgent |
| fixing | fix.generated | reviewing_patch | DeveloperAgent |
| summarizing | summary.completed | completed | SummaryAgent |

### 5.2 暂停与取消转换

| 当前状态 | 触发事件 | 下一个状态 | 备注 |
|---|---|---|---|
| planning | task.pause | paused | 保存 previousStatus=planning |
| analyzing_codebase | task.pause | paused | 当前工具调用结束后暂停 |
| developing_patch | task.pause | paused | 通过 cancellation token 尝试中断 |
| testing | task.pause | paused | 如果命令已执行，等待命令结束或发取消 |
| paused | task.resume | previousStatus | 恢复到暂停前状态 |
| 任意非终态 | task.cancel | cancelling | 设置 cancellation_token |
| cancelling | cancel.done | cancelled | 清理资源 |

### 5.3 失败转换

| 当前状态 | 触发事件 | 下一个状态 | 备注 |
|---|---|---|---|
| 任意非终态 | internal.error | failed | 不可恢复错误 |
| 任意非终态 | timeout | failed | 超时 |
| 任意非终态 | max_retry_exceeded | failed | 超过重试 |
| WebSocket 断开 | ws.disconnect | 状态不变 | 任务后台继续 |
| AutoGen Service 退出 | runtime.crash | failed/recovering | 取决于是否有持久化恢复 |

---

## 6. Workflow Step 状态机

### 6.1 StepStatus

```ts
type StepStatus =
  | "pending"
  | "running"
  | "waiting_approval"
  | "skipped"
  | "succeeded"
  | "failed"
  | "cancelled";
```

### 6.2 Step 示例

```json
{
  "stepId": "step_developer_001",
  "taskId": "task_001",
  "type": "agent",
  "agentId": "developer_agent",
  "name": "DeveloperAgent 生成代码变更",
  "status": "running",
  "startedAt": "2026-05-10T03:12:11+09:00",
  "endedAt": null,
  "inputRefs": ["plan", "codebaseSummary", "relatedFiles"],
  "outputRefs": []
}
```

### 6.3 Step 与 Task 状态关系

```text
TaskStatus = developing_patch
  ↓
当前 Step = DeveloperAgent
  ↓
StepStatus = running
```

当 Step 成功：

```text
StepStatus = succeeded
TaskStatus 根据 workflow edge 进入下一个状态
```

当 Step 需要确认：

```text
StepStatus = waiting_approval
TaskStatus = waiting_plan_approval 或 waiting_patch_approval
```

---

## 7. Agent 状态机

### 7.1 AgentRunStatus

```ts
type AgentRunStatus =
  | "idle"
  | "queued"
  | "running"
  | "streaming"
  | "tool_calling"
  | "waiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled";
```

### 7.2 Agent 状态说明

| 状态 | 含义 |
|---|---|
| idle | 空闲 |
| queued | 等待当前 step 调用 |
| running | Agent 已开始 |
| streaming | 正在输出模型消息 |
| tool_calling | 正在调用工具 |
| waiting_approval | 工具或节点需要用户确认 |
| succeeded | Agent 执行成功 |
| failed | Agent 执行失败 |
| cancelled | Agent 被取消 |

### 7.3 UI 显示映射

| AgentRunStatus | UI Badge |
|---|---|
| idle | Idle |
| queued | Waiting |
| running | Running |
| streaming | Streaming |
| tool_calling | Tool |
| waiting_approval | Approval |
| succeeded | Done |
| failed | Failed |
| cancelled | Cancelled |

---

## 8. Tool Call 状态机

### 8.1 ToolCallStatus

```ts
type ToolCallStatus =
  | "created"
  | "permission_checking"
  | "waiting_approval"
  | "running"
  | "succeeded"
  | "failed"
  | "denied"
  | "cancelled";
```

### 8.2 Tool Call 流程

```text
created
  ↓
permission_checking
  ↓ allow
running
  ↓
succeeded / failed
```

如果需要确认：

```text
permission_checking
  ↓ confirm_required
waiting_approval
  ↓ approved
running
  ↓
succeeded
```

如果拒绝：

```text
waiting_approval
  ↓ rejected
denied
```

### 8.3 Tool Call 记录结构

```json
{
  "toolCallId": "tool_001",
  "taskId": "task_001",
  "stepId": "step_codebase_001",
  "agentId": "codebase_agent",
  "toolName": "read_file",
  "args": {
    "path": "pom.xml"
  },
  "status": "succeeded",
  "requiresApproval": false,
  "resultSummary": "读取成功，4210 chars",
  "resultRef": "tool_result_001",
  "startedAt": "2026-05-10T03:12:11+09:00",
  "endedAt": "2026-05-10T03:12:12+09:00"
}
```

---

## 9. Approval 状态机

### 9.1 ApprovalStatus

```ts
type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";
```

### 9.2 ApprovalType

```ts
type ApprovalType =
  | "plan"
  | "patch"
  | "command"
  | "sensitive_file"
  | "tool_call"
  | "runtime_action";
```

### 9.3 Approval 对象

```json
{
  "approvalId": "approval_001",
  "taskId": "task_001",
  "type": "patch",
  "title": "确认应用 AI 生成的 patch",
  "description": "将修改 5 个文件，包含 pom.xml 和 AuthController.java",
  "status": "pending",
  "payload": {
    "patchId": "patch_001",
    "files": [
      "pom.xml",
      "src/main/java/com/demo/AuthController.java"
    ]
  },
  "actions": [
    {
      "id": "approve",
      "label": "应用 Patch"
    },
    {
      "id": "reject",
      "label": "拒绝并说明"
    },
    {
      "id": "partial",
      "label": "部分应用"
    }
  ],
  "createdAt": "2026-05-10T03:12:20+09:00",
  "expiresAt": null
}
```

---

## 10. WebSocket 总体设计

### 10.1 连接拓扑

```text
Python AutoGen Service
  ↓ WebSocket /ws/tasks/{taskId}
VS Code Extension Host
  ↓ webview.postMessage()
VS Code Webview UI
```

Webview 不直接连 Python Service，原因：

```text
1. Webview 安全边界更清晰
2. Extension 可以统一处理鉴权、重连、日志
3. Extension 可以把远程事件转换成 UI 事件
4. 后续 Code-OSS / 独立 Electron 可复用 Extension 通信层
```

### 10.2 WebSocket 地址

```http
GET ws://127.0.0.1:{port}/ws/tasks/{taskId}?clientId={clientId}&sinceSeq={seq}
```

参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| taskId | string | 任务 ID |
| clientId | string | VS Code Extension 实例 ID |
| sinceSeq | number | 从哪个事件序号之后开始补发 |
| token | string | 可选，本地安全 token |

### 10.3 连接建立流程

```text
1. Extension 调用 POST /api/tasks 创建任务
2. AutoGen Service 返回 taskId
3. Extension 建立 /ws/tasks/{taskId}
4. AutoGen Service 发送 ws.connected
5. Extension 转发给 Webview
6. TaskManager 开始执行任务
7. WorkflowRunner 持续推送 task / agent / tool / patch / approval 事件
```

---

## 11. WebSocket 事件统一格式

### 11.1 BaseEvent

```ts
interface BaseEvent<T = any> {
  eventId: string;
  seq: number;
  type: string;
  taskId: string;
  timestamp: string;
  source: "autogen_service" | "extension" | "tool_gateway" | "workflow_runner";
  payload: T;
}
```

### 11.2 示例

```json
{
  "eventId": "evt_000001",
  "seq": 1,
  "type": "task.created",
  "taskId": "task_001",
  "timestamp": "2026-05-10T03:12:10+09:00",
  "source": "workflow_runner",
  "payload": {
    "userRequest": "帮我增加 JWT 登录接口",
    "teamId": "java_spring_team",
    "workflowId": "code_edit"
  }
}
```

### 11.3 seq 设计

`seq` 是任务内递增事件序号。

用途：

```text
1. Webview 展示消息顺序
2. 断线重连后按 sinceSeq 补发
3. 调试时还原任务全过程
4. 避免重复事件重复渲染
```

---

## 12. Task 事件定义

### 12.1 task.created

```json
{
  "type": "task.created",
  "payload": {
    "taskId": "task_001",
    "userRequest": "帮我增加 JWT 登录接口",
    "teamId": "java_spring_team",
    "workflowId": "code_edit",
    "mode": "semi_auto"
  }
}
```

UI 动作：

```text
1. 创建任务会话
2. Run 页顶部状态显示 Created
3. Timeline 新增任务开始节点
```

### 12.2 task.status.changed

```json
{
  "type": "task.status.changed",
  "payload": {
    "from": "planning",
    "to": "waiting_plan_approval",
    "reason": "planner.completed"
  }
}
```

UI 动作：

```text
1. 更新顶部状态 badge
2. 更新按钮可用性
3. 更新 timeline 当前步骤
```

### 12.3 task.paused

```json
{
  "type": "task.paused",
  "payload": {
    "previousStatus": "developing_patch",
    "reason": "user_request"
  }
}
```

### 12.4 task.resumed

```json
{
  "type": "task.resumed",
  "payload": {
    "resumeStatus": "developing_patch"
  }
}
```

### 12.5 task.cancelled

```json
{
  "type": "task.cancelled",
  "payload": {
    "reason": "user_cancelled"
  }
}
```

### 12.6 task.failed

```json
{
  "type": "task.failed",
  "payload": {
    "errorCode": "PATCH_APPLY_FAILED",
    "message": "git apply failed",
    "recoverable": true
  }
}
```

### 12.7 task.completed

```json
{
  "type": "task.completed",
  "payload": {
    "summary": "已完成 JWT 登录接口开发，测试通过。",
    "changedFiles": 5,
    "testStatus": "passed"
  }
}
```

---

## 13. Step 事件定义

### 13.1 step.started

```json
{
  "type": "step.started",
  "payload": {
    "stepId": "step_developer_001",
    "stepType": "agent",
    "name": "DeveloperAgent 生成代码变更",
    "agentId": "developer_agent"
  }
}
```

### 13.2 step.completed

```json
{
  "type": "step.completed",
  "payload": {
    "stepId": "step_developer_001",
    "status": "succeeded",
    "durationMs": 18200,
    "outputRefs": ["patch_001"]
  }
}
```

### 13.3 step.failed

```json
{
  "type": "step.failed",
  "payload": {
    "stepId": "step_developer_001",
    "errorCode": "AGENT_OUTPUT_PARSE_FAILED",
    "message": "DeveloperAgent 未输出合法 patch JSON",
    "recoverable": true
  }
}
```

---

## 14. Agent 事件定义

### 14.1 agent.started

```json
{
  "type": "agent.started",
  "payload": {
    "agentId": "developer_agent",
    "agentName": "DeveloperAgent",
    "stepId": "step_developer_001",
    "model": "gpt-4.1"
  }
}
```

### 14.2 agent.message.delta

用于流式文本增量。

```json
{
  "type": "agent.message.delta",
  "payload": {
    "agentId": "developer_agent",
    "messageId": "msg_001",
    "delta": "我将新增 AuthController..."
  }
}
```

UI 动作：

```text
把 delta 追加到当前 Agent 消息卡片
```

### 14.3 agent.message.completed

```json
{
  "type": "agent.message.completed",
  "payload": {
    "agentId": "developer_agent",
    "messageId": "msg_001",
    "content": "我将新增 AuthController、AuthService 和 JwtUtil。",
    "usage": {
      "promptTokens": 12000,
      "completionTokens": 1500
    }
  }
}
```

### 14.4 agent.completed

```json
{
  "type": "agent.completed",
  "payload": {
    "agentId": "developer_agent",
    "status": "succeeded",
    "durationMs": 30000
  }
}
```

### 14.5 agent.failed

```json
{
  "type": "agent.failed",
  "payload": {
    "agentId": "developer_agent",
    "errorCode": "MODEL_TIMEOUT",
    "message": "模型响应超时",
    "recoverable": true
  }
}
```

---

## 15. Tool 事件定义

### 15.1 tool.call.started

```json
{
  "type": "tool.call.started",
  "payload": {
    "toolCallId": "tool_001",
    "agentId": "codebase_agent",
    "toolName": "read_file",
    "args": {
      "path": "pom.xml"
    },
    "requiresApproval": false
  }
}
```

### 15.2 tool.call.waiting_approval

```json
{
  "type": "tool.call.waiting_approval",
  "payload": {
    "toolCallId": "tool_002",
    "agentId": "tester_agent",
    "toolName": "run_command",
    "approvalId": "approval_001",
    "args": {
      "command": "mvn test"
    }
  }
}
```

### 15.3 tool.call.succeeded

```json
{
  "type": "tool.call.succeeded",
  "payload": {
    "toolCallId": "tool_001",
    "toolName": "read_file",
    "summary": "读取成功，4210 chars",
    "resultRef": "tool_result_001",
    "durationMs": 140
  }
}
```

### 15.4 tool.call.failed

```json
{
  "type": "tool.call.failed",
  "payload": {
    "toolCallId": "tool_001",
    "toolName": "read_file",
    "errorCode": "FILE_NOT_FOUND",
    "message": "文件不存在：pom.xml"
  }
}
```

### 15.5 tool.call.denied

```json
{
  "type": "tool.call.denied",
  "payload": {
    "toolCallId": "tool_003",
    "toolName": "read_file",
    "reason": "SENSITIVE_FILE_BLOCKED",
    "args": {
      "path": ".env"
    }
  }
}
```

---

## 16. Approval 事件定义

### 16.1 approval.required

```json
{
  "type": "approval.required",
  "payload": {
    "approvalId": "approval_001",
    "approvalType": "command",
    "title": "TesterAgent 请求执行命令",
    "description": "mvn test",
    "actions": [
      {
        "id": "approve_once",
        "label": "允许一次"
      },
      {
        "id": "add_allowlist",
        "label": "加入白名单"
      },
      {
        "id": "reject",
        "label": "拒绝"
      }
    ],
    "data": {
      "command": "mvn test"
    }
  }
}
```

UI 动作：

```text
在 Run 页显示确认卡片
暂停当前 workflow
```

### 16.2 approval.resolved

```json
{
  "type": "approval.resolved",
  "payload": {
    "approvalId": "approval_001",
    "approvalType": "command",
    "decision": "approve_once",
    "comment": ""
  }
}
```

### 16.3 approval.expired

```json
{
  "type": "approval.expired",
  "payload": {
    "approvalId": "approval_001",
    "reason": "timeout"
  }
}
```

---

## 17. Patch 事件定义

### 17.1 patch.proposed

```json
{
  "type": "patch.proposed",
  "payload": {
    "patchId": "patch_001",
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
    "riskLevel": "medium",
    "requiresApproval": true
  }
}
```

### 17.2 patch.reviewed

```json
{
  "type": "patch.reviewed",
  "payload": {
    "patchId": "patch_001",
    "reviewStatus": "passed_with_warnings",
    "riskLevel": "medium",
    "comments": [
      "建议 JWT secret 从环境变量读取"
    ]
  }
}
```

### 17.3 patch.applied

```json
{
  "type": "patch.applied",
  "payload": {
    "patchId": "patch_001",
    "appliedFiles": [
      "pom.xml",
      "src/main/java/com/demo/AuthController.java"
    ],
    "checkpointId": "checkpoint_001"
  }
}
```

### 17.4 patch.apply_failed

```json
{
  "type": "patch.apply_failed",
  "payload": {
    "patchId": "patch_001",
    "errorCode": "GIT_APPLY_CONFLICT",
    "message": "patch 与当前文件内容冲突",
    "recoverable": true
  }
}
```

---

## 18. Command / Test 事件定义

### 18.1 command.started

```json
{
  "type": "command.started",
  "payload": {
    "commandId": "cmd_001",
    "command": "mvn test",
    "cwd": "${workspaceRoot}"
  }
}
```

### 18.2 command.output

```json
{
  "type": "command.output",
  "payload": {
    "commandId": "cmd_001",
    "stream": "stdout",
    "chunk": "[INFO] Running AuthControllerTest..."
  }
}
```

### 18.3 command.completed

```json
{
  "type": "command.completed",
  "payload": {
    "commandId": "cmd_001",
    "exitCode": 0,
    "durationMs": 48120,
    "stdoutRef": "cmd_001_stdout.log",
    "stderrRef": "cmd_001_stderr.log"
  }
}
```

### 18.4 test.result

```json
{
  "type": "test.result",
  "payload": {
    "commandId": "cmd_001",
    "status": "passed",
    "summary": "Tests run: 18, Failures: 0, Errors: 0",
    "failedTests": []
  }
}
```

---

## 19. Runtime 事件定义

### 19.1 runtime.health.changed

```json
{
  "type": "runtime.health.changed",
  "payload": {
    "status": "healthy",
    "provider": "autogen",
    "pythonVersion": "3.11.8",
    "autogenAgentChatVersion": "x.x.x",
    "port": 8765
  }
}
```

### 19.2 runtime.log

```json
{
  "type": "runtime.log",
  "payload": {
    "level": "info",
    "message": "AutoGen service started",
    "logger": "runtime"
  }
}
```

### 19.3 runtime.error

```json
{
  "type": "runtime.error",
  "payload": {
    "errorCode": "SERVICE_CRASHED",
    "message": "AutoGen Service process exited unexpectedly",
    "recoverable": true
  }
}
```

---

## 20. AutoGen run_stream 到统一事件的映射

### 20.1 映射原则

AutoGen 原始事件不直接暴露给 UI。

必须转换成项目统一事件：

```text
AutoGen raw event
  ↓
AutoGenEventMapper
  ↓
Unified Task Event
  ↓
EventStore 持久化
  ↓
WebSocket 推送
```

### 20.2 映射表

| AutoGen 原始对象 / 行为 | 统一事件 |
|---|---|
| Agent 开始执行 | agent.started |
| 流式文本输出 | agent.message.delta |
| 完整消息 | agent.message.completed |
| 工具调用请求 | tool.call.started |
| 工具调用结果 | tool.call.succeeded / failed |
| TaskResult | agent.completed / step.completed |
| cancellation_token 取消 | agent.cancelled / task.cancelled |
| Exception | agent.failed / task.failed |

### 20.3 Mapper 伪代码

```python
async def stream_agent_events(agent, task_input, ctx):
    emit("agent.started", {...})

    try:
        async for item in agent.run_stream(
            task=task_input,
            cancellation_token=ctx.cancellation_token
        ):
            event = map_autogen_item(item, ctx)
            if event:
                await event_bus.emit(event)

        emit("agent.completed", {...})

    except CancelledError:
        emit("agent.cancelled", {...})
        raise

    except Exception as e:
        emit("agent.failed", {
            "errorCode": classify_error(e),
            "message": str(e),
            "recoverable": is_recoverable(e)
        })
        raise
```

---

## 21. WebSocket 服务端设计

### 21.1 ConnectionManager

```python
class ConnectionManager:
    def __init__(self):
        self.connections: dict[str, set[WebSocket]] = {}

    async def connect(self, task_id: str, websocket: WebSocket):
        await websocket.accept()
        self.connections.setdefault(task_id, set()).add(websocket)

    def disconnect(self, task_id: str, websocket: WebSocket):
        self.connections.get(task_id, set()).discard(websocket)

    async def broadcast(self, task_id: str, event: dict):
        for ws in list(self.connections.get(task_id, set())):
            try:
                await ws.send_json(event)
            except Exception:
                self.disconnect(task_id, ws)
```

### 21.2 WebSocket Endpoint

```python
@app.websocket("/ws/tasks/{task_id}")
async def task_ws(websocket: WebSocket, task_id: str, sinceSeq: int = 0):
    await manager.connect(task_id, websocket)

    try:
        missed_events = event_store.get_events_after(task_id, sinceSeq)
        for event in missed_events:
            await websocket.send_json(event)

        await websocket.send_json({
            "type": "ws.connected",
            "taskId": task_id,
            "payload": {
                "sinceSeq": sinceSeq
            }
        })

        while True:
            message = await websocket.receive_json()
            await handle_ws_client_message(task_id, message)

    except WebSocketDisconnect:
        manager.disconnect(task_id, websocket)
```

### 21.3 客户端主动消息

WebSocket 不只用于服务端推送，也可以接收轻量客户端消息：

```json
{
  "type": "client.ping",
  "payload": {
    "lastSeq": 128
  }
}
```

```json
{
  "type": "client.ack",
  "payload": {
    "seq": 128
  }
}
```

但所有有副作用的操作，比如 `patch.apply`、`approval.resolve`，建议仍走 HTTP API，避免 WebSocket 与 HTTP 同时修改状态导致复杂性。

---

## 22. Extension 侧 WebSocket Client 设计

### 22.1 职责

Extension 负责：

```text
1. 与 Python AutoGen Service 建立 WebSocket
2. 断线重连
3. sinceSeq 补发
4. 把事件转发给 Webview
5. 记录最近事件缓存
6. 对部分事件触发 VS Code 原生命令，例如打开 diff
```

### 22.2 TypeScript 伪代码

```ts
class TaskWebSocketClient {
  private socket?: WebSocket;
  private lastSeq = 0;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(
    private readonly serviceUrl: string,
    private readonly taskId: string,
    private readonly webview: vscode.Webview
  ) {}

  connect() {
    const url = `${this.serviceUrl}/ws/tasks/${this.taskId}?sinceSeq=${this.lastSeq}`;
    this.socket = new WebSocket(url);

    this.socket.onmessage = (raw) => {
      const event = JSON.parse(raw.data.toString());
      this.lastSeq = Math.max(this.lastSeq, event.seq || 0);
      this.forwardToWebview(event);
    };

    this.socket.onclose = () => {
      this.scheduleReconnect();
    };

    this.socket.onerror = () => {
      this.scheduleReconnect();
    };
  }

  private forwardToWebview(event: any) {
    this.webview.postMessage({
      type: "backend.event",
      payload: event
    });
  }

  private scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 1000);
  }
}
```

---

## 23. Webview UI 事件处理设计

### 23.1 Webview 接收事件

```js
window.addEventListener("message", (event) => {
  const msg = event.data;

  if (msg.type === "backend.event") {
    handleBackendEvent(msg.payload);
  }

  if (msg.type === "command.result") {
    handleCommandResult(msg.payload);
  }
});
```

### 23.2 handleBackendEvent

```js
function handleBackendEvent(event) {
  if (seenSeq.has(event.seq)) {
    return;
  }

  seenSeq.add(event.seq);

  switch (event.type) {
    case "task.status.changed":
      updateTaskStatus(event.payload);
      break;

    case "agent.message.delta":
      appendAgentDelta(event.payload);
      break;

    case "tool.call.started":
      renderToolCallCard(event.payload);
      break;

    case "approval.required":
      renderApprovalCard(event.payload);
      break;

    case "patch.proposed":
      renderPatchCard(event.payload);
      break;

    case "command.output":
      appendTerminalOutput(event.payload);
      break;

    case "task.completed":
      renderTaskSummary(event.payload);
      break;
  }
}
```

---

## 24. UI 按钮可用性矩阵

### 24.1 Run 页顶部按钮

| TaskStatus | 继续 | 暂停 | 终止 | 重跑当前 Agent | 切换 Agent |
|---|---:|---:|---:|---:|---:|
| created | 否 | 否 | 是 | 否 | 否 |
| queued | 否 | 是 | 是 | 否 | 否 |
| planning | 否 | 是 | 是 | 是 | 否 |
| waiting_plan_approval | 否 | 否 | 是 | 是 | 是 |
| analyzing_codebase | 否 | 是 | 是 | 是 | 否 |
| developing_patch | 否 | 是 | 是 | 是 | 是 |
| reviewing_patch | 否 | 是 | 是 | 是 | 是 |
| waiting_patch_approval | 否 | 否 | 是 | 是 | 是 |
| applying_patch | 否 | 否 | 是 | 否 | 否 |
| testing | 否 | 是 | 是 | 是 | 否 |
| paused | 是 | 否 | 是 | 否 | 否 |
| failed | 否 | 否 | 否 | 是 | 是 |
| completed | 否 | 否 | 否 | 否 | 否 |
| cancelled | 否 | 否 | 否 | 否 | 否 |

### 24.2 Plan 卡片按钮

| 状态 | 接受计划 | 调整计划 | 保存为模板 |
|---|---:|---:|---:|
| waiting_plan_approval | 是 | 是 | 是 |
| planning | 否 | 否 | 否 |
| completed | 否 | 否 | 是 |

### 24.3 Patch 卡片按钮

| 状态 | 查看 Diff | 应用 Patch | 拒绝 | 部分应用 | 让 AI 解释 |
|---|---:|---:|---:|---:|---:|
| patch.proposed | 是 | 是 | 是 | 是 | 是 |
| reviewing_patch | 是 | 否 | 否 | 否 | 是 |
| waiting_patch_approval | 是 | 是 | 是 | 是 | 是 |
| patch.applied | 是 | 否 | 否 | 否 | 是 |
| patch.apply_failed | 是 | 否 | 是 | 是 | 是 |

### 24.4 Command 卡片按钮

| 状态 | 允许一次 | 加入白名单 | 拒绝 |
|---|---:|---:|---:|
| waiting_approval | 是 | 是 | 是 |
| running | 否 | 否 | 否 |
| completed | 否 | 否 | 否 |
| denied | 否 | 否 | 否 |

---

## 25. HTTP 操作与事件关系

### 25.1 task.create

请求：

```http
POST /api/tasks
```

返回：

```json
{
  "taskId": "task_001",
  "status": "created",
  "wsUrl": "ws://127.0.0.1:8765/ws/tasks/task_001"
}
```

后续事件：

```text
task.created
task.status.changed(created → queued)
task.status.changed(queued → planning)
step.started
agent.started
```

### 25.2 task.pause

请求：

```http
POST /api/tasks/{taskId}/pause
```

后续事件：

```text
task.paused
task.status.changed(current → paused)
```

### 25.3 approval.resolve

请求：

```http
POST /api/tasks/{taskId}/approvals/{approvalId}/resolve
```

请求体：

```json
{
  "decision": "approve_once",
  "comment": ""
}
```

后续事件：

```text
approval.resolved
tool.call.running 或 task.status.changed
```

### 25.4 patch.apply

请求：

```http
POST /api/tasks/{taskId}/patches/{patchId}/apply
```

后续事件：

```text
patch.applying
patch.applied
task.status.changed(waiting_patch_approval → testing)
```

---

## 26. EventStore 设计

### 26.1 为什么需要 EventStore

需要 EventStore 的原因：

```text
1. WebSocket 断线重连后补发事件
2. 任务历史回放
3. Debug AutoGen 行为
4. 生成审计日志
5. 任务失败后恢复上下文
6. 给 UI 的 Timeline、Logs、Tool Calls 提供数据源
```

### 26.2 存储结构

第一版可以使用 SQLite 或 JSONL。

推荐 SQLite：

```sql
CREATE TABLE task_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(task_id, seq),
  UNIQUE(event_id)
);
```

索引：

```sql
CREATE INDEX idx_task_event_task_seq
ON task_event(task_id, seq);
```

### 26.3 EventStore API

```python
class EventStore:
    def append(self, task_id: str, event: dict) -> dict:
        pass

    def get_events_after(self, task_id: str, seq: int) -> list[dict]:
        pass

    def get_latest_seq(self, task_id: str) -> int:
        pass

    def get_task_timeline(self, task_id: str) -> list[dict]:
        pass
```

---

## 27. 断线重连与事件补发

### 27.1 Extension 断线重连流程

```text
1. WebSocket close
2. Extension 记录 lastSeq
3. 1s 后重连
4. URL 带 sinceSeq=lastSeq
5. AutoGen Service 查询 EventStore
6. 补发 missed events
7. 继续实时推送
```

### 27.2 去重规则

Webview 维护：

```js
const seenEventIds = new Set();
const seenSeq = new Set();
```

处理前判断：

```js
if (seenEventIds.has(event.eventId)) {
  return;
}
```

### 27.3 任务已经结束时重连

如果任务终态：

```text
completed / failed / cancelled
```

服务端仍返回：

```text
ws.connected
历史事件
task.snapshot
```

然后可以关闭连接。

---

## 28. Snapshot 设计

### 28.1 为什么需要 Snapshot

如果一个任务事件很多，UI 每次都从头重放会慢。

可以定期生成快照：

```text
每 50 个事件生成一次 TaskSnapshot
任务进入 waiting approval 时生成快照
任务完成时生成最终快照
```

### 28.2 TaskSnapshot 结构

```json
{
  "taskId": "task_001",
  "seq": 128,
  "status": "waiting_patch_approval",
  "currentStepId": "step_human_patch_001",
  "agents": {
    "developer_agent": {
      "status": "succeeded"
    },
    "reviewer_agent": {
      "status": "succeeded"
    }
  },
  "timeline": [],
  "patches": [],
  "approvals": [],
  "toolCalls": [],
  "messages": []
}
```

### 28.3 WebSocket 事件

```json
{
  "type": "task.snapshot",
  "payload": {
    "snapshot": {}
  }
}
```

UI 收到 snapshot 后：

```text
1. 用 snapshot 覆盖当前 UI 状态
2. 再应用 seq 之后的增量事件
```

---

## 29. 错误码设计

### 29.1 Task 错误码

| 错误码 | 含义 | 是否可恢复 |
|---|---|---:|
| TASK_NOT_FOUND | 任务不存在 | 否 |
| TASK_ALREADY_COMPLETED | 任务已完成 | 否 |
| INVALID_STATE_TRANSITION | 非法状态转换 | 否 |
| WORKFLOW_NODE_FAILED | Workflow 节点失败 | 是 |
| MAX_RETRY_EXCEEDED | 超过重试次数 | 否 |
| TASK_CANCELLED | 用户取消 | 否 |
| TASK_TIMEOUT | 任务超时 | 是 |

### 29.2 Agent 错误码

| 错误码 | 含义 | 是否可恢复 |
|---|---|---:|
| MODEL_TIMEOUT | 模型超时 | 是 |
| MODEL_RATE_LIMIT | 模型限流 | 是 |
| MODEL_AUTH_FAILED | API Key 错误 | 否 |
| AGENT_OUTPUT_PARSE_FAILED | 输出解析失败 | 是 |
| AGENT_TOOL_CALL_FAILED | 工具调用失败 | 是 |

### 29.3 Tool 错误码

| 错误码 | 含义 | 是否可恢复 |
|---|---|---:|
| TOOL_PERMISSION_DENIED | 权限拒绝 | 是 |
| SENSITIVE_FILE_BLOCKED | 敏感文件阻止 | 是 |
| COMMAND_BLOCKED | 命令被阻止 | 是 |
| COMMAND_FAILED | 命令执行失败 | 是 |
| PATCH_APPLY_FAILED | Patch 应用失败 | 是 |
| WORKSPACE_OUT_OF_SCOPE | 访问 workspace 外路径 | 否 |

### 29.4 WebSocket 错误码

| 错误码 | 含义 | 处理 |
|---|---|---|
| WS_AUTH_FAILED | 鉴权失败 | 关闭连接 |
| WS_TASK_NOT_FOUND | 任务不存在 | 提示用户 |
| WS_REPLAY_FAILED | 事件补发失败 | 请求 snapshot |
| WS_INTERNAL_ERROR | 服务端错误 | 重连 |

---

## 30. 后端核心类设计

### 30.1 TaskManager

```python
class TaskManager:
    async def create_task(self, request: CreateTaskRequest) -> Task:
        pass

    async def start_task(self, task_id: str):
        pass

    async def pause_task(self, task_id: str):
        pass

    async def resume_task(self, task_id: str):
        pass

    async def cancel_task(self, task_id: str):
        pass

    async def change_status(self, task_id: str, to: TaskStatus, reason: str):
        pass
```

### 30.2 TaskStateMachine

```python
class TaskStateMachine:
    allowed_transitions = {
        "created": ["queued", "cancelled"],
        "queued": ["planning", "cancelled"],
        "planning": ["waiting_plan_approval", "paused", "failed", "cancelled"],
        "waiting_plan_approval": ["planning", "analyzing_codebase", "cancelled"],
        ...
    }

    def validate(self, current: str, target: str):
        if target not in self.allowed_transitions[current]:
            raise InvalidStateTransition(current, target)
```

### 30.3 EventBus

```python
class EventBus:
    def __init__(self, event_store, ws_manager):
        self.event_store = event_store
        self.ws_manager = ws_manager

    async def emit(self, task_id: str, type: str, payload: dict, source: str):
        event = self.event_store.append(task_id, {
            "type": type,
            "payload": payload,
            "source": source
        })
        await self.ws_manager.broadcast(task_id, event)
        return event
```

### 30.4 WorkflowRunner

```python
class WorkflowRunner:
    async def run(self, task_id: str):
        ctx = await self.task_store.get_context(task_id)

        await self.task_manager.change_status(task_id, "planning", "workflow.start")
        await self.run_planner(ctx)

        await self.wait_plan_approval(ctx)

        await self.task_manager.change_status(task_id, "analyzing_codebase", "plan.approved")
        await self.run_codebase(ctx)

        ...
```

---

## 31. 前端状态 Store 设计

### 31.1 Webview State

```ts
interface WebviewState {
  currentTaskId?: string;
  taskStatus?: TaskStatus;
  lastSeq: number;

  agents: Record<string, AgentUiState>;
  steps: Record<string, StepUiState>;
  messages: UiMessage[];
  toolCalls: ToolCallUiState[];
  approvals: ApprovalUiState[];
  patches: PatchUiState[];
  commands: CommandUiState[];

  activeTab: "run" | "agents" | "team" | "tools" | "workflow" | "settings";
}
```

### 31.2 AgentUiState

```ts
interface AgentUiState {
  agentId: string;
  name: string;
  status: AgentRunStatus;
  currentMessageId?: string;
  lastError?: string;
}
```

### 31.3 事件 reducer

```ts
function reduceEvent(state: WebviewState, event: BaseEvent): WebviewState {
  switch (event.type) {
    case "task.status.changed":
      return {
        ...state,
        taskStatus: event.payload.to
      };

    case "agent.started":
      return updateAgentStatus(state, event.payload.agentId, "running");

    case "agent.message.delta":
      return appendMessageDelta(state, event.payload);

    case "tool.call.started":
      return addToolCall(state, event.payload);

    case "approval.required":
      return addApproval(state, event.payload);

    case "patch.proposed":
      return addPatch(state, event.payload);

    default:
      return state;
  }
}
```

---

## 32. 与 UI 六个 Tab 的关系

### 32.1 Run Tab

主要消费事件：

```text
task.*
step.*
agent.*
tool.*
approval.*
patch.*
command.*
test.*
```

### 32.2 Agents Tab

主要消费事件：

```text
agent.config.saved
agent.test.started
agent.test.completed
agent.test.failed
```

### 32.3 Team Tab

主要消费事件：

```text
team.config.saved
team.validation.failed
```

### 32.4 Tools Tab

主要消费事件：

```text
tool.permission.saved
tool.test.started
tool.test.completed
tool.test.failed
tool.audit.appended
```

### 32.5 Workflow Tab

主要消费事件：

```text
workflow.saved
workflow.test.started
workflow.test.step
workflow.test.completed
workflow.validation.failed
```

### 32.6 Settings Tab

主要消费事件：

```text
settings.saved
runtime.health.changed
runtime.log
runtime.error
model.connection.tested
```

---

## 33. 事件持久化与任务历史 UI

### 33.1 任务历史列表数据

```json
{
  "taskId": "task_001",
  "title": "增加 JWT 登录接口",
  "status": "completed",
  "createdAt": "2026-05-10T03:12:10+09:00",
  "completedAt": "2026-05-10T03:18:21+09:00",
  "changedFiles": 5,
  "testStatus": "passed"
}
```

### 33.2 任务详情数据

```http
GET /api/tasks/{taskId}/events
GET /api/tasks/{taskId}/snapshot
GET /api/tasks/{taskId}/messages
GET /api/tasks/{taskId}/tool-calls
GET /api/tasks/{taskId}/patches
GET /api/tasks/{taskId}/commands
```

### 33.3 历史回放

UI 可以提供：

```text
查看完整执行流
回放 Agent 消息
查看所有工具调用
查看 Patch 和测试结果
复制任务上下文
继续修复
```

---

## 34. 安全与权限要求

### 34.1 WebSocket 鉴权

本地开发可以使用随机 token：

```text
Extension 启动 AutoGen Service 时生成 localAuthToken
所有 HTTP / WS 请求带 token
AutoGen Service 校验 token
```

WebSocket：

```text
ws://127.0.0.1:8765/ws/tasks/task_001?token=xxx
```

### 34.2 防止恶意事件注入

原则：

```text
Webview 不能直接连接 AutoGen Service
Webview 不能直接发送 task 状态修改事件
所有用户操作必须经过 Extension
所有 Extension → Service 请求要校验 taskId 和 workspace
```

### 34.3 敏感信息脱敏

EventStore 不应该保存完整 API Key、密钥文件内容。

需要脱敏：

```text
OPENAI_API_KEY
Authorization header
.env 内容
id_rsa
*.pem
credentials.json
```

### 34.4 Tool Result 长文本存储

长文本不要直接塞到 WebSocket 事件里。

应该：

```text
事件里只放 summary + resultRef
完整内容存在文件或数据库
UI 点“查看完整结果”时再 GET
```

---

## 35. 性能设计

### 35.1 事件大小限制

建议：

```text
单个 WebSocket 事件最大 64KB
大于 64KB 的内容存 resultRef
command.output 按 chunk 推送
agent.message.delta 合并节流
```

### 35.2 Delta 合并策略

Agent 流式输出可能非常频繁。

Extension 或 Webview 可以做 50ms 合并：

```text
50ms 内的 delta 合并成一次 UI 更新
```

### 35.3 command.output 限制

命令输出可能很大。

策略：

```text
UI 只显示最近 500 行
完整日志写入文件
事件里附 stdoutRef / stderrRef
```

---

## 36. 测试用例设计

### 36.1 状态机测试

```text
created → queued → planning 合法
planning → completed 非法
waiting_plan_approval → analyzing_codebase 合法
waiting_patch_approval → testing 非法，必须先 applying_patch
paused → previousStatus 合法
completed → running 非法
```

### 36.2 WebSocket 测试

```text
创建任务后收到 ws.connected
任务执行时收到 task.status.changed
断线后重连能按 sinceSeq 补发
重复事件不会重复渲染
任务完成后可读取完整事件历史
```

### 36.3 Approval 测试

```text
plan approval 会暂停 workflow
approve 后继续
reject patch 后回到 developing_patch
command reject 后 tool.call.denied
approval timeout 后 task.failed 或 step.failed
```

### 36.4 Tool 测试

```text
read_file 成功推送 tool.call.succeeded
读取 .env 推送 tool.call.denied
run_command 需要 approval.required
mvn test 输出 command.output
命令完成推送 command.completed
```

### 36.5 Patch 测试

```text
DeveloperAgent 生成 patch 后 patch.proposed
ReviewerAgent 审查后 patch.reviewed
用户 apply 后 patch.applied
git apply 冲突后 patch.apply_failed
```

---

## 37. Codex 开发任务拆分

### Task 1：实现 TaskStatus 枚举与状态机

修改文件：

```text
agent-service/core/task_state.py
```

验收标准：

```text
1. 定义 TaskStatus
2. 定义合法转换表
3. 非法转换抛 InvalidStateTransition
4. 单元测试覆盖核心转换
```

### Task 2：实现 EventStore

修改文件：

```text
agent-service/core/event_store.py
agent-service/storage/schema.sql
```

验收标准：

```text
1. 支持 append
2. 支持 get_events_after
3. task_id + seq 唯一
4. 支持 JSON payload
```

### Task 3：实现 EventBus

修改文件：

```text
agent-service/core/event_bus.py
```

验收标准：

```text
1. emit 时自动分配 eventId 和 seq
2. 先写 EventStore
3. 再广播 WebSocket
4. 广播失败不影响持久化
```

### Task 4：实现 WebSocket ConnectionManager

修改文件：

```text
agent-service/ws/connection_manager.py
agent-service/api/ws_routes.py
```

验收标准：

```text
1. 支持 /ws/tasks/{taskId}
2. 支持 sinceSeq 补发
3. 支持断开清理
4. 支持同一任务多个连接
```

### Task 5：实现 AutoGenEventMapper

修改文件：

```text
agent-service/runtime/autogen_event_mapper.py
```

验收标准：

```text
1. AutoGen message 转 agent.message.*
2. tool call 转 tool.call.*
3. TaskResult 转 agent.completed
4. 异常转 agent.failed
```

### Task 6：Extension 侧 WebSocket Client

修改文件：

```text
extension/src/services/taskWebSocketClient.ts
```

验收标准：

```text
1. 创建任务后连接 WS
2. 断线自动重连
3. 使用 lastSeq 补发
4. 转发 backend.event 到 Webview
```

### Task 7：Webview 事件 Reducer

修改文件：

```text
extension/media/app.js
```

验收标准：

```text
1. 支持 task.status.changed
2. 支持 agent.message.delta
3. 支持 tool.call.*
4. 支持 approval.required
5. 支持 patch.proposed
6. 支持 command.output
```

### Task 8：按钮可用性控制

修改文件：

```text
extension/media/app.js
```

验收标准：

```text
1. 根据 TaskStatus 更新按钮 disabled 状态
2. waiting_plan_approval 时显示计划按钮
3. waiting_patch_approval 时显示 patch 按钮
4. paused 时显示继续按钮
```

### Task 9：任务历史事件回放

修改文件：

```text
agent-service/api/task_routes.py
extension/src/services/taskApi.ts
extension/media/app.js
```

验收标准：

```text
1. GET /api/tasks/{taskId}/events 可返回历史事件
2. Webview 可以重建 timeline
3. 支持查看历史任务详情
```

---

## 38. 自检清单

### 38.1 状态机完整性

- [x] 定义了 TaskStatus
- [x] 定义了 StepStatus
- [x] 定义了 AgentRunStatus
- [x] 定义了 ToolCallStatus
- [x] 定义了 ApprovalStatus
- [x] 定义了主流程状态转换
- [x] 定义了失败修复流程
- [x] 定义了暂停 / 继续 / 取消流程

### 38.2 WebSocket 完整性

- [x] 定义了连接地址
- [x] 定义了统一事件格式
- [x] 定义了 seq 事件序号
- [x] 定义了断线重连
- [x] 定义了 sinceSeq 补发
- [x] 定义了 snapshot
- [x] 定义了 Extension 转发到 Webview

### 38.3 事件类型完整性

- [x] Task 事件
- [x] Step 事件
- [x] Agent 事件
- [x] Tool 事件
- [x] Approval 事件
- [x] Patch 事件
- [x] Command 事件
- [x] Runtime 事件

### 38.4 UI 联动完整性

- [x] Run 页按钮可用性矩阵
- [x] Plan 卡片按钮
- [x] Patch 卡片按钮
- [x] Command 卡片按钮
- [x] 六个 Tab 与事件关系
- [x] Webview reducer 设计

### 38.5 开发可执行性

- [x] 给出了后端核心类
- [x] 给出了 TypeScript WebSocket Client 骨架
- [x] 给出了 Webview reducer 骨架
- [x] 给出了 EventStore 表结构
- [x] 给出了 Codex 任务拆分

---

## 39. 本文结论

本文件定义了 AutoGen + VS Code 插件项目的任务状态机和实时事件系统。

核心原则：

```text
1. Task 状态由 AutoGen Service 统一维护。
2. Webview 只展示状态，不直接决定真实任务状态。
3. 所有状态变化都产生 Event。
4. Event 先持久化，再通过 WebSocket 推送。
5. WebSocket 断线后用 sinceSeq 补发。
6. UI 通过统一事件 reducer 更新界面。
7. AutoGen 原始事件必须映射成项目统一事件。
```

最终通信链路：

```text
AutoGen run_stream
  ↓
AutoGenEventMapper
  ↓
EventBus
  ↓
EventStore
  ↓
WebSocket
  ↓
VS Code Extension
  ↓
webview.postMessage
  ↓
Webview UI Reducer
```

这样可以保证：

```text
任务可暂停
任务可恢复
任务可回放
任务可审计
UI 可实时更新
多 Agent 执行过程可视化
```
