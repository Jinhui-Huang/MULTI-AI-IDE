你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 5C：实现 Terminal / Command 工具的最小安全闭环：run_command 只允许白名单命令，并且必须通过用户确认。

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
- Command Allowlist / Blocklist 已有配置
- Global Safety 已有配置

Task 4A～4C 已完成：
- Python Service 可以启动 / 停止 / 健康检查
- task.create 可以创建 placeholder task
- WebSocket placeholder event stream 可以转发到 Webview

Task 5A 已完成：
- VS Code Tool 基础文件工具已实现
- WorkspaceGuard 已实现
- list_files / read_file / search_code 已实现
- 敏感文件拦截已实现
- workspace 外路径拦截已实现

Task 5B 已完成：
- PatchStore / DiffTools / PatchTools 已实现
- propose_patch / open_diff / apply_patch / reject_patch 最小闭环已实现
- patch.debug.proposePlaceholder 可以创建测试 patch
- patch.openDiff / patch.apply / patch.reject 可以工作

本次只做 run_command 的最小安全能力。
不要接真实 AutoGen。
不要调用 Gemini。
不要实现 Git。
不要实现复杂 shell。
不要实现后台长期进程。
不要绕过用户确认。

============================================================
一、本次目标
============================================================

实现 VS Code Extension 侧 Terminal / Command 工具的最小安全闭环：

1. 实现 CommandGuard。
2. 实现 TerminalTools.runCommand。
3. run_command 只能执行 allowlist 中的命令。
4. run_command 必须检查 blocklist。
5. run_command 必须检查 Global Safety 的 confirmRunCommand。
6. run_command 默认不直接执行，先创建 pending command approval。
7. 用户点击 command.approveOnce 后才执行。
8. 用户点击 command.reject 后拒绝。
9. 用户点击 command.addAllowlist 后把命令加入 allowlist。
10. 命令执行目录必须是当前 workspace root。
11. 命令输出要限制长度。
12. npm run compile 通过。

本次不要做：

- 真实 AutoGen tool 注入
- Gemini 调用
- Git
- 长时间交互式 terminal
- 任意 shell 执行
- 自动执行未确认命令
- 后台 daemon 任务
- 真实 WorkflowRunner

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. src/tools/WorkspaceGuard.ts
2. src/tools/ToolRouter.ts
3. src/tools/TerminalTools.ts
4. src/tools/CommandTools.ts
5. src/storage/ConfigStore.ts
6. src/webview/MessageDispatcher.ts
7. src/extension.ts
8. media/webview.html
9. media/webview-bridge.js
10. package.json

可以只读参考：
11. docs/07_Tools工具系统与权限控制详细设计.md
12. docs/08_VSCode文件_Diff_Terminal_Git工具联调详细设计.md
13. docs/11_安全边界与沙箱策略详细设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要接真实 AutoGen。
不要调用 Gemini。
不要实现 Git。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. src/tools/TerminalTools.ts
2. src/tools/CommandTools.ts
3. src/tools/ToolRouter.ts
4. src/tools/WorkspaceGuard.ts
5. src/storage/ConfigStore.ts
6. src/webview/MessageDispatcher.ts
7. src/extension.ts
8. media/webview-bridge.js
9. media/webview.html

必要时可以新增：
10. src/tools/CommandGuard.ts
11. src/tools/CommandStore.ts
12. src/types/command.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. agent-service 目录
4. src/runtime 目录
5. config 目录

============================================================
四、Command 数据结构要求
============================================================

定义 PendingCommand：

{
  "id": "cmd_xxx",
  "command": "mvn test",
  "cwd": "D:/project",
  "status": "pending",
  "createdAt": "...",
  "reason": "TesterAgent requested test command",
  "source": "run_command"
}

定义 CommandResult：

{
  "id": "cmd_xxx",
  "command": "mvn test",
  "cwd": "D:/project",
  "status": "completed",
  "exitCode": 0,
  "stdout": "...",
  "stderr": "...",
  "durationMs": 1234,
  "truncated": false
}

