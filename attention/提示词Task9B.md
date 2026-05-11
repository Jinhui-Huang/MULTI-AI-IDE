你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 9B：端到端 MVP 自检、错误处理补强和安全边界回归修复。

当前上下文：
Task 1 已完成：
- VS Code 插件可以编译和启动
- AutoGen Control Webview 可以打开
- Webview ⇄ Extension 基础链路可用

Task 2A～2F 已完成：
- Webview 已经有 6 个 Tab：Run / Agents / Team / Tools / Workflow / Settings
- 所有页面控件框子已补齐
- 所有主要按钮已有 data-action
- 所有主要表单已有 data-field
- event-log 可以显示 sent / response / error
- settings.apiKey 在日志中已经脱敏

Task 3A～3D 已完成：
- Settings / Agents / Team / Workflow / Tools 配置可以保存和加载
- API Key 使用 VS Code SecretStorage
- 普通配置使用 VS Code globalState
- Agents / Team / Workflow / Tools / Safety 配置已保存
- 默认模型配置使用 Gemini OpenAI-compatible

Task 4A～4C 已完成：
- Python Service 可以启动 / 停止 / 健康检查
- Python Service 有 /api/runtime/health
- Python Service 有 WebSocket /ws/tasks/{taskId}
- Extension WebSocketClient 可以连接 Python Service
- Webview 可以显示 task.event

Task 5A～5D 已完成：
- list_files / read_file / search_code 已实现
- WorkspaceGuard / SensitiveFileGuard 已实现
- propose_patch / open_diff / apply_patch / reject_patch 已实现
- run_command 安全确认闭环已实现
- git_status / git_diff 只读工具已实现

Task 6A 已完成：
- Extension ToolServer 已实现
- Python Service 可以通过 ToolGateway 调用 Extension ToolServer
- Python /api/tools/call 可以调用 Extension 工具

Task 7A～7D 已完成：
- Gemini OpenAI-compatible 模型健康检查已实现
- AutoGen 单 Agent run-once 已实现
- AutoGen 单 Agent + ToolGateway 已实现
- AgentFactory + 多角色 Agent 顺序调用已实现

Task 8A～8C 已完成：
- Python Service 已有最小 WorkflowRunner
- Run 页 task.create 已接入真实 WorkflowRunner
- /api/tasks/start-workflow 可立即返回 taskId
- Extension 会自动连接 /ws/tasks/{taskId}
- Webview 能实时显示 workflow.step / agent.message / tool.call / patch.proposed / task.completed 等事件

Task 9A 已完成：
- Plan / Patch / Command Approval 最小闭环已实现
- plan.approve / plan.revise 可以记录 approval 决策
- patch.openDiff / patch.apply / patch.reject 支持 currentPatchId
- command.approveOnce / command.reject / command.addAllowlist 支持 currentCommandId
- 没有自动 apply_patch
- 没有自动 run_command

本次只做端到端自检和修复。
不要新增大功能。
不要重构架构。
不要实现新的 Agent 能力。
不要修改 UI 大布局。
不要修改 Demo / prototype / docs。

============================================================
一、本次目标
============================================================

对当前 MVP 做一次端到端自检和修复，确保以下主流程能稳定跑通：

1. Settings 保存 Gemini API Key。
2. runtime.start 启动 Python Service 和 ToolServer。
3. settings.testModel 能测试 Gemini 模型连接。
4. Run 页 task.create 能启动 WorkflowRunner。
5. Webview 能实时收到 task.event。
6. ToolGateway 能调用 Extension 工具。
7. list_files / read_file / search_code 能正常工作。
8. 敏感文件和 workspace 外路径会被拦截。
9. DeveloperAgent 的 patch.proposed 只显示，不自动应用。
10. patch.apply 必须用户点击后执行。
11. run_command 必须用户点击 approveOnce 后执行。
12. API Key 不出现在 Webview / event-log / console / response。
13. npm run compile 通过。
14. Python Service 可以启动。
15. 关键错误都有明确 error code 和 message。

