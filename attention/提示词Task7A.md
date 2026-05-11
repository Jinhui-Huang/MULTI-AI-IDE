你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 7A：实现 Gemini OpenAI-compatible 模型配置同步与模型健康检查。

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

Task 3A 已完成：
- Settings 配置可以保存和加载
- API Key 使用 VS Code SecretStorage
- 普通 settings 使用 VS Code globalState
- 默认模型配置使用 Gemini OpenAI-compatible：
  - settings.provider = openai_compatible
  - settings.baseUrl = https://generativelanguage.googleapis.com/v1beta/openai/
  - settings.model = gemini-3-flash-preview
  - settings.fallbackModel = gemini-3-flash-preview

Task 3B～3D 已完成：
- Agents / Team / Workflow / Tools 配置可以保存和加载

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

本次只做模型配置同步和 Gemini 连接测试。
不要接 AutoGen AssistantAgent。
不要实现真实 Agent 执行。
不要实现 WorkflowRunner。
不要把 API Key 写入日志。
不要把 API Key 发送给 Webview。

============================================================
一、本次目标
============================================================

实现从 VS Code Extension 到 Python Service 的模型配置同步，并实现 Gemini OpenAI-compatible 模型健康检查。

目标链路：

Settings Tab
  ↓ settings.save
VS Code SecretStorage 保存 Gemini API Key
  ↓ runtime.start
RuntimeManager 读取 Settings + SecretStorage
  ↓ 环境变量传给 Python Service
Python Service
  ↓ /api/model/health
使用 OpenAI-compatible Chat Completions 测试 Gemini
  ↓
返回模型健康状态给 Extension/Webview

必须完成：

1. RuntimeManager 启动 Python Service 时，把模型配置通过环境变量传给 Python Service。
2. Python Service 读取模型环境变量。
3. Python Service 增加 GET /api/model/config-safe。
4. Python Service 增加 POST /api/model/health。
5. ExtensionApiClient 增加 modelHealth。
6. MessageDispatcher 的 settings.testModel 不再 placeholder，而是真实调用 Python /api/model/health。
7. Webview 点击“测试模型连接”后能看到成功或失败结果。
8. API Key 不允许进入 event-log。
9. API Key 不允许进入 Webview response。
10. npm run compile 通过。
11. Python 基础语法检查通过。

本次不要做：
- AutoGen AssistantAgent
- autogen-agentchat 导入
- WorkflowRunner
- Agent 执行
- Tool calling
- 文件工具新功能
- WebSocket 新逻辑

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. src/runtime/RuntimeManager.ts
2. src/runtime/ExtensionApiClient.ts
3. src/webview/MessageDispatcher.ts
4. src/storage/ConfigStore.ts
5. src/storage/SecretStore.ts
6. src/extension.ts
7. media/webview.html
8. media/webview-bridge.js
9. agent-service/main.py
10. agent-service/requirements.txt
11. package.json

可以只读参考：
12. docs/03_Extension与AutoGenService通信接口详细设计.md
13. docs/04_AutoGen多Agent运行时详细设计.md
14. docs/10_配置存储与SecretStorage详细设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要实现 AutoGen Agent。
不要实现 WorkflowRunner。
不要实现新工具能力。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. src/runtime/RuntimeManager.ts
2. src/runtime/ExtensionApiClient.ts
3. src/webview/MessageDispatcher.ts
4. src/storage/SecretStore.ts
5. src/storage/ConfigStore.ts
6. src/extension.ts
7. media/webview-bridge.js
8. agent-service/main.py
9. agent-service/requirements.txt

必要时可以新增：
10. agent-service/runtime/model_settings.py
11. agent-service/api/model.py
12. agent-service/schemas/model.py
13. src/types/model.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. src/tools 目录
4. config 目录
5. 不要大改已完成的 ToolServer / ToolRouter

============================================================
四、Extension RuntimeManager 要求
============================================================

修改 src/runtime/RuntimeManager.ts。

runtime.start 启动 Python Service 时，需要读取：

普通 Settings：

