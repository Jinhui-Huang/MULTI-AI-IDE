你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 6A：实现 Python Service 调用 VS Code Extension ToolServer 的 HTTP 工具网关联调。

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
- Tools / Safety 配置可以保存和加载

Task 4A～4C 已完成：
- Python Service 可以启动 / 停止 / 健康检查
- task.create 可以创建 placeholder task
- WebSocket placeholder event stream 可以转发到 Webview

Task 5A 已完成：
- list_files / read_file / search_code 已实现
- WorkspaceGuard 已实现
- 敏感文件拦截已实现
- workspace 外路径拦截已实现

Task 5B 已完成：
- propose_patch / open_diff / apply_patch / reject_patch 最小闭环已实现

Task 5C 已完成：
- run_command 最小安全闭环已实现
- allowlist / blocklist / 用户确认已实现

Task 5D 已完成：
- git_status / git_diff 只读工具已实现
- ToolRouter 已支持 Git 只读工具

本次只做 Python Service 调用 VS Code Extension 工具的 HTTP 网关。
不要接真实 AutoGen。
不要调用 Gemini。
不要创建 AssistantAgent。
不要实现 WorkflowRunner。
不要改动现有工具安全规则。

============================================================
一、本次目标
============================================================

实现链路：

Python Service
  ↓ HTTP POST
VS Code Extension ToolServer
  ↓
ToolRouter
  ↓
list_files / read_file / search_code / git_status / git_diff / propose_patch 等已有工具
  ↓
返回结果给 Python Service

必须完成：

1. Extension 侧 ToolServer 可以启动。
2. ToolServer 提供 POST /tools/call。
3. ToolServer 只监听 127.0.0.1。
4. ToolServer 调用现有 ToolRouter。
5. RuntimeManager 启动 Python Service 前或同时启动 ToolServer。
6. Python Service 增加 ToolGateway client。
7. Python Service 增加测试接口 POST /api/tools/call。
8. Python Service 的 /api/tools/call 会转发到 Extension ToolServer。
9. Webview 增加或复用 Debug action 测试 Python → Extension 工具链路。
10. npm run compile 通过。
11. Python 语法检查通过。

本次不要做：
- AutoGen tools 注入
- AssistantAgent
- Gemini 调用
- 真实 WorkflowRunner
- 真实 Agent 执行
- 新的工具能力
- 放宽安全规则
- 外网监听

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. src/tools/ToolServer.ts
2. src/tools/ToolRouter.ts
3. src/runtime/RuntimeManager.ts
4. src/runtime/ExtensionApiClient.ts
5. src/webview/MessageDispatcher.ts
6. src/extension.ts
7. src/storage/ConfigStore.ts
8. agent-service/main.py
9. package.json

可以只读参考：
10. docs/03_Extension与AutoGenService通信接口详细设计.md
11. docs/07_Tools工具系统与权限控制详细设计.md
12. docs/08_VSCode文件_Diff_Terminal_Git工具联调设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要接真实 AutoGen。
不要调用 Gemini。
不要实现新工具功能。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. src/tools/ToolServer.ts
2. src/tools/ToolRouter.ts
3. src/runtime/RuntimeManager.ts
4. src/webview/MessageDispatcher.ts
5. src/extension.ts
6. agent-service/main.py

必要时可以新增或修改：
7. agent-service/tools/tool_gateway.py
8. agent-service/schemas/tool.py
9. src/types/tools.ts
10. media/webview.html
11. media/webview-bridge.js

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. config 目录
4. 已有工具安全规则，除非是修 bug
5. 不要改 Python Service 为真实 AutoGen

============================================================
四、Extension ToolServer 要求
============================================================

检查或实现 src/tools/ToolServer.ts。

ToolServer 必须提供：

1. start(): Promise<{ host: string; port: number; url: string }>
2. stop(): Promise<void>
3. isRunning(): boolean
4. getUrl(): string | undefined

默认配置：

host = 127.0.0.1
port = 18765

只监听：

127.0.0.1

不能监听：

0.0.0.0

HTTP 接口：

POST /tools/call

请求：

{
  "tool": "read_file",
  "args": {
    "path": "pom.xml"
  },
  "requestId": "req_xxx"
}

返回：

ToolRouter.handleToolCall 的结果。

要求：

1. 只接受 POST /tools/call。
2. GET /health 返回：

{
  "ok": true,
  "service": "vscode-tool-server",
  "status": "running"
}

3. 非法 JSON 返回 400。
4. 未知路径返回 404。
5. 非 POST /tools/call 返回 405。
6. 工具异常必须返回 JSON，不要让 server 崩溃。
7. 不要把文件内容打印到 console。
8. 不要自动暴露到外网。

============================================================
五、ToolServer 安全要求
============================================================

ToolServer 调用 ToolRouter 时必须保留现有安全逻辑：

1. WorkspaceGuard 必须生效。
2. Sensitive File Guard 必须生效。
3. CommandGuard 必须生效。
4. PatchTools 安全检查必须生效。
5. GitTools 只读限制必须生效。
6. 不允许绕过 ToolRouter 直接调用工具。
7. 不允许添加任意命令执行接口。
8. 不允许传入 workspace 外路径成功。

