你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 8B：把 Run 页 task.create 接入真实 WorkflowRunner，但仍然不做审批恢复和自动 apply_patch / run_command。

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
- Settings / Agents / Team / Workflow / Tools 配置可以本地保存和加载
- API Key 使用 VS Code SecretStorage
- 普通 settings 使用 VS Code globalState
- 默认模型配置使用 Gemini OpenAI-compatible
- Agents / Team / Workflow / Tools 配置已本地保存

Task 4A～4C 已完成：
- Python Service 可以启动 / 停止 / 健康检查
- Python Service 已有 task.create placeholder
- WebSocket placeholder event stream 已经能转发到 Webview

Task 5A～5D 已完成：
- list_files / read_file / search_code 已实现
- propose_patch / open_diff / apply_patch / reject_patch 已实现
- run_command 安全确认闭环已实现
- git_status / git_diff 只读工具已实现

Task 6A 已完成：
- Extension ToolServer 已实现
- Python Service 可以通过 ToolGateway 调用 Extension ToolServer
- Python /api/tools/call 可以调用 list_files / read_file / search_code 等工具

Task 7A～7D 已完成：
- Gemini OpenAI-compatible 模型健康检查已实现
- AutoGen 单 Agent run-once 已实现
- AutoGen 单 Agent + ToolGateway 已实现
- AgentFactory + 多角色 Agent 顺序调用已实现

Task 8A 已完成：
- Python Service 已有最小 WorkflowRunner
- /api/workflows/run-once 可以按 Planner → Codebase → Developer → Reviewer → Summary 顺序执行
- 当前 Run 页 task.create 还没有正式接 WorkflowRunner

本次只做 task.create 接入 WorkflowRunner。
不要实现真实 WebSocket 流式事件。
不要实现审批暂停/恢复。
不要自动 apply_patch。
不要自动 run_command。
不要实现 Team GroupChat。
不要实现复杂 Workflow 条件分支。

============================================================
一、本次目标
============================================================

把 Run 页的 task.create 从 placeholder task 创建，改为调用真实 WorkflowRunner。

目标链路：

Run Tab 点击 “发送给 AutoGen Team”
  ↓
Webview postMessage task.create
  ↓
Extension MessageDispatcher
  ↓
RuntimeManager / ExtensionApiClient
  ↓
Python Service POST /api/tasks/run
  ↓
WorkflowRunner 执行 Planner → Codebase → Developer → Reviewer → Summary
  ↓
返回完整 workflow result
  ↓
Webview 显示每个 step 的结果摘要

必须完成：

1. Python Service 新增或修改 POST /api/tasks/run。
2. /api/tasks/run 内部调用 WorkflowRunner。
3. ExtensionApiClient 增加 runTask。
4. RuntimeManager 增加 runTask。
5. MessageDispatcher 的 task.create 改为调用 runTask。
6. Webview task.create 成功后显示 taskId、status、steps。
7. Run 页 Timeline 区显示 Workflow steps。
8. Agent 状态区显示每个 Agent completed / failed。
9. DeveloperAgent 输出 proposed patch 文本时，只展示，不自动应用。
10. TesterAgent 本次可以不执行，或者只作为 skipped。
11. npm run compile 通过。
12. Python Service 可以启动。

本次不要做：
- 自动 apply_patch
- 自动 run_command
- 真实审批等待
- WebSocket 真实流
- 多 Agent GroupChat
- RoundRobinGroupChat
- SelectorGroupChat
- Git 写操作
- 修改 workspace 文件

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. agent-service/main.py
2. agent-service/runtime/workflow_runner.py
3. agent-service/runtime/task_manager.py
4. agent-service/runtime/agent_factory.py
5. agent-service/adapters/autogen_adapter.py
6. src/runtime/ExtensionApiClient.ts
7. src/runtime/RuntimeManager.ts
8. src/webview/MessageDispatcher.ts
9. media/webview.html
10. media/webview-bridge.js
11. package.json

