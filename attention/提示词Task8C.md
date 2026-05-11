你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 8C：把 task.create 的真实 WorkflowRunner 执行过程接入 WebSocket 真实事件流。

当前上下文：
Task 1 已完成：
- VS Code 插件可以编译和启动
- AutoGen Control Webview 可以打开
- Webview ⇄ Extension 基础 placeholder 链路可用

Task 2A～2F 已完成：
- Webview 已经有 6 个 Tab：Run / Agents / Team / Tools / Workflow / Settings
- 所有页面控件框子已补齐
- 所有主要按钮已有 data-action
- 所有主要表单已有 data-field
- event-log 可以显示 sent / response
- settings.apiKey 在日志中已经脱敏

Task 3A～3D 已完成：
- Settings / Agents / Team / Workflow / Tools 配置可以保存和加载
- API Key 使用 VS Code SecretStorage
- 普通配置使用 VS Code globalState
- 默认模型配置使用 Gemini OpenAI-compatible
- Agents / Team / Workflow / Tools 配置已保存

Task 4A～4C 已完成：
- Python Service 可以启动 / 停止 / 健康检查
- Python Service 已有 WebSocket /ws/tasks/{taskId}
- Extension WebSocketClient 可以连接 Python Service
- Webview 可以显示 placeholder task.event

Task 5A～5D 已完成：
- list_files / read_file / search_code 已实现
- propose_patch / open_diff / apply_patch / reject_patch 已实现
- run_command 安全确认闭环已实现
- git_status / git_diff 只读工具已实现

Task 6A 已完成：
- Extension ToolServer 已实现
- Python Service 可以通过 ToolGateway 调用 Extension ToolServer

Task 7A～7D 已完成：
- Gemini OpenAI-compatible 模型健康检查已实现
- AutoGen 单 Agent run-once 已实现
- AutoGen 单 Agent + ToolGateway 已实现
- AgentFactory + 多角色 Agent 顺序调用已实现

Task 8A 已完成：
- Python Service 已有最小 WorkflowRunner
- /api/workflows/run-once 可以按 Planner → Codebase → Developer → Reviewer → Summary 顺序执行

Task 8B 已完成：
- Run 页 task.create 已接入真实 WorkflowRunner
- /api/tasks/run 可用
- task.create 能返回 taskId 和 workflow steps
- Webview 能显示最终 workflow result
- 当前还没有真实执行过程 WebSocket 流式事件

本次只做真实 WorkflowRunner 执行过程的 WebSocket 事件推送。
不要实现审批恢复。
不要自动 apply_patch。
不要自动 run_command。
不要实现 Team GroupChat。
不要实现复杂并行 workflow。

============================================================
一、本次目标
============================================================

把 WorkflowRunner 的执行过程实时推送到 Webview。

目标链路：

Run 页点击 task.create
  ↓
Extension 调用 Python /api/tasks/run
  ↓
Python 创建 taskId
  ↓
Extension 自动连接 /ws/tasks/{taskId}
  ↓
WorkflowRunner 执行每个 step 时发布事件
  ↓
Python WebSocket 推送真实事件
  ↓
Extension 转发 task.event 到 Webview
  ↓
Run 页 Timeline / Agent 状态 / event-log 实时更新

必须完成：

1. Python TaskManager 支持事件发布和订阅。
2. Python WebSocket /ws/tasks/{taskId} 不再只发送固定 placeholder，而是发送该 task 的真实 WorkflowRunner 事件。
3. WorkflowRunner 每个 step 开始 / 完成 / 失败时发布事件。
4. ToolGateway 调用工具时，尽量发布 tool.call / tool.result 事件。
5. DeveloperAgent 输出中如果包含 proposed patch 文本，发布 patch.proposed 事件，但不自动 apply。
6. task.create 后 Extension 自动连接 task WebSocket。
7. Webview 能实时显示：
   - task.status
   - workflow.step.started
   - agent.status
   - agent.message
   - tool.call
   - tool.result
   - patch.proposed
   - workflow.step.completed
   - workflow.step.failed
   - task.completed
   - task.failed

8. 最终 task.create.result 仍然返回完整 result。
9. npm run compile 通过。
10. Python Service 可以启动。

