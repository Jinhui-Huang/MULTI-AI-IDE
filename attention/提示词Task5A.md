你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 5A：实现 VS Code Tool Server 的 list_files / read_file / search_code placeholder 到真实 VS Code workspace 文件读取能力。

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

Task 4B 已完成：
- Python Service 已有 POST /api/tasks
- Python Service 已有 GET /api/tasks/{taskId}
- task.create 可以从 Webview 经过 Extension 调用 Python Service
- Python Service 可以返回 placeholder taskId

Task 4C 已完成：
- Python Service 已有 WebSocket /ws/tasks/{taskId}
- Python Service 可以推送 placeholder task event
- Extension 可以连接 WebSocket 并把 task.event 转发到 Webview
- Webview event-log 可以显示 task.status / agent.message / tool.call / tool.result / patch.proposed / approval.required / task.completed

本次开始做 VS Code 文件类工具。
只实现 list_files / read_file / search_code。
不要实现 write_file。
不要实现 propose_patch / apply_patch。
不要实现 run_command。
不要实现 Git。
不要接真实 AutoGen。
不要调用 Gemini。

============================================================
一、本次目标
============================================================

实现 Extension 侧 ToolServer / ToolRouter 的基础文件工具：

1. list_files：列出当前 workspace 内文件。
2. read_file：读取当前 workspace 内指定文件。
3. search_code：在当前 workspace 内搜索文本。
4. 实现 WorkspaceGuard，禁止访问 workspace 外路径。
5. 实现 Sensitive File Blocklist 检查。
6. 实现基础文件大小限制。
7. 提供 Extension 内部 tool 调用入口。
8. 提供 Python Service 调用 Extension Tool 的 HTTP 接口 placeholder 或 Extension ToolServer 接口。
9. 不允许读取敏感文件。
10. 不允许访问 workspace 外文件。
11. npm run compile 通过。

本次不要做：

- 写文件
- 删除文件
- propose_patch
- apply_patch
- run_command
- git_diff / git_status
- 真实 AutoGen tool 注入
- Gemini 调用
- WorkflowRunner 执行
- WebSocket 工具事件真实联动

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. src/tools/ToolServer.ts
2. src/tools/ToolRouter.ts
3. src/tools/WorkspaceGuard.ts
4. src/tools/FileTools.ts
5. src/tools/SearchTools.ts
6. src/storage/ConfigStore.ts
7. src/webview/MessageDispatcher.ts
8. src/extension.ts
9. media/webview.html
10. media/webview-bridge.js
11. package.json

可以只读参考：
12. docs/07_Tools工具系统与权限控制详细设计.md
13. docs/08_VSCode文件_Diff_Terminal_Git工具联调详细设计.md
14. docs/11_安全边界与沙箱策略详细设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要接真实 AutoGen。
不要调用 Gemini。
不要实现 Diff/Patch/Terminal/Git。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. src/tools/ToolServer.ts
2. src/tools/ToolRouter.ts
3. src/tools/WorkspaceGuard.ts
4. src/tools/FileTools.ts
5. src/tools/SearchTools.ts
6. src/storage/ConfigStore.ts
7. src/webview/MessageDispatcher.ts
8. src/extension.ts
9. media/webview-bridge.js
10. media/webview.html

必要时可以新增或修改：
11. src/types/tools.ts
12. src/tools/SensitiveFileGuard.ts
13. src/tools/ToolTypes.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. agent-service 目录
4. src/runtime 目录，除非编译必须小修
5. config 目录

============================================================
四、WorkspaceGuard 要求
============================================================

实现或修正 src/tools/WorkspaceGuard.ts。

必须提供：

1. getWorkspaceRoot(): vscode.Uri | undefined
2. requireWorkspaceRoot(): vscode.Uri
3. resolveWorkspacePath(relativePath: string): vscode.Uri
4. isInsideWorkspace(uri: vscode.Uri): boolean
5. assertInsideWorkspace(uri: vscode.Uri): void
6. normalizeRelativePath(path: string): string

要求：

1. 只允许访问当前第一个 workspace folder。
2. 如果没有打开 workspace，返回明确错误：
   WORKSPACE_NOT_OPEN
3. 禁止绝对路径直接访问。
4. 禁止 ../ 跳出 workspace。
5. 禁止 Windows 盘符路径，例如 C:\xxx、D:\xxx 直接作为工具参数。
6. 所有工具参数 path 必须是 workspace 相对路径。
7. resolve 后必须确认仍在 workspace 内。
8. 路径错误返回：
   PATH_OUTSIDE_WORKSPACE

============================================================
五、Sensitive File 检查要求
============================================================

实现敏感文件检查。

可以放在 WorkspaceGuard.ts，也可以新增 SensitiveFileGuard.ts。

必须读取 Tools 配置中的：

sensitiveFileBlocklist

