# 08_VSCode文件_Diff_Terminal_Git工具联调详细设计

> 文档定位：本文件专门设计 VS Code Extension 侧如何把文件、搜索、Diff、Patch、Terminal、Git 能力封装成可被 AutoGen Service 调用的 Tool Server。  
> 对应前置文档：
> - 02_Webview与Extension通信协议详细设计.md
> - 03_Extension与AutoGenService通信接口详细设计.md
> - 04_AutoGen多Agent运行时详细设计.md
> - 07_Tools工具系统与权限控制详细设计.md

---

## 0. 资料检索依据

本设计参考以下公开资料和官方接口能力：

1. VS Code Extension API Reference  
   - 用于确认 `vscode.workspace.fs`、`vscode.window.createTerminal`、`vscode.commands.executeCommand`、`TextDocumentContentProvider` 等核心 API。
   - https://code.visualstudio.com/api/references/vscode-api

2. VS Code Built-in Commands  
   - 用于确认 `vscode.diff`、`vscode.open` 等内置命令通过 `commands.executeCommand` 调用的方式。
   - https://code.visualstudio.com/api/references/commands

3. VS Code Commands Guide  
   - 用于确认 Extension 使用命令系统触发 VS Code UI 行为的方式。
   - https://code.visualstudio.com/api/extension-guides/command

4. VS Code Virtual Documents Guide  
   - 用于设计 AI 修改前后内容的虚拟文档 diff 预览。
   - https://code.visualstudio.com/api/extension-guides/virtual-documents

5. VS Code Source Control API Guide  
   - 用于理解 VS Code SCM 集成边界。第一版建议主要使用 Git CLI，后续再接内置 Git Extension API。
   - https://code.visualstudio.com/api/extension-guides/scm-provider

6. VS Code Remote Extensions Guide  
   - 用于提醒 Extension 在 Remote SSH / WSL / Codespaces 中运行时，文件系统、终端和 Node API 的实际运行位置差异。
   - https://code.visualstudio.com/api/advanced-topics/remote-extensions

7. VS Code Extension Samples  
   - 用于参考官方示例工程组织方式。
   - https://github.com/microsoft/vscode-extension-samples

---

## 1. 本模块目标

本模块的目标是把 VS Code Extension Host 能力封装成 AutoGen 可调用工具。

AutoGen Service 不直接操作用户工程，而是通过 Extension 暴露的 Tool Server 执行受控操作：

```text
AutoGen Service
   ↓ HTTP / WebSocket / Local RPC
VS Code Extension Tool Server
   ↓ VS Code API / Git CLI / Terminal
Workspace 文件、Diff、Patch、Terminal、Git
```

### 1.1 为什么必须经过 VS Code Extension

不能让 Python AutoGen Service 直接读写项目目录，原因：

```text
1. VS Code Extension 能天然知道当前 workspace。
2. VS Code Extension 可以打开 diff editor、terminal、notification。
3. VS Code Extension 能使用 SecretStorage、globalStorageUri。
4. VS Code Extension 可以统一处理 Remote Workspace 差异。
5. 用户确认、UI 状态、工具调用日志都在 Extension 侧更容易控制。
6. 可以禁止访问 workspace 外部文件。
```

### 1.2 模块边界

本模块负责：

```text
- list_files
- read_file
- read_files
- write_file，仅内部受控使用
- search_code
- open_diff
- propose_patch
- apply_patch
- run_command
- read_terminal_output
- git_status
- git_diff
- git_apply
- create_checkpoint
- rollback_checkpoint
- get_workspace_summary
```

不负责：

```text
- Agent 推理
- Prompt 生成
- Workflow 节点调度
- 模型 API 调用
- RAG 向量检索
```

---

## 2. 总体架构

```text
┌──────────────────────────────────────────────┐
│ VS Code Webview UI                            │
│ - Run / Agents / Team / Tools / Workflow      │
│ - 显示工具调用、Diff、命令确认                  │
└─────────────────────┬────────────────────────┘
                      │ postMessage
┌─────────────────────▼────────────────────────┐
│ VS Code Extension Host                        │
│ - ToolServer                                  │
│ - ToolPermissionGuard                         │
│ - DiffManager                                 │
│ - TerminalManager                             │
│ - GitManager                                  │
│ - WorkspaceGuard                              │
└─────────────────────┬────────────────────────┘
                      │ localhost HTTP / WS
┌─────────────────────▼────────────────────────┐
│ Python AutoGen Service                        │
│ - WorkflowRunner                              │
│ - ToolGateway Client                          │
│ - AutoGen Adapter                             │
└──────────────────────────────────────────────┘
```

---

## 3. Extension 侧目录结构设计

建议 VS Code 插件侧目录：