本次主要做：
- 自检
- 小修
- 错误处理补强
- 日志脱敏
- 状态显示修复
- 端到端联调修复

本次不要做：
- 新增复杂功能
- 多 Agent GroupChat
- 复杂 Workflow 分支
- 自动 patch apply
- 自动 run command
- Git 写操作
- 大规模重构

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. src/extension.ts
2. src/runtime/RuntimeManager.ts
3. src/runtime/ExtensionApiClient.ts
4. src/runtime/WebSocketClient.ts
5. src/webview/AgentControlPanelProvider.ts
6. src/webview/MessageDispatcher.ts
7. src/storage/ConfigStore.ts
8. src/storage/SecretStore.ts
9. src/tools/ToolServer.ts
10. src/tools/ToolRouter.ts
11. src/tools/WorkspaceGuard.ts
12. src/tools/FileTools.ts
13. src/tools/SearchTools.ts
14. src/tools/PatchTools.ts
15. src/tools/TerminalTools.ts
16. src/tools/GitTools.ts
17. media/webview.html
18. media/webview-bridge.js
19. media/webview.css
20. agent-service/main.py
21. agent-service/runtime/task_manager.py
22. agent-service/runtime/workflow_runner.py
23. agent-service/runtime/ws_manager.py
24. agent-service/tools/tool_gateway.py
25. agent-service/adapters/autogen_adapter.py
26. package.json
27. agent-service/requirements.txt

可以只读参考：
28. docs/09_Task任务状态机与WebSocket事件详细设计.md
29. docs/11_安全边界与沙箱策略详细设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要大改架构。
不要新增新模块，除非是很小的错误处理工具。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. src/runtime/RuntimeManager.ts
2. src/runtime/ExtensionApiClient.ts
3. src/runtime/WebSocketClient.ts
4. src/webview/AgentControlPanelProvider.ts
5. src/webview/MessageDispatcher.ts
6. src/tools/ToolServer.ts
7. src/tools/ToolRouter.ts
8. src/tools/WorkspaceGuard.ts
9. src/tools/FileTools.ts
10. src/tools/SearchTools.ts
11. src/tools/PatchTools.ts
12. src/tools/TerminalTools.ts
13. src/tools/GitTools.ts
14. media/webview.html
15. media/webview-bridge.js
16. media/webview.css
17. agent-service/main.py
18. agent-service/runtime/task_manager.py
19. agent-service/runtime/workflow_runner.py
20. agent-service/runtime/ws_manager.py
21. agent-service/tools/tool_gateway.py
22. agent-service/adapters/autogen_adapter.py

必要时可以小改：
23. src/storage/ConfigStore.ts
24. src/storage/SecretStore.ts
25. agent-service/runtime/model_settings.py

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. 不要大改 config
4. 不要删除已有功能
5. 不要引入大型新依赖

============================================================
四、端到端主流程检查
============================================================

请按代码层面检查并修复以下流程。

------------------------------------------------------------
1. Settings 保存和模型测试
------------------------------------------------------------

必须确认：

1. settings.save 不会把 settings.apiKey 保存到 globalState。
2. settings.apiKey 只保存到 SecretStorage。
3. settings.load 不会把 API Key 明文返回给 Webview。
4. settings.testModel 走 Python /api/model/health。
5. /api/model/config-safe 不返回 API Key。
6. /api/model/health 错误信息不包含 API Key。
7. event-log 中 settings.apiKey 永远显示 "***"。

如果发现直接 JSON.stringify(payload) 导致 API Key 泄露，必须修复。

------------------------------------------------------------
2. Runtime 启动
------------------------------------------------------------

必须确认：