status 可用值：

- pending
- approved
- rejected
- running
- completed
- failed

============================================================
五、CommandStore 要求
============================================================

新增或实现 src/tools/CommandStore.ts。

CommandStore 可以是内存存储。

必须提供：

1. createPendingCommand(input): PendingCommand
2. getCommand(commandId: string): PendingCommand | undefined
3. getLatestPendingCommand(): PendingCommand | undefined
4. updateStatus(commandId: string, status: string): PendingCommand
5. saveResult(commandId: string, result: CommandResult): CommandResult
6. getResult(commandId: string): CommandResult | undefined

要求：

1. commandId 使用 cmd_ + 时间戳 + 随机短 id。
2. 不需要持久化。
3. 不要保存 API Key。
4. 不要自动执行命令。

============================================================
六、CommandGuard 要求
============================================================

新增或实现 src/tools/CommandGuard.ts。

必须提供：

1. normalizeCommand(command: string): string
2. isBlocked(command: string, blocklist: string[]): boolean
3. isAllowed(command: string, allowlist: string[]): boolean
4. assertCommandAllowed(command: string, toolsConfig): void
5. parseCommand(command: string): { executable: string; args: string[] }

安全要求：

1. command 不能为空。
2. command 长度不能超过 500 字符。
3. 禁止包含危险连接符：
   - &&
   - ||
   - ;
   - |
   - >
   - >>
   - <
   - `
4. 禁止包含换行。
5. 禁止 powershell / cmd / bash / sh 包裹任意命令，除非该完整命令在 allowlist 中。
6. blocklist 命中时必须拒绝。
7. allowlist 不命中时必须拒绝。
8. allowlist 允许精确匹配。
9. 第一版不做复杂通配。
10. 返回错误码：
    - COMMAND_EMPTY
    - COMMAND_TOO_LONG
    - COMMAND_BLOCKED
    - COMMAND_NOT_ALLOWLISTED
    - COMMAND_UNSAFE_SYNTAX

默认 allowlist 从 ToolsConfig.commandAllowlist 读取。
默认 blocklist 从 ToolsConfig.commandBlocklist 读取。

============================================================
七、TerminalTools 要求
============================================================

实现或修正 src/tools/TerminalTools.ts。

必须提供：

1. requestRunCommand(command: string, reason?: string): Promise<PendingCommand>
2. approveAndRun(commandId?: string): Promise<CommandResult>
3. rejectCommand(commandId?: string, reason?: string): Promise<PendingCommand>
4. addCommandToAllowlist(commandId?: string): Promise<unknown>
5. runCommandDirect(command: string): Promise<CommandResult>

注意：

runCommandDirect 只能被 approveAndRun 内部调用。
不要让 ToolRouter 直接暴露 runCommandDirect。

------------------------------------------------------------
1. requestRunCommand
------------------------------------------------------------

逻辑：

1. 检查 workspace 是否打开。
2. 读取 ToolsConfig。
3. 用 CommandGuard 检查 blocklist / allowlist / unsafe syntax。
4. 如果命令不安全，直接返回错误。
5. 如果 globalSafety.confirmRunCommand 为 true，创建 PendingCommand，status=pending。
6. 如果 confirmRunCommand 为 false，可以直接执行，但默认配置中它应为 true。
7. 返回 PendingCommand。

本项目默认必须要求确认。

------------------------------------------------------------
2. approveAndRun
------------------------------------------------------------

逻辑：

1. 如果传 commandId，取该 command。
2. 如果不传，取 latest pending command。
3. 找不到返回 COMMAND_NOT_FOUND。
4. 再次用 CommandGuard 检查。
5. status 改为 running。
6. 调用 runCommandDirect。
7. 保存 result。
8. 返回 result。

------------------------------------------------------------
3. rejectCommand
------------------------------------------------------------

逻辑：

1. 找到 command。
2. status 改为 rejected。
3. 保存 reason。
4. 返回 command。

------------------------------------------------------------
4. addCommandToAllowlist
------------------------------------------------------------

逻辑：

1. 找到 command。
2. 读取 ToolsConfig。
3. 如果 allowlist 没有该命令，追加。
4. 保存 ToolsConfig。
5. 返回新的 allowlist。

------------------------------------------------------------
5. runCommandDirect
------------------------------------------------------------

执行要求：

1. 使用 child_process.spawn。
2. cwd 必须是 workspace root。
3. shell 默认 false。
4. 仅执行 parseCommand 得到的 executable + args。
5. 超时默认 60 秒。
6. stdout / stderr 最大各 20000 字符，超出截断。
7. 记录 durationMs。
8. 退出码保存 exitCode。
9. 不打开交互式 VS Code Terminal。
10. 不执行长时间 watch 命令。

如果 Windows 下常见命令例如 npm.cmd / pnpm.cmd / mvn.cmd 解析失败，可以做最小兼容：
- npm -> npm.cmd
- pnpm -> pnpm.cmd
- npx -> npx.cmd
- mvn -> mvn.cmd
- gradle -> gradle.bat

但不要使用 shell:true 绕过安全检查。

============================================================
八、ToolRouter 要求
============================================================

修改 src/tools/ToolRouter.ts。

新增支持工具：

1. run_command

调用逻辑：

{
  "tool": "run_command",
  "args": {
    "command": "mvn test",
    "reason": "Run project tests"
  }
}

ToolRouter 只调用 TerminalTools.requestRunCommand。

也就是说：
run_command 只创建 pending approval，不直接执行。

返回：

{
  "ok": true,
  "message": "Command approval required",
  "command": {
    "id": "cmd_xxx",
    "command": "mvn test",
    "status": "pending"
  },
  "approvalRequired": true
}

不要破坏 list_files / read_file / search_code / patch 工具。

============================================================
九、MessageDispatcher 要求
============================================================

修改 src/webview/MessageDispatcher.ts。

将这些 action 改为真实逻辑：

1. command.approveOnce
2. command.addAllowlist
3. command.reject

新增开发测试 action：

4. command.debug.requestMvnTest

------------------------------------------------------------
1. command.debug.requestMvnTest
------------------------------------------------------------

用于从 UI 生成一个 pending command。

逻辑：

调用 TerminalTools.requestRunCommand("mvn test", "Debug test command")

如果当前 workspace 不是 Maven 项目也没关系，本次只测试 pending approval。

返回 pending command。

------------------------------------------------------------
2. command.approveOnce
------------------------------------------------------------

逻辑：

1. 从 payload.commandId 或 current/latest pending command 获取 command。
2. 调用 TerminalTools.approveAndRun。
3. 返回 CommandResult。

成功返回：

{
  "ok": true,
  "type": "command.approveOnce.result",
  "payload": {
    "message": "Command executed",
    "result": {...}
  }
}

失败返回明确错误。

------------------------------------------------------------
3. command.addAllowlist
------------------------------------------------------------

逻辑：

1. 找到 command。
2. 调用 TerminalTools.addCommandToAllowlist。
3. 返回新的 allowlist。

------------------------------------------------------------
4. command.reject
------------------------------------------------------------

逻辑：

1. 找到 command。
2. 调用 TerminalTools.rejectCommand。
3. 返回 rejected command。

------------------------------------------------------------
5. 其他 command action
------------------------------------------------------------

不要删除原有 placeholder。
不要破坏其他 action。

============================================================
十、Webview 要求
============================================================

修改 media/webview.html 和 media/webview-bridge.js。

如果 Run 页 Command Approval 区还没有测试按钮，增加：

<button data-action="command.debug.requestMvnTest">生成测试命令</button>

要求：

1. 点击 command.debug.requestMvnTest 后，event-log 显示 commandId。
2. 保存 currentCommandId 到前端状态。
3. 点击 command.approveOnce 时，如果有 currentCommandId，把 commandId 传给 Extension。
4. 点击 command.addAllowlist 时，如果有 currentCommandId，把 commandId 传给 Extension。
5. 点击 command.reject 时，如果有 currentCommandId，把 commandId 传给 Extension。
6. 命令执行结果不要完整刷爆页面。
7. stdout/stderr 最多显示前 3000 字符。
8. 显示 exitCode / durationMs。

不要大改 Run 页 UI。

============================================================
十一、错误码要求
============================================================

至少支持这些错误码：

COMMAND_EMPTY
COMMAND_TOO_LONG
COMMAND_BLOCKED
COMMAND_NOT_ALLOWLISTED
COMMAND_UNSAFE_SYNTAX
COMMAND_NOT_FOUND
COMMAND_EXEC_FAILED
WORKSPACE_NOT_OPEN
COMMAND_TIMEOUT

错误格式：

{
  "ok": false,
  "error": {
    "code": "COMMAND_BLOCKED",
    "message": "Command is blocked: git push"
  }
}

============================================================
十二、安全要求
============================================================

必须保证：

1. run_command 默认不直接执行。
2. 必须用户点击 command.approveOnce 才执行。
3. blocklist 命中必须拒绝。
4. allowlist 不命中必须拒绝。
5. 禁止 && / || / ; / | 等组合命令。
6. 禁止 workspace 外 cwd。
7. 不使用 shell:true。
8. 不执行交互式命令。
9. 输出长度限制。
10. 不把 API Key 或 Secret 输出到日志。
11. 不允许 git push / npm publish。
12. 不允许 powershell 任意执行。

============================================================
十三、不要做的事情
============================================================

本次不要做：

1. 不要接 AutoGen。
2. 不要调用 Gemini。
3. 不要启动 Python。
4. 不要改 Python Service。
5. 不要实现 WebSocket 新逻辑。
6. 不要实现 Git。
7. 不要实现 apply_patch 变化。
8. 不要实现复杂 Terminal UI。
9. 不要使用 shell:true 绕过安全。
10. 不要自动执行命令。
11. 不要修改 Demo / prototype。
12. 不要修改 docs。

============================================================
十四、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. command.debug.requestMvnTest 可以创建 pending command。
3. run_command 不会直接执行命令。
4. command.approveOnce 才会执行 pending command。
5. command.reject 可以拒绝 pending command。
6. command.addAllowlist 可以把命令加入 allowlist。
7. blocklist 命令会被拒绝。
8. 不在 allowlist 的命令会被拒绝。
9. 带 && / || / ; / | 的命令会被拒绝。
10. 执行 cwd 是 workspace root。
11. stdout / stderr 有长度限制。
12. ToolRouter 支持 run_command。
13. list_files / read_file / search_code / patch 工具不受影响。
14. Settings / Agents / Team / Workflow / Tools 配置保存不受影响。
15. 没有接 AutoGen / Gemini / Python / WebSocket / Git。
16. 没有修改 Demo / prototype / docs。

运行验收命令：

npm run compile

手动测试建议：

1. 打开一个普通 workspace。
2. 确认 Tools 页 allowlist 包含 mvn test 或 npm test。
3. 点击“生成测试命令”。
4. 确认 event-log 显示 pending commandId。
5. 点击“允许一次”。
6. 确认命令执行结果显示 exitCode。
7. 测试一个 blocklist 命令，例如 git push，应返回 COMMAND_BLOCKED。
8. 测试一个组合命令，例如 npm test && git push，应返回 COMMAND_UNSAFE_SYNTAX。

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. CommandGuard 实现了哪些检查。
5. CommandStore 实现了哪些方法。
6. TerminalTools 实现了哪些方法。
7. ToolRouter 是否支持 run_command。
8. command.debug.requestMvnTest 是否可用。
9. command.approveOnce 是否会执行命令。
10. npm run compile 是否通过。
11. 是否确认没有接 AutoGen / Gemini / Python / WebSocket / Git。
12. 下一步建议执行哪个 Task。