你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 5D：实现 Git 工具的最小只读能力：git_status / git_diff。

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

Task 5C 已完成：
- CommandGuard / CommandStore / TerminalTools 已实现
- run_command 只创建 pending command
- command.approveOnce 后才执行
- allowlist / blocklist / unsafe syntax 检查已实现

本次只做 Git 只读工具。
不要实现 git apply。
不要实现 git commit。
不要实现 git push。
不要实现 git checkout。
不要实现 git reset。
不要接 AutoGen。
不要调用 Gemini。
不要修改 Python Service。

============================================================
一、本次目标
============================================================

实现 VS Code Extension 侧 Git 只读工具：

1. git_status：读取当前 workspace 的 Git 状态。
2. git_diff：读取当前 workspace 的 Git diff。
3. Git 工具必须是只读。
4. Git 工具必须在 workspace root 中执行。
5. Git 工具不能接受任意命令参数执行。
6. Git 工具不能执行 git push / commit / reset / checkout / apply。
7. ToolRouter 支持 git_status / git_diff。
8. 可以在 Tools 页或 Run 页增加 Debug 按钮测试。
9. npm run compile 通过。

本次不要做：

- git apply
- git commit
- git push
- git checkout
- git reset
- git stash
- git clean
- 修改文件
- 调用 AutoGen
- 调用 Gemini
- 修改 Python Service
- WebSocket 新逻辑

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. src/tools/WorkspaceGuard.ts
2. src/tools/ToolRouter.ts
3. src/tools/GitTools.ts
4. src/tools/CommandGuard.ts
5. src/tools/TerminalTools.ts
6. src/storage/ConfigStore.ts
7. src/webview/MessageDispatcher.ts
8. src/extension.ts
9. media/webview.html
10. media/webview-bridge.js
11. package.json

可以只读参考：
12. docs/08_VSCode文件_Diff_Terminal_Git工具联调详细设计.md
13. docs/11_安全边界与沙箱策略详细设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要接真实 AutoGen。
不要调用 Gemini。
不要修改 Python Service。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. src/tools/GitTools.ts
2. src/tools/ToolRouter.ts
3. src/tools/WorkspaceGuard.ts
4. src/webview/MessageDispatcher.ts
5. src/extension.ts
6. media/webview-bridge.js
7. media/webview.html

必要时可以新增或修改：
8. src/types/git.ts
9. src/tools/GitCommandGuard.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. agent-service 目录
4. src/runtime 目录
5. config 目录

============================================================
四、GitTools 要求
============================================================

实现或修正 src/tools/GitTools.ts。

必须提供：

1. gitStatus(): Promise<GitStatusResult>
2. gitDiff(options?: GitDiffOptions): Promise<GitDiffResult>
3. isGitRepository(): Promise<boolean>

GitStatusResult 示例：

{
  "ok": true,
  "isGitRepository": true,
  "branch": "main",
  "shortStatus": " M src/App.ts\n?? new-file.ts",
  "files": [
    {
      "path": "src/App.ts",
      "status": "modified"
    },
    {
      "path": "new-file.ts",
      "status": "untracked"
    }
  ]
}

GitDiffOptions 示例：

{
  "cached": false,
  "path": "src/App.ts",
  "maxBytes": 200000
}

GitDiffResult 示例：

{
  "ok": true,
  "diff": "...",
  "truncated": false,
  "bytes": 12345
}

============================================================
五、Git 命令执行要求
============================================================

GitTools 可以使用 child_process.spawn 执行 git。

只允许执行这些命令：

1. git status --short --branch
2. git diff --no-ext-diff -- src/path
3. git diff --cached --no-ext-diff -- src/path
4. git diff --no-ext-diff
5. git diff --cached --no-ext-diff
6. git rev-parse --is-inside-work-tree

要求：

1. cwd 必须是 workspace root。
2. shell 必须为 false。
3. 不允许用户传完整 git 命令。
4. 用户只能传 options.path 和 options.cached。
5. options.path 必须是 workspace 相对路径。
6. options.path 必须通过 WorkspaceGuard。
7. 输出最大 200000 bytes，超出截断。
8. 超时时间默认 10 秒。
9. stderr 必须捕获。
10. exitCode 非 0 时返回明确错误。

不能执行：

- git push
- git commit
- git checkout
- git reset
- git apply
- git clean
- git stash
- git pull
- git fetch
- git merge
- git rebase
- git config
- git remote

============================================================
六、WorkspaceGuard 要求
============================================================

GitTools 必须使用 WorkspaceGuard。

要求：

1. 没打开 workspace 时返回 WORKSPACE_NOT_OPEN。
2. path 参数不能是绝对路径。
3. path 参数不能包含 ../ 跳出 workspace。
4. path 参数解析后必须位于 workspace 内。
5. git diff path 时传给 git 的 path 必须是相对路径。
6. 不允许 workspace 外 cwd。

============================================================
七、git_status 详细要求
============================================================

gitStatus() 逻辑：

1. 确认 workspace 打开。
2. 执行：
   git rev-parse --is-inside-work-tree
3. 如果不是 git repo，返回：

{
  "ok": true,
  "isGitRepository": false,
  "branch": "",
  "shortStatus": "",
  "files": []
}

4. 如果是 git repo，执行：
   git status --short --branch

5. 解析输出。

示例输出：

## main...origin/main
 M src/App.ts
?? README_NEW.md
A  src/NewFile.ts
D  src/OldFile.ts

解析为：

- modified
- untracked
- added
- deleted
- renamed
- unknown

不要求解析非常复杂，但至少能识别：

- M
- A
- D
- ??
- R

============================================================
八、git_diff 详细要求
============================================================

gitDiff(options) 逻辑：

