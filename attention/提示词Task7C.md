你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 7C：实现 AutoGen 单 Agent 调用 ToolGateway 的最小闭环。

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

Task 7A 已完成：
- RuntimeManager 启动 Python Service 时会传入 Gemini OpenAI-compatible 配置
- Python Service 已有 /api/model/config-safe
- Python Service 已有 /api/model/health
- Settings 页“测试模型连接”可以真实调用 Gemini 健康检查
- API Key 不进入 Webview / event-log / globalState

Task 7B 已完成：
- Python Service 已有 AutoGenAdapter 最小真实调用
- /api/agent/run-once 可以用 Gemini OpenAI-compatible 跑单 Agent
- agent.debug.runOnce 可以从 Webview 触发
- 当前 AutoGen 单 Agent 不使用 tools

本次只做 AutoGen 单 Agent 的 ToolGateway 工具调用。
不要实现多 Agent。
不要实现完整 WorkflowRunner。
不要实现 RoundRobinGroupChat。
不要实现 SelectorGroupChat。
不要自动应用 patch。
不要自动执行命令。
不要绕过用户确认。

============================================================
一、本次目标
============================================================

实现 AutoGen 单 Agent 可以通过 ToolGateway 调用 VS Code Extension 工具。

目标链路：

AutoGen AssistantAgent
  ↓ tool call
Python ToolGateway
  ↓ HTTP
VS Code Extension ToolServer
  ↓ ToolRouter
VS Code workspace 工具
  ↓
返回给 AutoGen Agent

必须完成：

1. Python Service 中为 AutoGenAdapter 增加工具函数。
2. 最小支持这些工具：
   - list_files
   - read_file
   - search_code
   - git_status
   - git_diff

3. 不支持危险工具：
   - apply_patch
   - run_command
   - write_file
   - delete_file
   - git push / commit / reset

4. 新增接口：
   POST /api/agent/run-with-tools

5. run-with-tools 使用 AssistantAgent + tools。
6. Agent 可以调用 list_files / read_file / search_code / git_status / git_diff。
7. Agent 只能读取 workspace 内文件。
8. 敏感文件仍然由 Extension ToolServer 拦截。
9. workspace 外路径仍然由 Extension WorkspaceGuard 拦截。
10. API Key 不进入日志。
11. Webview 增加 Debug action，可以触发 run-with-tools。
12. npm run compile 通过。
13. Python Service 可以启动并通过 run-with-tools 测试。

本次不要做：
- 多 Agent Team
- WorkflowRunner
- Tool approval
- apply_patch 自动应用
- run_command 自动执行
- WebSocket 真实模型流
- 自动修改文件
- Git 写操作

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. agent-service/adapters/autogen_adapter.py
2. agent-service/tools/tool_gateway.py
3. agent-service/main.py
4. agent-service/runtime/model_settings.py
5. agent-service/requirements.txt
6. src/runtime/ExtensionApiClient.ts
7. src/webview/MessageDispatcher.ts
8. src/tools/ToolServer.ts
9. src/tools/ToolRouter.ts
10. media/webview.html
11. media/webview-bridge.js
12. package.json

可以只读参考：
13. docs/04_AutoGen多Agent运行时详细设计.md
14. docs/05_Agent配置与Prompt模板详细设计.md
15. docs/07_Tools工具系统与权限控制详细设计.md
16. docs/08_VSCode文件_Diff_Terminal_Git工具联调详细设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要实现多 Agent。
不要实现 WorkflowRunner。
不要实现自动 patch apply。
不要实现 run_command 自动执行。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. agent-service/adapters/autogen_adapter.py
2. agent-service/tools/tool_gateway.py
3. agent-service/main.py
4. agent-service/requirements.txt
5. src/runtime/ExtensionApiClient.ts
6. src/webview/MessageDispatcher.ts
7. media/webview.html
8. media/webview-bridge.js

必要时可以新增：
9. agent-service/runtime/autogen_tools.py
10. agent-service/api/agent.py
11. agent-service/schemas/agent.py
12. src/types/agentRun.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. src/tools 安全逻辑，除非是 bug 修复
4. config 目录
5. 不要大改 ToolServer / ToolRouter
6. 不要大改 RuntimeManager，除非只是增加 API 调用

============================================================
四、AutoGen 工具函数要求
============================================================

在 Python Service 中实现 AutoGen 可用工具函数。

可以新增：

agent-service/runtime/autogen_tools.py

必须提供这些 async 函数：

1. list_files(dir: str = ".", max_files: int = 100) -> str
2. read_file(path: str, max_bytes: int = 200000) -> str
3. search_code(query: str, dir: str = ".", max_results: int = 20) -> str
4. git_status() -> str
5. git_diff(path: str | None = None, cached: bool = False, max_bytes: int = 200000) -> str

这些函数内部必须调用 ToolGateway。

示例：

await tool_gateway.call_tool("read_file", {"path": path, "maxBytes": max_bytes})

要求：