```text
extension/
├─ package.json
├─ src/
│  ├─ extension.ts
│  ├─ webview/
│  │  ├─ WebviewProvider.ts
│  │  ├─ messageDispatcher.ts
│  │  └─ stateStore.ts
│  ├─ service/
│  │  ├─ AutoGenClient.ts
│  │  ├─ AutoGenRuntimeManager.ts
│  │  └─ TaskWebSocketBridge.ts
│  ├─ tools/
│  │  ├─ ToolServer.ts
│  │  ├─ ToolRouter.ts
│  │  ├─ ToolPermissionGuard.ts
│  │  ├─ WorkspaceGuard.ts
│  │  ├─ FileTools.ts
│  │  ├─ SearchTools.ts
│  │  ├─ DiffTools.ts
│  │  ├─ PatchTools.ts
│  │  ├─ TerminalTools.ts
│  │  ├─ GitTools.ts
│  │  └─ CheckpointTools.ts
│  ├─ config/
│  │  ├─ ConfigStore.ts
│  │  ├─ SecretStore.ts
│  │  └─ DefaultConfig.ts
│  ├─ logs/
│  │  ├─ ToolAuditLogger.ts
│  │  └─ TaskLogStore.ts
│  └─ types/
│     ├─ tool.ts
│     ├─ task.ts
│     ├─ config.ts
│     └─ vscode-git.d.ts
└─ media/
   └─ webview.html
```

---

## 4. Tool Server 设计

### 4.1 Tool Server 职责

Tool Server 是 Extension 内部暴露给 Python AutoGen Service 的本地服务。

职责：

```text
1. 接收 AutoGen Service 的工具调用请求。
2. 校验 taskId / agentId / workspaceId。
3. 校验工具权限。
4. 校验路径安全。
5. 根据工具名分发到 FileTools / DiffTools / TerminalTools / GitTools。
6. 记录 tool audit log。
7. 返回结构化结果。
8. 需要用户确认时通知 Webview 并挂起请求。
```

### 4.2 HTTP 接口

建议 Extension 启动一个仅监听 `127.0.0.1` 的本地 HTTP Server。

```http
POST /tools/invoke
GET  /tools/health
GET  /tools/schema
```

### 4.3 工具调用请求结构

```ts
interface ToolInvokeRequest {
  requestId: string;
  taskId: string;
  agentId: string;
  toolName: string;
  args: Record<string, unknown>;
  workspaceId: string;
  approvalPolicy?: {
    requireConfirm?: boolean;
    reason?: string;
  };
}
```

示例：

```json
{
  "requestId": "tool_001",
  "taskId": "task_001",
  "agentId": "codebase_agent",
  "toolName": "read_file",
  "workspaceId": "workspace_main",
  "args": {
    "path": "pom.xml",
    "maxBytes": 120000
  }
}
```

### 4.4 工具调用响应结构

```ts
interface ToolInvokeResponse<T = unknown> {
  requestId: string;
  ok: boolean;
  toolName: string;
  result?: T;
  error?: {
    code: string;
    message: string;
    detail?: unknown;
  };
  audit?: {
    durationMs: number;
    truncated: boolean;
    approvalRequired: boolean;
  };
}
```

示例：

```json
{
  "requestId": "tool_001",
  "ok": true,
  "toolName": "read_file",
  "result": {
    "path": "pom.xml",
    "content": "<project>...</project>",
    "encoding": "utf-8",
    "sizeBytes": 4210,
    "truncated": false
  },
  "audit": {
    "durationMs": 12,
    "truncated": false,
    "approvalRequired": false
  }
}
```

---

## 5. WorkspaceGuard 设计

### 5.1 目标

WorkspaceGuard 负责保证所有文件操作只发生在当前 workspace 内。

必须防止：

```text
../../../.ssh/id_rsa
C:\Users\xxx\.env
/Users/xxx/.aws/credentials
符号链接跳出 workspace
大小写路径绕过
URL 编码路径绕过
```

### 5.2 路径解析逻辑

```ts
class WorkspaceGuard {
  constructor(private workspaceRoot: string) {}

  resolveSafePath(relativePath: string): vscode.Uri {
    // 1. 禁止空路径时默认 workspaceRoot
    // 2. normalize
    // 3. resolve 到绝对路径
    // 4. realpath 解析符号链接
    // 5. 确认 real target 在 workspaceRoot 内
    // 6. 检查 sensitive patterns
  }
}
```

### 5.3 敏感文件规则

默认禁止读取：

```text
.env
.env.*
*.pem
*.key
id_rsa
id_dsa
id_ed25519
credentials.json
application-prod.yml
application-prod.yaml
settings.json 中包含 token / secret 的字段
.aws/credentials
.ssh/*
```

### 5.4 可配置策略

对应 UI：Tools → Global Safety / Sensitive File Blocklist。

```ts
interface WorkspaceSafetyConfig {
  denyOutsideWorkspace: boolean;
  denySymlinkOutsideWorkspace: boolean;
  sensitiveFilePatterns: string[];
  maxReadFileBytes: number;
  maxReadFilesPerTask: number;
  allowBinaryRead: boolean;
}
```

---

## 6. FileTools 详细设计

### 6.1 list_files

#### 作用

列出 workspace 指定目录下文件树。

#### 参数

