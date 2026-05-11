你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 8A：实现最小 WorkflowRunner，把 Planner → Codebase → Developer → Reviewer → Summary 串成可复用的任务执行器。

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
- 普通配置使用 VS Code globalState
- 默认模型配置使用 Gemini OpenAI-compatible
- Agents / Team / Workflow / Tools 配置已本地保存

Task 4A～4C 已完成：
- Python Service 可以启动 / 停止 / 健康检查
- task.create 可以创建 placeholder task
- WebSocket placeholder event stream 可以转发到 Webview

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
- /api/agent/run-sequence 可以按 PlannerAgent / CodebaseAgent / DeveloperAgent / ReviewerAgent / SummaryAgent 顺序执行
- 当前还没有正式 WorkflowRunner

本次只做最小 WorkflowRunner。
不要接 Run 页 task.create 到 WorkflowRunner。
不要实现 WebSocket 真实流。
不要实现审批恢复。
不要自动 apply_patch。
不要自动 run_command。
不要实现复杂条件分支。
不要实现 Team GroupChat。

============================================================
一、本次目标
============================================================

实现 Python Service 内部的最小 WorkflowRunner。

目标：

1. 新增或修正 WorkflowRunner。
2. WorkflowRunner 能接收 userRequest、teamId、workflowId、mode。
3. WorkflowRunner 能按固定顺序执行：
   - PlannerAgent
   - CodebaseAgent
   - DeveloperAgent
   - ReviewerAgent
   - SummaryAgent

4. WorkflowRunner 使用 TaskManager 记录 task 状态。
5. WorkflowRunner 使用 AgentFactory 创建 Agent。
6. WorkflowRunner 可以复用 AutoGenAdapter 或内部调用 AgentFactory。
7. 新增接口：
   POST /api/workflows/run-once

8. /api/workflows/run-once 执行一次完整 workflow 并返回结果。
9. 结果中包含每个 step 的 agent、status、content、error。
10. 任意 step 失败时，WorkflowRunner 返回失败状态和已完成步骤。
11. 不自动应用 patch。
12. 不自动执行 command。
13. 不实现人工确认暂停恢复。
14. npm run compile 通过。
15. Python Service 可以启动。

本次不要做：
- task.create 正式接入 WorkflowRunner
- WebSocket 真实事件推送
- approval.required 的真实等待
- patch.apply 自动执行
- command.approveOnce 自动执行
- RoundRobinGroupChat
- SelectorGroupChat
- 多 Agent 自由对话
- Git 写操作
- 修改 workspace 文件

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. agent-service/runtime/workflow_runner.py
2. agent-service/runtime/agent_factory.py
3. agent-service/adapters/autogen_adapter.py
4. agent-service/runtime/task_manager.py
5. agent-service/runtime/autogen_tools.py
6. agent-service/tools/tool_gateway.py
7. agent-service/main.py
8. agent-service/runtime/model_settings.py
9. src/runtime/ExtensionApiClient.ts
10. src/webview/MessageDispatcher.ts
11. media/webview.html
12. media/webview-bridge.js
13. package.json

可以只读参考：
14. docs/04_AutoGen多Agent运行时详细设计.md
15. docs/06_Team与Workflow编排详细设计.md
16. docs/09_Task任务状态机与WebSocket事件详细设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要接 Run 页 task.create。
不要实现 WebSocket 真实流。
不要实现自动 patch apply。
不要实现 run_command 自动执行。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. agent-service/runtime/workflow_runner.py
2. agent-service/runtime/agent_factory.py
3. agent-service/adapters/autogen_adapter.py
4. agent-service/runtime/task_manager.py
5. agent-service/main.py
6. src/runtime/ExtensionApiClient.ts
7. src/webview/MessageDispatcher.ts
8. media/webview.html
9. media/webview-bridge.js

必要时可以新增：
10. agent-service/api/workflows.py
11. agent-service/schemas/workflow.py
12. agent-service/runtime/workflow_events.py
13. src/types/workflowRun.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. src/tools 安全逻辑，除非是 bug 修复
4. config 目录
5. 不要大改 ToolServer / ToolRouter
6. 不要大改 RuntimeManager，除非只是增加 API 调用

