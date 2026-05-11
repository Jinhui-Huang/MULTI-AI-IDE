你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 4A：实现 Python AutoGen Service 的本地启动、停止、重启和健康检查 placeholder。

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
- 默认模型配置使用 Gemini OpenAI-compatible

Task 3B 已完成：
- Agents 配置可以保存和加载

Task 3C 已完成：
- Team / Workflow 配置可以保存和加载

Task 3D 已完成：
- Tools / Safety 配置可以保存和加载

本次开始做 Runtime，但只做 Python Service placeholder 启停和健康检查。
不要接真实 AutoGen。
不要创建 AssistantAgent。
不要实现 WebSocket。
不要实现真实 task.create。
不要实现文件工具、Diff、Git、Terminal。

============================================================
一、本次目标
============================================================

实现 VS Code Extension 侧对本地 Python Service 的基础管理：

1. 实现 RuntimeManager 启动 Python Service。
2. 实现 RuntimeManager 停止 Python Service。
3. 实现 RuntimeManager 重启 Python Service。
4. 实现 RuntimeManager 健康检查。
5. 实现 agent-service/main.py 的 FastAPI placeholder 服务。
6. 实现 GET /api/runtime/health。
7. Settings 页 runtime.start / runtime.stop / runtime.restart / runtime.health 不再只是 placeholder，而是真实调用 RuntimeManager。
8. Runtime 状态结果能返回 Webview 并显示在 event-log。
9. npm run compile 通过。
10. Python 文件基础语法检查通过。

本次不要做：

- 真实 AutoGen Agent
- 真实模型调用
- 真实任务执行
- WebSocket
- ToolServer
- 文件读写工具
- Diff / Patch
- Terminal
- Git

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. src/extension.ts
2. src/webview/MessageDispatcher.ts
3. src/runtime/RuntimeManager.ts
4. src/runtime/ExtensionApiClient.ts
5. src/storage/ConfigStore.ts
6. media/webview.html
7. media/webview-bridge.js
8. agent-service/main.py
9. agent-service/requirements.txt
10. package.json

可以只读参考：
11. docs/03_Extension与AutoGenService通信接口详细设计.md
12. docs/12_插件打包发布与内置PythonRuntime详细设计.md
13. docs/10_配置存储与SecretStorage详细设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要实现 AutoGen。
不要实现 WebSocket。
不要实现真实工具。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. src/runtime/RuntimeManager.ts
2. src/runtime/ExtensionApiClient.ts
3. src/webview/MessageDispatcher.ts
4. src/extension.ts
5. agent-service/main.py
6. agent-service/requirements.txt
7. media/webview-bridge.js
8. media/webview.html

必要时可以小改：
9. src/storage/ConfigStore.ts
10. src/types/messages.ts
11. 新增 src/types/runtime.ts
12. agent-service/runtime/settings.py

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. src/tools 目录
4. config 目录

============================================================
四、Python Service 要求
============================================================

检查或实现 agent-service/main.py。

必须提供一个 FastAPI 服务。

最低要求：

1. 可以通过以下命令启动：

python agent-service/main.py --host 127.0.0.1 --port 8765

或者：

python agent-service/main.py

默认 host = 127.0.0.1
默认 port = 8765

2. 提供接口：

GET /api/runtime/health

返回 JSON：

{
  "ok": true,
  "service": "autogen-agent-service",
  "status": "running",
  "version": "0.1.0",
  "runtimeProvider": "placeholder",
  "autogenEnabled": false,
  "python": "...",
  "time": "..."
}

3. 提供接口：

GET /

返回简单 JSON：

{
  "ok": true,
  "message": "AutoGen Agent Service placeholder"
}

4. 不能要求真实 AutoGen 依赖。
5. 即使没有安装 autogen-agentchat，也必须能启动。
6. 不要在本次导入 autogen。
7. 不要读取 API Key。
8. 不要连接 Gemini。

requirements.txt 至少包含：

fastapi
uvicorn

如果已经有 httpx，可以保留。

main.py 建议结构：

- parse_args()
- create_app()
- main()
- if __name__ == "__main__": main()