```ts
interface ListFilesArgs {
  path?: string;
  recursive?: boolean;
  maxDepth?: number;
  maxEntries?: number;
  includeHidden?: boolean;
  ignorePatterns?: string[];
}
```

#### 返回

```ts
interface ListFilesResult {
  root: string;
  entries: Array<{
    path: string;
    type: "file" | "directory";
    sizeBytes?: number;
    childrenCount?: number;
  }>;
  truncated: boolean;
}
```

#### 默认忽略

```text
.git
node_modules
target
build
dist
out
.gradle
.idea
.vscode
coverage
__pycache__
```

#### VS Code API 实现

优先使用：

```ts
vscode.workspace.fs.readDirectory(uri)
```

必要时配合 Node `path` 和 `minimatch`。

#### 权限

```text
CodebaseAgent: allow
DeveloperAgent: allow
ReviewerAgent: allow
TesterAgent: readonly
```

---

### 6.2 read_file

#### 作用

读取 workspace 内单个文本文件。

#### 参数

```ts
interface ReadFileArgs {
  path: string;
  maxBytes?: number;
  startLine?: number;
  endLine?: number;
  encoding?: "utf-8";
}
```

#### 返回

```ts
interface ReadFileResult {
  path: string;
  content: string;
  encoding: string;
  sizeBytes: number;
  lineCount: number;
  truncated: boolean;
  range?: {
    startLine: number;
    endLine: number;
  };
}
```

#### VS Code API 实现

```ts
const bytes = await vscode.workspace.fs.readFile(uri);
const content = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
```

#### 安全限制

```text
1. 必须通过 WorkspaceGuard.resolveSafePath。
2. 超过 maxBytes 自动截断。
3. 二进制文件拒绝。
4. 敏感文件拒绝。
5. 记录读取日志。
```

---

### 6.3 read_files

#### 作用

批量读取多个文件。

#### 参数

```ts
interface ReadFilesArgs {
  paths: string[];
  maxBytesPerFile?: number;
  maxTotalBytes?: number;
}
```

#### 限制

```text
默认最多 20 个文件
默认每个文件最多 120KB
默认总量最多 1MB
```

#### 返回

```ts
interface ReadFilesResult {
  files: ReadFileResult[];
  denied: Array<{
    path: string;
    reason: string;
  }>;
  truncated: boolean;
}
```

---

### 6.4 write_file

#### 定位

第一版不建议开放给 Agent。

只允许内部用于：

```text
- apply_patch 后写文件
- 用户确认后写文件
- 生成临时 diff preview 文档
```

#### 参数

```ts
interface WriteFileArgs {
  path: string;
  content: string;
  createIfMissing?: boolean;
  overwrite?: boolean;
}
```

#### 权限策略

```text
Agent 默认禁止 write_file。
DeveloperAgent 只能 propose_patch。
Patch 通过用户确认后，由 Extension 内部执行 write_file。
```

---

## 7. SearchTools 详细设计

### 7.1 search_code

#### 作用

在 workspace 中按关键词 / 正则搜索代码。

#### 参数

```ts
interface SearchCodeArgs {
  query: string;
  regex?: boolean;
  caseSensitive?: boolean;
  include?: string[];
  exclude?: string[];
  maxResults?: number;
  contextLines?: number;
}
```

#### 返回

```ts
interface SearchCodeResult {
  query: string;
  results: Array<{
    path: string;
    line: number;
    column?: number;
    preview: string;
    before?: string[];
    after?: string[];
  }>;
  truncated: boolean;
}
```

#### 实现方案 A：VS Code API

可使用：

```ts
vscode.workspace.findFiles(include, exclude, maxResults)
```

再逐文件读取搜索。

优点：

```text
跨 remote workspace 更稳定。
不依赖本机 rg。
```

缺点：

```text
性能一般。
大项目搜索慢。
```

#### 实现方案 B：ripgrep

通过 Node child_process 调用 `rg`。

优点：

```text
性能高。
搜索结果格式成熟。
```

缺点：

```text
Remote 环境要确认 rg 是否可用。
命令执行有安全风险。
```

#### MVP 推荐

```text
本地桌面版：优先 rg，失败回退 workspace.findFiles。
Remote 环境：优先 workspace.findFiles。
```

---

### 7.2 search_symbol

#### 定位

MVP 可先不做，第二阶段实现。

#### 作用

搜索类名、方法名、注解、接口实现关系。

#### Java 项目建议

```text
第一版：用文本搜索 class / interface / enum / @Annotation。
第二版：用 tree-sitter / JavaParser / LSP。
第三版：建立项目索引和调用关系图。
```

---

## 8. DiffTools 详细设计

### 8.1 open_diff

#### 作用

在 VS Code 编辑器中打开某个文件的原始内容和 AI 修改后内容对比。

#### 参数

```ts
interface OpenDiffArgs {
  title: string;
  originalPath: string;
  modifiedContent: string;
  languageId?: string;
}
```

#### 实现方式

使用 VS Code 内置命令：