============================================================
四、WorkflowRun 数据结构要求
============================================================

定义 WorkflowRunResult：

{
  "ok": true,
  "taskId": "task_xxx",
  "workflowId": "code_edit",
  "teamId": "java_spring_team",
  "status": "completed",
  "steps": [
    {
      "id": "planner",
      "agent": "PlannerAgent",
      "status": "completed",
      "content": "...",
      "startedAt": "...",
      "endedAt": "..."
    }
  ],
  "summary": "..."
}

失败时：

{
  "ok": false,
  "taskId": "task_xxx",
  "workflowId": "code_edit",
  "teamId": "java_spring_team",
  "status": "failed",
  "steps": [...],
  "error": {
    "code": "WORKFLOW_RUN_FAILED",
    "message": "..."
  }
}

Step status 可用值：

- pending
- running
- completed
- failed
- skipped

Workflow status 可用值：

- created
- running
- completed
- failed
- cancelled

============================================================
五、WorkflowRunner 要求
============================================================

实现或修正：

agent-service/runtime/workflow_runner.py

必须提供：

class WorkflowRunner:
    def __init__(self, agent_factory, task_manager=None):
        ...

    async def run_once(
        self,
        user_request: str,
        team_id: str | None = None,
        workflow_id: str | None = None,
        mode: str | None = None,
        task_id: str | None = None
    ) -> dict:
        ...

执行顺序固定为：

1. planner
2. codebase
3. developer
4. reviewer
5. summary

每一步要求：

1. 更新 step status = running。
2. 调用对应 Agent。
3. 成功后 step status = completed。
4. 失败后 step status = failed，并停止后续步骤。
5. 每一步输入要包含前面步骤结果。

输入构造建议：

PlannerAgent 输入：
- user_request

CodebaseAgent 输入：
- user_request
- planner_result

DeveloperAgent 输入：
- user_request
- planner_result
- codebase_result

ReviewerAgent 输入：
- user_request
- planner_result
- codebase_result
- developer_result

SummaryAgent 输入：
- user_request
- planner_result
- codebase_result
- developer_result
- reviewer_result

要求：

1. 不自动应用 patch。
2. 不自动执行 command。
3. 不等待人工确认。
4. 不做复杂 retry。
5. 不做条件分支。
6. 不做并行。
7. 不使用 GroupChat。
8. 不返回 API Key。
9. Agent 输出过长时截断到 20000 字符。
10. Python 不能直接读文件，只能通过 ToolGateway。
11. Tools 仍然只允许当前已允许的只读工具。

============================================================
六、Agent 调用要求
============================================================

WorkflowRunner 可以使用 AgentFactory 创建 Agent 后逐个调用。

如果当前 AgentFactory 已经能创建：

- PlannerAgent
- CodebaseAgent
- DeveloperAgent
- ReviewerAgent
- SummaryAgent

则复用它。

如果当前 AutoGenAdapter 已有 run_sequence，可以把核心逻辑抽到 WorkflowRunner，或者让 WorkflowRunner 调用类似方法。

要求：

1. 不要复制大量重复代码。
2. 保持 AutoGenAdapter 的 run_sequence 仍然可用。
3. WorkflowRunner 是后续 task.create 正式执行的基础。
4. 当前 /api/agent/run-sequence 可以继续存在，不要破坏。

============================================================
七、TaskManager 要求
============================================================

检查或修正：

agent-service/runtime/task_manager.py

至少提供：

1. create_task(payload: dict) -> dict
2. get_task(task_id: str) -> dict | None
3. update_task_status(task_id: str, status: str) -> dict
4. append_task_step(task_id: str, step: dict) -> dict
5. update_task_result(task_id: str, result: dict) -> dict

如果已经有类似方法，复用即可。

WorkflowRunner 运行时：

1. 如果没有 task_id，则创建 task。
2. 开始时 task.status = running。
3. 完成时 task.status = completed。
4. 失败时 task.status = failed。
5. result 保存 WorkflowRunResult。

本次仍然可以只用内存存储，不需要持久化。

============================================================
八、Python API 要求
============================================================

新增接口：

POST /api/workflows/run-once

请求：