启动 uvicorn 时使用：

uvicorn.run(app, host=host, port=port)

============================================================
五、RuntimeManager 要求
============================================================

修改 src/runtime/RuntimeManager.ts。

实现这些方法：

1. start(): Promise<RuntimeStatus>
2. stop(): Promise<RuntimeStatus>
3. restart(): Promise<RuntimeStatus>
4. health(): Promise<RuntimeStatus>
5. dispose(): Promise<void>

RuntimeStatus 至少包含：

{
  "running": boolean,
  "pid"?: number,
  "serviceUrl": string,
  "message": string,
  "health"?: unknown
}

启动逻辑：

1. 从 ConfigStore.loadSettings() 读取：
   - settings.pythonPath
   - settings.host
   - settings.port
   - settings.serviceUrl

2. pythonPath 默认：
   python

3. host 默认：
   127.0.0.1

4. port 默认：
   8765

5. serviceUrl 默认：
   http://127.0.0.1:8765

6. 使用 child_process.spawn 启动：

pythonPath agent-service/main.py --host host --port port

7. cwd 使用 extension 根目录。

8. stdio 使用 pipe。

9. 捕获 stdout/stderr，并写入 VS Code OutputChannel 或 console。

10. 如果已经 running，不要重复启动，直接返回 running 状态。

11. stop() 要 kill 子进程。

12. restart() = stop() 后 start()。

13. dispose() 调用 stop()。

14. 启动后可以等待短暂时间再调用 health()。
    例如轮询 10 次，每次 300ms。
    不要无限等待。

15. 如果启动失败，返回 running=false 和错误 message，不要抛未捕获异常。

注意：

- 不要使用 shell: true，除非 Windows 路径确实无法启动；优先 shell:false。
- 不要写死 D 盘路径。
- 不要写死用户 Python 路径。
- 使用 Settings 中的 pythonPath。

============================================================
六、ExtensionApiClient 要求
============================================================

修改 src/runtime/ExtensionApiClient.ts。

实现或修正：

1. health(serviceUrl: string): Promise<unknown>

使用 Node 内置 fetch 如果当前环境支持。
如果项目没有 fetch 类型兼容问题，可以使用 fetch。
如果 TypeScript 报错，可以使用 http/https 简单实现，或添加明确类型。

请求：

GET `${serviceUrl}/api/runtime/health`

要求：

1. 超时时间 3000ms。
2. 返回 JSON。
3. 失败时抛出带 message 的 Error。
4. 不要实现 WebSocket。

如果当前 ExtensionApiClient 已经有 WebSocket placeholder，不要在本次展开实现。

============================================================
七、MessageDispatcher 要求
============================================================

修改 src/webview/MessageDispatcher.ts。

runtime.start / runtime.stop / runtime.restart / runtime.health 不再 placeholder。

必须调用 RuntimeManager。

实现：

1. runtime.start

返回：

{
  "ok": true,
  "type": "runtime.start.result",
  "requestId": "...",
  "payload": {
    "message": "Runtime started",
    "status": {...}
  }
}

如果失败：

{
  "ok": false,
  "type": "runtime.start.result",
  "requestId": "...",
  "error": {
    "code": "RUNTIME_START_FAILED",
    "message": "..."
  }
}

2. runtime.stop

返回：

{
  "ok": true,
  "type": "runtime.stop.result",
  "payload": {
    "message": "Runtime stopped",
    "status": {...}
  }
}

3. runtime.restart

返回：

{
  "ok": true,
  "type": "runtime.restart.result",
  "payload": {
    "message": "Runtime restarted",
    "status": {...}
  }
}

4. runtime.health

返回：

{
  "ok": true,
  "type": "runtime.health.result",
  "payload": {
    "message": "Runtime health checked",
    "status": {...}
  }
}

其他 Settings action 保持原有逻辑：

- settings.save 仍然真实保存
- settings.load 仍然真实加载
- settings.testModel 仍然 placeholder
- settings.import/export 仍然 placeholder

不要破坏 Run / Agents / Team / Tools / Workflow action。

============================================================
八、extension.ts 要求
============================================================