本次不要做：
- 审批暂停/恢复
- patch.apply 自动执行
- command.approveOnce 自动执行
- Team GroupChat
- RoundRobinGroupChat
- SelectorGroupChat
- 并行 workflow
- Git 写操作
- 修改 workspace 文件

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. agent-service/runtime/workflow_runner.py
2. agent-service/runtime/task_manager.py
3. agent-service/runtime/ws_manager.py
4. agent-service/runtime/tool_gateway.py
5. agent-service/tools/tool_gateway.py
6. agent-service/main.py
7. src/runtime/WebSocketClient.ts
8. src/runtime/RuntimeManager.ts
9. src/runtime/ExtensionApiClient.ts
10. src/webview/MessageDispatcher.ts
11. src/webview/AgentControlPanelProvider.ts
12. media/webview.html
13. media/webview-bridge.js
14. package.json

可以只读参考：
15. docs/09_Task任务状态机与WebSocket事件详细设计.md
16. docs/03_Extension与AutoGenService通信接口详细设计.md
17. docs/06_Team与Workflow编排详细设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要实现审批恢复。
不要实现自动 patch apply。
不要实现 run_command 自动执行。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. agent-service/runtime/workflow_runner.py
2. agent-service/runtime/task_manager.py
3. agent-service/runtime/ws_manager.py
4. agent-service/tools/tool_gateway.py
5. agent-service/main.py
6. src/runtime/WebSocketClient.ts
7. src/runtime/RuntimeManager.ts
8. src/webview/MessageDispatcher.ts
9. src/webview/AgentControlPanelProvider.ts
10. media/webview.html
11. media/webview-bridge.js

必要时可以新增：
12. agent-service/runtime/events.py
13. agent-service/schemas/events.py
14. src/types/events.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. src/tools 安全逻辑，除非是 bug 修复
4. config 目录
5. 不要大改 Settings / Agents / Team / Workflow / Tools 保存逻辑

============================================================
四、事件格式要求
============================================================

统一事件格式：

{
  "type": "agent.message",
  "taskId": "task_xxx",
  "seq": 1,
  "timestamp": "2026-05-11T00:00:00Z",
  "payload": {}
}

要求：

1. taskId 必须存在。
2. seq 对同一个 task 从 1 递增。
3. timestamp 使用 ISO 字符串。
4. type 使用稳定字符串。
5. payload 不能包含 API Key。
6. payload 内容过长要截断。
7. 每个事件都要保存到 TaskManager 里，方便新 WebSocket 连接补发历史事件。

============================================================
五、必须支持的事件类型
============================================================

至少支持这些事件：

------------------------------------------------------------
1. task.status
------------------------------------------------------------

任务状态变化时发送：

{
  "type": "task.status",
  "payload": {
    "status": "running"
  }
}

status 可为：

created
running
completed
failed
cancelled

------------------------------------------------------------
2. workflow.step.started
------------------------------------------------------------

每个 step 开始时发送：

{
  "type": "workflow.step.started",
  "payload": {
    "stepId": "planner",
    "agent": "PlannerAgent"
  }
}

------------------------------------------------------------
3. agent.status
------------------------------------------------------------

Agent 状态变化：

{
  "type": "agent.status",
  "payload": {
    "agent": "PlannerAgent",
    "status": "running"
  }
}

status 可为：

waiting
running
completed
failed
skipped

------------------------------------------------------------
4. agent.message
------------------------------------------------------------

Agent 输出完成后发送：

{
  "type": "agent.message",
  "payload": {
    "agent": "PlannerAgent",
    "content": "..."
  }
}

content 最多 10000 字符。

------------------------------------------------------------
5. tool.call
------------------------------------------------------------

ToolGateway 调用工具前发送：

{
  "type": "tool.call",
  "payload": {
    "agent": "CodebaseAgent",
    "tool": "read_file",
    "args": {
      "path": "pom.xml"
    }
  }
}

args 不能包含 API Key。

------------------------------------------------------------
6. tool.result
------------------------------------------------------------

ToolGateway 调用工具后发送：

{
  "type": "tool.result",
  "payload": {
    "agent": "CodebaseAgent",
    "tool": "read_file",
    "ok": true,
    "summary": "..."
  }
}

summary 最多 3000 字符。
不要把完整文件内容全部推送到 UI。

------------------------------------------------------------
7. patch.proposed
------------------------------------------------------------

DeveloperAgent 输出中检测到 patch / diff / changedFiles 时发送：

{
  "type": "patch.proposed",
  "payload": {
    "agent": "DeveloperAgent",
    "summary": "DeveloperAgent proposed code changes",
    "contentPreview": "...",
    "needsApproval": true
  }
}

