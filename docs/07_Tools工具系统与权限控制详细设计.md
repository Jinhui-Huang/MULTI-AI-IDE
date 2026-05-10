# 07_Tools工具系统与权限控制详细设计

> 文档版本：v1.0  
> 适用项目：AutoGen + VS Code 插件式多 Agent 代码 IDE  
> 对应 UI：`autogen_full_control_ui_config_complete.html` 的 **Tools** Tab，同时影响 Run / Workflow / Settings / Agents Tab  
> 目标读者：VS Code Extension 开发、Python AutoGen Service 开发、工具网关开发、Codex 执行开发

---

## 0. 资料依据与设计结论

### 0.1 参考资料

本设计参考以下官方资料与公开资料：

1. **AutoGen AgentChat Agents 文档**  
   AutoGen `AssistantAgent` 支持挂载工具，并可通过工具调用扩展 Agent 能力。  
   参考：`https://microsoft.github.io/autogen/stable//user-guide/agentchat-user-guide/tutorial/agents.html`

2. **AutoGen Core Tools 文档**  
   AutoGen 工具本质是可被 Agent 执行的代码，工具可以是普通函数、API 调用、第三方服务调用。  
   参考：`https://microsoft.github.io/autogen/stable//user-guide/core-user-guide/components/tools.html`

3. **AutoGen AgentChat tools API**  
   AutoGen 提供 `AgentTool`、`TeamTool` 等工具封装能力，可以将 Agent / Team 当成工具使用。  
   参考：`https://microsoft.github.io/autogen/stable//reference/python/autogen_agentchat.tools.html`

4. **VS Code Extension API**  
   VS Code 插件可使用 `workspace.fs`、`window.createTerminal`、`commands.executeCommand`、`SecretStorage`、OutputChannel 等能力。  
   参考：`https://code.visualstudio.com/api/references/vscode-api`

5. **VS Code Built-in Commands**  
   VS Code 可通过 `vscode.commands.executeCommand()` 调用内置命令，例如打开 diff、打开文件等。  
   参考：`https://code.visualstudio.com/api/references/commands`

6. **VS Code Webview 通信机制**  
   Webview UI 与 Extension Host 之间通过 `acquireVsCodeApi().postMessage()`、`webview.onDidReceiveMessage()` 和 `webview.postMessage()` 通信。  
   参考：`https://code.visualstudio.com/api/extension-guides/webview`

---

### 0.2 本文设计结论

本项目中的 Tools 系统不能简单等同于 AutoGen 的工具函数。  
因为代码 IDE 场景涉及本地项目、文件读写、终端执行、Git 操作、Diff 应用、敏感文件保护，所以必须设计成四层：

```text
AutoGen Agent
  ↓
AutoGen Tool Function
  ↓
ToolGateway / PermissionGuard
  ↓
VS Code Extension Tool Server
  ↓
VS Code API / Node FS / Terminal / Git
```

核心原则：

```text
1. AutoGen 不直接读写用户项目。
2. AutoGen 只能调用受控 Tool。
3. 所有 Tool 调用必须经过权限矩阵。
4. 写文件必须通过 propose_patch → 用户确认 → apply_patch。
5. run_command 必须默认需要确认。
6. 禁止访问 workspace 外文件。
7. 敏感文件默认禁止读取。
8. 所有 Tool Call 必须记录日志。
9. UI 必须能显示工具调用、参数、结果、风险和确认状态。
```

---

## 1. Tools 系统总体架构

### 1.1 架构图

```text
┌────────────────────────────────────────────┐
│ VS Code Webview UI                         │
│ Tools Tab / Run Tab / Approval Modal       │
└───────────────────────┬────────────────────┘
                        │ postMessage
                        ↓
┌────────────────────────────────────────────┐
│ VS Code Extension Host                     │
│ - WebviewMessageDispatcher                 │
│ - ToolServer                               │
│ - FileToolProvider                         │
│ - DiffToolProvider                         │
│ - TerminalToolProvider                     │
│ - GitToolProvider                          │
│ - SecretStorage                            │
└───────────────────────┬────────────────────┘
                        │ HTTP / WS
                        ↓
┌────────────────────────────────────────────┐
│ Python AutoGen Service                     │
│ - ToolGatewayClient                        │
│ - ToolRegistry                             │
│ - PermissionGuard                          │
│ - ApprovalManager                          │
│ - AuditLogger                              │
└───────────────────────┬────────────────────┘
                        │ tools=[...]
                        ↓
┌────────────────────────────────────────────┐
│ AutoGen Agents                             │
│ Planner / Codebase / Developer / Reviewer │
│ Tester / Summary                           │
└────────────────────────────────────────────┘
```

---

### 1.2 职责边界

| 层级 | 职责 | 不应该做 |
|---|---|---|
| Webview UI | 展示权限矩阵、工具日志、确认卡片、白名单配置 | 不直接访问文件、不直接运行命令 |
| Extension Host | 调用 VS Code API、执行真实文件/Diff/Terminal/Git 操作 | 不做 Agent 推理 |
| AutoGen Service | 生成 Tool 函数、执行权限判断、转发工具请求 | 不绕过 Extension 直接操作 workspace |
| AutoGen Agent | 决定是否调用工具、根据结果继续任务 | 不拥有真实文件系统权限 |
| ToolGateway | 统一权限、日志、确认、风险控制 | 不掺杂业务 Agent prompt |