settings.provider
settings.baseUrl
settings.model
settings.fallbackModel
settings.serviceUrl
settings.host
settings.port
settings.pythonPath
settings.logLevel

SecretStorage：

autogenAgent.apiKey

要求：

1. 使用 ConfigStore.loadSettings() 读取普通配置。
2. 使用 SecretStore.getApiKey() 读取 API Key。
3. 启动 Python Service 时通过 env 传递模型配置。
4. 不要把 API Key 打印到 console。
5. 不要把 API Key 传给 Webview。
6. 如果 API Key 不存在，仍允许 Python Service 启动，但 /api/model/health 应返回 MODEL_API_KEY_MISSING。

传给 Python Service 的环境变量：

AUTOGEN_IDE_MODEL_PROVIDER=openai_compatible
AUTOGEN_IDE_MODEL_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
AUTOGEN_IDE_MODEL_NAME=gemini-3-flash-preview
AUTOGEN_IDE_FALLBACK_MODEL=gemini-3-flash-preview
AUTOGEN_IDE_MODEL_API_KEY=<SecretStorage 中的 key>
AUTOGEN_IDE_LOG_LEVEL=info
AUTOGEN_IDE_TOOL_SERVER_URL=http://127.0.0.1:18765

注意：

- 不要使用 OPENAI_API_KEY 作为主环境变量，避免误导。
- 可以额外兼容 OPENAI_API_KEY，但主变量必须是 AUTOGEN_IDE_MODEL_API_KEY。
- 不要在日志里输出 AUTOGEN_IDE_MODEL_API_KEY。
- runtime.health 返回中不要包含 API Key。

runtime.health 返回 status 中可以包含：

{
  "model": {
    "provider": "openai_compatible",
    "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai/",
    "model": "gemini-3-flash-preview",
    "apiKeyConfigured": true
  }
}

不能包含 apiKey 明文。

============================================================
五、Python Service 模型配置要求
============================================================

在 Python Service 中实现模型配置读取。

可以在 agent-service/runtime/model_settings.py 中实现：

class ModelSettings:
    provider: str
    base_url: str
    model: str
    fallback_model: str
    api_key_configured: bool

函数：

load_model_settings_from_env()

读取环境变量：

AUTOGEN_IDE_MODEL_PROVIDER
AUTOGEN_IDE_MODEL_BASE_URL
AUTOGEN_IDE_MODEL_NAME
AUTOGEN_IDE_FALLBACK_MODEL
AUTOGEN_IDE_MODEL_API_KEY

默认值：

provider = openai_compatible
base_url = https://generativelanguage.googleapis.com/v1beta/openai/
model = gemini-3-flash-preview
fallback_model = gemini-3-flash-preview

要求：

1. 不要在返回 safe config 时包含 API Key。
2. 只返回 apiKeyConfigured = true / false。
3. 不要 print API Key。
4. 不要写入文件。

============================================================
六、Python /api/model/config-safe 要求
============================================================

新增接口：

GET /api/model/config-safe

返回：

{
  "ok": true,
  "model": {
    "provider": "openai_compatible",
    "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai/",
    "model": "gemini-3-flash-preview",
    "fallbackModel": "gemini-3-flash-preview",
    "apiKeyConfigured": true
  }
}

要求：

1. 不能返回 API Key。
2. 如果 API Key 不存在，apiKeyConfigured=false。
3. 不调用 Gemini。
4. 不导入 AutoGen。

============================================================
七、Python /api/model/health 要求
============================================================

新增接口：

POST /api/model/health

请求 body 可以为空，也可以包含：

{
  "message": "ping"
}

逻辑：

1. 读取模型配置。
2. 如果 api_key 为空，返回：

{
  "ok": false,
  "error": {
    "code": "MODEL_API_KEY_MISSING",
    "message": "Model API key is not configured."
  }
}

3. 如果 base_url 为空，返回 MODEL_BASE_URL_MISSING。
4. 如果 model 为空，返回 MODEL_NAME_MISSING。
5. 使用 OpenAI-compatible Chat Completions 调用 Gemini。