本次只发布事件，不创建真实 PatchStore patch 也可以。
如果当前已经能解析 ProposedPatch，也可以创建 patch，但不能自动 apply。

------------------------------------------------------------
8. workflow.step.completed
------------------------------------------------------------

每个 step 完成时发送：

{
  "type": "workflow.step.completed",
  "payload": {
    "stepId": "planner",
    "agent": "PlannerAgent",
    "status": "completed"
  }
}

------------------------------------------------------------
9. workflow.step.failed
------------------------------------------------------------

step 失败时发送：

{
  "type": "workflow.step.failed",
  "payload": {
    "stepId": "codebase",
    "agent": "CodebaseAgent",
    "error": {
      "code": "AGENT_STEP_FAILED",
      "message": "..."
    }
  }
}

------------------------------------------------------------
10. task.completed
------------------------------------------------------------

任务完成时发送：

{
  "type": "task.completed",
  "payload": {
    "status": "completed",
    "summary": "..."
  }
}

------------------------------------------------------------
11. task.failed
------------------------------------------------------------

任务失败时发送：

{
  "type": "task.failed",
  "payload": {
    "status": "failed",
    "error": {
      "code": "WORKFLOW_RUN_FAILED",
      "message": "..."
    }
  }
}

============================================================
六、TaskManager 要求
============================================================

修改 agent-service/runtime/task_manager.py。

必须支持：

1. append_event(task_id: str, event_type: str, payload: dict) -> dict
2. list_events(task_id: str, since_seq: int | None = None) -> list[dict]
3. subscribe(task_id: str) 或使用 asyncio.Queue 支持 WebSocket 实时推送
4. publish_event(task_id: str, event_type: str, payload: dict) -> dict

实现方式可以简单：

- 每个 task 保存 events 数组
- 每个 task 保存 seq_counter
- 每个 task 保存 subscribers: list[asyncio.Queue]
- publish_event 时：
  - 创建 event
  - 保存到 events
  - put 到所有 subscriber queue

要求：

1. 新 WebSocket 连接时先发送历史 events。
2. 然后继续等待 queue 新事件。
3. task 不存在时返回 TASK_NOT_FOUND。
4. 不需要持久化。
5. 不要保存 API Key。

============================================================
七、WebSocket /ws/tasks/{taskId} 要求
============================================================

修改 agent-service/main.py 或 ws_manager.py。

WebSocket 逻辑：

1. 接受连接。
2. 检查 task 是否存在。
3. 如果不存在：
   - 发送 task.failed 或 error 事件
   - close
4. 如果存在：
   - 发送历史事件 list_events(taskId)
   - 订阅该 task 的事件 queue
   - 持续发送新事件
5. 客户端断开时清理 subscriber。
6. 不要每次连接都重新生成 placeholder 事件。
7. 不要阻塞整个服务。

支持可选 query：

/ws/tasks/{taskId}?sinceSeq=10

如果实现简单，可以忽略 sinceSeq，但要保留不报错。

============================================================
八、WorkflowRunner 事件发布要求
============================================================

修改 agent-service/runtime/workflow_runner.py。

WorkflowRunner.run_once 中必须在关键节点发布事件。

执行开始：

publish task.status running

每个 step：

1. publish workflow.step.started
2. publish agent.status running
3. 调用 Agent
4. publish agent.message
5. publish agent.status completed
6. publish workflow.step.completed

失败时：

1. publish agent.status failed
2. publish workflow.step.failed
3. publish task.failed

整体成功：

publish task.completed

要求：

1. event 发布失败不能让 workflow 崩溃。
2. Agent 调用失败要产生失败事件。
3. 不要把 API Key 放入 event。
4. Agent 输出过长要截断。
5. DeveloperAgent 输出中如果包含关键词：
   - diff
   - patch
   - changedFiles
   - proposedPatch
   则 publish patch.proposed。

============================================================
九、ToolGateway 事件发布要求
============================================================

修改 agent-service/tools/tool_gateway.py。

ToolGateway.call_tool 支持可选参数：

task_id: str | None = None
agent: str | None = None
event_publisher: callable | None = None

或者通过构造函数传入 task_manager / current_task_id。

目标：

1. 工具调用前发布 tool.call。
2. 工具调用后发布 tool.result。
3. 工具失败时 tool.result ok=false。

如果当前结构难以传递 task_id，本次可以只在 WorkflowRunner 调用 Agent 前后发布 agent 事件，ToolGateway 事件可以简单实现为可选，不要大改架构。

优先级：