1. runtime.start 会启动 ToolServer。
2. runtime.start 会启动 Python Service。
3. RuntimeManager 把 ToolServer URL 通过 AUTOGEN_IDE_TOOL_SERVER_URL 传给 Python。
4. RuntimeManager 把模型配置通过 AUTOGEN_IDE_MODEL_* 传给 Python。
5. RuntimeManager 不在日志中打印 API Key。
6. runtime.health 返回 toolServer 状态。
7. runtime.stop 会停止 Python Service。
8. runtime.stop 会停止 ToolServer。
9. deactivate / dispose 会清理进程和 WebSocket。

------------------------------------------------------------
3. task.create 执行
------------------------------------------------------------

必须确认：

1. task.create 会检查 task.userRequest。
2. 空任务返回 EMPTY_USER_REQUEST。
3. Runtime 未启动返回 RUNTIME_NOT_RUNNING。
4. Runtime 已启动时调用 /api/tasks/start-workflow。
5. task.create.result 立即返回 taskId 和 running 状态。
6. Extension 自动连接 /ws/tasks/{taskId}。
7. Webview 能收到 task.event。

------------------------------------------------------------
4. WorkflowRunner 事件
------------------------------------------------------------

必须确认 Python Service 会发布：

1. task.status running
2. workflow.step.started
3. agent.status running
4. agent.message
5. workflow.step.completed
6. task.completed

如果失败，必须发布：

1. workflow.step.failed
2. task.failed

不要只在最终 HTTP response 里返回结果。
WebSocket 事件必须能实时推给 Webview。

------------------------------------------------------------
5. ToolGateway
------------------------------------------------------------

必须确认：

1. Python 不直接读文件。
2. Python ToolGateway 只调用 Extension ToolServer。
3. Extension ToolServer 只监听 127.0.0.1。
4. ToolServer POST /tools/call 走 ToolRouter。
5. ToolRouter 保留 WorkspaceGuard / SensitiveFileGuard / CommandGuard。
6. ToolGateway 工具错误能转换成明确错误返回给 Agent。

------------------------------------------------------------
6. Patch Approval
------------------------------------------------------------

必须确认：

1. patch.proposed 只显示。
2. patch.openDiff 只打开 Diff。
3. patch.apply 必须用户点击。
4. patch.apply 走 WorkspaceGuard。
5. patch.apply 拦截敏感文件。
6. patch.apply 不支持 delete。
7. patch.reject 能更新 patch 状态。
8. 没有自动 patch.apply。

------------------------------------------------------------
7. Command Approval
------------------------------------------------------------

必须确认：

1. run_command 只创建 pending command。
2. command.approveOnce 才执行。
3. command.reject 能拒绝。
4. command.addAllowlist 能更新 allowlist。
5. blocklist 命令被拒绝。
6. 不在 allowlist 的命令被拒绝。
7. 含 && / || / ; / | 的命令被拒绝。
8. 不使用 shell:true。
9. 输出长度有限制。
10. 没有自动 run_command。

============================================================
五、统一错误格式检查
============================================================

所有 Extension 返回给 Webview 的错误必须使用统一格式：

{
  "ok": false,
  "type": "xxx.result",
  "requestId": "...",
  "error": {
    "code": "ERROR_CODE",
    "message": "..."
  }
}

所有 Python API 错误必须使用统一格式：

{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "..."
  }
}

请重点检查这些错误码是否存在并能正确返回：

RUNTIME_NOT_RUNNING
EMPTY_USER_REQUEST
MODEL_API_KEY_MISSING
MODEL_HEALTH_FAILED
TOOL_SERVER_UNAVAILABLE
WORKSPACE_NOT_OPEN
PATH_OUTSIDE_WORKSPACE
SENSITIVE_FILE_BLOCKED
PATCH_NOT_FOUND
PATCH_TARGET_EXISTS
PATCH_CONTENT_MISMATCH
COMMAND_NOT_ALLOWLISTED
COMMAND_BLOCKED
COMMAND_UNSAFE_SYNTAX
NOT_GIT_REPOSITORY
TASK_NOT_FOUND
APPROVAL_NOT_FOUND
WORKFLOW_RUN_FAILED