如果 ConfigStore 当前已经有 loadToolsConfig()，使用它。
如果没有，至少使用默认列表：

.env
*.pem
id_rsa
id_ed25519
credentials.json
application-prod.yml
*.p12
*.key

要求：

1. read_file 前必须检查敏感文件。
2. search_code 结果中如果命中文件是敏感文件，要跳过。
3. list_files 默认可以显示敏感文件名，但建议标记 sensitive=true；如果实现复杂，可以先跳过敏感文件。
4. 匹配规则支持：
   - 精确文件名，例如 .env
   - 后缀通配，例如 *.pem
   - 简单 glob 星号匹配
5. 命中敏感文件时返回错误：
   SENSITIVE_FILE_BLOCKED

============================================================
六、FileTools 要求
============================================================

实现或修正 src/tools/FileTools.ts。

必须提供：

1. listFiles(options?: { dir?: string; maxFiles?: number; includeHidden?: boolean }): Promise<unknown>
2. readFile(path: string, options?: { maxBytes?: number }): Promise<unknown>

------------------------------------------------------------
1. listFiles
------------------------------------------------------------

参数：

{
  "dir": "src",
  "maxFiles": 200,
  "includeHidden": false
}

要求：

1. dir 默认为 "."。
2. maxFiles 默认 200。
3. 递归列出文件。
4. 跳过常见目录：
   - node_modules
   - .git
   - dist
   - out
   - build
   - target
   - .venv
   - __pycache__
5. includeHidden=false 时跳过 . 开头文件/目录。
6. 返回 workspace 相对路径。
7. 不要读取文件内容。
8. 不要访问 workspace 外路径。

返回示例：

{
  "ok": true,
  "root": "D:/project",
  "dir": "src",
  "files": [
    {
      "path": "src/main/java/App.java",
      "type": "file",
      "size": 1234
    }
  ],
  "truncated": false
}

------------------------------------------------------------
2. readFile
------------------------------------------------------------

参数：

path: workspace 相对路径

options:

{
  "maxBytes": 200000
}

要求：

1. maxBytes 默认 200000。
2. 只读取文本文件。
3. 如果文件超过 maxBytes，返回 truncated=true，只返回前 maxBytes 内容。
4. 如果是二进制文件，返回错误：
   BINARY_FILE_NOT_SUPPORTED
5. 如果敏感文件，返回错误：
   SENSITIVE_FILE_BLOCKED
6. 如果路径越界，返回错误：
   PATH_OUTSIDE_WORKSPACE
7. 返回内容使用 utf8。

返回示例：

{
  "ok": true,
  "path": "pom.xml",
  "content": "...",
  "size": 4096,
  "truncated": false
}

============================================================
七、SearchTools 要求
============================================================

实现或修正 src/tools/SearchTools.ts。

必须提供：

searchCode(query: string, options?: { dir?: string; maxResults?: number; includeHidden?: boolean }): Promise<unknown>

参数示例：

{
  "query": "@RestController",
  "dir": "src",
  "maxResults": 50
}

要求：

1. query 不能为空。
2. dir 默认为 "."。
3. maxResults 默认 50。
4. 搜索文本文件。
5. 跳过常见目录：
   - node_modules
   - .git
   - dist
   - out
   - build
   - target
   - .venv
   - __pycache__
6. 跳过敏感文件。
7. 不访问 workspace 外。
8. 返回匹配文件、行号、行文本。
9. 每行最多返回 300 字符。
10. 搜索结果达到 maxResults 后停止。

返回示例：

{
  "ok": true,
  "query": "@RestController",
  "results": [
    {
      "path": "src/main/java/AuthController.java",
      "line": 12,
      "text": "@RestController"
    }
  ],
  "truncated": false
}

============================================================
八、ToolRouter 要求
============================================================

实现或修正 src/tools/ToolRouter.ts。

必须提供统一入口：

handleToolCall(request: ToolCallRequest): Promise<ToolCallResponse>

ToolCallRequest 至少包含：

{
  "tool": "read_file",
  "args": {
    "path": "pom.xml"
  }
}

支持工具：

1. list_files
2. read_file
3. search_code

未知工具返回：

{
  "ok": false,
  "error": {
    "code": "UNKNOWN_TOOL",
    "message": "Unknown tool: xxx"
  }
}

工具异常必须被捕获并转成统一错误响应。

不要让异常直接抛到 HTTP 层。

============================================================
九、ToolServer 要求
============================================================

检查 src/tools/ToolServer.ts。

如果已有 HTTP Server placeholder，本次实现最小 HTTP 接口：

POST /tools/call

请求：

{
  "tool": "read_file",
  "args": {
    "path": "pom.xml"
  }
}

返回 ToolRouter 的结果。

要求：

