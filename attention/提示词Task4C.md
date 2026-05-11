你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 4C：实现 Python AutoGen Service 到 Webview 的 WebSocket 事件流 placeholder 联调。

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

Task 4B 已完成：
- Python Service 已有 POST /api/tasks
- Python Service 已有 GET /api/tasks/{taskId}
- task.create 可以从 Webview 经过 Extension 调用 Python Service
- Python Service 可以返回 placeholder taskId
- Runtime 未启动时 task.create 返回 RUNTIME_NOT_RUNNING
- 空任务返回 EMPTY_USER_REQUEST

本次只做 WebSocket placeholder 事件流。
不要接真实 AutoGen。
不要创建 AssistantAgent。
不要调用 Gemini。
不要实现真实文件工具、Diff、Git、Terminal。
不要实现真实 WorkflowRunner。

============================================================
一、本次目标
============================================================

实现 Python Service → Extension → Webview 的实时事件流 placeholder。

目标链路：

Python AutoGen Service WebSocket
  ↓
VS Code Extension WebSocketClient
  ↓
AgentControlPanelProvider / MessageDispatcher
  ↓
Webview postMessage
  ↓
Run 页 event-log / Timeline / Agent 状态区域显示 placeholder 事件

必须完成：

1. Python Service 增加 WebSocket 接口：
   /ws/tasks/{task_id}

2. Python Service 在 task.create 后能为 task 生成一组 placeholder 事件。

3. Extension 侧实现 WebSocketClient 连接 Python Service。

4. RuntimeManager 增加 connectTaskEvents(taskId) 或等价方法。

5. task.create 成功后，Extension 自动连接该 task 的 WebSocket。

6. WebSocket 收到事件后转发给 Webview。

7. Webview 能显示这些事件：
   - task.status
   - agent.status
   - agent.message
   - tool.call
   - tool.result
   - patch.proposed
   - approval.required
   - task.completed

8. event-log 能显示实时事件。

9. Run 页如果已有 Timeline / Agent 状态 / Patch 卡片，尽量更新 placeholder 内容。

10. npm run compile 通过。

11. Python 文件基础语法检查通过。

本次不要做：

- 真实 AutoGen run_stream
- 真实 Agent 执行
- 真实工具调用
- 真实 patch
- 真实命令执行
- 真实审批恢复
- 真实文件读取
- 真实 Git 操作

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. src/webview/MessageDispatcher.ts
2. src/webview/AgentControlPanelProvider.ts
3. src/runtime/RuntimeManager.ts
4. src/runtime/ExtensionApiClient.ts
5. src/runtime/WebSocketClient.ts
6. media/webview.html
7. media/webview-bridge.js
8. agent-service/main.py
9. agent-service/runtime/ws_manager.py
10. agent-service/runtime/task_manager.py
11. package.json

可以只读参考：
12. docs/03_Extension与AutoGenService通信接口详细设计.md
13. docs/09_Task任务状态机与WebSocket事件详细设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要接真实 AutoGen。
不要调用 Gemini。
不要实现真实工具。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. src/runtime/WebSocketClient.ts
2. src/runtime/RuntimeManager.ts
3. src/runtime/ExtensionApiClient.ts
4. src/webview/MessageDispatcher.ts
5. src/webview/AgentControlPanelProvider.ts
6. media/webview-bridge.js
7. media/webview.html
8. agent-service/main.py
9. agent-service/runtime/ws_manager.py
10. agent-service/runtime/task_manager.py

必要时可以新增或修改：
11. agent-service/schemas/events.py
12. agent-service/schemas/task.py
13. src/types/events.ts
14. src/types/task.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. src/tools 目录
4. config 目录

============================================================
四、Python WebSocket 要求
============================================================

在 Python Service 中实现：

WebSocket:

/ws/tasks/{task_id}

连接规则：

1. 如果 task_id 不存在，WebSocket 接受后发送错误事件，然后关闭。
2. 如果 task_id 存在，连接成功后发送 task.status 事件。
3. 然后按顺序发送一组 placeholder 事件。
4. 每个事件之间可以 sleep 0.3～0.8 秒，模拟流式执行。
5. 最后发送 task.completed 事件。
6. 不要调用 AutoGen。
7. 不要调用 Gemini。
8. 不要执行工具。
9. 不要读取文件。

事件统一格式：

{
  "type": "agent.message",
  "taskId": "task_xxx",
  "seq": 1,
  "timestamp": "2026-05-11T00:00:00Z",
  "payload": {}
}