---

## 2. Tools Tab UI 控件详细映射

### 2.1 Tools Tab 页面结构

Tools Tab 建议分成 6 个区块：

```text
Tools
├─ A. Tool Permission Matrix
├─ B. Global Safety
├─ C. Tool Registry
├─ D. Tool Schema Editor
├─ E. Command Allowlist / Blocklist
└─ F. Sensitive File Blocklist
```

---

### 2.2 A. Tool Permission Matrix

#### UI 控件

| 控件 | 类型 | 说明 |
|---|---|---|
| Agent 列 | table column | Planner / Codebase / Developer / Reviewer / Tester |
| Tool 行 | table row | list_files / read_file / search_code / propose_patch 等 |
| 权限格子 | segmented cell / button | deny / allow / confirm / readonly / whitelist |
| 批量编辑 | button | 打开批量权限编辑弹窗 |
| 保存权限 | button | 保存当前权限矩阵 |
| 恢复默认 | button | 恢复内置权限模板 |

#### 权限状态

```text
deny       禁用
allow      允许直接调用
confirm    每次调用前需要用户确认
readonly   只允许只读类参数
whitelist  仅允许白名单参数
```

#### UI 显示建议

```text
deny       -
allow      ✓
confirm    确认
readonly   只读
whitelist  白
```

#### 前端事件

```ts
type ToolPermissionChangeMessage = {
  type: "tool.permission.change";
  payload: {
    agentId: string;
    toolName: string;
    permission: "deny" | "allow" | "confirm" | "readonly" | "whitelist";
  };
};
```

#### 保存事件

```ts
type ToolPermissionSaveMessage = {
  type: "tool.permission.save";
  payload: {
    matrix: ToolPermissionMatrix;
  };
};
```

#### Extension 调用 AutoGen Service

```http
PUT /api/tools/permissions
Content-Type: application/json
```

```json
{
  "matrix": {
    "planner_agent": {
      "list_files": "deny",
      "read_file": "deny",
      "search_code": "deny"
    },
    "codebase_agent": {
      "list_files": "allow",
      "read_file": "allow",
      "search_code": "allow"
    },
    "developer_agent": {
      "list_files": "allow",
      "read_file": "allow",
      "search_code": "allow",
      "propose_patch": "allow",
      "apply_patch": "confirm",
      "run_command": "deny"
    },
    "tester_agent": {
      "run_command": "confirm",
      "read_terminal": "allow"
    }
  }
}
```

---

### 2.3 B. Global Safety

#### UI 控件

| 控件 | 类型 | 默认 | 说明 |
|---|---|---:|---|
| 禁止 workspace 外访问 | checkbox | true | 所有文件路径必须在 workspaceRoot 下 |
| 禁止直接写文件 | checkbox | true | 只能 propose_patch，不能直接 write_file |
| apply_patch 强制确认 | checkbox | true | 即使权限 allow，也必须用户确认 |
| run_command 强制确认 | checkbox | true | 命令执行前必须 UI 确认 |
| 禁止危险工具 | checkbox | true | 禁止 delete_file、git_push、npm_publish 等 |
| 记录完整工具日志 | checkbox | true | 保存 args/result summary |
| 工具结果脱敏 | checkbox | true | 对密钥、token、密码做 mask |
| 工具调用超时 | input number | 60 | 单次 Tool 超时时间，单位秒 |
| 最大文件读取数 | input number | 30 | 单任务最多读取文件数 |
| 最大单文件字符数 | input number | 20000 | 防止一次读入超大文件 |

#### 前端事件

```ts
type GlobalSafetySaveMessage = {
  type: "tools.globalSafety.save";
  payload: {
    forbidOutsideWorkspace: boolean;
    forbidDirectWrite: boolean;
    forceApplyPatchConfirm: boolean;
    forceRunCommandConfirm: boolean;
    forbidDangerousTools: boolean;
    enableFullAuditLog: boolean;
    enableResultRedaction: boolean;
    toolTimeoutSeconds: number;
    maxFilesReadPerTask: number;
    maxCharsPerFile: number;
  };
};
```

#### API

```http
PUT /api/tools/global-safety
```

---

### 2.4 C. Tool Registry

Tool Registry 用于管理系统已注册的工具。

#### UI 控件

| 控件 | 类型 | 说明 |
|---|---|---|
| 工具列表 | card/list | 显示工具名、类别、风险等级、启用状态 |
| 新增工具 | button | 打开新增工具弹窗 |
| 编辑工具 | button | 编辑工具名称、描述、schema |
| 禁用工具 | button | 全局禁用 |
| 测试工具 | button | 打开工具测试表单 |
| 查看日志 | button | 查看该工具最近调用记录 |

#### 工具分类

```text
file        文件工具
search      搜索工具
patch       Patch / Diff 工具
terminal    终端工具
git         Git 工具
context     上下文工具
runtime     Runtime 工具
external    外部 API 工具
```

#### ToolRegistry 数据结构

```ts
type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  category: "file" | "search" | "patch" | "terminal" | "git" | "context" | "runtime" | "external";
  riskLevel: "low" | "medium" | "high" | "critical";
  enabled: boolean;
  requiresApprovalByDefault: boolean;
  parameterSchema: JsonSchema;
  resultSchema?: JsonSchema;
  implementation: {
    provider: "vscode-extension" | "autogen-service" | "external-http" | "mcp";
    endpoint?: string;
  };
};
```