1. Workflow step / agent 事件必须实现。
2. tool.call / tool.result 尽力实现。
3. 如果 tool 事件暂时难以准确关联 agent，至少在 ToolGateway 中预留参数和事件格式。

============================================================
十、Extension WebSocket 连接要求
============================================================

修改 src/runtime/RuntimeManager.ts / WebSocketClient.ts / MessageDispatcher.ts。

task.create 调用 /api/tasks/run 时，需要尽早拿到 taskId 并连接 WebSocket。

有两种可接受方案：

方案 A：/api/tasks/run 是同步长请求，只有完成后返回 taskId。
这种情况下无法实时显示执行中事件。
本次需要改成方案 B。

方案 B：新增 /api/tasks/start-workflow。
它立即创建 task，后台启动 WorkflowRunner，马上返回 taskId。
Extension 拿到 taskId 后立刻连接 WebSocket。
WorkflowRunner 后台执行并推事件。

本次推荐方案 B。

要求新增 Python 接口：

POST /api/tasks/start-workflow

返回：

{
  "ok": true,
  "taskId": "task_xxx",
  "status": "running",
  "message": "Workflow started"
}

然后 task.create 改为调用 start-workflow，而不是等待 run 完成。

如果当前项目不方便新增 start-workflow，可以在 /api/tasks/run 内部先返回 taskId 不等待完成，但 HTTP 一般不适合。推荐新增接口。

============================================================
十一、Python /api/tasks/start-workflow 要求
============================================================

新增接口：

POST /api/tasks/start-workflow

请求同 /api/tasks/run：

{
  "userRequest": "...",
  "teamId": "java_spring_team",
  "workflowId": "code_edit",
  "mode": "semi_auto",
  "targetAgent": "current",
  "fields": {...},
  "source": "vscode-webview"
}

逻辑：

1. 校验 userRequest。
2. 创建 task，status=running。
3. 立即 publish task.status running。
4. 使用 asyncio.create_task 后台执行 WorkflowRunner.run_once。
5. 立即返回 taskId。
6. 后台任务执行时持续 publish events。
7. 执行完成后更新 task result。
8. 执行失败后更新 task failed。

不要阻塞 HTTP 请求等待所有 Agent 完成。

保留 /api/tasks/run 用于同步调试，不要删除。

============================================================
十二、ExtensionApiClient 要求
============================================================

修改 src/runtime/ExtensionApiClient.ts。

新增：

startWorkflowTask(serviceUrl: string, payload: unknown): Promise<unknown>

请求：

POST `${serviceUrl}/api/tasks/start-workflow`

超时：

10000ms

返回 JSON。

保留 runTask / runWorkflowOnce，不要删除。

============================================================
十三、RuntimeManager 要求
============================================================

修改 src/runtime/RuntimeManager.ts。

新增或修改：

startWorkflowTask(payload: unknown, onEvent: (event: unknown) => void): Promise<unknown>

逻辑：

1. 确认 Runtime 正在运行。
2. 调用 ExtensionApiClient.startWorkflowTask。
3. 从 response 中取 taskId。
4. 调用 connectTaskEvents(taskId, onEvent)。
5. 返回 start response。

如果 WebSocket 连接失败：
- task 已经启动，可以返回 ok=false 或 warning。
- 最好返回 taskId 和 warning。

stop / dispose 时关闭 WebSocket。

============================================================
十四、MessageDispatcher / Provider 要求
============================================================

task.create 现在改为：

1. 调用 RuntimeManager.startWorkflowTask。
2. startWorkflowTask 成功后立刻返回：

{
  "ok": true,
  "type": "task.create.result",
  "requestId": "...",
  "payload": {
    "message": "Workflow task started",
    "taskId": "task_xxx",
    "status": "running"
  }
}

3. 后续真实执行过程通过 task.event 发给 Webview。

Provider 需要能把 RuntimeManager 收到的 event postMessage 给 Webview：

{
  "ok": true,
  "type": "task.event",
  "payload": {
    "event": {...}
  }
}

如果当前架构已有 task.event 转发，复用即可。

============================================================
十五、Webview 要求
============================================================

修改 media/webview-bridge.js。

task.create.result：

1. 显示：
   Workflow task started: task_xxx
2. 更新 Current Task 状态为 running。
3. 清空上一次 workflow-run-result / timeline 的旧内容。

task.event：

根据 event.type 更新 UI：

1. task.status
   - 更新 Current Task status

2. workflow.step.started
   - Timeline 添加 step running

