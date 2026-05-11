你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 7B：实现 Python Service 中的 AutoGenAdapter 最小真实调用，用 Gemini OpenAI-compatible 模型跑一个单 Agent placeholder 任务。

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

本次开始接真实 AutoGen，但只做最小单 Agent 调用。
不要实现多 Agent Team。
不要实现完整 WorkflowRunner。
不要实现真实 patch 应用。
不要实现工具调用闭环。
不要让 Agent 直接修改文件。

============================================================
一、本次目标
============================================================

实现 Python Service 里的 AutoGenAdapter 最小真实调用：

1. 安装并使用 autogen-agentchat / autogen-ext。
2. 创建 Gemini OpenAI-compatible 的 model client。
3. 创建一个单 Agent：AssistantAgent。
4. 新增 POST /api/agent/run-once。
5. run-once 接收 userRequest，调用 AssistantAgent 生成一次回复。
6. 不让 Agent 使用工具。
7. 不让 Agent 修改文件。
8. 不执行命令。
9. 不生成真实 patch。
10. 返回模型回复。
11. Webview 增加 Debug action，可以从 Run 页测试单 Agent 调用。
12. npm run compile 通过。
13. Python Service 可以启动。
14. AutoGen 调用失败时返回明确错误。

本次不要做：

- 多 Agent Team
- RoundRobinGroupChat
- SelectorGroupChat
- WorkflowRunner
- Tool calling
- list_files/read_file 工具注入
- propose_patch 工具注入
- apply_patch
- run_command
- Git
- WebSocket run_stream 真实流
- 自动修改文件

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. agent-service/main.py
2. agent-service/adapters/autogen_adapter.py
3. agent-service/requirements.txt
4. agent-service/runtime/model_settings.py
5. src/runtime/RuntimeManager.ts
6. src/runtime/ExtensionApiClient.ts
7. src/webview/MessageDispatcher.ts
8. media/webview.html
9. media/webview-bridge.js
10. package.json

可以只读参考：
11. docs/04_AutoGen多Agent运行时详细设计.md
12. docs/05_Agent配置与Prompt模板详细设计.md
13. docs/03_Extension与AutoGenService通信接口详细设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要实现多 Agent。
不要实现 Tool calling。
不要实现 WorkflowRunner。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. agent-service/adapters/autogen_adapter.py
2. agent-service/main.py
3. agent-service/requirements.txt
4. agent-service/runtime/model_settings.py
5. src/runtime/ExtensionApiClient.ts
6. src/webview/MessageDispatcher.ts
7. media/webview.html
8. media/webview-bridge.js

必要时可以新增：
9. agent-service/api/agent.py
10. agent-service/schemas/agent.py
11. agent-service/runtime/model_client_factory.py
12. src/types/agentRun.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. src/tools 目录
4. config 目录
5. 不要大改 ToolServer / ToolRouter
6. 不要大改 RuntimeManager，除非只是增加 API 调用

============================================================
四、requirements.txt 要求
============================================================

检查 agent-service/requirements.txt。

必须包含：

fastapi
uvicorn
httpx
autogen-agentchat
autogen-ext[openai]

如果当前没有，添加。

不要固定太新的不可用版本。
如果已有版本锁定，尽量保持。

============================================================
五、AutoGenAdapter 要求
============================================================

实现或修正 agent-service/adapters/autogen_adapter.py。

必须提供：

class AutoGenAdapter:
    def __init__(self, model_settings):
        ...

    async def run_once(self, user_request: str, system_prompt: str | None = None) -> dict:
        ...

run_once 要求：

1. user_request 不能为空。
2. 从 model_settings 读取：
   - provider
   - base_url
   - model
   - api_key
3. 当前只支持 provider = openai_compatible。
4. 使用 autogen_ext.models.openai.OpenAIChatCompletionClient。
5. base_url 使用 Gemini OpenAI-compatible：
   https://generativelanguage.googleapis.com/v1beta/openai/
6. model 默认 gemini-3-flash-preview。
7. api_key 来自 AUTOGEN_IDE_MODEL_API_KEY。
8. 创建 AssistantAgent。
9. 不传 tools。
10. 不允许 Agent 执行任何工具。
11. 调用 agent.run(task=user_request) 或当前 AutoGen 版本推荐的等价 API。
12. 返回文本结果。
13. 关闭 model client，如果 AutoGen client 需要 close。
14. 捕获异常，返回明确错误。