{
  "userRequest": "请分析当前项目结构，并给出增加登录接口的修改建议。",
  "teamId": "java_spring_team",
  "workflowId": "code_edit",
  "mode": "semi_auto"
}

返回成功：

{
  "ok": true,
  "result": {
    "taskId": "task_xxx",
    "workflowId": "code_edit",
    "teamId": "java_spring_team",
    "status": "completed",
    "steps": [...],
    "summary": "..."
  }
}

返回失败：

{
  "ok": false,
  "error": {
    "code": "WORKFLOW_RUN_FAILED",
    "message": "..."
  },
  "result": {
    "steps": [...]
  }
}

错误码：

EMPTY_USER_REQUEST
MODEL_API_KEY_MISSING
MODEL_PROVIDER_NOT_SUPPORTED
TOOL_SERVER_UNAVAILABLE
WORKFLOW_RUN_FAILED

要求：

1. userRequest 不能为空。
2. 如果 ToolServer 不可用，返回明确错误。
3. 不要直接读文件。
4. 不要执行命令。
5. 不要应用 patch。
6. 不返回 API Key。

============================================================
九、ExtensionApiClient 要求
============================================================

修改 src/runtime/ExtensionApiClient.ts。

新增：

runWorkflowOnce(serviceUrl: string, payload: unknown): Promise<unknown>

请求：

POST `${serviceUrl}/api/workflows/run-once`

body：

{
  "userRequest": "...",
  "teamId": "...",
  "workflowId": "...",
  "mode": "semi_auto"
}

要求：

1. 超时 240000ms。
2. 返回 JSON。
3. HTTP 非 2xx 抛 Error。
4. 不打印 API Key。
5. 不实现 WebSocket。

============================================================
十、RuntimeManager 要求
============================================================

如果 RuntimeManager 封装 Python Service API，则新增：

runWorkflowOnce(payload: unknown): Promise<unknown>

逻辑：

1. 确认 Runtime 正在运行。
2. 调用 ExtensionApiClient.runWorkflowOnce(serviceUrl, payload)。
3. 返回结果。

如果当前 MessageDispatcher 直接调用 ExtensionApiClient，也可以保持，但不要重复太多代码。

============================================================
十一、MessageDispatcher 要求
============================================================

修改 src/webview/MessageDispatcher.ts。

新增 action：

workflow.debug.runOnce

逻辑：

1. 从 message.payload.fields 读取：
   - task.userRequest
   - task.teamId
   - task.workflowId
   - task.mode

2. 如果 task.userRequest 为空，使用默认测试文本：

请分析当前 workspace 的项目结构，并给出如果要增加一个简单登录接口，需要检查哪些文件、可能修改哪些文件、有什么风险。不要修改文件。

3. 默认：

teamId = java_spring_team
workflowId = code_edit
mode = semi_auto

4. 调用 RuntimeManager.runWorkflowOnce 或 ExtensionApiClient.runWorkflowOnce。

5. 如果 Runtime 未启动，返回 RUNTIME_NOT_RUNNING。

6. 成功返回：

{
  "ok": true,
  "type": "workflow.debug.runOnce.result",
  "requestId": "...",
  "payload": {
    "message": "Workflow run completed",
    "result": {...}
  }
}

7. 失败返回明确错误。

不要破坏：
- task.create
- agent.debug.runOnce
- agent.debug.runWithTools
- agent.debug.runSequence
- settings.save / settings.load
- agents.load / agent.save
- teams.load / workflows.load

============================================================
十二、Webview 要求
============================================================

修改 media/webview.html 和 media/webview-bridge.js。

在 Run 页或 Workflow 页增加按钮：

<button data-action="workflow.debug.runOnce">Debug WorkflowRunner</button>

建议放在 Run 页任务输入区附近，和：

- Debug 单 Agent 调用
- Debug 单 Agent + Tools
- Debug 多角色顺序调用

放在同一区域。

点击后：

1. 发送 workflow.debug.runOnce。
2. event-log 显示：
   → sent: workflow.debug.runOnce

收到成功 response 后：

1. event-log 显示：
   ← response: workflow.debug.runOnce.result

2. 对每个 step 显示摘要：

