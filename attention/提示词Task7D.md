你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 7D：实现 AgentFactory 和多角色 Agent 的最小顺序调用，但不做完整 WorkflowRunner。

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
- 默认 Agents 包含 PlannerAgent / CodebaseAgent / DeveloperAgent / ReviewerAgent / TesterAgent / SummaryAgent

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

Task 7A 已完成：
- RuntimeManager 启动 Python Service 时会传入 Gemini OpenAI-compatible 配置
- Python Service 已有 /api/model/config-safe
- Python Service 已有 /api/model/health
- Settings 页“测试模型连接”可以真实调用 Gemini 健康检查

Task 7B 已完成：
- Python Service 已有 AutoGenAdapter 最小真实调用
- /api/agent/run-once 可以用 Gemini OpenAI-compatible 跑单 Agent

Task 7C 已完成：
- /api/agent/run-with-tools 可以让单 Agent 通过 ToolGateway 调用 Extension ToolServer
- 支持 list_files / read_file / search_code / git_status / git_diff
- 没有注入 apply_patch / run_command

本次只做多角色 Agent 的最小顺序调用。
不要实现完整 WorkflowRunner。
不要实现 RoundRobinGroupChat。
不要实现 SelectorGroupChat。
不要实现自动 patch.apply。
不要实现自动 run_command。
不要实现真实审批恢复。
不要自动修改文件。

============================================================
一、本次目标
============================================================

实现 Python Service 中的多角色 Agent 最小顺序调用：

PlannerAgent
  ↓
CodebaseAgent
  ↓
DeveloperAgent
  ↓
ReviewerAgent
  ↓
SummaryAgent

本次可以暂时跳过 TesterAgent，或者只让 TesterAgent 输出建议，不执行命令。

必须完成：

1. 新增或修正 AgentFactory。
2. AgentFactory 能根据 agent config 创建不同角色的 AssistantAgent。
3. Python Service 新增接口：
   POST /api/agent/run-sequence

4. run-sequence 按顺序调用多个角色。
5. PlannerAgent 只做计划，不用工具或只用 list_files。
6. CodebaseAgent 可以用工具：
   - list_files
   - read_file
   - search_code
   - git_status
   - git_diff

7. DeveloperAgent 可以生成 proposed patch 文本，但不能自动调用 apply_patch。
8. ReviewerAgent 只审查 DeveloperAgent 输出。
9. SummaryAgent 总结结果。
10. 全部结果一次性返回给 Extension/Webview。
11. Webview 增加 Debug action：
    agent.debug.runSequence

12. event-log 能显示每个 Agent 的结果摘要。
13. npm run compile 通过。
14. Python Service 可以启动。

本次不要做：
- 完整 WorkflowRunner
- WebSocket 真实流式事件
- 多 Agent 自动对话 Team
- RoundRobinGroupChat
- SelectorGroupChat
- apply_patch 自动应用
- run_command 自动执行
- Git 写操作
- 自动修改 workspace 文件

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. agent-service/adapters/autogen_adapter.py
2. agent-service/runtime/agent_factory.py
3. agent-service/runtime/autogen_tools.py
4. agent-service/tools/tool_gateway.py
5. agent-service/main.py
6. agent-service/runtime/model_settings.py
7. src/runtime/ExtensionApiClient.ts
8. src/webview/MessageDispatcher.ts
9. media/webview.html
10. media/webview-bridge.js
11. package.json

可以只读参考：
12. docs/04_AutoGen多Agent运行时详细设计.md
13. docs/05_Agent配置与Prompt模板详细设计.md
14. docs/06_Team与Workflow编排详细设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要实现完整 WorkflowRunner。
不要实现 Team group chat。
不要实现自动 patch apply。
不要实现 run_command 自动执行。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. agent-service/adapters/autogen_adapter.py
2. agent-service/runtime/agent_factory.py
3. agent-service/runtime/autogen_tools.py
4. agent-service/main.py
5. src/runtime/ExtensionApiClient.ts
6. src/webview/MessageDispatcher.ts
7. media/webview.html
8. media/webview-bridge.js

必要时可以新增：
9. agent-service/api/agent.py
10. agent-service/schemas/agent.py
11. agent-service/runtime/agent_prompts.py
12. src/types/agentRun.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. src/tools 安全逻辑，除非是 bug 修复
4. config 目录
5. 不要大改 ToolServer / ToolRouter
6. 不要大改 RuntimeManager，除非只是增加 API 调用