返回成功格式：

{
  "ok": true,
  "model": "gemini-3-flash-preview",
  "agent": "DebugAssistantAgent",
  "content": "..."
}

返回失败格式：

{
  "ok": false,
  "error": {
    "code": "AUTOGEN_RUN_FAILED",
    "message": "..."
  }
}

API Key 安全要求：

1. 不要 print API Key。
2. 不要把 API Key 放入返回值。
3. 异常 message 中如果包含 API Key，要脱敏。
4. 不要保存 API Key 到文件。

============================================================
六、ModelClientFactory 要求
============================================================

如果新增 agent-service/runtime/model_client_factory.py，提供：

create_openai_compatible_client(model_settings)

要求：

1. 使用 OpenAIChatCompletionClient。
2. 参数包含：
   - model
   - api_key
   - base_url
3. 不要写死 OpenAI URL。
4. 不要写死 GPT 模型。
5. 默认使用 Gemini 配置。
6. 不要导入 VS Code 侧代码。

如果不新增 factory，也可以先写在 AutoGenAdapter 中，但代码要清晰，方便后续抽出。

============================================================
七、Python Service API 要求
============================================================

新增接口：

POST /api/agent/run-once

请求：

{
  "userRequest": "用一句话说明你能做什么",
  "systemPrompt": "你是一个代码助手，只能回答文本，不要调用工具。"
}

返回成功：

{
  "ok": true,
  "result": {
    "model": "gemini-3-flash-preview",
    "agent": "DebugAssistantAgent",
    "content": "..."
  }
}

返回失败：

{
  "ok": false,
  "error": {
    "code": "AUTOGEN_RUN_FAILED",
    "message": "..."
  }
}

错误处理：

1. userRequest 为空：
   code = EMPTY_USER_REQUEST

2. API Key 缺失：
   code = MODEL_API_KEY_MISSING

3. provider 不支持：
   code = MODEL_PROVIDER_NOT_SUPPORTED

4. AutoGen 调用失败：
   code = AUTOGEN_RUN_FAILED

5. 模型返回空：
   code = MODEL_RESPONSE_EMPTY

要求：

1. 不使用 WebSocket。
2. 不使用工具。
3. 不读 workspace 文件。
4. 不执行命令。
5. 不生成 patch。
6. 不调用 ToolGateway。
7. 不返回 API Key。

============================================================
八、ExtensionApiClient 要求
============================================================

修改 src/runtime/ExtensionApiClient.ts。

新增：

runAgentOnce(serviceUrl: string, payload: unknown): Promise<unknown>

请求：

POST `${serviceUrl}/api/agent/run-once`

body：

{
  "userRequest": "...",
  "systemPrompt": "..."
}

要求：

1. 超时 60000ms。
2. 返回 JSON。
3. HTTP 非 2xx 抛 Error。
4. 不打印 API Key。
5. 不实现 WebSocket。

============================================================
九、MessageDispatcher 要求
============================================================

修改 src/webview/MessageDispatcher.ts。

新增 action：

agent.debug.runOnce

逻辑：

1. 从 message.payload.fields 读取：
   - task.userRequest
   - agent.systemPrompt
2. userRequest 优先使用 task.userRequest。
3. 如果 task.userRequest 为空，可以使用固定测试文本：
   用一句话说明你已经成功连接到 Gemini。
4. systemPrompt 可以使用 Agent 页当前 systemPrompt。
5. 调用 RuntimeManager 或 ExtensionApiClient 的 runAgentOnce。
6. 如果 Runtime 未启动，返回 RUNTIME_NOT_RUNNING。
7. 成功返回：

{
  "ok": true,
  "type": "agent.debug.runOnce.result",
  "requestId": "...",
  "payload": {
    "message": "Agent run completed",
    "result": {...}
  }
}

8. 失败返回明确错误。

不要破坏 agent.save / agents.load 等已有配置保存逻辑。

============================================================
十、RuntimeManager 要求
============================================================

如果 RuntimeManager 目前统一封装 Python Service API，则新增：

runAgentOnce(payload: unknown): Promise<unknown>