seq 要从 1 递增。

必须至少发送这些事件：

1. task.status

{
  "type": "task.status",
  "payload": {
    "status": "running"
  }
}

2. agent.status

{
  "type": "agent.status",
  "payload": {
    "agent": "PlannerAgent",
    "status": "running"
  }
}

3. agent.message

{
  "type": "agent.message",
  "payload": {
    "agent": "PlannerAgent",
    "content": "我将先拆分任务并生成执行计划。"
  }
}

4. approval.required

{
  "type": "approval.required",
  "payload": {
    "approvalType": "plan",
    "title": "Plan approval required",
    "summary": "这是 placeholder 计划确认事件。"
  }
}

5. agent.status

{
  "type": "agent.status",
  "payload": {
    "agent": "CodebaseAgent",
    "status": "running"
  }
}

6. tool.call

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

7. tool.result

{
  "type": "tool.result",
  "payload": {
    "agent": "CodebaseAgent",
    "tool": "read_file",
    "summary": "placeholder file analysis completed"
  }
}

8. agent.status

{
  "type": "agent.status",
  "payload": {
    "agent": "DeveloperAgent",
    "status": "running"
  }
}

9. patch.proposed

{
  "type": "patch.proposed",
  "payload": {
    "patchId": "patch_placeholder",
    "files": [
      {
        "path": "src/main/java/example/AuthController.java",
        "changeType": "add"
      },
      {
        "path": "pom.xml",
        "changeType": "modify"
      }
    ],
    "summary": "placeholder patch proposed"
  }
}

10. task.completed

{
  "type": "task.completed",
  "payload": {
    "status": "completed",
    "summary": "Placeholder task event stream completed."
  }
}

============================================================
五、Python TaskManager 要求
============================================================

如果 agent-service/runtime/task_manager.py 已存在，补充：

1. get_task(task_id)
2. append_event(task_id, event)
3. list_events(task_id)
4. generate_placeholder_events(task_id)

如果当前 TaskStore 在 main.py 内部，也可以先保持简单，但建议整理到 TaskManager。

要求：

1. task.create 时创建 task。
2. WebSocket 根据 task_id 查 task。
3. placeholder 事件可以动态生成，不需要持久化。
4. 不要实现真实任务执行。

============================================================
六、Extension WebSocketClient 要求
============================================================

修改 src/runtime/WebSocketClient.ts。

要求：

1. 在 Node Extension Host 中使用明确 WebSocket 实现。

如果项目没有 ws 依赖，可以选择：

方案 A：使用 package.json 添加 ws 和 @types/ws。
方案 B：如果当前 VS Code Node 环境已有全局 WebSocket 且 compile 通过，可以暂时使用，但必须类型安全。

推荐方案 A：

npm install ws
npm install -D @types/ws

然后：

import WebSocket from "ws";

2. WebSocketClient 至少提供：

connect(url: string, onEvent: (event: unknown) => void, onError?: (error: Error) => void): void

close(): void

isConnected(): boolean

3. 连接打开时 console.log：
   WebSocket connected

4. 收到 message 时：
   JSON.parse
   调用 onEvent(event)

5. JSON 解析失败时：
   调用 onError 或 console.warn

6. 连接关闭时：
   console.log WebSocket closed

7. 本次不需要复杂重连。
8. 本次不需要 sinceSeq。
9. 本次不需要认证 token。

============================================================
七、RuntimeManager 要求
============================================================

修改 src/runtime/RuntimeManager.ts。

增加：

1. connectTaskEvents(taskId: string, onEvent: (event: unknown) => void): Promise<void>
2. disconnectTaskEvents(): void

逻辑：

1. 从 settings.serviceUrl 获取 serviceUrl。
2. 把 http://127.0.0.1:8765 转成 ws://127.0.0.1:8765。
3. 连接：
   ws://127.0.0.1:8765/ws/tasks/{taskId}
4. 收到事件后调用 onEvent。
5. 如果已有 WebSocket 连接，先关闭旧连接。
6. stop Runtime 时关闭 WebSocket。
7. dispose 时关闭 WebSocket。

不要实现自动重连。

============================================================
八、MessageDispatcher / Provider 转发要求
============================================================

task.create 成功后，需要自动连接 WebSocket。

有两种实现方式，选当前项目最简单的一种：