推荐使用 httpx 直接请求，不要本次引入 OpenAI SDK。

请求地址：

POST {base_url}/chat/completions

注意：
base_url 可能以 / 结尾，也可能不以 / 结尾。
要安全拼接成：

https://generativelanguage.googleapis.com/v1beta/openai/chat/completions

headers：

Authorization: Bearer <api_key>
Content-Type: application/json

body：

{
  "model": "gemini-3-flash-preview",
  "messages": [
    {
      "role": "user",
      "content": "Reply with exactly: OK"
    }
  ],
  "max_tokens": 16,
  "temperature": 0
}

成功返回：

{
  "ok": true,
  "provider": "openai_compatible",
  "model": "gemini-3-flash-preview",
  "message": "Model health check passed",
  "responsePreview": "OK"
}

失败返回：

{
  "ok": false,
  "error": {
    "code": "MODEL_HEALTH_FAILED",
    "message": "...",
    "statusCode": 401
  }
}

要求：

1. 超时 15 秒。
2. 不要返回完整响应里可能包含的敏感信息。
3. 不要把 API Key 写入错误 message。
4. 如果 HTTP 非 2xx，返回 statusCode 和简短 body。
5. 如果网络失败，返回 MODEL_HEALTH_FAILED。
6. 不导入 AutoGen。
7. 不创建 AssistantAgent。

requirements.txt 需要包含：

httpx

如果已有 httpx，保持即可。

============================================================
八、ExtensionApiClient 要求
============================================================

修改 src/runtime/ExtensionApiClient.ts。

新增：

1. getModelConfigSafe(serviceUrl: string): Promise<unknown>
2. modelHealth(serviceUrl: string): Promise<unknown>

getModelConfigSafe：

GET `${serviceUrl}/api/model/config-safe`

modelHealth：

POST `${serviceUrl}/api/model/health`

请求 body：

{
  "message": "ping"
}

要求：

1. 超时 20000ms。
2. 返回 JSON。
3. HTTP 非 2xx 抛 Error，message 包含 status 和 response text。
4. 不打印 API Key。
5. 不实现 AutoGen。

============================================================
九、RuntimeManager 要求：modelHealth
============================================================

修改 src/runtime/RuntimeManager.ts。

新增：

modelHealth(): Promise<unknown>

逻辑：

1. 确认 Runtime 正在运行。
2. 如果没运行，返回或抛出 RUNTIME_NOT_RUNNING。
3. 调用 ExtensionApiClient.modelHealth(serviceUrl)。
4. 返回 Python Service 的结果。

如果 Runtime 未启动，不要自动启动。

============================================================
十、MessageDispatcher 要求
============================================================

修改 src/webview/MessageDispatcher.ts。

settings.testModel 不再 placeholder。

实现逻辑：

1. 调用 RuntimeManager.modelHealth()。
2. 成功返回：

{
  "ok": true,
  "type": "settings.testModel.result",
  "requestId": "...",
  "payload": {
    "message": "Model health check passed",
    "result": {...}
  }
}

3. 如果 Runtime 未启动：

{
  "ok": false,
  "type": "settings.testModel.result",
  "requestId": "...",
  "error": {
    "code": "RUNTIME_NOT_RUNNING",
    "message": "Runtime is not running. Please start Runtime first."
  }
}

4. 如果 API Key 缺失：

{
  "ok": false,
  "type": "settings.testModel.result",
  "requestId": "...",
  "error": {
    "code": "MODEL_API_KEY_MISSING",
    "message": "Model API key is not configured."
  }
}

5. 如果模型调用失败，返回 MODEL_HEALTH_FAILED。

要求：

1. 不要把 API Key 放进 response。
2. 不要破坏 settings.save / settings.load。
3. 不要破坏 runtime.start / runtime.health。
4. 不要破坏其他页面 action。

============================================================
十一、Webview 要求
============================================================

修改 media/webview-bridge.js。

收到 settings.testModel.result 时：

1. 如果 ok=true，event-log 显示：
   Model health check passed: gemini-3-flash-preview