本次可以先不加 token。
如果当前 ToolServer 已经有 token 机制，可以保留，但不要复杂化。

============================================================
六、RuntimeManager 要求
============================================================

修改 src/runtime/RuntimeManager.ts。

要求：

1. RuntimeManager 构造时可以接收 ToolServer，或内部创建 ToolServer。
2. runtime.start 时：
   - 先启动 ToolServer
   - 再启动 Python Service
   - 把 ToolServer URL 通过环境变量传给 Python Service

环境变量：

AUTOGEN_IDE_TOOL_SERVER_URL=http://127.0.0.1:18765

3. runtime.stop 时：
   - 停止 Python Service
   - 停止 ToolServer

4. runtime.restart 时：
   - stop
   - start

5. dispose 时：
   - 停止 WebSocket
   - 停止 Python Service
   - 停止 ToolServer

6. runtime.health 返回中增加 ToolServer 状态：

{
  "toolServer": {
    "running": true,
    "url": "http://127.0.0.1:18765"
  }
}

7. 如果 ToolServer 启动失败，runtime.start 返回 RUNTIME_START_FAILED。

8. 不要在 VS Code 插件 activate 时自动启动 ToolServer。
只有 runtime.start 才启动。

============================================================
七、Python ToolGateway 要求
============================================================

新增或实现：

agent-service/tools/tool_gateway.py

必须提供：

class ToolGateway:
    def __init__(self, base_url: str):
        ...

    async def call_tool(self, tool: str, args: dict | None = None, request_id: str | None = None) -> dict:
        ...

要求：

1. base_url 从环境变量读取：

AUTOGEN_IDE_TOOL_SERVER_URL

默认：

http://127.0.0.1:18765

2. 使用 httpx.AsyncClient。
3. POST 到：

{base_url}/tools/call

4. 请求 JSON：

{
  "tool": "read_file",
  "args": {...},
  "requestId": "..."
}

5. HTTP 非 2xx 返回错误。
6. 网络失败返回错误。
7. 不要调用 AutoGen。
8. 不要读取 Gemini API Key。
9. 不要绕过 ToolServer 直接读文件。

requirements.txt 如果没有 httpx，需要添加：

httpx

============================================================
八、Python Service API 要求
============================================================

修改 agent-service/main.py。

新增接口：

POST /api/tools/call

请求：

{
  "tool": "list_files",
  "args": {
    "dir": ".",
    "maxFiles": 20
  }
}

返回 ToolGateway.call_tool 结果。

示例成功返回：

{
  "ok": true,
  "tool": "list_files",
  "result": {
    "ok": true,
    "files": [...]
  }
}

示例失败返回：

{
  "ok": false,
  "error": {
    "code": "TOOL_GATEWAY_FAILED",
    "message": "..."
  }
}

新增接口：

GET /api/tools/health

逻辑：

1. 读取 ToolServer URL。
2. 请求 ToolServer GET /health。
3. 返回结果。

如果 ToolServer 不可用，返回：

{
  "ok": false,
  "error": {
    "code": "TOOL_SERVER_UNAVAILABLE",
    "message": "..."
  }
}

============================================================
九、MessageDispatcher Debug Action 要求
============================================================

修改 src/webview/MessageDispatcher.ts。

新增开发测试 action：

1. tool.gateway.health
2. tool.gateway.debugListFiles
3. tool.gateway.debugReadFile
4. tool.gateway.debugSearchCode

这些 action 要调用 Python Service 的接口，而不是直接调用 ToolRouter。

也就是说：

Webview
  ↓ tool.gateway.debugListFiles
Extension MessageDispatcher
  ↓ RuntimeManager / ExtensionApiClient
Python Service /api/tools/call
  ↓ ToolGateway
Extension ToolServer /tools/call
  ↓ ToolRouter
list_files

tool.gateway.health：

调用 Python Service：

GET /api/tools/health

tool.gateway.debugListFiles：

POST /api/tools/call

{
  "tool": "list_files",
  "args": {
    "dir": ".",
    "maxFiles": 20
  }
}

tool.gateway.debugReadFile：

从 fields["tool.debug.path"] 读取路径。
默认：

package.json

POST /api/tools/call

{
  "tool": "read_file",
  "args": {
    "path": "package.json"
  }
}

tool.gateway.debugSearchCode：

从 fields["tool.debug.query"] 读取 query。
默认：

function

POST /api/tools/call

{
  "tool": "search_code",
  "args": {
    "query": "function",
    "maxResults": 20
  }
}

如果 Runtime 未启动，返回：

RUNTIME_NOT_RUNNING

============================================================
十、ExtensionApiClient 要求
============================================================

修改 src/runtime/ExtensionApiClient.ts。

新增：

1. toolHealth(serviceUrl: string): Promise<unknown>
2. callToolViaService(serviceUrl: string, payload: unknown): Promise<unknown>