可以只读参考：
12. docs/03_Extension与AutoGenService通信接口详细设计.md
13. docs/06_Team与Workflow编排详细设计.md
14. docs/09_Task任务状态机与WebSocket事件详细设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要实现真实 WebSocket 流。
不要实现审批恢复。
不要实现自动 patch apply。
不要实现 command 自动执行。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. agent-service/main.py
2. agent-service/runtime/workflow_runner.py
3. agent-service/runtime/task_manager.py
4. src/runtime/ExtensionApiClient.ts
5. src/runtime/RuntimeManager.ts
6. src/webview/MessageDispatcher.ts
7. media/webview.html
8. media/webview-bridge.js

必要时可以新增：
9. agent-service/api/tasks.py
10. agent-service/schemas/task.py
11. src/types/taskRun.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. src/tools 安全逻辑，除非是 bug 修复
4. config 目录
5. 不要大改 ToolServer / ToolRouter
6. 不要大改 Settings / Agents / Team / Workflow / Tools 保存逻辑

============================================================
四、Python API 要求
============================================================

新增或修改接口：

POST /api/tasks/run

请求：

{
  "userRequest": "请分析当前项目结构，并给出增加登录接口的修改建议。",
  "teamId": "java_spring_team",
  "workflowId": "code_edit",
  "mode": "semi_auto",
  "targetAgent": "current",
  "fields": {
    "task.teamId": "java_spring_team",
    "task.workflowId": "code_edit",
    "task.mode": "semi_auto",
    "task.targetAgent": "current",
    "task.userRequest": "..."
  },
  "source": "vscode-webview"
}

响应成功：

{
  "ok": true,
  "taskId": "task_xxx",
  "status": "completed",
  "message": "Task workflow completed",
  "result": {
    "taskId": "task_xxx",
    "workflowId": "code_edit",
    "teamId": "java_spring_team",
    "status": "completed",
    "steps": [
      {
        "id": "planner",
        "agent": "PlannerAgent",
        "status": "completed",
        "content": "..."
      }
    ],
    "summary": "..."
  }
}

响应失败：

{
  "ok": false,
  "taskId": "task_xxx",
  "status": "failed",
  "error": {
    "code": "TASK_RUN_FAILED",
    "message": "..."
  },
  "result": {
    "steps": [...]
  }
}

错误码至少包含：

EMPTY_USER_REQUEST
MODEL_API_KEY_MISSING
TOOL_SERVER_UNAVAILABLE
WORKFLOW_RUN_FAILED
TASK_RUN_FAILED

要求：

1. userRequest 不能为空。
2. 如果 userRequest 为空，返回 EMPTY_USER_REQUEST。
3. 内部调用 WorkflowRunner.run_once。
4. 创建或更新 TaskManager 中的 task。
5. 不自动应用 patch。
6. 不自动执行命令。
7. 不直接读文件。
8. 不返回 API Key。
9. 失败时返回 partial steps。

============================================================
五、TaskManager 要求
============================================================

检查 agent-service/runtime/task_manager.py。

确保支持：

1. create_task(payload)
2. get_task(task_id)
3. update_task_status(task_id, status)
4. update_task_result(task_id, result)
5. append_task_step(task_id, step)

task.run 流程：

1. 创建 task：
   status = running

2. WorkflowRunner 每完成一个 step，可以写入 task steps。
   如果当前 WorkflowRunner 只最终返回 steps，也可以最终一次性写入。

3. 成功：
   status = completed

4. 失败：
   status = failed

5. GET /api/tasks/{task_id} 应能返回最新 task 状态和 result。

============================================================
六、WorkflowRunner 要求
============================================================

检查 agent-service/runtime/workflow_runner.py。

本次只要求保证它适合被 /api/tasks/run 调用。

要求：

1. run_once 接收：
   - user_request
   - team_id
   - workflow_id
   - mode
   - task_id

2. 返回结构稳定：
   - taskId
   - workflowId
   - teamId
   - status
   - steps
   - summary