如果有地方抛出了未捕获异常，改成统一错误响应。

============================================================
六、日志脱敏检查
============================================================

必须全局检查这些内容不能进入日志：

1. settings.apiKey
2. apiKey
3. AUTOGEN_IDE_MODEL_API_KEY
4. Authorization header
5. Bearer token
6. SecretStorage 读取到的明文 key

检查位置：

1. Webview event-log
2. Extension console.log
3. VS Code OutputChannel
4. Python print / logging
5. Python API response
6. WebSocket event payload
7. task result payload
8. error message

如果不能完全确认，就加 sanitize 处理。

建议实现或复用：

- sanitizeForLog
- sanitizePayloadForWebview
- redact_secret

脱敏显示统一为：

"***"

============================================================
七、Webview 状态显示检查
============================================================

检查 media/webview-bridge.js。

必须保证：

1. task.create.result 能保存 currentTaskId。
2. approval.required 能保存 currentPlanApprovalId。
3. patch.proposed 能保存 currentPatchId。
4. command pending result 能保存 currentCommandId。
5. task.event 能正确进入 event-log。
6. task.completed 后 Current Task 状态变 completed。
7. task.failed 后 Current Task 状态变 failed。
8. 每条长内容截断，最多显示 3000～5000 字符。
9. API Key 脱敏。
10. JS 错误不会导致整个页面空白。

如果 event handler 对某些事件没有处理，至少写入 event-log。

============================================================
八、Python Service 稳定性检查
============================================================

检查 agent-service/main.py 和相关 runtime 文件。

必须保证：

1. FastAPI 启动不要求 AutoGen 立即可用，除非调用相关 API。
2. /api/runtime/health 总是能返回。
3. /api/model/config-safe 不返回 API Key。
4. /api/tools/health 在 ToolServer 不可用时返回明确错误。
5. /api/tasks/start-workflow 创建后台任务后立即返回。
6. 后台 task 异常不会让整个服务崩溃。
7. WebSocket 客户端断开后能清理 subscriber。
8. task events 不会重复无限发送。
9. 不要在 Python 里直接访问 workspace 文件。

============================================================
九、TypeScript 编译和类型检查
============================================================

必须运行：

npm run compile

如果出现 TypeScript 错误：

1. 优先小修类型。
2. 不要删除功能绕过。
3. 不要用大量 any 掩盖核心错误，除非是边界层 unknown 转换。
4. 不要引入新大型依赖。

============================================================
十、Python 基础检查
============================================================

至少保证：

1. Python Service 能启动：
   python agent-service/main.py --host 127.0.0.1 --port 8765

2. health 可访问：
   http://127.0.0.1:8765/api/runtime/health

如果环境允许，运行：

python -m compileall agent-service

如果没有环境依赖，不要为了通过检查删除 AutoGen 代码。
只修明显语法错误。

============================================================
十一、手动测试入口检查
============================================================

确认以下 Debug action 仍可用，不要删除：

1. agent.debug.runOnce
2. agent.debug.runWithTools
3. agent.debug.runSequence
4. workflow.debug.runOnce
5. patch.debug.proposePlaceholder
6. command.debug.requestMvnTest
7. git.debug.status
8. git.debug.diff
9. tool.gateway.health
10. tool.gateway.debugListFiles
11. tool.gateway.debugReadFile
12. tool.gateway.debugSearchCode

如果某些按钮不存在但 action 存在，可以不补按钮。
如果按钮存在但 MessageDispatcher 不支持，必须补支持或移除按钮。
优先补支持。

============================================================
十二、安全回归测试要求
============================================================

必须确认以下情况会失败，不能成功：

1. read_file 读取 .env。
   期望：SENSITIVE_FILE_BLOCKED