#### 新增工具事件

```ts
type ToolCreateMessage = {
  type: "tool.create";
  payload: ToolDefinition;
};
```

#### API

```http
POST /api/tools
PUT  /api/tools/{toolName}
POST /api/tools/{toolName}/test
GET  /api/tools/{toolName}/logs
```

---

### 2.5 D. Tool Schema Editor

工具参数 Schema 必须可视化编辑，同时允许 JSON 直接编辑。

#### UI 控件

| 控件 | 类型 | 说明 |
|---|---|---|
| Tool Name | input | 工具名 |
| Description | textarea | 工具描述，供 LLM 理解 |
| Risk Level | select | low / medium / high / critical |
| Provider | select | vscode-extension / autogen-service / external-http / mcp |
| Parameter Schema | textarea/json editor | JSON Schema |
| Result Schema | textarea/json editor | 可选 |
| 保存 Schema | button | 保存工具定义 |
| 测试工具 | button | 用测试参数执行 |
| 工具返回值预览 | readonly textarea | 显示测试结果 |

#### 示例 Schema

```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "Workspace 内相对路径"
    }
  },
  "required": ["path"],
  "additionalProperties": false
}
```

---

### 2.6 E. Command Allowlist / Blocklist

#### Allowlist UI

```text
Command Allowlist
[ mvn test                         ][删除]
[ mvn -q test                      ][删除]
[ npm test                         ][删除]
[ npm run build                    ][删除]
[ pnpm build                       ][删除]
[ python -m pytest                 ][删除]
[ 添加命令 ][保存]
```

#### Blocklist UI

```text
Command Blocklist
[ rm                               ][删除]
[ del                              ][删除]
[ format                           ][删除]
[ curl                             ][删除]
[ wget                             ][删除]
[ powershell                       ][删除]
[ ssh                              ][删除]
[ git push                         ][删除]
[ npm publish                      ][删除]
[ 添加命令 ][保存]
```

#### 匹配策略

```text
exact       完全匹配
prefix      前缀匹配
regex       正则匹配
contains    包含匹配
```

#### 数据结构

```ts
type CommandRule = {
  pattern: string;
  matchType: "exact" | "prefix" | "regex" | "contains";
  action: "allow" | "block" | "confirm";
  description?: string;
};
```

#### API

```http
PUT /api/tools/command-rules
```

---

### 2.7 F. Sensitive File Blocklist

#### 默认规则

```text
.env
.env.*
*.pem
*.key
id_rsa
id_ed25519
credentials.json
application-prod.yml
application-production.yml
secrets.*
*.p12
*.jks
*.keystore
```

#### UI 控件

| 控件 | 类型 | 说明 |
|---|---|---|
| 规则列表 | list | 显示 pattern |
| 添加规则 | button/input | 添加 pattern |
| 删除规则 | button | 删除 |
| 保存 | button | 保存 |
| 测试路径 | input/button | 输入路径测试是否被拦截 |

#### API

```http
PUT /api/tools/sensitive-file-rules
POST /api/tools/sensitive-file-rules/test
```

---

## 3. 内置工具详细设计

### 3.1 工具总览

| 工具名 | 类别 | 默认可用 Agent | 风险 | 是否确认 |
|---|---|---|---|---|
| list_files | file | Codebase/Developer/Reviewer | low | 否 |
| read_file | file | Codebase/Developer/Reviewer | medium | 敏感文件确认/拒绝 |
| read_files | file | Codebase/Developer/Reviewer | medium | 敏感文件确认/拒绝 |
| search_code | search | Codebase/Developer/Reviewer | low | 否 |
| search_symbol | search | Codebase/Developer | low | 否 |
| get_project_summary | context | 全部 | low | 否 |
| get_current_file | context | 全部 | low | 否 |
| get_selection | context | 全部 | low | 否 |
| get_git_diff | git | Codebase/Reviewer/Tester | medium | 否 |
| get_git_status | git | Codebase/Reviewer/Tester | low | 否 |
| create_checkpoint | git | WorkflowRunner | medium | 否 |
| rollback_checkpoint | git | WorkflowRunner | high | 确认 |
| propose_patch | patch | Developer | medium | 否 |
| open_diff | patch | Extension/UI | low | 否 |
| apply_patch | patch | WorkflowRunner | high | 必须确认 |
| reject_patch | patch | UI | low | 否 |
| run_command | terminal | Tester | critical | 必须确认 |
| read_terminal | terminal | Tester/Developer | medium | 否 |
| kill_command | terminal | UI/WorkflowRunner | high | 确认 |
| write_file | file | 默认禁用 | critical | 必须确认，不建议 MVP 开启 |
| delete_file | file | 默认禁用 | critical | 必须确认，不建议 MVP 开启 |

---

## 4. 文件工具设计

### 4.1 list_files

#### 功能

列出 workspace 内指定目录下的文件。

#### 参数

```json
{
  "path": "src/main/java",
  "maxDepth": 4,
  "includeHidden": false
}
```

#### 返回

```json
{
  "files": [
    {
      "path": "src/main/java/com/demo/App.java",
      "type": "file",
      "size": 1234
    }
  ],
  "truncated": false
}
```

#### 权限规则