1. 确认 workspace 打开。
2. 确认是 git repo。
3. 如果 options.path 存在，先用 WorkspaceGuard 校验。
4. 根据 cached 决定命令：

cached=false:
git diff --no-ext-diff -- path

cached=true:
git diff --cached --no-ext-diff -- path

5. 如果没有 path，则读取全量 diff。
6. 输出超过 maxBytes 时截断。
7. 返回 truncated=true。
8. 不要把完整巨大 diff 写入 console.log。
9. event-log 最多显示前 3000 字符。

如果不是 Git repo，返回：

{
  "ok": false,
  "error": {
    "code": "NOT_GIT_REPOSITORY",
    "message": "Workspace is not a Git repository."
  }
}

============================================================
九、ToolRouter 要求
============================================================

修改 src/tools/ToolRouter.ts。

新增支持：

1. git_status
2. git_diff

调用示例：

{
  "tool": "git_status",
  "args": {}
}

{
  "tool": "git_diff",
  "args": {
    "cached": false,
    "path": "src/App.ts",
    "maxBytes": 200000
  }
}

要求：

1. 未知工具继续返回 UNKNOWN_TOOL。
2. 工具错误转统一错误响应。
3. 不破坏 list_files / read_file / search_code / patch / run_command。

============================================================
十、MessageDispatcher 要求
============================================================

修改 src/webview/MessageDispatcher.ts。

新增开发测试 action：

1. git.debug.status
2. git.debug.diff

git.debug.status：

1. 调用 GitTools.gitStatus 或 ToolRouter git_status。
2. 返回结果。
3. Webview 日志显示 branch 和文件数量。

git.debug.diff：

1. 从 fields["git.debug.path"] 可选读取 path。
2. 从 fields["git.debug.cached"] 可选读取 cached。
3. 调用 GitTools.gitDiff 或 ToolRouter git_diff。
4. 返回 diff。
5. Webview 日志显示 diff 前 3000 字符。

不要把 git_status / git_diff 接成危险任意命令。

============================================================
十一、Webview Debug UI 要求
============================================================

可以在 Tools 页或 Run 页增加 Git Debug 小区域。

建议放 Tools 页 Debug 区。

增加：

<input data-field="git.debug.path" placeholder="可选：src/App.ts">
<input type="checkbox" data-field="git.debug.cached">
<button data-action="git.debug.status">Debug git_status</button>
<button data-action="git.debug.diff">Debug git_diff</button>

要求：

1. 点击 git.debug.status 后 event-log 显示结果摘要。
2. 点击 git.debug.diff 后 event-log 显示 diff 摘要。
3. diff 内容最多显示前 3000 字符。
4. 不要大改 UI。
5. 不要影响 Tools 配置保存。

============================================================
十二、错误码要求
============================================================

至少支持：

WORKSPACE_NOT_OPEN
NOT_GIT_REPOSITORY
GIT_COMMAND_FAILED
GIT_COMMAND_TIMEOUT
PATH_OUTSIDE_WORKSPACE
GIT_DIFF_TOO_LARGE
UNKNOWN_TOOL

错误格式：

{
  "ok": false,
  "error": {
    "code": "NOT_GIT_REPOSITORY",
    "message": "Workspace is not a Git repository."
  }
}

============================================================
十三、安全要求
============================================================

必须保证：

1. 不执行任何写入型 git 命令。
2. 不执行用户传入的任意 git 命令。
3. 不使用 shell:true。
4. cwd 必须是 workspace root。
5. path 必须是 workspace 相对路径。
6. path 不能跳出 workspace。
7. diff 输出长度有限制。
8. 不读取 API Key。
9. 不把过长 diff 全量刷到 event-log。
10. 不修改任何文件。

============================================================
十四、不要做的事情
============================================================

本次不要做：

1. 不要接 AutoGen。
2. 不要调用 Gemini。
3. 不要启动 Python。
4. 不要改 Python Service。
5. 不要实现 WebSocket 新逻辑。
6. 不要实现 git apply。
7. 不要实现 git commit。
8. 不要实现 git push。
9. 不要实现 git checkout/reset/clean/stash。
10. 不要修改 Demo / prototype。
11. 不要修改 docs。

============================================================
十五、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. git.debug.status 可以读取当前 workspace Git 状态。
3. git.debug.diff 可以读取当前 workspace Git diff。
4. 非 Git 仓库返回 NOT_GIT_REPOSITORY。
5. path 参数不能访问 workspace 外。
6. 不执行任何写入型 Git 命令。
7. 不使用 shell:true。
8. ToolRouter 支持 git_status / git_diff。
9. list_files / read_file / search_code 不受影响。
10. patch 工具不受影响。
11. run_command 工具不受影响。
12. Settings / Agents / Team / Workflow / Tools 配置保存不受影响。
13. 没有接 AutoGen / Gemini / Python / WebSocket。
14. 没有修改 Demo / prototype / docs。

运行验收命令：

npm run compile

手动测试建议：

1. 打开一个 Git workspace。
2. 修改一个文件但不提交。
3. 点击 Debug git_status。
4. 确认 event-log 显示 modified 文件。
5. 点击 Debug git_diff。
6. 确认 event-log 显示 diff 摘要。
7. 在非 Git 目录打开插件测试，确认返回 NOT_GIT_REPOSITORY。
8. 测试 git.debug.path = ../outside.txt，确认返回 PATH_OUTSIDE_WORKSPACE。

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. GitTools 实现了哪些方法。
5. ToolRouter 是否支持 git_status / git_diff。
6. git.debug.status 是否可用。
7. git.debug.diff 是否可用。
8. 是否确认没有执行写入型 Git 命令。
9. npm run compile 是否通过。
10. 是否确认没有接 AutoGen / Gemini / Python / WebSocket。
11. 下一步建议执行哪个 Task。