方案 A：
MessageDispatcher 在 task.create 成功后调用 RuntimeManager.connectTaskEvents，
收到 event 后通过回调让 Provider postMessage 给 Webview。

方案 B：
MessageDispatcher 返回 taskId 后，Webview 发送 task.events.connect，Extension 再连接 WebSocket。

推荐方案 A，但如果当前架构不方便，可以用方案 B。

无论哪种方案，都必须保证 Webview 最终能收到事件。

转发给 Webview 的消息格式：

{
  "ok": true,
  "type": "task.event",
  "payload": {
    "event": {
      "type": "agent.message",
      "taskId": "task_xxx",
      "seq": 1,
      "timestamp": "...",
      "payload": {}
    }
  }
}

如果 WebSocket 错误：

{
  "ok": false,
  "type": "task.event.error",
  "error": {
    "code": "TASK_EVENT_STREAM_ERROR",
    "message": "..."
  }
}

============================================================
九、Webview 显示要求
============================================================

修改 media/webview-bridge.js。

必须处理：

1. type = task.event

收到后：

- 写入 event-log：
  event: agent.message
- 如果 payload.event.type 是 agent.message，显示：
  PlannerAgent: 我将先拆分任务并生成执行计划。

- 如果 payload.event.type 是 agent.status，更新 Agent 状态区，或至少写入日志：
  PlannerAgent -> running

- 如果 payload.event.type 是 tool.call，写入：
  Tool call: read_file

- 如果 payload.event.type 是 tool.result，写入：
  Tool result: read_file

- 如果 payload.event.type 是 patch.proposed，写入：
  Patch proposed: patch_placeholder

- 如果 payload.event.type 是 approval.required，写入：
  Approval required: plan

- 如果 payload.event.type 是 task.completed，写入：
  Task completed

2. type = task.event.error

写入 event-log：
Task event stream error: ...

如果 Run 页已有这些区域，尽量更新：

- Agent 状态区
- Timeline 区
- Tool Call 区
- Patch / Diff 区
- Current Task 状态区

如果没有稳定结构，不要大改 UI，先写 event-log 即可。

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
7. 不要实现真实工具调用。
8. 不要读取 workspace 文件。
9. 不要生成真实 patch。
10. 不要应用 patch。
11. 不要执行命令。
12. 不要做 Git 操作。
13. 不要实现复杂重连。
14. 不要实现 sinceSeq。
15. 不要修改 Demo / prototype。
16. 不要修改 docs。

============================================================
十一、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. Python Service 可以启动。
3. POST /api/tasks 可以创建 placeholder task。
4. WebSocket /ws/tasks/{taskId} 可以连接。
5. WebSocket 能发送 placeholder 事件序列。
6. Run 页点击 runtime.start 可以启动服务。
7. Run 页点击 task.create 可以创建 task。
8. task.create 成功后 Extension 能连接 task WebSocket。
9. Webview event-log 能显示 task.event。
10. Webview event-log 至少能看到：
    - task.status
    - agent.message
    - tool.call
    - tool.result
    - patch.proposed
    - approval.required
    - task.completed
11. Runtime stop / dispose 时会关闭 WebSocket。
12. 没有接 AutoGen / Gemini / 真实工具。
13. 没有修改 Demo / prototype / docs。

运行验收命令：

npm run compile

Python 手动测试：

python agent-service/main.py --host 127.0.0.1 --port 8765

创建任务：

curl -X POST http://127.0.0.1:8765/api/tasks ^
  -H "Content-Type: application/json" ^
  -d "{\"userRequest\":\"test task\",\"fields\":{\"task.teamId\":\"java-spring-team\",\"task.workflowId\":\"code-edit\",\"task.mode\":\"semi_auto\"},\"source\":\"manual\"}"

WebSocket 可以通过 VS Code Webview 实际测试。
如果你有 WebSocket 测试工具，也可以手动连：

ws://127.0.0.1:8765/ws/tasks/{taskId}

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. Python Service 新增了哪个 WebSocket 接口。
5. WebSocket 发送了哪些 placeholder 事件。
6. WebSocketClient 如何实现。
7. RuntimeManager 新增了哪些事件流方法。
8. task.create 后是否能自动连接事件流。
9. Webview 是否能显示 task.event。
10. npm run compile 是否通过。
11. Python WebSocket 是否测试通过。
12. 是否确认没有接 AutoGen / Gemini / 真实工具。
13. 下一步建议执行哪个 Task。