```ts
await vscode.commands.executeCommand(
  "vscode.diff",
  originalUri,
  modifiedUri,
  title
);
```

其中 `modifiedUri` 可以通过 `TextDocumentContentProvider` 提供虚拟文档内容。

#### TextDocumentContentProvider 设计

```ts
class AutoGenDiffContentProvider implements vscode.TextDocumentContentProvider {
  private contents = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "";
  }

  setContent(uri: vscode.Uri, content: string) {
    this.contents.set(uri.toString(), content);
    this.onDidChangeEmitter.fire(uri);
  }
}
```

虚拟 URI 示例：

```text
autogen-diff:/task_001/patch_001/src/main/java/AuthController.java
```

---

### 8.2 open_unified_diff_document

#### 作用

直接把 unified diff 文本打开成 diff 语言文档。

#### 参数

```ts
interface OpenUnifiedDiffArgs {
  patchId: string;
  patchText: string;
}
```

#### 实现

```ts
const doc = await vscode.workspace.openTextDocument({
  content: patchText,
  language: "diff"
});
await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
```

#### 用途

MVP 推荐先用这个，因为实现简单。

---

### 8.3 open_multi_file_diff

#### 作用

对 patch 中多个文件逐个打开 diff。

#### 策略

UI 中点击「查看 Diff」时：

```text
1. Webview 展示文件列表。
2. 用户点某个文件。
3. Extension 打开该文件左右 diff。
4. 用户可以逐个查看。
```

---

## 9. PatchTools 详细设计

### 9.1 propose_patch

#### 作用

AutoGen DeveloperAgent 生成 patch 后，不直接应用，而是提交给 Extension 保存并展示给用户。

#### 参数

```ts
interface ProposePatchArgs {
  taskId: string;
  patchText: string;
  summary: string;
  changedFiles: Array<{
    path: string;
    changeType: "add" | "modify" | "delete" | "rename";
  }>;
}
```

#### 返回

```ts
interface ProposePatchResult {
  patchId: string;
  status: "proposed";
  changedFiles: PatchChangedFile[];
  warnings: string[];
}
```

#### 校验

```text
1. patch 是否是 unified diff。
2. 所有路径是否在 workspace 内。
3. 是否修改敏感文件。
4. 是否包含删除大量文件。
5. 是否修改 lock 文件。
6. 是否修改 package publish / CI 配置。
```

---

### 9.2 apply_patch

#### 作用

用户确认后把 patch 应用到 workspace。

#### 参数

```ts
interface ApplyPatchArgs {
  patchId: string;
  mode: "all" | "selectedFiles";
  selectedFiles?: string[];
  createCheckpoint?: boolean;
}
```

#### 返回

```ts
interface ApplyPatchResult {
  patchId: string;
  status: "applied" | "failed";
  appliedFiles: string[];
  checkpointId?: string;
  stdout?: string;
  stderr?: string;
}
```

#### 实现方案 A：git apply

```ts
await execFile("git", ["apply", patchFile], { cwd: workspaceRoot });
```

优点：

```text
成熟可靠。
支持标准 unified diff。
```

缺点：

```text
需要 workspace 是 Git 仓库或安装 git。
部分 patch 失败时错误不够结构化。
```

#### 实现方案 B：JS patch parser

使用 npm 库解析 diff 后调用 `workspace.fs.writeFile`。

优点：

```text
可控。
可实现部分文件应用。
不依赖 git。
```

缺点：

```text
复杂。
容易出错。
```

#### MVP 推荐

```text
第一版：git apply --check + git apply。
第二版：实现 selectedFiles 时生成子 patch 后 git apply。
第三版：引入 JS patch parser。
```

---

### 9.3 apply_patch 安全流程

```text
1. 用户点击应用 Patch。
2. Extension 调用 create_checkpoint。
3. Extension 写 patch 到临时文件。
4. 执行 git apply --check。
5. 如果通过，执行 git apply。
6. 读取 git diff 结果。
7. 推送 patch.applied 事件给 Webview 和 AutoGen Service。
8. 进入 TesterAgent。
```

### 9.4 reject_patch

#### 作用

用户拒绝 patch，并填写原因。

#### 参数

```ts
interface RejectPatchArgs {
  patchId: string;
  reason: string;
}
```

#### 后续

```text
1. 标记 patch = rejected。
2. 把 reason 追加到 TaskContext.decisions。
3. 重新调用 DeveloperAgent。
```

---

## 10. TerminalTools 详细设计

### 10.1 run_command

#### 作用

执行构建、测试、lint 等命令。

#### 参数

```ts
interface RunCommandArgs {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  requireApproval?: boolean;
  captureOutput?: boolean;
}
```

#### 返回

```ts
interface RunCommandResult {
  commandId: string;
  command: string;
  status: "running" | "success" | "failed" | "timeout" | "cancelled";
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  outputTruncated?: boolean;
}
```

### 10.2 两种执行方式

#### 方式 A：VS Code Terminal API

```ts
const terminal = vscode.window.createTerminal({
  name: "AutoGen Task",
  cwd: workspaceRoot
});
terminal.show();
terminal.sendText(command);
```