```text
1. path 必须在 workspaceRoot 内。
2. 默认跳过 .git、node_modules、target、build、dist。
3. 单次最多返回 500 条。
```

#### VS Code Extension 实现

优先使用：

```ts
vscode.workspace.findFiles(
  new vscode.RelativePattern(workspaceFolder, "**/*"),
  "{**/node_modules/**,**/.git/**,**/target/**,**/build/**}",
  500
)
```

也可以使用 Node FS，但需要统一路径安全检查。

---

### 4.2 read_file

#### 功能

读取 workspace 内指定文件。

#### 参数

```json
{
  "path": "src/main/java/com/demo/App.java",
  "startLine": 1,
  "endLine": 200
}
```

#### 返回

```json
{
  "path": "src/main/java/com/demo/App.java",
  "content": "...",
  "lineCount": 160,
  "truncated": false
}
```

#### 权限规则

```text
1. path 必须在 workspaceRoot 内。
2. 命中敏感文件黑名单时拒绝或请求确认。
3. 单文件超过 maxCharsPerFile 时截断。
4. 二进制文件拒绝读取。
5. 读取结果进入 Tool Audit Log。
```

#### Extension 实现

```ts
const uri = vscode.Uri.joinPath(workspaceFolder.uri, relativePath);
const bytes = await vscode.workspace.fs.readFile(uri);
const content = Buffer.from(bytes).toString("utf8");
```

---

### 4.3 read_files

#### 功能

批量读取文件，供 CodebaseAgent 构建上下文。

#### 参数

```json
{
  "paths": [
    "pom.xml",
    "src/main/java/com/demo/UserController.java"
  ],
  "maxCharsPerFile": 20000
}
```

#### 限制

```text
1. 单次最多读取 10 个文件。
2. 单任务累计读取数不得超过 maxFilesReadPerTask。
3. 敏感文件逐个检查。
```

---

## 5. 搜索工具设计

### 5.1 search_code

#### 功能

在 workspace 内搜索代码文本。

#### 参数

```json
{
  "query": "@RestController",
  "glob": "src/main/java/**/*.java",
  "maxResults": 50
}
```

#### 返回

```json
{
  "matches": [
    {
      "path": "src/main/java/com/demo/UserController.java",
      "line": 12,
      "preview": "@RestController"
    }
  ],
  "truncated": false
}
```

#### Extension 实现方案

优先级：

```text
1. 使用 ripgrep rg，速度最快。
2. 没有 rg 时使用 vscode.workspace.findTextInFiles。
3. 最后 fallback 到 Node FS 递归搜索。
```

VS Code API 可使用 `workspace.findTextInFiles`。

---

### 5.2 search_symbol

#### 功能

搜索类名、方法名、符号。

#### MVP 实现

```text
Java：
- rg "class User"
- rg "interface User"
- rg "void login"
- rg "@RequestMapping"

TypeScript：
- rg "function xxx"
- rg "class xxx"
- rg "export const xxx"
```

#### 后期增强

```text
1. 使用 VS Code DocumentSymbolProvider。
2. 使用 Language Server。
3. 建立 AST 索引。
4. 接入自研代码索引 / RAG。
```

---

## 6. Patch / Diff 工具设计

### 6.1 propose_patch

#### 功能

DeveloperAgent 生成 unified diff patch，但不直接应用。

#### 参数

```json
{
  "summary": "新增 JWT 登录接口",
  "patch": "diff --git ...",
  "changedFiles": [
    {
      "path": "src/main/java/com/demo/AuthController.java",
      "changeType": "add"
    }
  ],
  "riskLevel": "medium"
}
```

#### 返回

```json
{
  "patchId": "patch_001",
  "status": "proposed",
  "requiresApproval": true
}
```

#### 处理流程

```text
1. PermissionGuard 检查 DeveloperAgent 是否允许 propose_patch。
2. PatchValidator 校验 unified diff 格式。
3. 检查是否修改 workspace 外路径。
4. 检查是否包含敏感文件。
5. 保存 patch_proposal。
6. WebSocket 推送 patch.proposed。
7. UI 显示 Proposed Changes 卡片。
```

---

### 6.2 open_diff

#### 功能

在 VS Code 中打开 diff 预览。

#### 参数

```json
{
  "patchId": "patch_001",
  "filePath": "src/main/java/com/demo/AuthController.java"
}
```

#### 实现方案

MVP：

```text
1. Webview 内显示 unified diff 文本。
2. 点击“查看 Diff”时打开 diff 文档。
```

正式版：

```text
1. 解析 patch。
2. 生成 modified virtual document。
3. 调用 vscode.diff。
```

VS Code 调用：

```ts
await vscode.commands.executeCommand(
  "vscode.diff",
  originalUri,
  modifiedVirtualUri,
  "AutoGen Proposed Change"
);
```

---

### 6.3 apply_patch

#### 功能

用户确认后应用 patch。

#### 参数

```json
{
  "patchId": "patch_001",
  "mode": "all",
  "selectedFiles": []
}
```

#### 返回

```json
{
  "status": "applied",
  "changedFiles": ["..."],
  "checkpointId": "checkpoint_001"
}
```

#### 安全流程

```text
1. 必须用户确认。
2. 创建 Git checkpoint 或保存当前 diff。
3. 检查 patch 文件路径。
4. 检查敏感文件。
5. 执行 git apply。
6. 如果失败，返回错误详情。
7. 如果成功，刷新 Git 状态。
8. WebSocket 推送 patch.applied。
```