3. steps 中每个 step 至少有：
   - id
   - agent
   - status
   - content
   - error 可选

4. 任意 Agent 失败时，停止后续执行。
5. 不自动 apply_patch。
6. 不自动 run_command。
7. 不做审批等待。
8. 不做真实 WebSocket 事件。
9. 不返回 API Key。

============================================================
七、ExtensionApiClient 要求
============================================================

修改 src/runtime/ExtensionApiClient.ts。

新增：

runTask(serviceUrl: string, payload: unknown): Promise<unknown>

请求：

POST `${serviceUrl}/api/tasks/run`

body：

{
  "userRequest": "...",
  "teamId": "...",
  "workflowId": "...",
  "mode": "...",
  "targetAgent": "...",
  "fields": {...},
  "source": "vscode-webview"
}

要求：

1. 超时 300000ms。
2. 返回 JSON。
3. HTTP 非 2xx 抛 Error。
4. 不打印 API Key。
5. 不实现 WebSocket。

============================================================
八、RuntimeManager 要求
============================================================

修改 src/runtime/RuntimeManager.ts。

新增：

runTask(payload: unknown): Promise<unknown>

逻辑：

1. 确认 Runtime 正在运行。
2. 如果没运行，返回或抛出 RUNTIME_NOT_RUNNING。
3. 调用 ExtensionApiClient.runTask(serviceUrl, payload)。
4. 返回结果。

如果当前 RuntimeManager 已经有 createTask，请保留。
task.create 这次可以使用 runTask。
不要删除 /api/tasks placeholder 兼容逻辑。

============================================================
九、MessageDispatcher 要求
============================================================

修改 src/webview/MessageDispatcher.ts。

把 task.create 改为真实调用 RuntimeManager.runTask。

task.create 逻辑：

1. 从 message.payload.fields 读取：
   - task.userRequest
   - task.teamId
   - task.workflowId
   - task.mode
   - task.targetAgent

2. 如果 task.userRequest 为空，返回 EMPTY_USER_REQUEST。

3. 默认：
   - teamId = java_spring_team
   - workflowId = code_edit
   - mode = semi_auto
   - targetAgent = current

4. 调用 RuntimeManager.runTask。

5. 成功返回：

{
  "ok": true,
  "type": "task.create.result",
  "requestId": "...",
  "payload": {
    "message": "Task workflow completed",
    "taskId": "task_xxx",
    "status": "completed",
    "result": {...}
  }
}

6. 失败返回明确错误。

如果 Runtime 未启动：

{
  "ok": false,
  "type": "task.create.result",
  "requestId": "...",
  "error": {
    "code": "RUNTIME_NOT_RUNNING",
    "message": "Runtime is not running. Please start Runtime first."
  }
}

不要破坏：
- workflow.debug.runOnce
- agent.debug.runOnce
- agent.debug.runWithTools
- agent.debug.runSequence
- settings.save / settings.load
- agents.load / agent.save
- teams.load / workflows.load
- tools.load

============================================================
十、Webview 要求
============================================================

修改 media/webview-bridge.js。

收到 task.create.result 成功后：

1. event-log 显示：
   ← response: task.create.result
   Task workflow completed: task_xxx

2. 如果 payload.result.steps 存在，逐个显示 step 摘要：

PlannerAgent: completed
CodebaseAgent: completed
DeveloperAgent: completed
ReviewerAgent: completed
SummaryAgent: completed

3. 更新 Run 页 Timeline 区。
4. 更新 Agent 状态区。
5. 如果 DeveloperAgent content 中包含 patch / diff 文本，只作为文本显示。
6. 不自动调用 patch.apply。
7. 不自动调用 patch.openDiff。
8. 每个 step content 最多显示前 3000 字符。
9. 如果 result.status = failed，也显示已完成 steps 和错误。

如果 Run 页没有适合的容器，可以增加：

<div id="workflow-run-result"></div>

不要大改 UI。