============================================================
四、AgentFactory 要求
============================================================

实现或修正：

agent-service/runtime/agent_factory.py

必须提供：

class AgentFactory:
    def __init__(self, model_client_factory, tool_gateway=None):
        ...

    def create_planner_agent(self):
        ...

    def create_codebase_agent(self):
        ...

    def create_developer_agent(self):
        ...

    def create_reviewer_agent(self):
        ...

    def create_summary_agent(self):
        ...

也可以提供统一方法：

create_agent(role: str)

要求：

1. 所有 Agent 使用 Gemini OpenAI-compatible model client。
2. 每个 Agent 有不同 name。
3. 每个 Agent 有不同 system_message。
4. 不同 Agent 注入不同工具。
5. 不要给 DeveloperAgent 注入 apply_patch。
6. 不要给任何 Agent 注入 run_command。
7. 不要给任何 Agent 注入写文件工具。
8. 不要给任何 Agent 注入 Git 写操作。

============================================================
五、各 Agent 工具权限要求
============================================================

本次 Python AutoGen 层只允许这些工具：

公共可用工具：

- list_files
- read_file
- search_code
- git_status
- git_diff

禁止工具：

- apply_patch
- run_command
- write_file
- delete_file
- git_apply
- git_commit
- git_push
- git_reset
- git_checkout

具体角色：

1. PlannerAgent

建议工具：
- list_files

也可以不注入工具。

职责：
- 拆分用户需求。
- 生成执行计划。
- 指出需要检查哪些文件。
- 不写代码。
- 不生成 patch。

2. CodebaseAgent

工具：
- list_files
- read_file
- search_code
- git_status
- git_diff

职责：
- 分析项目结构。
- 查找相关文件。
- 总结现有实现。
- 不写代码。
- 不生成 patch。

3. DeveloperAgent

工具：
- list_files
- read_file
- search_code

职责：
- 根据 Planner 和 Codebase 输出生成修改建议。
- 可以输出 proposed patch 文本。
- 不能调用 apply_patch。
- 不能直接修改文件。

4. ReviewerAgent

工具：
- read_file
- search_code
- git_diff

职责：
- 审查 Developer 输出。
- 指出风险。
- 不修改文件。

5. SummaryAgent

工具：
- 无，或者只用 git_status

职责：
- 总结任务结果。
- 给出下一步建议。

============================================================
六、Agent Prompt 要求
============================================================

如果新增 agent-service/runtime/agent_prompts.py，定义这些 prompt：

PLANNER_PROMPT：

你是 PlannerAgent，负责把用户的代码需求拆成明确执行计划。
你不能修改文件。
你不能生成 patch。
你不能执行命令。
你的输出必须包含：
1. taskSummary
2. assumptions
3. steps
4. filesToInspect
5. approvalRequired

CODEBASE_PROMPT：

你是 CodebaseAgent，负责理解当前项目结构和相关代码。
你必须优先使用工具查看真实项目。
不要凭空猜测。
你不能修改文件。
你不能生成 patch。
你的输出必须包含：
1. projectType
2. relevantFiles
3. existingPatterns
4. risks
5. recommendedChangeScope

DEVELOPER_PROMPT：

你是 DeveloperAgent，负责根据计划和代码分析生成修改方案。
你不能直接修改文件。
你不能调用 apply_patch。
你可以输出 proposed patch 文本，但必须等待用户确认。
你的输出必须包含：
1. summary
2. changedFiles
3. proposedPatch
4. risk
5. needsApproval

REVIEWER_PROMPT：

你是 ReviewerAgent，负责审查 DeveloperAgent 的修改方案。
你不能修改文件。
你需要指出：
1. correctness
2. risk
3. missingTests
4. securityConcerns
5. approvalRecommendation

SUMMARY_PROMPT：

你是 SummaryAgent，负责总结本次任务。
你需要输出：
1. 用户需求
2. 计划摘要
3. 项目分析摘要
4. 修改建议摘要
5. Review 结论
6. 下一步建议

============================================================
七、AutoGenAdapter run_sequence 要求
============================================================

修改 agent-service/adapters/autogen_adapter.py。

新增：