#### Extension 实现建议

用 `child_process.execFile` 调用 `git apply`，不要通过终端直接发送字符串，避免命令注入。

```ts
execFile("git", ["apply", patchFilePath], { cwd: workspaceRoot }, callback);
```

---

### 6.4 apply_partial_patch

#### 功能

用户只应用部分文件。

#### UI

部分应用弹窗：

```text
[x] AuthController.java
[x] AuthService.java
[ ] pom.xml
[应用选中文件]
```

#### 后端处理

```text
1. 从 patch 中抽取 selectedFiles 对应 hunks。
2. 生成 partial patch。
3. 复用 apply_patch 流程。
```

---

## 7. Terminal / Command 工具设计

### 7.1 run_command

#### 功能

执行测试/构建命令。

#### 参数

```json
{
  "command": "mvn test",
  "cwd": ".",
  "timeoutSeconds": 120
}
```

#### 返回

```json
{
  "commandId": "cmd_001",
  "status": "running"
}
```

#### 权限流程

```text
1. 检查调用 Agent 是否允许 run_command。
2. 检查 Global Safety 是否强制确认。
3. 检查 blocklist。
4. 检查 allowlist。
5. 如果不在 allowlist，必须确认。
6. UI 显示命令确认卡片。
7. 用户允许后执行。
8. 流式推送 stdout/stderr。
9. 命令结束后推送 exitCode。
```

#### 确认事件

```json
{
  "type": "approval.required",
  "approvalType": "command",
  "requestId": "approval_001",
  "command": "mvn test",
  "riskLevel": "medium"
}
```

#### Extension 执行方式

MVP 可使用 VS Code Terminal：

```ts
const terminal = vscode.window.createTerminal({
  name: "AutoGen Task",
  cwd: workspaceRoot
});
terminal.show();
terminal.sendText(command);
```

正式版建议使用 `child_process.spawn` 捕获输出：

```ts
const child = spawn(cmd, args, { cwd: workspaceRoot, shell: false });
```

#### 禁止用法

```text
shell: true 且直接拼接用户命令
powershell -Command 任意字符串
cmd /c 任意字符串
```

---

### 7.2 read_terminal

#### 功能

读取最近一次命令输出摘要。

#### 参数

```json
{
  "commandId": "cmd_001",
  "maxLines": 200
}
```

#### 返回

```json
{
  "stdout": "...",
  "stderr": "...",
  "exitCode": 1
}
```

---

### 7.3 kill_command

#### 功能

终止正在运行的命令。

#### 参数

```json
{
  "commandId": "cmd_001"
}
```

#### 权限

```text
需要用户确认，或者仅 UI/WorkflowRunner 可调用。
Agent 默认不可直接 kill。
```

---

## 8. Git 工具设计

### 8.1 get_git_status

#### 功能

返回当前 Git 状态。

```json
{
  "changedFiles": [
    {
      "path": "src/main/java/App.java",
      "status": "modified"
    }
  ],
  "branch": "feature/autogen"
}
```

---

### 8.2 get_git_diff

#### 功能

返回当前 workspace diff。

#### 参数

```json
{
  "cached": false,
  "paths": []
}
```

#### 用途

```text
1. ReviewerAgent 对当前修改做审查。
2. SummaryAgent 总结变更。
3. 用户 @Git diff 加入上下文。
```

---

### 8.3 create_checkpoint

#### 功能

应用 patch 前创建回滚点。

#### 方案

MVP：

```text
1. 保存 git diff 到 .autogen/checkpoints/{id}.patch。
2. 保存当前文件列表状态。
```

正式版：

```text
1. 如果 workspace 是 git 仓库，创建 stash 或临时 commit。
2. 如果不是 git 仓库，复制受影响文件到 checkpoint 目录。
```

---

### 8.4 rollback_checkpoint

#### 功能

回滚到任务开始前。

#### 权限

```text
必须 UI 确认。
默认不允许 Agent 调用。
```

---

## 9. ToolGateway 设计

### 9.1 Python 侧 ToolGatewayClient

AutoGen Service 中所有工具函数都不直接做真实操作，而是转发给 Extension Tool Server。

```python
class ToolGatewayClient:
    def __init__(self, base_url: str, task_id: str, agent_id: str):
        self.base_url = base_url
        self.task_id = task_id
        self.agent_id = agent_id

    async def call_tool(self, tool_name: str, args: dict) -> dict:
        payload = {
            "taskId": self.task_id,
            "agentId": self.agent_id,
            "toolName": tool_name,
            "args": args
        }
        # POST /api/tool-server/call
        ...
```

---

### 9.2 AutoGen Tool 函数包装

```python
async def read_file(path: str, startLine: int | None = None, endLine: int | None = None) -> str:
    """
    读取当前 VS Code workspace 内的指定文件。
    只能读取 workspace 内路径，不能读取敏感文件。
    """
    result = await tool_gateway.call_tool("read_file", {
        "path": path,
        "startLine": startLine,
        "endLine": endLine
    })
    return result["content"]
```

挂载给 Agent：

```python
developer = AssistantAgent(
    name="DeveloperAgent",
    model_client=model_client,
    tools=[read_file, search_code, propose_patch],
    system_message=developer_prompt,
    reflect_on_tool_use=True
)
```