优点：

```text
用户可见。
符合 IDE 体验。
适合长任务。
```

缺点：

```text
不容易直接拿到 exitCode 和完整 stdout/stderr。
```

#### 方式 B：child_process.execFile / spawn

```ts
const child = spawn(cmd, args, {
  cwd: workspaceRoot,
  shell: false
});
```

优点：

```text
可捕获 stdout/stderr/exitCode。
适合给 AutoGen 分析错误。
```

缺点：

```text
用户不一定能直接看到。
Remote 环境需要注意执行位置。
```

### 10.3 MVP 推荐

```text
使用 spawn 执行并捕获输出，同时在 VS Code OutputChannel 或 Webview Terminal Card 展示。
必要时同步发送到一个 VS Code Terminal。
```

### 10.4 命令白名单

默认允许：

```text
mvn test
mvn -q test
mvn package -DskipTests
./mvnw test
gradle test
./gradlew test
npm test
npm run build
pnpm test
pnpm build
yarn test
python -m pytest
pytest
```

默认禁止：

```text
rm
rm -rf
del
format
shutdown
reboot
curl
wget
ssh
scp
powershell
Invoke-WebRequest
git push
npm publish
pip upload
chmod 777
sudo
```

### 10.5 命令确认流程

```text
1. AutoGen 请求 run_command。
2. ToolPermissionGuard 判断是否需要确认。
3. Extension 推送 approval.required 到 Webview。
4. 用户点击：允许一次 / 加入白名单 / 拒绝。
5. ApprovalManager 恢复挂起工具调用。
6. 执行命令或返回拒绝错误。
```

---

## 11. GitTools 详细设计

### 11.1 git_status

#### 作用

获取当前 Git 工作区状态。

#### 参数

```ts
interface GitStatusArgs {
  porcelain?: boolean;
}
```

#### 返回

```ts
interface GitStatusResult {
  isGitRepo: boolean;
  branch?: string;
  changedFiles: Array<{
    path: string;
    status: string;
  }>;
  raw?: string;
}
```

#### 实现

```bash
git status --porcelain=v1 -b
```

---

### 11.2 git_diff

#### 作用

获取工作区 diff。

#### 参数

```ts
interface GitDiffArgs {
  staged?: boolean;
  path?: string;
  maxBytes?: number;
}
```

#### 返回

```ts
interface GitDiffResult {
  diff: string;
  changedFiles: string[];
  truncated: boolean;
}
```

#### 实现

```bash
git diff -- path
git diff --staged -- path
```

---

### 11.3 git_apply

`git_apply` 是 `apply_patch` 的内部实现，不建议作为 Agent 可直接调用工具。

#### 原因

```text
Agent 不能绕过 UI 确认直接应用 patch。
```

---

### 11.4 create_checkpoint

#### 作用

在应用 AI patch 前保存可回滚状态。

#### 方案 A：Git stash

```bash
git stash push -u -m "autogen-checkpoint-task_001"
```

问题：

```text
会改变工作区，用户可能不喜欢。
```

#### 方案 B：临时 patch 文件

```bash
git diff > .autogen/checkpoints/task_001_before.patch
git status --porcelain > .autogen/checkpoints/task_001_status.txt
```

优点：

```text
不改变工作区。
可审计。
```

缺点：

```text
未跟踪新文件需要额外复制。
```

#### 方案 C：复制受影响文件快照

```text
.autogen/checkpoints/task_001/files/...
```

MVP 推荐：

```text
Git diff patch + 受影响文件快照。
```

---

### 11.5 rollback_checkpoint

#### 作用

回滚到应用 patch 前状态。

#### 参数

```ts
interface RollbackCheckpointArgs {
  checkpointId: string;
}
```

#### 策略

```text
1. 检查当前工作区是否有用户新修改。
2. 弹出确认。
3. 用快照恢复受影响文件。
4. 删除 AI 新增文件。
5. 推送 rollback.completed。
```

---

## 12. VS Code 内置 Git Extension API 是否使用

VS Code 内置 Git 扩展可以通过 extension API 使用，但它不是 VS Code 主 API 的标准稳定公开面的一部分，通常需要依赖 `vscode.git`，并复制 `git.d.ts` 类型定义。

### 12.1 MVP 建议

```text
第一版用 Git CLI：git status / git diff / git apply。
```

理由：

```text
1. 简单。
2. 跨版本稳定。
3. 与 patch 工作流天然匹配。
4. AutoGen 主要需要文本 diff，不需要深度 SCM UI 控制。
```

### 12.2 后续增强

后续可以接：

```text
- VS Code Git Extension API 获取 repositories
- Source Control view 集成
- SCM resource decorations
- Stage / Unstage UI
```

---

## 13. Tool Permission Guard 联调

每个工具执行前必须执行：