检查 src/extension.ts。

要求：

1. RuntimeManager 在 activate 中创建。
2. MessageDispatcher 能拿到 RuntimeManager。
3. deactivate 中调用 RuntimeManager.dispose()。
4. disposable 正确 push 到 context.subscriptions。
5. 不要在 activate 时自动启动 Python Service。
6. 只有点击 runtime.start 才启动。
7. 如果已有 RuntimeManager 初始化逻辑，补齐即可，不要重构整个项目。

============================================================
九、Webview 要求
============================================================

media/webview-bridge.js：

1. 点击 runtime.start / runtime.stop / runtime.restart / runtime.health 后，event-log 显示 sent。
2. 收到 response 后显示 response。
3. 如果 response.payload.status 存在，把 Runtime 状态显示到页面。

如果页面已有 Runtime 状态卡片，更新其中内容。

如果没有明显的 Runtime 状态元素，可以新增一个：

<div id="runtime-status">Runtime status: unknown</div>

显示内容示例：

Runtime status: running
Service URL: http://127.0.0.1:8765
PID: 12345

不要破坏 Settings 页已有字段保存/加载。

============================================================
十、错误处理要求
============================================================

必须处理这些情况：

1. pythonPath 不存在或不可执行。
   - 返回 RUNTIME_START_FAILED
   - message 包含错误原因

2. agent-service/main.py 不存在。
   - 返回 RUNTIME_START_FAILED

3. 端口已占用。
   - 返回 RUNTIME_START_FAILED 或 health 检测失败
   - message 说明端口可能被占用

4. health 请求失败。
   - 返回 RUNTIME_HEALTH_FAILED

5. stop 时进程不存在。
   - 返回 running=false，不要报错

6. 重复 start。
   - 如果已经 running，直接返回当前状态

============================================================
十一、不要做的事情
============================================================

本次不要做：

1. 不要导入 autogen。
2. 不要创建 AssistantAgent。
3. 不要读取 Gemini API Key。
4. 不要调用 Gemini。
5. 不要实现 task.create 真实逻辑。
6. 不要实现 WebSocket。
7. 不要实现 ToolServer。
8. 不要实现文件读取。
9. 不要实现 Diff/Patch。
10. 不要实现 Terminal。
11. 不要实现 Git。
12. 不要修改 Demo / prototype。
13. 不要修改 docs。
14. 不要修改 config 默认业务配置。

============================================================
十二、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. python agent-service/main.py 可以启动 placeholder FastAPI 服务。
3. GET /api/runtime/health 返回 ok=true。
4. VS Code Webview 点击 runtime.start 能启动 Python Service。
5. Webview event-log 显示 runtime.start.result。
6. VS Code Webview 点击 runtime.health 能拿到 health 信息。
7. Webview event-log 显示 runtime.health.result。
8. VS Code Webview 点击 runtime.stop 能停止 Python Service。
9. runtime.stop 后再次 runtime.health 返回失败或 stopped 状态。
10. runtime.restart 能执行 stop + start。
11. deactivate 时会清理 Runtime 进程。
12. Settings 保存/加载不受影响。
13. Run / Agents / Team / Tools / Workflow 页面已有功能不受影响。
14. 没有接 AutoGen / Gemini / WebSocket / 真实工具。
15. 没有修改 Demo / prototype / docs。

运行验收命令：

npm run compile

另外运行 Python 检查：

python agent-service/main.py --host 127.0.0.1 --port 8765

然后在另一个终端测试：

curl http://127.0.0.1:8765/api/runtime/health

如果当前环境没有 curl，可以用浏览器打开：

http://127.0.0.1:8765/api/runtime/health

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. RuntimeManager 实现了哪些方法。
5. Python Service 提供了哪些接口。
6. runtime.start 是否能启动服务。
7. runtime.health 是否能返回健康信息。
8. runtime.stop 是否能停止服务。
9. npm run compile 是否通过。
10. Python health 接口是否测试通过。
11. 是否确认没有接 AutoGen / Gemini / WebSocket / 真实工具。
12. 下一步建议执行哪个 Task。