async def run_sequence(self, user_request: str) -> dict:
    ...

执行顺序：

1. PlannerAgent

输入：

用户原始需求。

输出保存为 planner_result。

2. CodebaseAgent

输入：

用户原始需求 + planner_result。

输出保存为 codebase_result。

3. DeveloperAgent

输入：

用户原始需求 + planner_result + codebase_result。

输出保存为 developer_result。

4. ReviewerAgent

输入：

用户原始需求 + planner_result + codebase_result + developer_result。

输出保存为 reviewer_result。

5. SummaryAgent

输入：

用户原始需求 + 所有前面结果。

输出 summary_result。

返回成功格式：

{
  "ok": true,
  "mode": "sequence",
  "model": "gemini-3-flash-preview",
  "results": [
    {
      "agent": "PlannerAgent",
      "content": "..."
    },
    {
      "agent": "CodebaseAgent",
      "content": "..."
    },
    {
      "agent": "DeveloperAgent",
      "content": "..."
    },
    {
      "agent": "ReviewerAgent",
      "content": "..."
    },
    {
      "agent": "SummaryAgent",
      "content": "..."
    }
  ],
  "summary": "..."
}

失败格式：

{
  "ok": false,
  "error": {
    "code": "AUTOGEN_SEQUENCE_FAILED",
    "message": "..."
  }
}

要求：

1. 任一 Agent 失败时，返回失败结果和已完成结果。
2. 不要让异常崩掉服务。
3. 不要返回 API Key。
4. 每个 Agent 输出过长时截断到合理长度，例如 20000 字符。
5. 不实现并行。
6. 不实现自动重试。
7. 不实现审批。
8. 不实现 patch apply。
9. 不实现命令执行。

============================================================
八、Python API 要求
============================================================

新增接口：

POST /api/agent/run-sequence

请求：

{
  "userRequest": "请分析当前项目结构，并给出如何增加登录接口的修改建议。"
}

返回成功：

{
  "ok": true,
  "result": {
    "mode": "sequence",
    "results": [...],
    "summary": "..."
  }
}

错误码：

EMPTY_USER_REQUEST
MODEL_API_KEY_MISSING
MODEL_PROVIDER_NOT_SUPPORTED
TOOL_SERVER_UNAVAILABLE
AUTOGEN_SEQUENCE_FAILED

要求：

1. userRequest 不能为空。
2. 如果 ToolServer 不可用，CodebaseAgent 可能失败，要返回明确错误。
3. 不要直接读文件。
4. 不要执行命令。
5. 不要应用 patch。
6. 不返回 API Key。

============================================================
九、ExtensionApiClient 要求
============================================================

修改 src/runtime/ExtensionApiClient.ts。

新增：

runAgentSequence(serviceUrl: string, payload: unknown): Promise<unknown>

请求：

POST `${serviceUrl}/api/agent/run-sequence`

body：

{
  "userRequest": "..."
}

要求：

1. 超时 180000ms。
2. 返回 JSON。
3. HTTP 非 2xx 抛 Error。
4. 不打印 API Key。
5. 不实现 WebSocket。

============================================================
十、RuntimeManager 要求
============================================================

如果 RuntimeManager 封装 Agent API，则新增：

runAgentSequence(payload: unknown): Promise<unknown>

逻辑：

1. 确认 Runtime 正在运行。
2. 调用 ExtensionApiClient.runAgentSequence(serviceUrl, payload)。
3. 返回结果。

如果当前 MessageDispatcher 直接调用 ExtensionApiClient，也可以保持，但不要重复太多代码。

============================================================
十一、MessageDispatcher 要求
============================================================

修改 src/webview/MessageDispatcher.ts。

新增 action：

agent.debug.runSequence

逻辑：

1. 从 message.payload.fields 读取：
   - task.userRequest

2. 如果 task.userRequest 为空，使用默认测试文本：

请分析当前 workspace 的项目结构，并给出如果要增加一个简单登录接口，需要检查哪些文件、可能修改哪些文件、有什么风险。不要修改文件。

3. 调用 RuntimeManager.runAgentSequence 或 ExtensionApiClient.runAgentSequence。

4. 如果 Runtime 未启动，返回 RUNTIME_NOT_RUNNING。

5. 成功返回：

{
  "ok": true,
  "type": "agent.debug.runSequence.result",
  "requestId": "...",
  "payload": {
    "message": "Agent sequence completed",
    "result": {...}
  }
}