planner / PlannerAgent: completed
codebase / CodebaseAgent: completed
developer / DeveloperAgent: completed
reviewer / ReviewerAgent: completed
summary / SummaryAgent: completed

3. 每个 step 内容最多显示前 3000 字符。
4. 如果有 Run 页 Timeline 区，可以更新 Timeline。
5. 如果有 Run 页 Agent 状态区，可以更新 Agent 状态。
6. 不要把内容无限刷满页面。

收到失败 response 后：

1. event-log 显示错误 code 和 message。
2. 如果有 partial steps，也显示已完成 steps。
3. 不显示 API Key。

不要大改 UI。

============================================================
十三、安全要求
============================================================

必须保证：

1. Python 不能直接读文件。
2. 工具必须通过 ToolGateway 调 Extension ToolServer。
3. Extension WorkspaceGuard 仍然生效。
4. Sensitive File Guard 仍然生效。
5. 不自动 apply_patch。
6. 不自动 run_command。
7. 不执行 Git 写操作。
8. 不注入写文件工具。
9. API Key 不返回 Webview。
10. API Key 不进入 event-log。
11. API Key 不进入 console。
12. Agent 输出过长要截断。
13. 不自动修改 workspace 文件。

============================================================
十四、不要做的事情
============================================================

本次不要做：

1. 不要把 Run 页 task.create 接到 WorkflowRunner。
2. 不要实现真实 WebSocket 流式事件。
3. 不要实现审批暂停和恢复。
4. 不要实现 patch.apply 自动执行。
5. 不要实现 command.approveOnce 自动执行。
6. 不要实现 Team GroupChat。
7. 不要实现 RoundRobinGroupChat。
8. 不要实现 SelectorGroupChat。
9. 不要实现并行。
10. 不要实现复杂 retry。
11. 不要做 Git 写操作。
12. 不要修改 Demo / prototype。
13. 不要修改 docs。

============================================================
十五、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. Python Service 可以启动。
3. ToolServer 可以启动。
4. /api/workflows/run-once 可用。
5. WorkflowRunner 能按 Planner → Codebase → Developer → Reviewer → Summary 顺序执行。
6. CodebaseAgent 能通过 ToolGateway 使用只读工具分析项目。
7. DeveloperAgent 只输出修改建议或 proposed patch 文本，不应用 patch。
8. ReviewerAgent 只审查，不修改文件。
9. SummaryAgent 能总结。
10. 失败时返回已完成 steps 和明确 error。
11. Webview 点击 workflow.debug.runOnce 可以看到 Workflow steps。
12. agent.debug.runSequence 仍然可用。
13. agent.debug.runWithTools 仍然可用。
14. task.create 仍保持原有逻辑，不接 WorkflowRunner。
15. Settings / Agents / Team / Workflow / Tools 配置保存不受影响。
16. 没有自动 apply_patch / run_command。
17. 没有真实 WebSocket 流式事件。
18. 没有修改 Demo / prototype / docs。
19. API Key 没有进入 Webview / event-log / console。

运行验收命令：

npm run compile

手动测试建议：

1. 在 Settings 保存 Gemini API Key。
2. 点击 runtime.start。
3. 确认 ToolServer 可用：
   http://127.0.0.1:8765/api/tools/health

4. 在 Run 页输入：

请分析当前 workspace 的项目结构，并给出如果要增加一个简单登录接口，需要检查哪些文件、可能修改哪些文件、有什么风险。不要修改文件。

5. 点击：
   Debug WorkflowRunner

6. 预期：
   - Planner step completed
   - Codebase step completed
   - Developer step completed
   - Reviewer step completed
   - Summary step completed

7. 确认没有生成真实文件修改。
8. 确认没有执行命令。

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. WorkflowRunner 如何组织 steps。
5. 每个 step 调用了哪个 Agent。
6. 是否确认没有自动 apply_patch / run_command。
7. /api/workflows/run-once 是否可用。
8. Webview workflow.debug.runOnce 是否可用。
9. npm run compile 是否通过。
10. Python workflow run 是否测试通过。
11. 是否确认 API Key 没有进入 Webview / event-log / console。
12. 是否确认没有接 task.create / 真实 WebSocket 流。
13. 下一步建议执行哪个 Task。