2. 如果 ok=false，event-log 显示：
   Model health check failed: ERROR_CODE - message

3. 如果 Settings 页有模型状态区，可以更新：
   Model status: OK
   或：
   Model status: Failed

如果没有模型状态区，可以在 Settings 页增加：

<div id="model-status">Model status: unknown</div>

要求：

1. 不显示 API Key。
2. 不显示完整 HTTP Authorization header。
3. 不破坏 Settings 保存/加载。

============================================================
十二、错误码要求
============================================================

至少支持：

RUNTIME_NOT_RUNNING
MODEL_API_KEY_MISSING
MODEL_BASE_URL_MISSING
MODEL_NAME_MISSING
MODEL_HEALTH_FAILED
MODEL_RESPONSE_INVALID

错误格式：

{
  "ok": false,
  "error": {
    "code": "MODEL_HEALTH_FAILED",
    "message": "..."
  }
}

============================================================
十三、安全要求
============================================================

必须保证：

1. API Key 只从 SecretStorage 读取。
2. API Key 只通过环境变量传给本地 Python 子进程。
3. API Key 不返回 Webview。
4. API Key 不打印到 console。
5. API Key 不写入 event-log。
6. API Key 不写入 globalState。
7. Python /api/model/config-safe 不返回 API Key。
8. Python /api/model/health 错误信息不包含 API Key。
9. 不把 Gemini 原始响应全部刷到日志。
10. 不调用除配置 base_url 之外的其他 URL。

============================================================
十四、不要做的事情
============================================================

本次不要做：

1. 不要接 AutoGen。
2. 不要导入 autogen-agentchat。
3. 不要创建 AssistantAgent。
4. 不要实现 task.create 真实 Agent 执行。
5. 不要实现 WorkflowRunner。
6. 不要实现 Tool calling。
7. 不要实现 WebSocket 新逻辑。
8. 不要改 ToolServer。
9. 不要修改 Demo / prototype。
10. 不要修改 docs。

============================================================
十五、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. Python Service 可以启动。
3. runtime.start 会把 Gemini 配置传给 Python Service。
4. GET /api/model/config-safe 返回模型配置，且不包含 API Key。
5. POST /api/model/health 可以调用 Gemini OpenAI-compatible endpoint。
6. Settings 页点击“测试模型连接”可以返回成功或明确失败。
7. Runtime 未启动时 settings.testModel 返回 RUNTIME_NOT_RUNNING。
8. API Key 缺失时返回 MODEL_API_KEY_MISSING。
9. event-log 不显示 API Key。
10. Webview response 不包含 API Key。
11. settings.save / settings.load 不受影响。
12. runtime.start / runtime.health 不受影响。
13. ToolServer / ToolGateway 不受影响。
14. 没有接 AutoGen / AssistantAgent / WorkflowRunner。
15. 没有修改 Demo / prototype / docs。

运行验收命令：

npm run compile

手动测试建议：

1. 在 Settings 页填写：
   provider = openai_compatible
   baseUrl = https://generativelanguage.googleapis.com/v1beta/openai/
   model = gemini-3-flash-preview
   fallbackModel = gemini-3-flash-preview
   apiKey = 你的 Gemini API Key
   useSecretStorage = true

2. 点击保存设置。

3. 点击 runtime.start。

4. 浏览器打开：
   http://127.0.0.1:8765/api/model/config-safe

确认不包含 API Key。

5. 点击 Settings 页“测试模型连接”。

6. event-log 应显示：
   Model health check passed
   或明确错误。

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. RuntimeManager 如何传递模型配置。
5. Python Service 新增了哪些模型接口。
6. /api/model/config-safe 是否不包含 API Key。
7. /api/model/health 是否测试通过。
8. settings.testModel 是否真实调用 Python Service。
9. npm run compile 是否通过。
10. 是否确认 API Key 没有进入 event-log / response / globalState。
11. 是否确认没有接 AutoGen / AssistantAgent / WorkflowRunner。
12. 下一步建议执行哪个 Task。