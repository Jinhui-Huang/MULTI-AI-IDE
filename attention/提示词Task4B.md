你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 4B：实现 Extension ⇄ Python AutoGen Service 的 HTTP task.create placeholder 联调。

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

Task 4A 已完成：
- RuntimeManager 可以启动 / 停止 / 重启 Python Service
- Python FastAPI placeholder Service 可以启动
- GET /api/runtime/health 可以返回健康状态
- runtime.start / runtime.stop / runtime.restart / runtime.health 可以从 Webview 调用

本次只做 HTTP task.create placeholder 联调。
不要接真实 AutoGen。
不要创建 AssistantAgent。
不要实现 WebSocket。
不要实现真实文件工具、Diff、Git、Terminal。
不要实现真实模型调用。

============================================================
一、本次目标
============================================================

实现 Run 页 task.create 从 Webview 到 Python Service 的完整 HTTP placeholder 链路：

Webview Run Tab
  ↓ task.create
MessageDispatcher
  ↓ RuntimeManager / ExtensionApiClient
Python AutoGen Service
  ↓ POST /api/tasks
返回 placeholder taskId
  ↓
Webview event-log 显示 task 创建成功

必须完成：

1. Python Service 增加 POST /api/tasks。
2. Python Service 增加 GET /api/tasks/{task_id}。
3. Python Service 内部维护内存 TaskStore placeholder。
4. ExtensionApiClient 增加 createTask / getTask。
5. MessageDispatcher 的 task.create 不再只是本地 placeholder，而是调用 Python Service。
6. 如果 Runtime 未启动，task.create 要返回明确错误或提示先启动 Runtime。
7. Run 页点击“发送给 AutoGen Team”后，能创建 placeholder task。
8. Webview 日志能显示 taskId。
9. npm run compile 通过。
10. Python 文件基础语法检查通过。

本次不要做：

- 真实 AutoGen
- Gemini 调用
- WebSocket
- Agent 执行
- Workflow 执行
- ToolServer
- 文件读取
- Diff / Patch
- Terminal
- Git

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. src/webview/MessageDispatcher.ts
2. src/runtime/RuntimeManager.ts
3. src/runtime/ExtensionApiClient.ts
4. src/storage/ConfigStore.ts
5. media/webview.html
6. media/webview-bridge.js
7. agent-service/main.py
8. package.json

可以只读参考：
9. docs/03_Extension与AutoGenService通信接口详细设计.md
10. docs/09_Task任务状态机与WebSocket事件详细设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要接真实 AutoGen。
不要实现 WebSocket。
不要实现真实工具。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. src/runtime/ExtensionApiClient.ts
2. src/runtime/RuntimeManager.ts
3. src/webview/MessageDispatcher.ts
4. media/webview-bridge.js
5. media/webview.html
6. agent-service/main.py

必要时可以新增或修改：
7. agent-service/runtime/task_manager.py
8. agent-service/schemas/task.py
9. agent-service/api/tasks.py
10. src/types/task.ts
11. src/types/messages.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. src/tools 目录
4. src/runtime/WebSocketClient.ts，除非编译必须小修
5. config 目录

============================================================
四、Python Service 要求
============================================================

修改 agent-service/main.py，或者拆分到 agent-service/api/tasks.py / runtime/task_manager.py。

必须实现：

POST /api/tasks

请求 JSON 示例：

{
  "userRequest": "帮我给当前 Spring Boot 项目增加 JWT 登录接口",
  "fields": {
    "task.teamId": "java-spring-team",
    "task.workflowId": "code-edit",
    "task.mode": "semi_auto",
    "task.targetAgent": "current",
    "task.userRequest": "..."
  },
  "workspaceRoot": "...",
  "source": "vscode-webview"
}

返回 JSON：