---

### 9.3 PermissionGuard

#### 输入

```python
class ToolCallRequest(BaseModel):
    task_id: str
    agent_id: str
    tool_name: str
    args: dict
```

#### 处理流程

```text
1. 读取 tool_permission_matrix。
2. 检查 agent_id + tool_name 权限。
3. 检查 global safety。
4. 检查参数 schema。
5. 根据工具类别执行额外校验。
6. 如果需要确认，创建 approval_request。
7. 如果允许，转发到 Extension Tool Server。
8. 写入 tool_call_log。
```

#### 伪代码

```python
async def execute_tool(req: ToolCallRequest):
    permission = permission_store.get(req.agent_id, req.tool_name)

    if permission == "deny":
        raise ToolPermissionDenied(req.tool_name)

    validate_args(req.tool_name, req.args)
    check_global_safety(req)
    check_sensitive_files(req)
    check_command_rules(req)

    if should_require_approval(req, permission):
        approval = await approval_manager.request(req)
        if not approval.approved:
            raise ToolApprovalRejected(req.tool_name)

    result = await extension_tool_client.call(req)
    audit_logger.log(req, result)
    return result
```

---

## 10. Extension Tool Server 设计

### 10.1 HTTP 接口

AutoGen Service 调用 VS Code Extension Tool Server。

```http
POST /tool-server/call
```

请求：

```json
{
  "taskId": "task_001",
  "agentId": "developer_agent",
  "toolName": "read_file",
  "args": {
    "path": "pom.xml"
  }
}
```

响应：

```json
{
  "ok": true,
  "result": {
    "content": "<project>...</project>",
    "truncated": false
  }
}
```

错误：

```json
{
  "ok": false,
  "error": {
    "code": "SENSITIVE_FILE_BLOCKED",
    "message": "该文件被敏感文件规则阻止读取",
    "details": {
      "path": ".env"
    }
  }
}
```

---

### 10.2 Extension ToolServer TypeScript 结构

```ts
class ToolServer {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly fileTools: FileToolProvider,
    private readonly searchTools: SearchToolProvider,
    private readonly patchTools: PatchToolProvider,
    private readonly terminalTools: TerminalToolProvider,
    private readonly gitTools: GitToolProvider,
  ) {}

  async call(req: ToolCallRequest): Promise<ToolCallResponse> {
    switch (req.toolName) {
      case "list_files":
        return this.fileTools.listFiles(req.args);
      case "read_file":
        return this.fileTools.readFile(req.args);
      case "search_code":
        return this.searchTools.searchCode(req.args);
      case "open_diff":
        return this.patchTools.openDiff(req.args);
      case "apply_patch":
        return this.patchTools.applyPatch(req.args);
      case "run_command":
        return this.terminalTools.runCommand(req.args);
      case "get_git_diff":
        return this.gitTools.getDiff(req.args);
      default:
        throw new Error(`Unknown tool: ${req.toolName}`);
    }
  }
}
```

---

## 11. ApprovalManager 设计

### 11.1 需要确认的场景

```text
1. apply_patch
2. run_command
3. rollback_checkpoint
4. read sensitive file
5. write_file
6. delete_file
7. workspace 外访问尝试
8. 不在 allowlist 的命令
```

---

### 11.2 ApprovalRequest 数据结构

```ts
type ApprovalRequest = {
  requestId: string;
  taskId: string;
  agentId: string;
  toolName: string;
  approvalType: "command" | "patch" | "file" | "dangerous_tool";
  title: string;
  description: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  args: Record<string, any>;
  options: ApprovalOption[];
  expiresAt?: string;
};

type ApprovalOption = {
  id: "approve_once" | "approve_always" | "reject" | "edit_args";
  label: string;
};
```

---

### 11.3 UI 事件

AutoGen Service → Extension → Webview：

```json
{
  "type": "approval.required",
  "payload": {
    "requestId": "approval_001",
    "approvalType": "command",
    "title": "TesterAgent 请求执行命令",
    "description": "mvn test",
    "riskLevel": "medium",
    "options": ["approve_once", "add_allowlist", "reject"]
  }
}
```

Webview → Extension：

```json
{
  "type": "approval.respond",
  "payload": {
    "requestId": "approval_001",
    "decision": "approve_once"
  }
}
```

Extension → AutoGen Service：

```http
POST /api/approvals/{requestId}/respond
```

---

## 12. Tool Audit Log 设计

### 12.1 日志字段

```ts
type ToolCallLog = {
  id: string;
  taskId: string;
  agentId: string;
  toolName: string;
  args: Record<string, any>;
  resultSummary?: string;
  resultSize?: number;
  status: "pending" | "approved" | "rejected" | "success" | "failed";
  riskLevel: "low" | "medium" | "high" | "critical";
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
};
```

---

### 12.2 日志展示 UI

Run 页日志卡片：

```text
Tool Call #18
Agent: CodebaseAgent
Tool: read_file
Args: { "path": "pom.xml" }
Status: success
Result: 4210 chars
[查看完整结果] [复制] [加入上下文]
```

Tools 页工具日志：

```text
read_file 最近调用
- 03:12 CodebaseAgent pom.xml success
- 03:13 DeveloperAgent AuthService.java success
- 03:15 DeveloperAgent .env blocked
```

---

### 12.3 脱敏策略

对以下字段值做 mask：

