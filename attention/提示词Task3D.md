你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 3D：实现 Tools / Safety 配置的本地保存、加载和基础管理。

当前上下文：
Task 1 已完成：
- VS Code 插件可以编译和启动
- AutoGen Control Webview 可以打开
- Webview ⇄ Extension 的基础 placeholder 链路可用

Task 2A～2F 已完成：
- Webview 已经有 6 个 Tab：Run / Agents / Team / Tools / Workflow / Settings
- 六个 Tab 可以切换
- 所有页面控件框子已补齐
- 所有主要按钮已有 data-action
- 所有主要 input/select/textarea/checkbox 已有 data-field
- webview-bridge.js 可以统一绑定 data-action
- collectFields() 可以收集 data-field
- MessageDispatcher 可以返回 placeholder success
- event-log 可以显示 sent / response
- settings.apiKey 在日志中已经脱敏

Task 3A 已完成：
- Settings 页配置可以保存和加载
- ConfigStore 已存在
- SecretStore 已存在
- settings.save / settings.load 已经是真实逻辑
- API Key 使用 VS Code SecretStorage
- 普通 settings 使用 VS Code globalState
- 默认模型配置使用 Gemini OpenAI-compatible

Task 3B 已完成：
- Agents 页配置可以保存和加载
- agents.load 已实现
- agent.save / create / copy / disable / delete / reset 已实现
- 默认 6 个 Agents 已存在
- 默认模型为 gemini-3-flash-preview

Task 3C 已完成：
- Team / Workflow 配置可以保存和加载
- teams.load / workflows.load 已实现
- team.save / create / copy / delete / setDefault / restoreDefault 已实现
- workflow.save / saveAsTemplate / setDefault 已实现
- 默认 Teams / Workflows 已存在

本次只做 Tools / Safety 配置保存和加载。
不要接 AutoGen。
不要启动 Python。
不要接 WebSocket。
不要实现真实工具调用。
不要实现真实权限拦截。
不要实现真实文件读写、Diff、Git、Terminal。

============================================================
一、本次目标
============================================================

实现 Tools / Safety 配置的本地保存、加载和基础管理。

必须完成：

1. ConfigStore 增加 Tools 配置读写方法。
2. 实现 tools.load。
3. 实现 tool.permission.save。
4. 实现 tool.permission.batchEdit。
5. 实现 tool.schema.save。
6. 实现 tool.allowlist.save。
7. 实现 tool.blocklist.save。
8. 实现 tool.sensitiveFiles.save。
9. 实现 tool.globalSafety.save。
10. tool.create / tool.test 暂时可以 placeholder，但不能报错。
11. Webview 初始化时能加载 Tools / Safety 配置。
12. Tools 页能根据 tools.load.result 回填权限矩阵、白名单、黑名单、敏感文件、安全开关。
13. 修改 Tools 页配置后点击保存，刷新或重新打开 Webview 后配置仍然存在。
14. npm run compile 通过。

本次不要做：
- 真实 ToolServer 权限拦截
- 真实文件读取
- 真实命令执行
- 真实 apply_patch
- 真实 git_diff
- 真实 AutoGen tool 注入
- Python 服务
- WebSocket

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. src/extension.ts
2. src/webview/AgentControlPanelProvider.ts
3. src/webview/MessageDispatcher.ts
4. src/storage/ConfigStore.ts
5. media/webview.html
6. media/webview-bridge.js
7. package.json

可以只读参考：
8. docs/07_Tools工具系统与权限控制详细设计.md
9. docs/10_配置存储与SecretStorage详细设计.md
10. docs/02_Webview与Extension通信协议详细设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要修改 agent-service。
不要修改 src/tools。
不要修改 src/runtime，除非发现编译错误必须小修。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. src/storage/ConfigStore.ts
2. src/webview/MessageDispatcher.ts
3. src/webview/AgentControlPanelProvider.ts
4. media/webview-bridge.js
5. media/webview.html

必要时可以小改：
6. src/extension.ts
7. src/types/messages.ts
8. 新增 src/types/tools.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. agent-service 目录
4. src/tools 目录
5. src/runtime 目录
6. config 目录