```ts
async function beforeToolInvoke(req: ToolInvokeRequest) {
  await validateTask(req.taskId);
  await validateAgent(req.agentId);
  await validateToolPermission(req.agentId, req.toolName, req.args);
  await validateWorkspacePath(req.toolName, req.args);
  await checkSensitivePatterns(req.toolName, req.args);
  await requestApprovalIfNeeded(req);
  await auditStart(req);
}
```

权限状态：

```text
deny       直接拒绝
allow      直接执行
confirm    UI 确认后执行
readonly   只允许读取类工具
whitelist  参数必须匹配白名单
```

---

## 14. ApprovalManager 设计

### 14.1 适用场景

```text
run_command
apply_patch
read_sensitive_file
delete_file
write_file
git_commit
git_push
```

### 14.2 审批请求结构

```ts
interface ApprovalRequest {
  approvalId: string;
  taskId: string;
  agentId: string;
  type: "command" | "patch" | "file" | "git";
  title: string;
  detail: string;
  payload: unknown;
  actions: Array<"approve_once" | "approve_always" | "reject">;
}
```

### 14.3 UI 推送事件

```json
{
  "type": "approval.required",
  "payload": {
    "approvalId": "approval_001",
    "type": "command",
    "title": "TesterAgent 请求执行命令",
    "detail": "mvn test",
    "actions": ["approve_once", "approve_always", "reject"]
  }
}
```

### 14.4 用户响应

```ts
interface ApprovalResponse {
  approvalId: string;
  decision: "approve_once" | "approve_always" | "reject";
  reason?: string;
}
```

---

## 15. OutputChannel 与日志设计

VS Code Extension 应创建 OutputChannel：

```ts
const output = vscode.window.createOutputChannel("AutoGen Code Agent");
```

记录：

```text
1. AutoGen Service 启停日志
2. Tool invoke 请求摘要
3. 工具执行结果
4. 命令 stdout/stderr 摘要
5. patch apply 结果
6. WebSocket 连接状态
```

大日志不要全部塞 Webview。应存文件：

```text
.globalStorage/autogen-code-agent/logs/task_001.log
.globalStorage/autogen-code-agent/tools/tool_001.json
```

---

## 16. Webview 事件映射

### 16.1 工具调用开始

```json
{
  "type": "tool.started",
  "payload": {
    "taskId": "task_001",
    "agentId": "codebase_agent",
    "toolName": "read_file",
    "args": { "path": "pom.xml" }
  }
}
```

### 16.2 工具调用成功

```json
{
  "type": "tool.completed",
  "payload": {
    "taskId": "task_001",
    "agentId": "codebase_agent",
    "toolName": "read_file",
    "summary": "读取 pom.xml，4210 bytes"
  }
}
```

### 16.3 Diff 打开

```json
{
  "type": "diff.opened",
  "payload": {
    "taskId": "task_001",
    "patchId": "patch_001",
    "file": "src/main/java/AuthController.java"
  }
}
```

### 16.4 Patch 应用结果

```json
{
  "type": "patch.applied",
  "payload": {
    "taskId": "task_001",
    "patchId": "patch_001",
    "appliedFiles": ["pom.xml", "src/main/java/AuthController.java"],
    "checkpointId": "ckpt_001"
  }
}
```

---

## 17. AutoGen Service 调用工具流程

```text
1. DeveloperAgent 调用 propose_patch。
2. AutoGen Service ToolGateway 收到工具调用。
3. ToolGateway POST /tools/invoke 到 Extension ToolServer。
4. Extension 权限检查。
5. Extension 保存 patch 并推送 UI。
6. Extension 返回 patchId。
7. AutoGen Service 把 patchId 写入 TaskContext。
8. WorkflowRunner 进入 waiting_patch_approval。
```

命令流程：

```text
1. TesterAgent 调用 run_command("mvn test")。
2. PermissionGuard 判断需要确认。
3. Extension 推送 approval.required。
4. 用户点击允许一次。
5. Extension spawn 执行命令。
6. 输出实时推送 command.output。
7. 命令结束后返回 exitCode/stdout/stderr。
8. TesterAgent 分析结果。
```

---

## 18. 错误码设计

```text
TOOL_NOT_FOUND
TOOL_PERMISSION_DENIED
TOOL_APPROVAL_REJECTED
WORKSPACE_NOT_OPEN
PATH_OUTSIDE_WORKSPACE
SENSITIVE_FILE_DENIED
FILE_NOT_FOUND
FILE_TOO_LARGE
BINARY_FILE_DENIED
PATCH_INVALID
PATCH_CHECK_FAILED
PATCH_APPLY_FAILED
COMMAND_BLOCKED
COMMAND_TIMEOUT
COMMAND_FAILED
GIT_NOT_FOUND
GIT_REPO_NOT_FOUND
CHECKPOINT_CREATE_FAILED
ROLLBACK_FAILED
```

错误响应示例：

```json
{
  "requestId": "tool_009",
  "ok": false,
  "toolName": "read_file",
  "error": {
    "code": "SENSITIVE_FILE_DENIED",
    "message": "该文件匹配敏感文件规则，禁止读取",
    "detail": {
      "path": ".env",
      "pattern": ".env"
    }
  }
}
```