1. 返回给 Agent 的内容必须是字符串。
2. 如果 ToolGateway 返回 ok=true，返回 JSON 字符串或简短文本。
3. 如果 ToolGateway 返回 ok=false，返回错误说明字符串。
4. 不要在 Python 中直接读文件。
5. 不要在 Python 中直接执行 git。
6. 不要在 Python 中直接执行命令。
7. 不要绕过 Extension ToolServer。
8. 不要返回超过 20000 字符给模型。
9. 超长内容要截断，并标记 truncated。
10. 不要包含 API Key。

============================================================
五、AutoGenAdapter 要求
============================================================

修改 agent-service/adapters/autogen_adapter.py。

保留已有 run_once。

新增：

async def run_with_tools(self, user_request: str, system_prompt: str | None = None) -> dict:
    ...

run_with_tools 要求：

1. user_request 不能为空。
2. 使用 Gemini OpenAI-compatible model client。
3. 创建 AssistantAgent。
4. 给 AssistantAgent 注册工具：
   - list_files
   - read_file
   - search_code
   - git_status
   - git_diff

5. 不注册：
   - apply_patch
   - run_command
   - propose_patch
   - write_file
   - delete_file

6. system_prompt 默认使用：

你是一个代码库分析助手。你可以使用 list_files、read_file、search_code、git_status、git_diff 了解项目。
你不能修改文件。
你不能执行命令。
你不能应用 patch。
你不能访问 workspace 外文件。
你不能读取敏感文件。
如果工具返回权限错误或敏感文件错误，你必须停止该方向并说明原因。
请根据工具结果回答用户问题。

7. 调用 Agent 时限制轮数，避免无限循环。
8. 如果 AutoGen 支持 max_tool_iterations 或 max_turns，设置较小值，例如 6。
9. 捕获异常并返回明确错误。
10. 关闭 model client。
11. 不要把 API Key 放入返回值。

返回成功：

{
  "ok": true,
  "model": "gemini-3-flash-preview",
  "agent": "ToolEnabledAssistantAgent",
  "content": "...",
  "tools": ["list_files", "read_file", "search_code", "git_status", "git_diff"]
}

返回失败：

{
  "ok": false,
  "error": {
    "code": "AUTOGEN_TOOL_RUN_FAILED",
    "message": "..."
  }
}

============================================================
六、Python API 要求
============================================================

新增或修改接口：

POST /api/agent/run-with-tools

请求：

{
  "userRequest": "请分析这个项目的结构，先列出根目录文件，然后读取 package.json 或 pom.xml。",
  "systemPrompt": "可选"
}

返回成功：

{
  "ok": true,
  "result": {
    "model": "gemini-3-flash-preview",
    "agent": "ToolEnabledAssistantAgent",
    "content": "...",
    "tools": [...]
  }
}

返回失败：

{
  "ok": false,
  "error": {
    "code": "AUTOGEN_TOOL_RUN_FAILED",
    "message": "..."
  }
}

错误码：

EMPTY_USER_REQUEST
MODEL_API_KEY_MISSING
MODEL_PROVIDER_NOT_SUPPORTED
TOOL_SERVER_UNAVAILABLE
AUTOGEN_TOOL_RUN_FAILED
MODEL_RESPONSE_EMPTY

要求：

1. 如果 ToolServer 不可用，返回 TOOL_SERVER_UNAVAILABLE。
2. 如果 API Key 缺失，返回 MODEL_API_KEY_MISSING。
3. 不要返回 API Key。
4. 不要直接读文件。
5. 不要执行命令。
6. 不要应用 patch。

============================================================
七、ExtensionApiClient 要求
============================================================

修改 src/runtime/ExtensionApiClient.ts。

新增：

runAgentWithTools(serviceUrl: string, payload: unknown): Promise<unknown>

请求：

POST `${serviceUrl}/api/agent/run-with-tools`

body：

{
  "userRequest": "...",
  "systemPrompt": "..."
}

要求：

1. 超时 120000ms。
2. 返回 JSON。
3. HTTP 非 2xx 抛 Error。
4. 不打印 API Key。
5. 不实现 WebSocket。

============================================================
八、RuntimeManager 要求
============================================================

如果 RuntimeManager 目前封装了 runAgentOnce，则新增：

runAgentWithTools(payload: unknown): Promise<unknown>

逻辑：

1. 确认 Runtime 正在运行。
2. 调用 ExtensionApiClient.runAgentWithTools(serviceUrl, payload)。
3. 返回结果。

如果当前架构是 MessageDispatcher 直接调用 ExtensionApiClient，也可以保持，但不要重复太多代码。

============================================================
九、MessageDispatcher 要求
============================================================

修改 src/webview/MessageDispatcher.ts。

新增 action：

agent.debug.runWithTools

逻辑：

1. 从 message.payload.fields 读取：
   - task.userRequest
   - agent.systemPrompt

2. userRequest 优先使用 task.userRequest。

3. 如果 task.userRequest 为空，使用默认测试文本：

请分析当前 workspace 的项目结构。先调用 list_files 查看根目录，再读取 package.json 或 pom.xml，如果存在的话。最后用中文总结项目类型和主要目录。

4. systemPrompt 可以使用 Agent 页当前 systemPrompt，也可以为空。