============================================================
四、ToolsConfig 数据结构要求
============================================================

Tools 配置至少包含这些字段：

{
  "permissions": {
    "Planner": {
      "list_files": "readonly",
      "read_file": "deny",
      "search_code": "deny",
      "propose_patch": "deny",
      "apply_patch": "deny",
      "run_command": "deny",
      "git_diff": "deny",
      "git_status": "deny"
    },
    "Codebase": {
      "list_files": "allow",
      "read_file": "allow",
      "search_code": "allow",
      "propose_patch": "deny",
      "apply_patch": "deny",
      "run_command": "deny",
      "git_diff": "allow",
      "git_status": "allow"
    }
  },
  "registry": [
    {
      "name": "read_file",
      "description": "读取 workspace 内指定文件内容",
      "enabled": true,
      "risk": "medium",
      "schema": "{...}",
      "returnPreview": "{...}"
    }
  ],
  "commandAllowlist": [
    "mvn test",
    "mvn -q test",
    "gradle test",
    "npm test",
    "npm run build",
    "pnpm test",
    "pnpm build",
    "python -m pytest"
  ],
  "commandBlocklist": [
    "rm",
    "del",
    "format",
    "curl",
    "wget",
    "ssh",
    "scp",
    "git push",
    "npm publish",
    "powershell",
    "sudo"
  ],
  "sensitiveFileBlocklist": [
    ".env",
    "*.pem",
    "id_rsa",
    "id_ed25519",
    "credentials.json",
    "application-prod.yml",
    "*.p12",
    "*.key"
  ],
  "globalSafety": {
    "denyOutsideWorkspace": true,
    "forcePatchOnly": true,
    "confirmApplyPatch": true,
    "confirmRunCommand": true,
    "denyDangerousTools": true,
    "enableToolAuditLog": true
  }
}

权限值只能使用：

- deny
- allow
- confirm
- readonly
- whitelist

============================================================
五、默认 Tools 配置要求
============================================================

ConfigStore 必须提供默认 Tools 配置。

默认工具行至少包含：

1. list_files
2. read_file
3. search_code
4. propose_patch
5. apply_patch
6. run_command
7. git_diff
8. git_status

默认 Agent 列至少包含：

1. Planner
2. Codebase
3. Developer
4. Reviewer
5. Tester

默认权限矩阵：

Planner:
- list_files = readonly
- read_file = deny
- search_code = deny
- propose_patch = deny
- apply_patch = deny
- run_command = deny
- git_diff = deny
- git_status = deny

Codebase:
- list_files = allow
- read_file = allow
- search_code = allow
- propose_patch = deny
- apply_patch = deny
- run_command = deny
- git_diff = allow
- git_status = allow

Developer:
- list_files = allow
- read_file = allow
- search_code = allow
- propose_patch = allow
- apply_patch = confirm
- run_command = deny
- git_diff = allow
- git_status = allow

Reviewer:
- list_files = allow
- read_file = allow
- search_code = allow
- propose_patch = deny
- apply_patch = deny
- run_command = deny
- git_diff = allow
- git_status = allow

Tester:
- list_files = readonly
- read_file = readonly
- search_code = readonly
- propose_patch = deny
- apply_patch = deny
- run_command = confirm
- git_diff = allow
- git_status = allow

默认 Command Allowlist：

mvn test
mvn -q test
gradle test
npm test
npm run build
pnpm test
pnpm build
python -m pytest

默认 Command Blocklist：

rm
del
format
curl
wget
ssh
scp
git push
npm publish
powershell
sudo
chmod
chown

默认 Sensitive File Blocklist：

.env
*.pem
id_rsa
id_ed25519
credentials.json
application-prod.yml
*.p12
*.key

默认 Global Safety 全部为 true：

denyOutsideWorkspace = true
forcePatchOnly = true
confirmApplyPatch = true
confirmRunCommand = true
denyDangerousTools = true
enableToolAuditLog = true

============================================================
六、ConfigStore 要求
============================================================

修改 src/storage/ConfigStore.ts。

增加至少这些方法：