{
  "ok": true,
  "taskId": "task_xxx",
  "status": "created",
  "message": "Task created placeholder",
  "task": {
    "id": "task_xxx",
    "status": "created",
    "userRequest": "...",
    "teamId": "java-spring-team",
    "workflowId": "code-edit",
    "mode": "semi_auto",
    "targetAgent": "current",
    "createdAt": "..."
  }
}

必须实现：

GET /api/tasks/{task_id}

返回：

{
  "ok": true,
  "task": {...}
}

如果 task 不存在，返回 404：

{
  "ok": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task not found: task_xxx"
  }
}

TaskStore 要求：

1. 可以先使用内存 dict。
2. 不需要持久化。
3. taskId 使用 task_ + 时间戳 + 随机短 id。
4. createdAt 使用 ISO 时间字符串。
5. status 初始为 created。
6. 不要调用 AutoGen。
7. 不要读取文件。
8. 不要执行命令。

============================================================
五、ExtensionApiClient 要求
============================================================

修改 src/runtime/ExtensionApiClient.ts。

新增：

1. createTask(serviceUrl: string, payload: unknown): Promise<unknown>
2. getTask(serviceUrl: string, taskId: string): Promise<unknown>

createTask 请求：

POST `${serviceUrl}/api/tasks`

headers:

Content-Type: application/json

body 为 JSON.stringify(payload)

要求：

1. 超时时间 5000ms。
2. 返回 JSON。
3. HTTP 非 2xx 时抛出 Error，message 包含 status 和 response text。
4. 网络失败时抛出带 message 的 Error。
5. 不实现 WebSocket。

getTask 请求：

GET `${serviceUrl}/api/tasks/${taskId}`

要求同上。

============================================================
六、RuntimeManager 要求
============================================================

修改 src/runtime/RuntimeManager.ts。

需要提供：

1. getServiceUrl(): Promise<string>
2. isRunning(): boolean
3. createTask(payload: unknown): Promise<unknown>
4. getTask(taskId: string): Promise<unknown>

createTask 逻辑：

1. 如果 RuntimeManager 当前没有 running 进程，可以先尝试 health。
2. 如果 health 成功，允许创建任务。
3. 如果 health 失败，返回明确错误：
   RUNTIME_NOT_RUNNING
   message: Runtime is not running. Please start Runtime first.
4. 如果 Runtime 正常，调用 ExtensionApiClient.createTask。

注意：

- 不要在 task.create 时自动启动 Runtime。
- Runtime 启动仍然由 runtime.start 按钮控制。
- 不要接 WebSocket。

============================================================
七、MessageDispatcher 要求
============================================================

修改 src/webview/MessageDispatcher.ts。

task.create 不再是简单 placeholder。

task.create 处理逻辑：

1. 从 message.payload.fields 读取 Run 页字段。
2. 取出：
   - task.userRequest
   - task.teamId
   - task.workflowId
   - task.mode
   - task.targetAgent
3. 构造 createTask payload。
4. 调用 RuntimeManager.createTask。
5. 成功返回：

{
  "ok": true,
  "type": "task.create.result",
  "requestId": "...",
  "payload": {
    "message": "Task created",
    "taskId": "task_xxx",
    "task": {...},
    "serviceResponse": {...}
  }
}

6. 如果 Runtime 未启动，返回：

{
  "ok": false,
  "type": "task.create.result",
  "requestId": "...",
  "error": {
    "code": "RUNTIME_NOT_RUNNING",
    "message": "Runtime is not running. Please start Runtime first."
  }
}

7. 如果 Python Service 返回错误，返回：

{
  "ok": false,
  "type": "task.create.result",
  "requestId": "...",
  "error": {
    "code": "TASK_CREATE_FAILED",
    "message": "..."
  }
}

其他 task action 仍然 placeholder：

- task.pause
- task.resume
- task.cancel
- task.rerunCurrentAgent
- task.switchAgent
- task.openHistory
- task.openContext
- task.copyLog
- task.userMessage

不要破坏 Settings / Agents / Team / Workflow / Tools action。

============================================================
八、Webview 要求
============================================================