```text
password
passwd
secret
token
api_key
apikey
authorization
cookie
private_key
```

示例：

```text
sk-abc123456789 → sk-********
```

---

## 13. 错误码设计

| 错误码 | 说明 | UI 处理 |
|---|---|---|
| TOOL_NOT_FOUND | 工具不存在 | 显示错误卡片 |
| TOOL_DISABLED | 工具已禁用 | 提示去 Tools Tab 启用 |
| TOOL_PERMISSION_DENIED | Agent 无权调用 | 显示权限拒绝 |
| TOOL_APPROVAL_REQUIRED | 需要确认 | 显示确认卡片 |
| TOOL_APPROVAL_REJECTED | 用户拒绝 | 通知 Agent |
| INVALID_TOOL_ARGS | 参数不符合 Schema | 显示参数错误 |
| OUTSIDE_WORKSPACE_BLOCKED | workspace 外访问被拦截 | 高风险提示 |
| SENSITIVE_FILE_BLOCKED | 敏感文件被拦截 | 高风险提示 |
| COMMAND_BLOCKED | 命令黑名单命中 | 高风险提示 |
| COMMAND_NOT_ALLOWLISTED | 命令不在白名单 | 请求确认 |
| PATCH_INVALID | patch 格式错误 | 要求 DeveloperAgent 重写 |
| PATCH_APPLY_FAILED | patch 应用失败 | 显示 git apply 错误 |
| TOOL_TIMEOUT | 工具执行超时 | 可重试 |
| TOOL_INTERNAL_ERROR | 内部错误 | 显示日志入口 |

---

## 14. 与 AutoGen 的集成方式

### 14.1 工具注入流程

```text
AgentConfig.tools
  ↓
ToolFactory 根据工具名生成 Python async function
  ↓
AssistantAgent(tools=[...])
  ↓
模型决定调用工具
  ↓
AutoGen 执行工具函数
  ↓
ToolGatewayClient.call_tool()
  ↓
PermissionGuard
  ↓
Extension Tool Server
```

---

### 14.2 工具描述对 Agent 的影响

每个工具必须有清晰 docstring：

```python
async def propose_patch(summary: str, patch: str) -> str:
    """
    提交 unified diff patch，供用户在 VS Code 中查看和确认。
    你不能直接修改文件。所有代码修改都必须通过本工具提交。
    patch 必须是标准 unified diff 格式。
    """
```

Prompt 中也要强制：

```text
DeveloperAgent:
- 你不能调用 write_file。
- 所有修改必须通过 propose_patch。
- patch 必须只修改 workspace 内文件。
```

---

### 14.3 不建议给 Agent 暴露的工具

MVP 阶段禁止：

```text
write_file
delete_file
git_commit
git_push
npm_publish
ssh
http_request unrestricted
shell unrestricted
```

后期可在企业配置中开放，但必须：

```text
1. 显式启用。
2. 每次确认。
3. 完整审计。
4. 支持回滚。
```

---

## 15. 与 VS Code 的联调方式

### 15.1 Webview → Extension

用户保存工具权限：

```ts
vscode.postMessage({
  type: "tool.permission.save",
  payload: collectPermissionMatrix()
});
```

Extension 接收：

```ts
webview.onDidReceiveMessage(async msg => {
  if (msg.type === "tool.permission.save") {
    await autoGenClient.saveToolPermissions(msg.payload);
    webview.postMessage({
      type: "toast.show",
      payload: { level: "success", message: "工具权限已保存" }
    });
  }
});
```

---

### 15.2 AutoGen Service → Extension Tool Server

AutoGen 调工具：

```http
POST http://127.0.0.1:{extensionToolPort}/tool-server/call
```

Extension 返回结果。

---

### 15.3 Extension → Webview 实时显示工具调用

```ts
webview.postMessage({
  type: "tool.call.started",
  payload: {
    taskId,
    agentId,
    toolName,
    args
  }
});
```

```ts
webview.postMessage({
  type: "tool.call.completed",
  payload: {
    taskId,
    agentId,
    toolName,
    resultSummary,
    durationMs
  }
});
```

---

## 16. 存储设计

### 16.1 配置存储

普通配置：

```text
globalStorageUri/autogen-agent/tools.json
```

包含：

```json
{
  "permissions": {},
  "globalSafety": {},
  "toolRegistry": [],
  "commandRules": [],
  "sensitiveFileRules": []
}
```

敏感信息：

```text
VS Code SecretStorage
```

用于：

```text
外部工具 API Key
MCP Server Token
私有服务认证信息
```

---

### 16.2 日志存储

建议：

```text
workspaceStorage/autogen-agent/tasks/{taskId}/tool-calls.jsonl
workspaceStorage/autogen-agent/tasks/{taskId}/command-output.log
workspaceStorage/autogen-agent/tasks/{taskId}/patches/{patchId}.diff
```

---

## 17. 安全测试用例

### 17.1 文件访问测试

| 用例 | 期望 |
|---|---|
| read_file("pom.xml") | 成功 |
| read_file("../.ssh/id_rsa") | 拒绝 |
| read_file(".env") | 拒绝或确认 |
| read_file("node_modules/large.js") | 拒绝或截断 |
| read_file("image.png") | 拒绝二进制 |

---

### 17.2 命令测试