toolHealth：

GET `${serviceUrl}/api/tools/health`

callToolViaService：

POST `${serviceUrl}/api/tools/call`

要求：

1. 超时 5000ms。
2. 返回 JSON。
3. HTTP 非 2xx 抛 Error。
4. 不实现 WebSocket。

============================================================
十一、Webview Debug UI 要求
============================================================

可以在 Tools 页 Debug 区增加按钮：

<button data-action="tool.gateway.health">Debug ToolGateway Health</button>
<button data-action="tool.gateway.debugListFiles">Debug Gateway list_files</button>
<button data-action="tool.gateway.debugReadFile">Debug Gateway read_file</button>
<button data-action="tool.gateway.debugSearchCode">Debug Gateway search_code</button>

如果已有 tool.debug.path / tool.debug.query 输入框，可以复用。

要求：

1. 点击后 event-log 显示 sent。
2. 收到 response 后 event-log 显示结果摘要。
3. read_file 内容最多显示前 1000 字符。
4. search_code 最多显示前 20 条摘要。
5. 不要大改 UI。

============================================================
十二、错误码要求
============================================================

至少支持：

TOOL_SERVER_START_FAILED
TOOL_SERVER_UNAVAILABLE
TOOL_GATEWAY_FAILED
RUNTIME_NOT_RUNNING
UNKNOWN_TOOL
WORKSPACE_NOT_OPEN
PATH_OUTSIDE_WORKSPACE
SENSITIVE_FILE_BLOCKED

错误格式：

{
  "ok": false,
  "error": {
    "code": "TOOL_GATEWAY_FAILED",
    "message": "..."
  }
}

============================================================
十三、安全要求
============================================================

必须保证：

1. ToolServer 只监听 127.0.0.1。
2. Python Service 不能直接访问文件。
3. Python Service 只能通过 ToolGateway 调 Extension ToolServer。
4. Extension ToolServer 必须走 ToolRouter。
5. ToolRouter 必须保留 WorkspaceGuard。
6. read_file 不能读敏感文件。
7. read_file 不能读 workspace 外路径。
8. run_command 仍必须用户确认。
9. apply_patch 仍必须用户点击确认。
10. Git 仍然只读。
11. 不把 API Key 传给 Python ToolGateway。
12. 不把 API Key 打印到日志。

============================================================
十四、不要做的事情
============================================================

本次不要做：

1. 不要接 AutoGen。
2. 不要创建 AssistantAgent。
3. 不要调用 Gemini。
4. 不要实现真实 Agent 工具绑定。
5. 不要实现 WorkflowRunner。
6. 不要新增不安全工具。
7. 不要放宽命令执行安全规则。
8. 不要让 Python 直接读文件。
9. 不要监听 0.0.0.0。
10. 不要修改 Demo / prototype。
11. 不要修改 docs。

============================================================
十五、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. Python Service 可以启动。
3. runtime.start 会启动 ToolServer。
4. runtime.health 返回 toolServer.running=true。
5. ToolServer GET /health 返回 ok=true。
6. ToolServer POST /tools/call 可以调用 list_files。
7. Python Service GET /api/tools/health 可以访问 ToolServer health。
8. Python Service POST /api/tools/call 可以通过 ToolGateway 调用 list_files。
9. Webview 点击 tool.gateway.debugListFiles 可以显示结果。
10. Webview 点击 tool.gateway.debugReadFile 可以读取普通 workspace 文件。
11. Webview 读取敏感文件会返回 SENSITIVE_FILE_BLOCKED。
12. Webview 读取 workspace 外路径会返回 PATH_OUTSIDE_WORKSPACE。
13. Python Service 没有直接读文件。
14. ToolServer 只监听 127.0.0.1。
15. 没有接 AutoGen / Gemini / AssistantAgent。
16. 没有修改 Demo / prototype / docs。
17. 现有 Settings / Agents / Team / Workflow / Tools 配置保存不受影响。
18. 现有 list_files / read_file / search_code / patch / command / git 工具不受影响。

运行验收命令：

npm run compile

Python 手动测试：

1. 在 VS Code Webview 点击 runtime.start。
2. 浏览器打开：
   http://127.0.0.1:18765/health
3. 浏览器打开：
   http://127.0.0.1:8765/api/tools/health

如果有 curl：

curl -X POST http://127.0.0.1:8765/api/tools/call ^
  -H "Content-Type: application/json" ^
  -d "{\"tool\":\"list_files\",\"args\":{\"dir\":\".\",\"maxFiles\":20}}"

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. ToolServer 实现了哪些接口。
5. RuntimeManager 如何启动 ToolServer。
6. Python ToolGateway 如何调用 ToolServer。
7. Python Service 新增了哪些工具接口。
8. Webview Debug action 是否可用。
9. npm run compile 是否通过。
10. Python /api/tools/health 是否测试通过。
11. Python /api/tools/call 是否测试通过。
12. 是否确认没有接 AutoGen / Gemini / AssistantAgent。
13. 下一步建议执行哪个 Task。