1. loadToolsConfig(): Promise<ToolsConfig>
2. saveToolsConfig(config: ToolsConfig): Promise<void>
3. getDefaultToolsConfig(): ToolsConfig
4. saveToolPermissions(permissions: ToolsConfig["permissions"]): Promise<ToolsConfig>
5. saveCommandAllowlist(commands: string[] | string): Promise<ToolsConfig>
6. saveCommandBlocklist(commands: string[] | string): Promise<ToolsConfig>
7. saveSensitiveFileBlocklist(patterns: string[] | string): Promise<ToolsConfig>
8. saveGlobalSafety(globalSafety: ToolsConfig["globalSafety"]): Promise<ToolsConfig>
9. saveToolSchema(toolName: string, schema: string, returnPreview?: string, description?: string): Promise<ToolsConfig>

保存 key：

autogenAgent.tools

要求：

1. 如果没有保存过 Tools 配置，loadToolsConfig 返回 getDefaultToolsConfig。
2. saveToolsConfig 使用 context.globalState.update。
3. 保存时合并默认配置，避免缺字段。
4. saveCommandAllowlist 支持 textarea 字符串，按行拆分，去掉空行。
5. saveCommandBlocklist 支持 textarea 字符串，按行拆分，去掉空行。
6. saveSensitiveFileBlocklist 支持 textarea 字符串，按行拆分，去掉空行。
7. saveGlobalSafety 只保存布尔值。
8. saveToolSchema 根据 tool.name 更新 registry 中对应工具；如果不存在则新增。
9. 不要在 Tools 配置中保存 API Key 或任何 Secret。

============================================================
七、MessageDispatcher 要求
============================================================

修改 src/webview/MessageDispatcher.ts。

Tools action 改为真实配置操作：

必须实现：

1. tools.load
2. tool.permission.save
3. tool.permission.batchEdit
4. tool.schema.save
5. tool.allowlist.save
6. tool.blocklist.save
7. tool.sensitiveFiles.save
8. tool.globalSafety.save

以下 action 暂时 placeholder：

9. tool.create
10. tool.test

------------------------------------------------------------
1. tools.load
------------------------------------------------------------

返回：

{
  "ok": true,
  "type": "tools.load.result",
  "requestId": "...",
  "payload": {
    "toolsConfig": {...}
  }
}

------------------------------------------------------------
2. tool.permission.save
------------------------------------------------------------

从 message.payload.fields 中读取以 toolPermission. 开头的字段。

字段示例：

toolPermission.Planner.list_files
toolPermission.Codebase.read_file
toolPermission.Developer.propose_patch
toolPermission.Tester.run_command

转换成：

permissions[agent][tool] = value

保存后返回：

{
  "ok": true,
  "type": "tool.permission.save.result",
  "requestId": "...",
  "payload": {
    "message": "Tool permissions saved",
    "toolsConfig": {...}
  }
}

------------------------------------------------------------
3. tool.permission.batchEdit
------------------------------------------------------------

本次可以 placeholder success。

返回：

{
  "ok": true,
  "type": "tool.permission.batchEdit.result",
  "payload": {
    "message": "Batch edit placeholder"
  }
}

------------------------------------------------------------
4. tool.schema.save
------------------------------------------------------------

从 fields 读取：

tool.name
tool.description
tool.schema
tool.returnPreview

调用 saveToolSchema。

返回：

{
  "ok": true,
  "type": "tool.schema.save.result",
  "payload": {
    "message": "Tool schema saved",
    "toolsConfig": {...}
  }
}

------------------------------------------------------------
5. tool.allowlist.save
------------------------------------------------------------

从 fields["tool.commandAllowlist"] 读取 textarea 文本。
按行拆分保存。

返回：

{
  "ok": true,
  "type": "tool.allowlist.save.result",
  "payload": {
    "message": "Command allowlist saved",
    "toolsConfig": {...}
  }
}

------------------------------------------------------------
6. tool.blocklist.save
------------------------------------------------------------

从 fields["tool.commandBlocklist"] 读取 textarea 文本。
按行拆分保存。

返回：