1. 只监听 127.0.0.1。
2. 端口可以默认 18765。
3. 支持 JSON body。
4. 非 POST 返回 405。
5. JSON 格式错误返回 400。
6. 不要对外网监听。
7. 不要做认证复杂逻辑；如果当前已有 token 检查，可以保留。
8. 不要在 activate 时自动启动 ToolServer，除非项目之前已有明确设计。第一版可以只实现类和方法，不自动启动。

如果当前项目没有启动 ToolServer 的需求，本次至少保证 ToolRouter / FileTools / SearchTools 可以被 MessageDispatcher 内部测试调用。

============================================================
十、MessageDispatcher 测试入口要求
============================================================

为了本次能从 Webview 简单测试工具，允许在 MessageDispatcher 增加临时 action：

1. tool.debug.listFiles
2. tool.debug.readFile
3. tool.debug.searchCode

这些 action 仅用于开发测试。

如果 UI 没有按钮，可以不用加到 HTML。
但如果加按钮，只能加到 Tools 页 Debug 小区域。

tool.debug.listFiles 调用 list_files。
tool.debug.readFile 默认读取 pom.xml 或 package.json。
tool.debug.searchCode 默认搜索 class 或 function。

不要影响现有 tool.permission.save 等配置保存逻辑。

============================================================
十一、Webview 可选 Debug UI
============================================================

如果方便，可以在 Tools 页增加一个小 Debug 区域：

按钮：

<button data-action="tool.debug.listFiles">Debug list_files</button>
<button data-action="tool.debug.readFile">Debug read_file</button>
<button data-action="tool.debug.searchCode">Debug search_code</button>

输入：

<input data-field="tool.debug.path" placeholder="pom.xml">
<input data-field="tool.debug.query" placeholder="@RestController">

要求：

1. 只用于测试。
2. 返回结果写入 event-log。
3. 不要大改 Tools 页结构。

如果时间不够，可以不加 Debug UI，只保证代码编译和单元调用入口。

============================================================
十二、错误码要求
============================================================

统一错误码至少包含：

WORKSPACE_NOT_OPEN
PATH_OUTSIDE_WORKSPACE
SENSITIVE_FILE_BLOCKED
FILE_NOT_FOUND
BINARY_FILE_NOT_SUPPORTED
QUERY_REQUIRED
UNKNOWN_TOOL
TOOL_CALL_FAILED

错误返回格式：

{
  "ok": false,
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "File not found: pom.xml"
  }
}

============================================================
十三、安全要求
============================================================

必须保证：

1. read_file 不能读 workspace 外。
2. read_file 不能读 .env / pem / key 等敏感文件。
3. search_code 不能搜索敏感文件内容。
4. list_files 不能进入 node_modules / .git 等巨大目录。
5. 不实现任何写文件。
6. 不执行命令。
7. 不做 Git 操作。
8. 不把文件内容写入 console.log。
9. event-log 显示文件内容时要限制长度，最多显示前 1000 字符。

============================================================
十四、不要做的事情
============================================================

本次不要做：

1. 不要接 AutoGen。
2. 不要调用 Gemini。
3. 不要启动 Python。
4. 不要改 Python Service。
5. 不要实现 WebSocket。
6. 不要实现 write_file。
7. 不要实现 propose_patch。
8. 不要实现 apply_patch。
9. 不要实现 run_command。
10. 不要实现 git_diff / git_status。
11. 不要真实修改 workspace 文件。
12. 不要修改 Demo / prototype。
13. 不要修改 docs。

============================================================
十五、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. WorkspaceGuard 能阻止 workspace 外路径。
3. WorkspaceGuard 能拒绝绝对路径参数。
4. read_file 可以读取 workspace 内普通文本文件。
5. read_file 会拒绝敏感文件。
6. read_file 会拒绝超出 workspace 的路径。
7. list_files 可以列出 workspace 内文件。
8. list_files 跳过 node_modules / .git / target 等目录。
9. search_code 可以搜索 workspace 内文本。
10. search_code 跳过敏感文件。
11. ToolRouter 能分发 list_files / read_file / search_code。
12. 未知工具返回 UNKNOWN_TOOL。
13. 不实现写文件 / 命令 / Git / Patch。
14. 现有 Settings / Agents / Team / Workflow / Tools 配置保存不受影响。
15. 没有修改 Demo / prototype / docs。

运行验收命令：

npm run compile

如果项目有测试脚本，可以运行：

npm test

如果没有测试脚本，可以至少通过临时 debug action 或手动调用 ToolRouter 确认：

- list_files
- read_file
- search_code

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. WorkspaceGuard 实现了哪些检查。
5. FileTools 实现了哪些方法。
6. SearchTools 实现了哪些方法。
7. ToolRouter 支持哪些工具。
8. 是否实现 ToolServer HTTP /tools/call，如果没有，说明原因。
9. npm run compile 是否通过。
10. 是否确认没有实现写文件 / 命令 / Git / Patch。
11. 是否确认没有接 AutoGen / Gemini / Python / WebSocket。
12. 下一步建议执行哪个 Task。