逻辑：

1. 确认 Runtime 正在运行。
2. 调用 ExtensionApiClient.runAgentOnce(serviceUrl, payload)。
3. 返回结果。

如果当前架构是 MessageDispatcher 直接调用 ExtensionApiClient，也可以保持，但不要重复代码太多。

============================================================
十一、Webview 要求
============================================================

修改 media/webview.html 和 media/webview-bridge.js。

在 Run 页或 Agents 页增加一个 Debug 按钮：

<button data-action="agent.debug.runOnce">Debug 单 Agent 调用</button>

建议放在 Run 页任务输入区旁边，或者 Agents 页测试 Agent 附近。

点击后：

1. 发送 agent.debug.runOnce。
2. event-log 显示：
   → sent: agent.debug.runOnce

收到成功 response 后：

1. event-log 显示：
   ← response: agent.debug.runOnce.result
2. 显示模型回复内容，最多显示前 3000 字符。
3. 如果有 Run 页 Message 区，可以追加一条：
   DebugAssistantAgent: ...

收到失败 response 后：

1. event-log 显示错误 code 和 message。
2. 不显示 API Key。

不要大改 UI。

============================================================
十二、安全要求
============================================================

必须保证：

1. 本次 AutoGen Agent 不使用 tools。
2. Agent 不能读文件。
3. Agent 不能写文件。
4. Agent 不能执行命令。
5. Agent 不能应用 patch。
6. API Key 不返回 Webview。
7. API Key 不进入 event-log。
8. API Key 不进入 console。
9. systemPrompt 不包含 API Key。
10. userRequest 可以进入模型，这是用户输入。

============================================================
十三、不要做的事情
============================================================

本次不要做：

1. 不要实现多 Agent。
2. 不要实现 Team。
3. 不要实现 WorkflowRunner。
4. 不要实现 tool calling。
5. 不要把 ToolGateway 注入 AutoGen。
6. 不要实现 run_stream。
7. 不要实现 WebSocket 真实模型流。
8. 不要生成真实 patch。
9. 不要应用 patch。
10. 不要执行命令。
11. 不要做 Git 操作。
12. 不要修改 Demo / prototype。
13. 不要修改 docs。

============================================================
十四、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. Python Service 可以启动。
3. /api/model/health 仍然可用。
4. /api/agent/run-once 可以调用 AutoGen AssistantAgent。
5. /api/agent/run-once 使用 Gemini OpenAI-compatible 配置。
6. /api/agent/run-once 不使用 tools。
7. /api/agent/run-once 不返回 API Key。
8. Webview 点击 agent.debug.runOnce 可以看到模型回复。
9. Runtime 未启动时返回 RUNTIME_NOT_RUNNING。
10. API Key 缺失时返回 MODEL_API_KEY_MISSING。
11. 空请求时返回 EMPTY_USER_REQUEST 或使用安全默认测试文本。
12. Settings / Agents / Team / Workflow / Tools 配置保存不受影响。
13. ToolServer / ToolGateway 不受影响。
14. 没有实现多 Agent / WorkflowRunner / tool calling。
15. 没有修改 Demo / prototype / docs。

运行验收命令：

npm run compile

Python 手动测试：

1. 先在 Settings 保存 Gemini API Key。
2. 点击 runtime.start。
3. 测试模型健康：
   POST http://127.0.0.1:8765/api/model/health

4. 测试单 Agent：
   POST http://127.0.0.1:8765/api/agent/run-once

请求 JSON：

{
  "userRequest": "用一句话说明你已经成功连接到 Gemini。",
  "systemPrompt": "你是一个简洁的代码助手。"
}

预期返回：

{
  "ok": true,
  "result": {
    "content": "..."
  }
}

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. AutoGenAdapter 如何创建模型客户端。
5. AutoGenAdapter 是否使用 Gemini OpenAI-compatible。
6. /api/agent/run-once 是否可用。
7. Webview agent.debug.runOnce 是否可用。
8. npm run compile 是否通过。
9. Python run-once 是否测试通过。
10. 是否确认没有 tools / 多 Agent / WorkflowRunner。
11. 是否确认 API Key 没有进入 Webview / event-log / console。
12. 下一步建议执行哪个 Task。