{
  "ok": true,
  "type": "tool.blocklist.save.result",
  "payload": {
    "message": "Command blocklist saved",
    "toolsConfig": {...}
  }
}

------------------------------------------------------------
7. tool.sensitiveFiles.save
------------------------------------------------------------

从 fields["tool.sensitiveFileBlocklist"] 读取 textarea 文本。
按行拆分保存。

返回：

{
  "ok": true,
  "type": "tool.sensitiveFiles.save.result",
  "payload": {
    "message": "Sensitive file blocklist saved",
    "toolsConfig": {...}
  }
}

------------------------------------------------------------
8. tool.globalSafety.save
------------------------------------------------------------

从 fields 读取：

safety.denyOutsideWorkspace
safety.forcePatchOnly
safety.confirmApplyPatch
safety.confirmRunCommand
safety.denyDangerousTools
safety.enableToolAuditLog

保存到 globalSafety。

返回：

{
  "ok": true,
  "type": "tool.globalSafety.save.result",
  "payload": {
    "message": "Global safety saved",
    "toolsConfig": {...}
  }
}

------------------------------------------------------------
9. tool.create / tool.test
------------------------------------------------------------

本次仍然 placeholder success，不实现真实逻辑。

------------------------------------------------------------
10. 未知 action
------------------------------------------------------------

继续返回 UNKNOWN_ACTION。

不要破坏 Run / Settings / Agents / Team / Workflow 已有 action。

============================================================
八、Webview 初始化和回填要求
============================================================

修改 media/webview-bridge.js。

必须实现：

1. DOMContentLoaded 后自动发送 tools.load。
2. 收到 tools.load.result 后回填 Tools 页表单。
3. 收到 tool.permission.save.result 后回填 Tools 页表单。
4. 收到 tool.schema.save.result 后回填 Tools 页表单。
5. 收到 tool.allowlist.save.result 后回填 Tools 页表单。
6. 收到 tool.blocklist.save.result 后回填 Tools 页表单。
7. 收到 tool.sensitiveFiles.save.result 后回填 Tools 页表单。
8. 收到 tool.globalSafety.save.result 后回填 Tools 页表单。
9. 写入 event-log 对应 response。

如果当前 webview-bridge.js 已经有统一消息处理，不要重写整个文件，只增加 Tools 相关处理。

============================================================
九、Tools 回填规则
============================================================

实现或补充 applyToolsConfig(toolsConfig)。

必须回填：

1. 权限矩阵 select

把：

permissions.Planner.list_files

回填到：

data-field="toolPermission.Planner.list_files"

把：

permissions.Developer.propose_patch

回填到：

data-field="toolPermission.Developer.propose_patch"

2. Command Allowlist

把 commandAllowlist 数组转成多行文本，回填：

data-field="tool.commandAllowlist"

3. Command Blocklist

把 commandBlocklist 数组转成多行文本，回填：

data-field="tool.commandBlocklist"

4. Sensitive File Blocklist

把 sensitiveFileBlocklist 数组转成多行文本，回填：

data-field="tool.sensitiveFileBlocklist"

5. Global Safety

回填 checkbox：

safety.denyOutsideWorkspace
safety.forcePatchOnly
safety.confirmApplyPatch
safety.confirmRunCommand
safety.denyDangerousTools
safety.enableToolAuditLog

6. Tool Registry / Tool Schema

如果 registry 中有 read_file，默认回填 read_file：

tool.name
tool.description
tool.schema
tool.returnPreview

如果没有 read_file，则回填 registry 第一个工具。

============================================================
十、HTML 要求
============================================================

检查 media/webview.html 的 Tools 页。

必须确保存在以下 data-field：

权限矩阵：
toolPermission.Planner.list_files
toolPermission.Planner.read_file
toolPermission.Planner.search_code
toolPermission.Planner.propose_patch
toolPermission.Planner.apply_patch
toolPermission.Planner.run_command
toolPermission.Planner.git_diff
toolPermission.Planner.git_status