2. read_file 读取 ../outside.txt。
   期望：PATH_OUTSIDE_WORKSPACE

3. apply_patch 修改 .env。
   期望：SENSITIVE_FILE_BLOCKED

4. apply_patch 修改 ../outside.txt。
   期望：PATH_OUTSIDE_WORKSPACE

5. run_command 执行 git push。
   期望：COMMAND_BLOCKED

6. run_command 执行 npm test && git push。
   期望：COMMAND_UNSAFE_SYNTAX

7. git_diff path = ../outside.txt。
   期望：PATH_OUTSIDE_WORKSPACE

8. settings.testModel 在 Runtime 未启动时。
   期望：RUNTIME_NOT_RUNNING

9. task.create 空输入。
   期望：EMPTY_USER_REQUEST

10. task.create Runtime 未启动。
   期望：RUNTIME_NOT_RUNNING

============================================================
十三、不要做的事情
============================================================

本次不要做：

1. 不要新增新的 Agent 能力。
2. 不要新增新的工具类型。
3. 不要实现复杂 Workflow 分支。
4. 不要实现多 Agent GroupChat。
5. 不要实现自动 patch.apply。
6. 不要实现自动 command.approveOnce。
7. 不要实现 Git 写操作。
8. 不要大改 UI 布局。
9. 不要删除 Debug action。
10. 不要修改 Demo / prototype。
11. 不要修改 docs。
12. 不要把安全检查放宽。
13. 不要把 shell:true 打开。
14. 不要把 API Key 写入任何日志。

============================================================
十四、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. Python Service 可以启动。
3. /api/runtime/health 可用。
4. runtime.start 可以启动 Python Service 和 ToolServer。
5. settings.testModel 可以返回成功或明确错误。
6. task.create Runtime 未启动时返回 RUNTIME_NOT_RUNNING。
7. task.create 空输入返回 EMPTY_USER_REQUEST。
8. task.create Runtime 启动后可以返回 taskId。
9. Webview 可以收到真实 task.event。
10. Webview 可以显示 task.completed 或 task.failed。
11. ToolGateway 可以调用 list_files。
12. read_file 敏感文件被拒绝。
13. workspace 外路径被拒绝。
14. patch.apply 只能用户点击触发。
15. command.approveOnce 只能用户点击触发。
16. blocklist 命令被拒绝。
17. unsafe syntax 命令被拒绝。
18. API Key 没有进入 Webview / event-log / console / Python response / WebSocket event。
19. 所有主要错误使用统一 error 格式。
20. Settings / Agents / Team / Workflow / Tools 配置保存仍然可用。
21. Debug actions 不被破坏。
22. 没有修改 Demo / prototype / docs。
23. 没有新增不安全功能。

运行验收命令：

npm run compile

建议额外运行：

python -m compileall agent-service

手动测试建议：

1. 保存 Gemini API Key。
2. 点击 runtime.start。
3. 点击 settings.testModel。
4. Run 页输入一个简单项目分析任务。
5. 点击发送给 AutoGen Team。
6. 观察 WebSocket 事件。
7. 等 task.completed。
8. 测试读取 .env，确认被拒绝。
9. 测试 ../outside.txt，确认被拒绝。
10. 测试 command.debug.requestMvnTest + approve/reject。
11. 测试 git.debug.status / git.debug.diff。

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. 发现并修复了哪些端到端问题。
5. 统一错误格式补强了哪些位置。
6. API Key 脱敏检查覆盖了哪些位置。
7. Webview 状态显示修复了哪些事件。
8. Python Service 稳定性修复了哪些点。
9. 安全回归测试哪些通过。
10. npm run compile 是否通过。
11. python -m compileall agent-service 是否通过。
12. 是否确认没有自动 apply_patch / run_command。
13. 是否确认没有修改 Demo / prototype / docs。
14. 下一步建议执行哪个 Task。