---

## 19. Remote Workspace 注意事项

VS Code Remote SSH / WSL / Containers / Codespaces 场景下：

```text
1. Extension Host 可能运行在远端。
2. Node child_process 在远端执行。
3. workspace.fs 访问的是远端文件系统。
4. 本地 Python AutoGen Service 未必能直接访问远端 workspace。
```

建议 MVP 明确限制：

```text
第一版优先支持本地 workspace。
Remote workspace 提示实验性支持。
```

后续支持 Remote 时：

```text
1. AutoGen Service 也运行在 Extension Host 所在机器。
2. 或所有文件/终端/Git 操作都通过 Extension ToolServer，Python 不直接访问文件。
3. ToolServer host/port 要考虑远端端口转发。
```

---

## 20. TypeScript 代码骨架

### 20.1 ToolRouter

```ts
export class ToolRouter {
  constructor(
    private fileTools: FileTools,
    private searchTools: SearchTools,
    private diffTools: DiffTools,
    private patchTools: PatchTools,
    private terminalTools: TerminalTools,
    private gitTools: GitTools,
    private guard: ToolPermissionGuard,
    private audit: ToolAuditLogger
  ) {}

  async invoke(req: ToolInvokeRequest): Promise<ToolInvokeResponse> {
    const startedAt = Date.now();
    await this.guard.beforeInvoke(req);

    try {
      let result: unknown;

      switch (req.toolName) {
        case "list_files":
          result = await this.fileTools.listFiles(req.args as any);
          break;
        case "read_file":
          result = await this.fileTools.readFile(req.args as any);
          break;
        case "search_code":
          result = await this.searchTools.searchCode(req.args as any);
          break;
        case "open_diff":
          result = await this.diffTools.openDiff(req.args as any);
          break;
        case "propose_patch":
          result = await this.patchTools.proposePatch(req.args as any);
          break;
        case "apply_patch":
          result = await this.patchTools.applyPatch(req.args as any);
          break;
        case "run_command":
          result = await this.terminalTools.runCommand(req.args as any);
          break;
        case "git_status":
          result = await this.gitTools.status(req.args as any);
          break;
        case "git_diff":
          result = await this.gitTools.diff(req.args as any);
          break;
        default:
          throw new ToolError("TOOL_NOT_FOUND", `Unknown tool: ${req.toolName}`);
      }

      await this.audit.success(req, result, Date.now() - startedAt);
      return { requestId: req.requestId, ok: true, toolName: req.toolName, result };
    } catch (error) {
      await this.audit.failure(req, error, Date.now() - startedAt);
      return toToolErrorResponse(req, error);
    }
  }
}
```

### 20.2 FileTools.readFile

```ts
export class FileTools {
  constructor(private workspaceGuard: WorkspaceGuard) {}

  async readFile(args: ReadFileArgs): Promise<ReadFileResult> {
    const uri = await this.workspaceGuard.resolveSafeUri(args.path);
    const bytes = await vscode.workspace.fs.readFile(uri);

    const maxBytes = args.maxBytes ?? 120_000;
    const truncated = bytes.length > maxBytes;
    const slice = truncated ? bytes.slice(0, maxBytes) : bytes;
    const content = new TextDecoder("utf-8").decode(slice);

    return {
      path: args.path,
      content,
      encoding: "utf-8",
      sizeBytes: bytes.length,
      lineCount: content.split(/\r?\n/).length,
      truncated
    };
  }
}
```

### 20.3 DiffTools.openDiff

```ts
export class DiffTools {
  constructor(private provider: AutoGenDiffContentProvider) {}

  async openDiff(args: OpenDiffArgs): Promise<{ opened: boolean }> {
    const originalUri = vscode.Uri.file(args.originalPath);
    const modifiedUri = vscode.Uri.parse(
      `autogen-diff:/${encodeURIComponent(args.title)}.preview`
    );

    this.provider.setContent(modifiedUri, args.modifiedContent);

    await vscode.commands.executeCommand(
      "vscode.diff",
      originalUri,
      modifiedUri,
      args.title
    );

    return { opened: true };
  }
}
```

### 20.4 TerminalTools.runCommand

```ts
export class TerminalTools {
  async runCommand(args: RunCommandArgs): Promise<RunCommandResult> {
    const parsed = parseAllowedCommand(args.command);
    const commandId = `cmd_${Date.now()}`;

    return await new Promise((resolve) => {
      const child = spawn(parsed.cmd, parsed.args, {
        cwd: args.cwd,
        shell: false
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("close", (code) => {
        resolve({
          commandId,
          command: args.command,
          status: code === 0 ? "success" : "failed",
          exitCode: code ?? undefined,
          stdout: truncate(stdout, 200_000),
          stderr: truncate(stderr, 200_000),
          outputTruncated: stdout.length + stderr.length > 200_000
        });
      });
    });
  }
}
```

---

## 21. Codex 开发任务拆分

### Task 08-01：实现 WorkspaceGuard

目标：