============================================================
十一、Run 页按钮说明

Run 页原有按钮：

<button data-action="task.create">发送给 AutoGen Team</button>

现在应该触发真实 WorkflowRunner。

Debug 按钮继续保留：

- agent.debug.runOnce
- agent.debug.runWithTools
- agent.debug.runSequence
- workflow.debug.runOnce

不要删除它们。

============================================================
十二、安全要求

必须保证：

1. task.create 不自动 apply_patch。
2. task.create 不自动 run_command。
3. task.create 不执行 Git 写操作。
4. Python 不直接读文件。
5. Python 仍然通过 ToolGateway 调 Extension ToolServer。
6. Extension WorkspaceGuard 仍然生效。
7. Sensitive File Guard 仍然生效。
8. API Key 不返回 Webview。
9. API Key 不进入 event-log。
10. API Key 不进入 console。
11. Agent 输出过长要截断。
12. 不自动修改 workspace 文件。

============================================================
十三、不要做的事情

本次不要做：

1. 不要实现真实 WebSocket 流式事件。
2. 不要实现审批暂停和恢复。
3. 不要实现 patch.apply 自动执行。
4. 不要实现 command.approveOnce 自动执行。
5. 不要实现 Team GroupChat。
6. 不要实现 RoundRobinGroupChat。
7. 不要实现 SelectorGroupChat。
8. 不要实现并行。
9. 不要实现复杂 retry。
10. 不要做 Git 写操作。
11. 不要修改 Demo / prototype。
12. 不要修改 docs。

============================================================
十四、验收标准

完成后必须满足：

1. npm run compile 通过。
2. Python Service 可以启动。
3. ToolServer 可以启动。
4. /api/tasks/run 可用。
5. Run 页点击“发送给 AutoGen Team”会调用 WorkflowRunner。
6. task.create 能返回 taskId。
7. task.create 能返回 workflow steps。
8. Webview 能显示 Planner / Codebase / Developer / Reviewer / Summary 结果摘要。
9. Runtime 未启动时 task.create 返回 RUNTIME_NOT_RUNNING。
10. 空任务时 task.create 返回 EMPTY_USER_REQUEST。
11. task.create 不自动 apply_patch。
12. task.create 不自动 run_command。
13. task.create 不修改 workspace 文件。
14. workflow.debug.runOnce 仍然可用。
15. agent.debug.runSequence 仍然可用。
16. Settings / Agents / Team / Workflow / Tools 配置保存不受影响。
17. 没有真实 WebSocket 流。
18. 没有审批恢复。
19. 没有修改 Demo / prototype / docs。
20. API Key 没有进入 Webview / event-log / console。

运行验收命令：

npm run compile

手动测试建议：

1. 在 Settings 保存 Gemini API Key。
2. 点击 runtime.start。
3. 确认 ToolServer 可用：
   http://127.0.0.1:8765/api/tools/health

4. 在 Run 页选择：
   Team = java-spring-team
   Workflow = code-edit
   Mode = semi_auto

5. 在 Run 页输入：

请分析当前 workspace 的项目结构，并给出如果要增加一个简单登录接口，需要检查哪些文件、可能修改哪些文件、有什么风险。不要修改文件。

6. 点击：
   发送给 AutoGen Team

7. 预期：
   - task.create.result 返回 taskId
   - WorkflowRunner 执行 Planner / Codebase / Developer / Reviewer / Summary
   - Webview 显示各 step 摘要
   - 没有自动修改文件
   - 没有执行命令

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. /api/tasks/run 如何调用 WorkflowRunner。
5. task.create 如何接入 RuntimeManager.runTask。
6. Webview 如何显示 workflow steps。
7. 是否确认不自动 apply_patch / run_command。
8. npm run compile 是否通过。
9. Python task run 是否测试通过。
10. 是否确认 API Key 没有进入 Webview / event-log / console。
11. 是否确认没有真实 WebSocket 流 / 审批恢复。
12. 下一步建议执行哪个 Task。