6. 失败返回明确错误。

不要破坏：
- agent.debug.runOnce
- agent.debug.runWithTools
- task.create
- settings.save / settings.load
- agents.load / agent.save

============================================================
十二、Webview 要求
============================================================

修改 media/webview.html 和 media/webview-bridge.js。

在 Run 页或 Agents 页增加按钮：

<button data-action="agent.debug.runSequence">Debug 多角色顺序调用</button>

建议放在 Run 页任务输入区附近，和：

- Debug 单 Agent 调用
- Debug 单 Agent + Tools

放在同一区域。

点击后：

1. 发送 agent.debug.runSequence。
2. event-log 显示：
   → sent: agent.debug.runSequence

收到成功 response 后：

1. event-log 显示：
   ← response: agent.debug.runSequence.result

2. 对每个 Agent 显示摘要：

PlannerAgent: ...
CodebaseAgent: ...
DeveloperAgent: ...
ReviewerAgent: ...
SummaryAgent: ...

3. 每个 Agent 内容最多显示前 3000 字符。
4. 如果有 Run 页 Message 区，可以追加 Agent 消息。
5. 不要把内容无限刷满页面。

收到失败 response 后：

1. event-log 显示错误 code 和 message。
2. 不显示 API Key。

不要大改 UI。

============================================================
十三、安全要求
============================================================

必须保证：

1. Python 不能直接读文件。
2. 工具必须通过 ToolGateway 调 Extension ToolServer。
3. Extension WorkspaceGuard 仍然生效。
4. Sensitive File Guard 仍然生效。
5. 不注入 apply_patch。
6. 不注入 run_command。
7. 不注入写文件工具。
8. 不执行 Git 写操作。
9. API Key 不返回 Webview。
10. API Key 不进入 event-log。
11. API Key 不进入 console。
12. Agent 输出过长要截断。
13. 不自动修改 workspace 文件。

============================================================
十四、不要做的事情
============================================================

本次不要做：

1. 不要实现完整 WorkflowRunner。
2. 不要实现 AutoGen Team GroupChat。
3. 不要实现 RoundRobinGroupChat。
4. 不要实现 SelectorGroupChat。
5. 不要实现 run_stream 真实流。
6. 不要实现 WebSocket 真实模型流。
7. 不要自动应用 patch。
8. 不要自动执行命令。
9. 不要做 Git 写操作。
10. 不要修改 Demo / prototype。
11. 不要修改 docs。

============================================================
十五、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. Python Service 可以启动。
3. ToolServer 可以启动。
4. /api/agent/run-sequence 可以调用多角色顺序执行。
5. PlannerAgent 能生成计划。
6. CodebaseAgent 能通过工具分析项目。
7. DeveloperAgent 能生成修改建议或 proposed patch 文本。
8. ReviewerAgent 能审查 Developer 输出。
9. SummaryAgent 能总结。
10. 不自动应用 patch。
11. 不自动执行命令。
12. 不注入 apply_patch / run_command。
13. 不返回 API Key。
14. Webview 点击 agent.debug.runSequence 可以看到多角色结果。
15. agent.debug.runOnce 仍然可用。
16. agent.debug.runWithTools 仍然可用。
17. Settings / Agents / Team / Workflow / Tools 配置保存不受影响。
18. 没有实现完整 WorkflowRunner。
19. 没有修改 Demo / prototype / docs。

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
   Debug 多角色顺序调用

6. 预期：
   - PlannerAgent 输出计划
   - CodebaseAgent 调用工具分析项目
   - DeveloperAgent 输出修改建议
   - ReviewerAgent 输出审查意见
   - SummaryAgent 输出总结

7. 确认没有生成真实文件修改。

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. AgentFactory 如何创建不同角色 Agent。
5. 每个 Agent 注入了哪些工具。
6. 是否确认没有注入 apply_patch / run_command。
7. /api/agent/run-sequence 是否可用。
8. Webview agent.debug.runSequence 是否可用。
9. npm run compile 是否通过。
10. Python run-sequence 是否测试通过。
11. 是否确认 API Key 没有进入 Webview / event-log / console。
12. 是否确认没有完整 WorkflowRunner / Team GroupChat。
13. 下一步建议执行哪个 Task。