```text
实现 workspace 内路径安全校验、敏感文件拦截、符号链接检查。
```

修改文件：

```text
src/tools/WorkspaceGuard.ts
src/types/tool.ts
```

验收：

```text
1. ../ 路径被拒绝。
2. .env 被拒绝。
3. workspace 内普通文件可读取。
4. 路径错误返回结构化错误码。
```

---

### Task 08-02：实现 FileTools

目标：

```text
实现 list_files、read_file、read_files。
```

验收：

```text
1. 可列出 src/main/java。
2. 可读取 pom.xml。
3. 超大文件自动截断。
4. node_modules / target 默认忽略。
```

---

### Task 08-03：实现 SearchTools

目标：

```text
实现 search_code，优先 workspace.findFiles，后续支持 rg。
```

验收：

```text
1. 搜索 @RestController 返回文件和行号。
2. 支持 maxResults。
3. 支持 include/exclude。
```

---

### Task 08-04：实现 DiffTools

目标：

```text
实现 open_unified_diff_document 和 open_diff。
```

验收：

```text
1. Webview 点击查看 Diff 后打开 diff 文档。
2. 单文件可打开左右 diff。
3. 虚拟文档 provider 正常释放。
```

---

### Task 08-05：实现 PatchTools

目标：

```text
实现 propose_patch、apply_patch、reject_patch。
```

验收：

```text
1. patch 保存到 task store。
2. git apply --check 失败时返回 PATCH_CHECK_FAILED。
3. 成功应用后返回 appliedFiles。
4. 拒绝 patch 可记录 reason。
```

---

### Task 08-06：实现 TerminalTools

目标：

```text
实现 run_command、命令白名单、输出捕获。
```

验收：

```text
1. mvn test 可执行。
2. rm -rf 被拒绝。
3. stdout/stderr 可返回给 AutoGen。
4. 超时可终止。
```

---

### Task 08-07：实现 GitTools 与 CheckpointTools

目标：

```text
实现 git_status、git_diff、create_checkpoint、rollback_checkpoint。
```

验收：

```text
1. 可获取当前分支和变更文件。
2. 可在 apply_patch 前创建 checkpoint。
3. 可回滚 AI 修改。
```

---

### Task 08-08：实现 ToolRouter 与 ToolServer

目标：

```text
实现 /tools/invoke 接口，分发所有工具。
```

验收：

```text
1. AutoGen Service 可 POST 调用 read_file。
2. 所有工具返回统一 ToolInvokeResponse。
3. 错误有标准 error.code。
4. 工具调用写入 audit log。
```

---

## 22. 自检清单

### 22.1 功能覆盖自检

| 项目 | 是否覆盖 |
|---|---|
| 文件列举 | 是 |
| 文件读取 | 是 |
| 批量读取 | 是 |
| 代码搜索 | 是 |
| Diff 预览 | 是 |
| Patch 提交 | 是 |
| Patch 应用 | 是 |
| Patch 拒绝 | 是 |
| Terminal 执行 | 是 |
| 命令确认 | 是 |
| Git 状态 | 是 |
| Git diff | 是 |
| Checkpoint | 是 |
| Rollback | 是 |
| Tool 审计日志 | 是 |
| Remote 注意事项 | 是 |

### 22.2 安全自检

| 项目 | 是否覆盖 |
|---|---|
| workspace 外访问禁止 | 是 |
| 符号链接逃逸防护 | 是 |
| 敏感文件黑名单 | 是 |
| 命令白名单 | 是 |
| 危险命令黑名单 | 是 |
| apply_patch 用户确认 | 是 |
| run_command 用户确认 | 是 |
| 工具权限矩阵 | 是 |
| 审计日志 | 是 |

### 22.3 联调自检

| 链路 | 是否覆盖 |
|---|---|
| Webview 点击查看 Diff → Extension open_diff | 是 |
| AutoGen 调用 read_file → Extension FileTools | 是 |
| AutoGen 调用 propose_patch → UI 展示 patch | 是 |
| 用户点击 apply_patch → git apply | 是 |
| TesterAgent 调用 run_command → 用户确认 → 执行 | 是 |
| Tool result 返回 AutoGen Service | 是 |

---

## 23. 本文档结论

VS Code 文件、Diff、Terminal、Git 能力不应该散落在 Extension 各处，而应该集中成 Tool Server。

核心原则：

```text
AutoGen 不能直接碰用户工程。
AutoGen 只能请求工具。
VS Code Extension 负责真实文件、Diff、Terminal、Git 操作。
所有危险动作必须经过权限矩阵和用户确认。
所有工具调用必须可审计、可回滚、可复现。
```

MVP 优先级：

```text
1. WorkspaceGuard
2. read_file / list_files / search_code
3. propose_patch / open_diff
4. apply_patch with git apply
5. run_command with allowlist
6. git_diff / checkpoint / rollback
```

完成本模块后，AutoGen 的 CodebaseAgent、DeveloperAgent、ReviewerAgent、TesterAgent 就可以真正和 VS Code 当前项目联调起来。