3. agent.status
   - Agent 状态区更新对应 Agent 状态

4. agent.message
   - Message 区追加 Agent 消息
   - event-log 显示 agent.message
   - 内容最多 3000 字符

5. tool.call
   - Tool Call 区追加工具调用

6. tool.result
   - Tool Call 区追加工具结果摘要

7. patch.proposed
   - Patch 区显示 proposed patch summary
   - 不自动 openDiff
   - 不自动 apply

8. workflow.step.completed
   - Timeline 更新 step completed

9. workflow.step.failed
   - Timeline 更新 step failed
   - event-log 显示错误

10. task.completed
    - Current Task status = completed
    - event-log 显示 Task completed

11. task.failed
    - Current Task status = failed
    - event-log 显示 Task failed

要求：

1. 不把内容无限刷屏。
2. 每条内容截断。
3. 不显示 API Key。
4. 不自动调用 patch.apply。
5. 不自动调用 command.approveOnce。

============================================================
十六、安全要求
============================================================

必须保证：

1. task.create 不自动 apply_patch。
2. task.create 不自动 run_command。
3. task.event 不触发任何危险动作。
4. patch.proposed 只显示，不应用。
5. approval.required 只显示，不自动确认。
6. API Key 不进入 Webview。
7. API Key 不进入 event-log。
8. API Key 不进入 console。
9. Python 不直接读文件。
10. 工具仍通过 ToolGateway 和 Extension ToolServer。
11. WorkspaceGuard 仍然生效。
12. Sensitive File Guard 仍然生效。

============================================================
十七、不要做的事情

本次不要做：

1. 不要实现审批暂停和恢复。
2. 不要实现 plan.approve 真实恢复。
3. 不要实现 patch.apply 自动执行。
4. 不要实现 command.approveOnce 自动执行。
5. 不要实现 Team GroupChat。
6. 不要实现 RoundRobinGroupChat。
7. 不要实现 SelectorGroupChat。
8. 不要实现复杂 retry。
9. 不要做 Git 写操作。
10. 不要修改 Demo / prototype。
11. 不要修改 docs。

============================================================
十八、验收标准

完成后必须满足：

1. npm run compile 通过。
2. Python Service 可以启动。
3. ToolServer 可以启动。
4. /api/tasks/start-workflow 可用。
5. /api/tasks/start-workflow 能立即返回 taskId。
6. task.create 调用 start-workflow，不再等待完整执行完成。
7. task.create.result 返回 running + taskId。
8. Extension 能自动连接 /ws/tasks/{taskId}。
9. Webview 能实时显示 task.event。
10. Webview 至少能看到：
    - task.status running
    - workflow.step.started
    - agent.status running
    - agent.message
    - workflow.step.completed
    - task.completed
11. 如果 Agent 使用工具，能看到 tool.call / tool.result。
12. 如果 Developer 输出 patch，能看到 patch.proposed。
13. task.completed 后 UI 状态变 completed。
14. 失败时能看到 task.failed。
15. 不自动 apply_patch。
16. 不自动 run_command。
17. Settings / Agents / Team / Workflow / Tools 配置保存不受影响。
18. workflow.debug.runOnce 仍然可用。
19. 没有审批恢复。
20. 没有修改 Demo / prototype / docs。
21. API Key 没有进入 Webview / event-log / console。

运行验收命令：

npm run compile

手动测试建议：

1. 在 Settings 保存 Gemini API Key。
2. 点击 runtime.start。
3. 在 Run 页输入：

请分析当前 workspace 的项目结构，并给出如果要增加一个简单登录接口，需要检查哪些文件、可能修改哪些文件、有什么风险。不要修改文件。

4. 点击：
   发送给 AutoGen Team

5. 预期：
   - 立即显示 Workflow task started: task_xxx
   - Timeline 开始实时变化
   - Agent 状态实时变化
   - Agent 消息逐步出现
   - 最后 task.completed

6. 确认没有自动应用 patch。
7. 确认没有执行命令。

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. TaskManager 事件发布如何实现。
5. /api/tasks/start-workflow 如何后台启动 WorkflowRunner。
6. WebSocket 如何发送真实 task events。
7. Extension 如何自动连接 task WebSocket。
8. Webview 如何显示真实事件。
9. npm run compile 是否通过。
10. Python start-workflow / WebSocket 是否测试通过。
11. 是否确认不自动 apply_patch / run_command。
12. 是否确认 API Key 没有进入 Webview / event-log / console。
13. 下一步建议执行哪个 Task。