修改 media/webview-bridge.js 和必要的 media/webview.html。

要求：

1. 点击 task.create 后，event-log 显示：
   → sent: task.create

2. 如果成功，event-log 显示：
   ← response: task.create.result
   Task created: task_xxx

3. 如果失败且 Runtime 未启动，event-log 显示：
   Runtime is not running. Please start Runtime first.

4. 如果页面有任务状态区，可以更新：
   Current Task: task_xxx
   Status: created

如果没有任务状态区，可以新增：

<div id="current-task-status">Current Task: none</div>

5. 不要破坏已有 Runtime 状态显示。
6. 不要破坏 Settings / Agents / Team / Workflow / Tools 回填逻辑。

============================================================
九、错误处理要求
============================================================

必须处理：

1. Runtime 未启动。
2. serviceUrl 配置为空。
3. Python Service 无响应。
4. POST /api/tasks 返回非 2xx。
5. task.userRequest 为空。

如果 task.userRequest 为空，MessageDispatcher 可以直接返回：

{
  "ok": false,
  "type": "task.create.result",
  "requestId": "...",
  "error": {
    "code": "EMPTY_USER_REQUEST",
    "message": "Task request is empty."
  }
}

不要把空任务发送给 Python Service。

============================================================
十、不要做的事情
============================================================

本次不要做：

1. 不要导入 autogen。
2. 不要创建 AssistantAgent。
3. 不要读取 Gemini API Key。
4. 不要调用 Gemini。
5. 不要实现真实 Agent 执行。
6. 不要实现 WorkflowRunner。
7. 不要实现 WebSocket。
8. 不要实现 ToolServer。
9. 不要读取 workspace 文件。
10. 不要生成 patch。
11. 不要应用 patch。
12. 不要执行命令。
13. 不要做 Git 操作。
14. 不要修改 Demo / prototype。
15. 不要修改 docs。

============================================================
十一、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. python agent-service/main.py 可以启动。
3. GET /api/runtime/health 返回 ok=true。
4. POST /api/tasks 可以返回 placeholder taskId。
5. GET /api/tasks/{taskId} 可以返回该 task。
6. Webview 点击 runtime.start 可以启动服务。
7. Runtime 启动后，Run 页点击 task.create 可以创建 task。
8. Webview event-log 显示 taskId。
9. 如果 Runtime 未启动，task.create 返回 RUNTIME_NOT_RUNNING。
10. 如果任务输入为空，task.create 返回 EMPTY_USER_REQUEST。
11. task.create 没有调用 AutoGen / Gemini。
12. Settings / Agents / Team / Workflow / Tools 已有功能不受影响。
13. 没有接 WebSocket / 文件工具 / Diff / Git / Terminal。
14. 没有修改 Demo / prototype / docs。

运行验收命令：

npm run compile

Python 手动测试：

python agent-service/main.py --host 127.0.0.1 --port 8765

另一个终端测试：

curl http://127.0.0.1:8765/api/runtime/health

curl -X POST http://127.0.0.1:8765/api/tasks ^
  -H "Content-Type: application/json" ^
  -d "{\"userRequest\":\"test task\",\"fields\":{\"task.teamId\":\"java-spring-team\",\"task.workflowId\":\"code-edit\",\"task.mode\":\"semi_auto\"},\"source\":\"manual\"}"

如果当前环境没有 curl，可以用浏览器测试 health，用 VS Code Webview 测试 task.create。

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. Python Service 新增了哪些接口。
5. RuntimeManager 新增了哪些方法。
6. ExtensionApiClient 新增了哪些方法。
7. task.create 是否能调用 Python Service。
8. Runtime 未启动时是否返回 RUNTIME_NOT_RUNNING。
9. 空任务是否返回 EMPTY_USER_REQUEST。
10. npm run compile 是否通过。
11. Python health / task create 是否测试通过。
12. 是否确认没有接 AutoGen / Gemini / WebSocket / 真实工具。
13. 下一步建议执行哪个 Task。