5. 调用 RuntimeManager.runAgentWithTools 或 ExtensionApiClient.runAgentWithTools。

6. 如果 Runtime 未启动，返回 RUNTIME_NOT_RUNNING。

7. 成功返回：

{
  "ok": true,
  "type": "agent.debug.runWithTools.result",
  "requestId": "...",
  "payload": {
    "message": "Agent tool run completed",
    "result": {...}
  }
}

8. 失败返回明确错误。

不要破坏 agent.debug.runOnce。
不要破坏 agent.save / agents.load。
不要破坏 task.create。

============================================================
十、Webview 要求
============================================================

修改 media/webview.html 和 media/webview-bridge.js。

在 Run 页或 Agents 页增加按钮：

<button data-action="agent.debug.runWithTools">Debug 单 Agent + Tools</button>

建议放在 Run 页任务输入区旁边，靠近 agent.debug.runOnce。

点击后：

1. 发送 agent.debug.runWithTools。
2. event-log 显示：
   → sent: agent.debug.runWithTools

收到成功 response 后：

1. event-log 显示：
   ← response: agent.debug.runWithTools.result
2. 显示模型回复内容，最多显示前 5000 字符。
3. 如果有 Run 页 Message 区，可以追加：
   ToolEnabledAssistantAgent: ...

收到失败 response 后：

1. event-log 显示错误 code 和 message。
2. 不显示 API Key。

不要大改 UI。

============================================================
十一、安全要求
============================================================

必须保证：

1. AutoGen tools 只能通过 Python ToolGateway 调 Extension ToolServer。
2. Python 不能直接读文件。
3. Python 不能直接执行命令。
4. Python 不能直接执行 git。
5. Agent 不能使用 apply_patch。
6. Agent 不能使用 run_command。
7. Agent 不能使用 write_file / delete_file。
8. Extension WorkspaceGuard 仍然生效。
9. Sensitive File Guard 仍然生效。
10. API Key 不返回 Webview。
11. API Key 不进入 event-log。
12. API Key 不进入 console。
13. Tool result 内容传给模型前要截断。
14. UI 显示结果要截断。

============================================================
十二、不要做的事情
============================================================

本次不要做：

1. 不要实现多 Agent。
2. 不要实现 Team。
3. 不要实现 WorkflowRunner。
4. 不要实现 RoundRobinGroupChat。
5. 不要实现 SelectorGroupChat。
6. 不要实现 run_stream 真实流。
7. 不要实现 WebSocket 真实模型流。
8. 不要注入 apply_patch。
9. 不要注入 run_command。
10. 不要自动应用 patch。
11. 不要自动执行命令。
12. 不要做 Git 写操作。
13. 不要修改 Demo / prototype。
14. 不要修改 docs。

============================================================
十三、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. Python Service 可以启动。
3. ToolServer 可以启动。
4. /api/tools/health 可用。
5. /api/agent/run-with-tools 可以调用 AutoGen AssistantAgent。
6. AutoGen Agent 可以调用 list_files。
7. AutoGen Agent 可以调用 read_file。
8. AutoGen Agent 可以调用 search_code。
9. AutoGen Agent 可以调用 git_status / git_diff。
10. AutoGen Agent 不能调用 apply_patch。
11. AutoGen Agent 不能调用 run_command。
12. Python 没有直接读取文件。
13. Python 没有直接执行命令。
14. 敏感文件读取仍然被 Extension 拦截。
15. workspace 外路径仍然被 Extension 拦截。
16. Webview 点击 agent.debug.runWithTools 可以看到模型基于工具结果的回复。
17. agent.debug.runOnce 仍然可用。
18. Settings / Agents / Team / Workflow / Tools 配置保存不受影响。
19. API Key 没有进入 Webview / event-log / console。
20. 没有实现多 Agent / WorkflowRunner / apply_patch / run_command。

运行验收命令：

npm run compile

手动测试建议：

1. 在 Settings 保存 Gemini API Key。
2. 点击 runtime.start。
3. 确认 ToolServer 可用：
   http://127.0.0.1:8765/api/tools/health

4. 在 Run 页输入：
   请分析当前 workspace 的项目结构。先列出根目录文件，再读取 package.json 或 pom.xml，最后总结项目类型。

5. 点击：
   Debug 单 Agent + Tools

6. 预期：
   Agent 会使用 list_files / read_file，然后返回项目结构总结。

7. 测试敏感文件：
   输入：
   请读取 .env 文件。
   预期：
   工具返回 SENSITIVE_FILE_BLOCKED，Agent 应说明无法读取敏感文件。

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. AutoGen tools 如何通过 ToolGateway 调用 Extension ToolServer。
5. run-with-tools 支持哪些工具。
6. 是否确认没有注入 apply_patch / run_command。
7. /api/agent/run-with-tools 是否可用。
8. Webview agent.debug.runWithTools 是否可用。
9. npm run compile 是否通过。
10. Python run-with-tools 是否测试通过。
11. 是否确认 API Key 没有进入 Webview / event-log / console。
12. 是否确认没有多 Agent / WorkflowRunner。
13. 下一步建议执行哪个 Task。