| 命令 | 期望 |
|---|---|
| mvn test | 如果白名单，确认或执行 |
| npm run build | 如果白名单，确认或执行 |
| rm -rf . | 拒绝 |
| git push | 拒绝 |
| curl http://x | 拒绝 |
| powershell -Command xxx | 拒绝 |

---

### 17.3 Patch 测试

| patch | 期望 |
|---|---|
| 修改 workspace 内 Java 文件 | 可预览 |
| 修改 .env | 拒绝 |
| 修改 ../../outside.txt | 拒绝 |
| 非 unified diff | 拒绝并要求重写 |
| 部分文件应用 | 只应用所选文件 |

---

## 18. Codex 开发任务拆分

### Task 1：实现 Tool 类型定义

目标：

```text
新增 src/common/tools/types.ts
定义 ToolDefinition、ToolPermissionMatrix、ToolCallRequest、ToolCallResponse。
```

验收：

```text
TypeScript 编译通过。
所有工具类型可被 Webview 和 Extension 共用。
```

---

### Task 2：实现 Tools Tab 状态收集

目标：

```text
Webview 中实现 collectToolPermissionMatrix()
collectGlobalSafety()
collectCommandRules()
collectSensitiveFileRules()
```

验收：

```text
点击保存权限时能输出完整 JSON。
```

---

### Task 3：实现 Webview → Extension 工具配置消息

目标：

```text
绑定 tool.permission.save
tools.globalSafety.save
command.rules.save
sensitive.rules.save
tool.create
tool.test
```

验收：

```text
Extension 能收到消息并打印 payload。
```

---

### Task 4：实现 AutoGen Service 工具配置 API

目标：

```text
PUT /api/tools/permissions
PUT /api/tools/global-safety
PUT /api/tools/command-rules
PUT /api/tools/sensitive-file-rules
GET /api/tools
```

验收：

```text
配置可保存到本地 JSON。
```

---

### Task 5：实现 PermissionGuard

目标：

```text
Python 中实现权限检查。
```

验收：

```text
deny 工具被拒绝。
confirm 工具创建 approval_request。
allow 工具继续执行。
```

---

### Task 6：实现 Extension Tool Server

目标：

```text
实现 /tool-server/call
支持 list_files、read_file、search_code。
```

验收：

```text
AutoGen Service 能通过 HTTP 调 VS Code 工具。
```

---

### Task 7：实现 Patch 工具

目标：

```text
propose_patch
open_diff
apply_patch
apply_partial_patch
```

验收：

```text
DeveloperAgent 生成 patch 后 UI 能查看 diff 并应用。
```

---

### Task 8：实现 Command 工具

目标：

```text
run_command
read_terminal
kill_command
```

验收：

```text
TesterAgent 请求执行 mvn test 时 UI 弹出确认。
```

---

### Task 9：实现 Tool Audit Log

目标：

```text
所有工具调用写入 JSONL。
Run 页显示工具调用卡片。
```

验收：

```text
可以查看每个工具调用参数和结果摘要。
```

---

### Task 10：安全测试

目标：

```text
执行文件越界、敏感文件、危险命令、非法 patch 测试。
```

验收：

```text
全部被拦截，并有 UI 错误提示。
```

---

## 19. 自检清单

### 19.1 UI 控件覆盖

- [x] 权限矩阵已覆盖。
- [x] Global Safety 已覆盖。
- [x] Tool Registry 已覆盖。
- [x] Tool Schema Editor 已覆盖。
- [x] Command Allowlist / Blocklist 已覆盖。
- [x] Sensitive File Blocklist 已覆盖。
- [x] 工具测试入口已覆盖。
- [x] 工具日志入口已覆盖。

### 19.2 工具能力覆盖

- [x] 文件读取工具已设计。
- [x] 代码搜索工具已设计。
- [x] Patch / Diff 工具已设计。
- [x] Terminal 工具已设计。
- [x] Git 工具已设计。
- [x] 上下文工具已设计。
- [x] 审计日志已设计。

### 19.3 安全控制覆盖

- [x] workspace 外访问禁止。
- [x] 敏感文件黑名单。
- [x] 命令白名单。
- [x] 命令黑名单。
- [x] apply_patch 确认。
- [x] run_command 确认。
- [x] 工具权限矩阵。
- [x] 工具参数 Schema 校验。
- [x] 工具结果脱敏。
- [x] 操作日志。

### 19.4 AutoGen 联调覆盖

- [x] AssistantAgent 工具注入方式已设计。
- [x] ToolGatewayClient 已设计。
- [x] PermissionGuard 已设计。
- [x] ApprovalManager 已设计。
- [x] AutoGen → Extension Tool Server 调用链已设计。
- [x] Tool Call → WebSocket → UI 显示链路已设计。

### 19.5 VS Code 联调覆盖

- [x] workspace.fs 文件读取已设计。
- [x] vscode.diff 打开 Diff 已设计。
- [x] Terminal / child_process 命令执行已设计。
- [x] Git apply / diff / status 已设计。
- [x] Webview postMessage 联调已设计。
- [x] SecretStorage 使用边界已说明。

---

## 20. 下一份文档建议

下一份建议生成：

```text
08_VSCode文件_Diff_Terminal_Git工具联调详细设计.md
```

原因：

```text
07 已经定义工具系统和权限边界；
08 应该深入到 VS Code Extension 侧，详细写每个真实工具如何用 VS Code API / Node API 实现。
```