toolPermission.Codebase.list_files
toolPermission.Codebase.read_file
toolPermission.Codebase.search_code
toolPermission.Codebase.propose_patch
toolPermission.Codebase.apply_patch
toolPermission.Codebase.run_command
toolPermission.Codebase.git_diff
toolPermission.Codebase.git_status

toolPermission.Developer.list_files
toolPermission.Developer.read_file
toolPermission.Developer.search_code
toolPermission.Developer.propose_patch
toolPermission.Developer.apply_patch
toolPermission.Developer.run_command
toolPermission.Developer.git_diff
toolPermission.Developer.git_status

toolPermission.Reviewer.list_files
toolPermission.Reviewer.read_file
toolPermission.Reviewer.search_code
toolPermission.Reviewer.propose_patch
toolPermission.Reviewer.apply_patch
toolPermission.Reviewer.run_command
toolPermission.Reviewer.git_diff
toolPermission.Reviewer.git_status

toolPermission.Tester.list_files
toolPermission.Tester.read_file
toolPermission.Tester.search_code
toolPermission.Tester.propose_patch
toolPermission.Tester.apply_patch
toolPermission.Tester.run_command
toolPermission.Tester.git_diff
toolPermission.Tester.git_status

工具编辑：
tool.name
tool.description
tool.schema
tool.returnPreview

列表：
tool.commandAllowlist
tool.commandBlocklist
tool.sensitiveFileBlocklist

安全开关：
safety.denyOutsideWorkspace
safety.forcePatchOnly
safety.confirmApplyPatch
safety.confirmRunCommand
safety.denyDangerousTools
safety.enableToolAuditLog

如果字段已存在，不要重复创建。
如果缺失，只补 Tools 页缺失字段。

============================================================
十一、不要做的事情
============================================================

本次不要做：

1. 不要接 AutoGen。
2. 不要启动 Python。
3. 不要接 WebSocket。
4. 不要真实执行工具。
5. 不要真实读取文件。
6. 不要真实执行命令。
7. 不要真实 apply_patch。
8. 不要真实 git 操作。
9. 不要保存 Agent / Team / Workflow / Settings 配置。
10. 不要实现 ToolServer。
11. 不要修改 src/tools。
12. 不要修改 src/runtime。
13. 不要修改 agent-service。
14. 不要修改 Demo / prototype。
15. 不要修改 docs。

============================================================
十二、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. Webview 打开后自动触发 tools.load。
3. Tools 页权限矩阵能回填默认配置。
4. Tools 页 command allowlist 能回填默认配置。
5. Tools 页 command blocklist 能回填默认配置。
6. Tools 页 sensitive file blocklist 能回填默认配置。
7. Tools 页 global safety checkbox 能回填默认配置。
8. 默认 global safety 全部为 true。
9. 修改权限矩阵后点击保存权限，刷新或重新打开 Webview 后仍然存在。
10. 修改 command allowlist 后点击保存白名单，刷新或重新打开 Webview 后仍然存在。
11. 修改 command blocklist 后点击保存黑名单，刷新或重新打开 Webview 后仍然存在。
12. 修改 sensitive file blocklist 后点击保存敏感文件，刷新或重新打开 Webview 后仍然存在。
13. 修改 global safety 后点击保存安全策略，刷新或重新打开 Webview 后仍然存在。
14. tool.schema.save 可以保存当前工具 schema 和 returnPreview。
15. tool.create / tool.test 仍然 placeholder。
16. Run / Settings / Agents / Team / Workflow 页已有功能不受影响。
17. 没有接 AutoGen / Python / WebSocket / 真实工具。
18. 没有修改 Demo / prototype / docs。

运行验收命令：

npm run compile

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. ConfigStore 新增了哪些 Tools 方法。
5. MessageDispatcher 实现了哪些 Tools action。
6. Webview 是否能加载默认 Tools 配置。
7. 权限矩阵是否能回填。
8. 白名单 / 黑名单 / 敏感文件是否能回填。
9. Global Safety 是否能回填。
10. Tools 配置保存后是否能持久化。
11. npm run compile 是否通过。
12. 是否确认没有接 AutoGen / Python / WebSocket / 真实工具。
13. 下一步建议执行哪个 Task。