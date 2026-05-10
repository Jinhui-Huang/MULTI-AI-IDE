# 10_配置存储与SecretStorage详细设计

> 适用项目：AutoGen + VS Code 插件 + Python AutoGen Service 多 Agent 编程 IDE  
> 文档目标：设计插件端、AutoGen Service 端、任务历史、运行日志、密钥与配置的完整存储方案，保证配置可编辑、可迁移、可回滚、可安全保存。  
> 当前文档定位：第 10 份详细设计文档，承接前面的 UI、通信协议、AutoGen Runtime、Tools、Task 状态机文档。

---

## 1. 资料依据与设计前提

### 1.1 官方能力依据

VS Code Extension 侧主要可用存储能力：

1. `ExtensionContext.workspaceState`
   - 工作区级 key/value 存储。
   - 适合保存当前 workspace 相关的小型状态，例如当前选中的 Team、最近任务 ID、UI Tab 状态。

2. `ExtensionContext.globalState`
   - 全局 key/value 存储。
   - 适合保存全局配置，例如默认模型、默认 Runtime Provider、最近使用的项目列表。
   - 可通过 `setKeysForSync()` 指定需要 Settings Sync 同步的键。

3. `ExtensionContext.storageUri`
   - 工作区级文件存储目录。
   - 适合保存当前项目专属的大型数据，例如任务事件、patch、命令日志、代码索引缓存。
   - 如果没有打开 workspace，可能为 `undefined`。

4. `ExtensionContext.globalStorageUri`
   - 扩展全局文件存储目录。
   - 适合保存跨项目共享的大型配置，例如内置 Agent 模板、全局 Workflow 模板、Runtime 下载缓存。

5. `ExtensionContext.secrets`
   - VS Code SecretStorage。
   - 适合保存 API Key、Token、私有模型认证信息等敏感数据。

6. `ExtensionContext.logUri`
   - 扩展日志目录。
   - 适合保存插件日志、AutoGen Service 启动日志、诊断信息。

### 1.2 本项目存储设计原则

本项目涉及多类数据：UI 配置、Agent 配置、Team 配置、Workflow 配置、Tool 权限、模型设置、密钥、任务历史、事件流、patch、命令输出、运行日志。必须分层保存。

核心原则：

```text
小型 key/value 状态 → workspaceState / globalState
敏感信息 → SecretStorage
当前项目大文件 → storageUri
跨项目大文件 → globalStorageUri
日志 → logUri
AutoGen Service 内部运行状态 → agent-service data 目录，必要时由 Extension 管理
```

禁止：

```text
不要把 API Key 写入普通 JSON 文件
不要把任务日志写进 workspace 源码目录
不要把大型 event log 写进 globalState/workspaceState
不要把用户代码片段长期保存在全局同步配置里
不要默认同步敏感路径、任务内容、代码上下文
```

---

## 2. 存储对象总览

### 2.1 存储分类表

| 数据类型 | 示例 | 存储位置 | 是否敏感 | 是否同步 | 说明 |
|---|---|---|---|---|---|
| UI 状态 | 当前 Tab、折叠状态 | workspaceState | 否 | 否 | 当前工作区 UI 状态 |
| 全局偏好 | 默认 Provider、主题偏好 | globalState | 否 | 可选 | 可通过 setKeysForSync 同步非敏感项 |
| API Key | OpenAI Key、Claude Key | SecretStorage | 是 | 由 VS Code 决定 | 不落普通文件 |
| Agent 配置 | Prompt、模型、工具列表 | storageUri / globalStorageUri | 部分敏感 | 默认不同步 | 项目级或全局级 |
| Team 配置 | Agent 顺序、模式 | storageUri / globalStorageUri | 否 | 默认不同步 | 可导入导出 |
| Workflow 配置 | 节点、边、确认策略 | storageUri / globalStorageUri | 否 | 默认不同步 | JSON 文件 |
| Tool 权限 | 权限矩阵、命令白名单 | storageUri / globalState | 中 | 默认不同步 | 工作区优先 |
| 任务事件 | WebSocket event log | storageUri | 可能含代码 | 否 | JSONL 存储 |
| Patch | unified diff | storageUri | 可能含代码 | 否 | 按 taskId 保存 |
| 命令输出 | stdout/stderr | storageUri / logUri | 可能含路径 | 否 | 大文件单独保存 |
| Runtime 配置 | Python path、port | globalState / workspaceState | 中 | 否 | 项目可覆盖 |
| Runtime 日志 | AutoGen Service stdout | logUri | 可能含敏感 | 否 | 可清理 |
| 代码索引缓存 | embedding / symbol index | storageUri | 可能含代码 | 否 | MVP 可不做 |

---

## 3. 推荐目录结构

### 3.1 globalStorageUri 目录

```text
<globalStorageUri>/
├─ config/
│  ├─ global-settings.json
│  ├─ model-providers.json
│  └─ runtime-providers.json
├─ templates/
│  ├─ agents/
│  │  ├─ planner.agent.json
│  │  ├─ developer.agent.json
│  │  └─ reviewer.agent.json
│  ├─ teams/
│  │  └─ java-spring.team.json
│  └─ workflows/
│     └─ code-edit.workflow.json
├─ runtime/
│  ├─ python/
│  └─ agent-service/
├─ cache/
│  ├─ downloads/
│  └─ package-metadata.json
└─ migrations/
   └─ applied.json
```

用途：

```text
全局模板
全局配置
内置 Runtime 资源
跨项目缓存
迁移记录
```

### 3.2 storageUri 目录

```text
<storageUri>/
├─ workspace-config/
│  ├─ settings.override.json
│  ├─ agents.json
│  ├─ teams.json
│  ├─ workflows.json
│  ├─ tool-permissions.json
│  └─ safety.json
├─ tasks/
│  ├─ task_20260510_001/
│  │  ├─ task.json
│  │  ├─ context.snapshot.json
│  │  ├─ events.jsonl
│  │  ├─ messages.jsonl
│  │  ├─ tool-calls.jsonl
│  │  ├─ approvals.jsonl
│  │  ├─ patches/
│  │  │  ├─ patch_001.diff
│  │  │  └─ patch_001.meta.json
│  │  ├─ commands/
│  │  │  ├─ cmd_001.stdout.log
│  │  │  ├─ cmd_001.stderr.log
│  │  │  └─ cmd_001.meta.json
│  │  └─ artifacts/
│  │     └─ summary.md
│  └─ task_20260510_002/
├─ indexes/
│  ├─ symbol-index.json
│  ├─ file-index.json
│  └─ rag-cache/
├─ checkpoints/
│  └─ task_20260510_001/
│     ├─ before.patch
│     └─ metadata.json
└─ tmp/
   └─ pending-patch.diff
```

用途：

```text
当前 workspace 的配置覆盖
任务历史
事件回放
patch 和命令输出
代码索引缓存
checkpoint/rollback 数据
```

### 3.3 logUri 目录

```text
<logUri>/
├─ extension.log
├─ agent-service.log
├─ runtime-start.log
├─ websocket.log
├─ tool-gateway.log
└─ diagnostics/
   └─ support-20260510.zip
```

用途：

```text
插件诊断
AutoGen Service 启动日志
WebSocket 连接日志
工具调用异常日志
用户导出支持包
```

---

## 4. 配置层级与覆盖规则

### 4.1 配置优先级

配置从低到高：

```text
内置默认配置
  ↓
globalStorageUri 全局配置
  ↓
storageUri 工作区配置
  ↓
workspaceState 临时状态
  ↓
当前任务请求参数
```

例如模型选择：

```text
默认模型：gpt-4.1-mini
全局设置：qwen2.5-coder:7b
当前项目覆盖：gpt-4.1
当前任务指定：claude-xxx
最终使用：当前任务指定模型
```

### 4.2 配置读取流程

```ts
async function loadEffectiveConfig(workspaceId: string): Promise<EffectiveConfig> {
  const defaults = loadBundledDefaults();
  const globalConfig = await globalConfigStore.load();
  const workspaceConfig = await workspaceConfigStore.load(workspaceId);
  const transientState = await workspaceStateStore.load();

  return deepMerge(
    defaults,
    globalConfig,
    workspaceConfig,
    transientState.overrides ?? {}
  );
}
```

### 4.3 配置写入原则

| 配置来源 | 写入位置 | 说明 |
|---|---|---|
| Settings 页全局保存 | globalStorageUri / globalState / SecretStorage | 默认设置 |
| Settings 页“仅当前项目”保存 | storageUri / workspaceState | 项目覆盖 |
| Agents 页保存 | storageUri/workspace-config/agents.json | 当前项目 Agent 配置 |
| Team 页保存 | storageUri/workspace-config/teams.json | 当前项目 Team |
| Workflow 页保存 | storageUri/workspace-config/workflows.json | 当前项目 Workflow |
| Tools 页权限保存 | storageUri/workspace-config/tool-permissions.json | 当前项目权限 |
| 临时 UI 状态 | workspaceState | 当前 Tab、选中 Agent |

---

## 5. SecretStorage 设计

### 5.1 需要进入 SecretStorage 的数据

必须保存到 SecretStorage：

```text
OpenAI API Key
Azure OpenAI API Key
Anthropic API Key
OpenAI-compatible Provider API Key
私有模型服务 Token
企业代理认证 Token
MCP Server 认证 Token
```

不能保存到 SecretStorage 的数据：

```text
普通 Provider 名称
Base URL
模型名
temperature
Python Path
端口
Agent Prompt
Workflow JSON
```

### 5.2 Secret Key 命名规范

```text
autogen-code.provider.openai.apiKey
autogen-code.provider.azure.apiKey
autogen-code.provider.anthropic.apiKey
autogen-code.provider.openaiCompatible.default.apiKey
autogen-code.provider.<providerId>.apiKey
autogen-code.mcp.<serverId>.token
```

### 5.3 SecretStorage 服务接口

```ts
export interface SecretStore {
  getProviderApiKey(providerId: string): Promise<string | undefined>;
  setProviderApiKey(providerId: string, value: string): Promise<void>;
  deleteProviderApiKey(providerId: string): Promise<void>;
  hasProviderApiKey(providerId: string): Promise<boolean>;
}
```

实现：

```ts
class VSCodeSecretStore implements SecretStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private key(providerId: string): string {
    return `autogen-code.provider.${providerId}.apiKey`;
  }

  async getProviderApiKey(providerId: string): Promise<string | undefined> {
    return this.context.secrets.get(this.key(providerId));
  }

  async setProviderApiKey(providerId: string, value: string): Promise<void> {
    await this.context.secrets.store(this.key(providerId), value);
  }

  async deleteProviderApiKey(providerId: string): Promise<void> {
    await this.context.secrets.delete(this.key(providerId));
  }

  async hasProviderApiKey(providerId: string): Promise<boolean> {
    const value = await this.getProviderApiKey(providerId);
    return !!value;
  }
}
```

### 5.4 UI 展示规则

Settings 页 API Key 输入框：

```text
如果已保存：显示 •••••••••••• 和 “已保存到 SecretStorage”
如果未保存：显示空输入框和 “未配置”
用户输入新值后：只传给 Extension，不回显给 Webview 日志
用户点击删除：删除 SecretStorage key
```

Webview 消息：

```json
{
  "type": "settings.secret.save",
  "requestId": "req_001",
  "payload": {
    "providerId": "openai-compatible",
    "secretKind": "apiKey",
    "value": "sk-..."
  }
}
```

Extension 返回时不能返回明文：

```json
{
  "type": "response",
  "requestId": "req_001",
  "ok": true,
  "data": {
    "providerId": "openai-compatible",
    "hasApiKey": true,
    "masked": "••••••••••••"
  }
}
```

### 5.5 传给 AutoGen Service 的方式

启动 Python AutoGen Service 时，Extension 从 SecretStorage 取出 API Key，通过环境变量传入：

```ts
const apiKey = await secretStore.getProviderApiKey(providerId);
const proc = spawn(pythonPath, [mainPy], {
  env: {
    ...process.env,
    AUTOGEN_PROVIDER_ID: providerId,
    AUTOGEN_API_KEY: apiKey ?? "",
    AUTOGEN_BASE_URL: modelSettings.baseUrl,
    AUTOGEN_MODEL: modelSettings.model
  }
});
```

注意：

```text
不要把 API Key 写入 runtime-settings.json
不要把 API Key 打印到 logUri
不要在 WebSocket 事件里返回 API Key
```

---

## 6. 配置文件结构设计

### 6.1 global-settings.json

```json
{
  "schemaVersion": "1.0.0",
  "runtimeProvider": "autogen",
  "defaultModelProvider": "openai-compatible",
  "defaultTeamId": "java-spring-team",
  "defaultWorkflowId": "code-edit-workflow",
  "ui": {
    "theme": "claude-dark",
    "defaultTab": "run",
    "compactMode": false
  },
  "runtime": {
    "serviceUrl": "http://127.0.0.1:8765",
    "host": "127.0.0.1",
    "port": 8765,
    "pythonPath": "python",
    "packageMode": "external",
    "logLevel": "info"
  },
  "history": {
    "maxTasks": 200,
    "maxEventLogMB": 200,
    "retentionDays": 30
  }
}
```

### 6.2 model-providers.json

```json
{
  "schemaVersion": "1.0.0",
  "providers": [
    {
      "id": "openai-compatible",
      "name": "OpenAI Compatible",
      "baseUrl": "http://localhost:11434/v1",
      "defaultModel": "qwen2.5-coder:7b",
      "fallbackModel": "gpt-4.1-mini",
      "apiKeySecretRef": "autogen-code.provider.openai-compatible.apiKey",
      "streaming": true,
      "timeoutMs": 120000,
      "maxRetries": 2
    }
  ]
}
```

### 6.3 agents.json

```json
{
  "schemaVersion": "1.0.0",
  "agents": [
    {
      "id": "developer_agent",
      "name": "DeveloperAgent",
      "description": "生成代码修改 patch",
      "role": "developer",
      "enabled": true,
      "model": {
        "providerId": "openai-compatible",
        "model": "qwen2.5-coder:7b",
        "temperature": 0.2,
        "maxOutputTokens": 8192
      },
      "limits": {
        "maxTurns": 8,
        "maxToolCalls": 30,
        "timeoutMs": 180000
      },
      "tools": ["read_file", "search_code", "propose_patch"],
      "contextScope": ["userRequest", "plan", "relatedFiles", "gitDiff"],
      "systemPrompt": "你是企业 Java 项目开发 Agent...",
      "responseFormat": "json_schema",
      "outputSchemaId": "developer_patch_result_v1",
      "stopCondition": "patch_proposed"
    }
  ]
}
```

### 6.4 teams.json

```json
{
  "schemaVersion": "1.0.0",
  "teams": [
    {
      "id": "java-spring-team",
      "name": "Java Spring Boot Team",
      "description": "适合 Java 后端项目的默认多 Agent 团队",
      "enabled": true,
      "mode": "sequential",
      "isDefault": true,
      "agentOrder": [
        "planner_agent",
        "codebase_agent",
        "developer_agent",
        "reviewer_agent",
        "tester_agent",
        "summary_agent"
      ],
      "limits": {
        "maxTurns": 20,
        "retryLimit": 2,
        "timeoutMs": 600000
      },
      "termination": {
        "type": "workflow_completed_or_error"
      }
    }
  ]
}
```

### 6.5 workflows.json

```json
{
  "schemaVersion": "1.0.0",
  "workflows": [
    {
      "id": "code-edit-workflow",
      "name": "Code Edit Workflow",
      "description": "代码修改流程",
      "version": "1.0.0",
      "isDefault": true,
      "nodes": [
        {
          "id": "plan",
          "type": "agent",
          "agentId": "planner_agent",
          "outputKey": "plan"
        },
        {
          "id": "plan_approval",
          "type": "human_approval",
          "approvalType": "plan"
        },
        {
          "id": "codebase",
          "type": "agent",
          "agentId": "codebase_agent",
          "outputKey": "codebaseSummary"
        },
        {
          "id": "develop",
          "type": "agent",
          "agentId": "developer_agent",
          "outputKey": "patch"
        },
        {
          "id": "review",
          "type": "agent",
          "agentId": "reviewer_agent",
          "outputKey": "review"
        },
        {
          "id": "patch_approval",
          "type": "human_approval",
          "approvalType": "patch"
        },
        {
          "id": "test",
          "type": "agent",
          "agentId": "tester_agent",
          "outputKey": "testResult"
        }
      ],
      "edges": [
        ["plan", "plan_approval"],
        ["plan_approval", "codebase"],
        ["codebase", "develop"],
        ["develop", "review"],
        ["review", "patch_approval"],
        ["patch_approval", "test"]
      ],
      "failureStrategy": {
        "onTestFailure": "return_to_developer",
        "maxRepairLoops": 2
      }
    }
  ]
}
```

### 6.6 tool-permissions.json

```json
{
  "schemaVersion": "1.0.0",
  "matrix": {
    "planner_agent": {
      "list_files": "deny",
      "read_file": "deny"
    },
    "codebase_agent": {
      "list_files": "allow",
      "read_file": "allow",
      "search_code": "allow",
      "propose_patch": "deny",
      "run_command": "deny"
    },
    "developer_agent": {
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
  },
  "commandAllowlist": [
    "mvn test",
    "mvn -q test",
    "gradle test",
    "npm test",
    "pnpm build"
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
    "powershell"
  ]
}
```

### 6.7 safety.json

```json
{
  "schemaVersion": "1.0.0",
  "workspaceGuard": {
    "denyOutsideWorkspace": true,
    "denySymlinkEscape": true,
    "denyHiddenSecrets": true
  },
  "fileAccess": {
    "sensitivePatterns": [
      ".env",
      ".env.*",
      "*.pem",
      "*.key",
      "id_rsa",
      "credentials.json",
      "application-prod.yml",
      "application-prod.yaml"
    ],
    "maxFilesReadPerTask": 40,
    "maxFileSizeKB": 512
  },
  "patch": {
    "requireApproval": true,
    "createCheckpointBeforeApply": true,
    "denyDirectWrite": true
  },
  "command": {
    "requireApproval": true,
    "defaultTimeoutMs": 120000,
    "maxOutputKB": 1024
  },
  "logging": {
    "redactSecrets": true,
    "storeToolArgs": true,
    "storeToolResults": "summary"
  }
}
```

---

## 7. Task 存储设计

### 7.1 task.json

```json
{
  "id": "task_20260510_001",
  "workspaceId": "workspace_hash_001",
  "title": "增加 JWT 登录接口",
  "userRequest": "帮我给当前 Spring Boot 项目增加 JWT 登录接口",
  "status": "waiting_patch_approval",
  "teamId": "java-spring-team",
  "workflowId": "code-edit-workflow",
  "createdAt": "2026-05-10T03:12:00+09:00",
  "updatedAt": "2026-05-10T03:20:00+09:00",
  "currentStepId": "patch_approval",
  "currentAgentId": "reviewer_agent",
  "summary": "已生成 patch，等待用户确认",
  "stats": {
    "messages": 18,
    "toolCalls": 12,
    "patches": 1,
    "commands": 0
  }
}
```

### 7.2 events.jsonl

每一行一个事件：

```json
{"seq":1,"type":"task.created","taskId":"task_20260510_001","timestamp":"2026-05-10T03:12:00+09:00","payload":{"title":"增加 JWT 登录接口"}}
{"seq":2,"type":"agent.started","taskId":"task_20260510_001","agentId":"planner_agent","timestamp":"2026-05-10T03:12:02+09:00","payload":{}}
{"seq":3,"type":"agent.message","taskId":"task_20260510_001","agentId":"planner_agent","timestamp":"2026-05-10T03:12:04+09:00","payload":{"content":"我将先拆分任务..."}}
```

设计理由：

```text
JSONL 适合追加写入
断线重连可按 seq 补发
任务历史可直接回放
大任务不会一次性重写整个 JSON
```

### 7.3 messages.jsonl

```json
{"id":"msg_001","seq":3,"agentId":"planner_agent","role":"assistant","content":"我将先拆分任务...","createdAt":"..."}
{"id":"msg_002","seq":4,"agentId":"codebase_agent","role":"assistant","content":"需要读取 pom.xml...","createdAt":"..."}
```

### 7.4 tool-calls.jsonl

```json
{
  "id": "tool_001",
  "seq": 5,
  "taskId": "task_20260510_001",
  "agentId": "codebase_agent",
  "toolName": "read_file",
  "args": {
    "path": "pom.xml"
  },
  "status": "success",
  "resultSummary": "读取成功，4210 chars",
  "startedAt": "...",
  "finishedAt": "..."
}
```

### 7.5 approvals.jsonl

```json
{
  "id": "approval_001",
  "taskId": "task_20260510_001",
  "type": "patch",
  "status": "approved",
  "requestedBy": "workflow_runner",
  "payloadRef": "patches/patch_001.meta.json",
  "decision": {
    "action": "approve",
    "comment": "可以应用"
  },
  "createdAt": "...",
  "decidedAt": "..."
}
```

### 7.6 patch meta

`patch_001.meta.json`：

```json
{
  "id": "patch_001",
  "taskId": "task_20260510_001",
  "status": "pending_approval",
  "diffPath": "patches/patch_001.diff",
  "changedFiles": [
    {
      "path": "src/main/java/com/demo/AuthController.java",
      "changeType": "add"
    },
    {
      "path": "pom.xml",
      "changeType": "modify"
    }
  ],
  "riskLevel": "medium",
  "createdBy": "developer_agent",
  "createdAt": "..."
}
```

### 7.7 command meta

```json
{
  "id": "cmd_001",
  "taskId": "task_20260510_001",
  "command": "mvn test",
  "cwd": "${workspaceRoot}",
  "status": "failed",
  "exitCode": 1,
  "stdoutPath": "commands/cmd_001.stdout.log",
  "stderrPath": "commands/cmd_001.stderr.log",
  "summary": "JwtUtilTest 编译失败",
  "startedAt": "...",
  "finishedAt": "..."
}
```

---

## 8. Extension 侧 ConfigStore 设计

### 8.1 模块划分

```text
src/storage/
├─ ConfigStore.ts
├─ SecretStore.ts
├─ TaskStore.ts
├─ EventStore.ts
├─ LogStore.ts
├─ MigrationManager.ts
├─ StoragePaths.ts
└─ schemas/
   ├─ agent.schema.ts
   ├─ team.schema.ts
   ├─ workflow.schema.ts
   ├─ tool.schema.ts
   └─ settings.schema.ts
```

### 8.2 StoragePaths

```ts
export class StoragePaths {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getGlobalStorageUri(): vscode.Uri {
    return this.context.globalStorageUri;
  }

  getWorkspaceStorageUri(): vscode.Uri | undefined {
    return this.context.storageUri;
  }

  getLogUri(): vscode.Uri {
    return this.context.logUri;
  }

  globalConfig(file: string): vscode.Uri {
    return vscode.Uri.joinPath(this.context.globalStorageUri, "config", file);
  }

  workspaceConfig(file: string): vscode.Uri {
    const root = this.requireWorkspaceStorageUri();
    return vscode.Uri.joinPath(root, "workspace-config", file);
  }

  taskDir(taskId: string): vscode.Uri {
    const root = this.requireWorkspaceStorageUri();
    return vscode.Uri.joinPath(root, "tasks", taskId);
  }

  private requireWorkspaceStorageUri(): vscode.Uri {
    if (!this.context.storageUri) {
      throw new Error("No workspace storage available. Open a folder first.");
    }
    return this.context.storageUri;
  }
}
```

### 8.3 ConfigStore API

```ts
export interface ConfigStore {
  loadEffectiveConfig(): Promise<EffectiveConfig>;

  loadAgents(scope: "global" | "workspace"): Promise<AgentConfig[]>;
  saveAgents(scope: "global" | "workspace", agents: AgentConfig[]): Promise<void>;

  loadTeams(scope: "global" | "workspace"): Promise<TeamConfig[]>;
  saveTeams(scope: "global" | "workspace", teams: TeamConfig[]): Promise<void>;

  loadWorkflows(scope: "global" | "workspace"): Promise<WorkflowConfig[]>;
  saveWorkflows(scope: "global" | "workspace", workflows: WorkflowConfig[]): Promise<void>;

  loadToolPermissions(): Promise<ToolPermissionConfig>;
  saveToolPermissions(config: ToolPermissionConfig): Promise<void>;

  loadSafety(): Promise<SafetyConfig>;
  saveSafety(config: SafetyConfig): Promise<void>;

  loadRuntimeSettings(): Promise<RuntimeSettings>;
  saveRuntimeSettings(settings: RuntimeSettings): Promise<void>;
}
```

### 8.4 JSON 读写工具

```ts
async function readJson<T>(uri: vscode.Uri, fallback: T): Promise<T> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as T;
  } catch (err: any) {
    if (err?.code === "FileNotFound") {
      return fallback;
    }
    throw err;
  }
}

async function writeJson<T>(uri: vscode.Uri, value: T): Promise<void> {
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, ".."));
  const text = JSON.stringify(value, null, 2);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, "utf8"));
}
```

注意：`vscode.Uri.joinPath(uri, "..")` 不适合所有 scheme，实际实现建议单独写 `dirnameUri()`。

---

## 9. TaskStore 设计

### 9.1 TaskStore API

```ts
export interface TaskStore {
  createTask(input: CreateTaskInput): Promise<TaskRecord>;
  updateTask(taskId: string, patch: Partial<TaskRecord>): Promise<void>;
  getTask(taskId: string): Promise<TaskRecord | undefined>;
  listTasks(filter?: TaskListFilter): Promise<TaskRecord[]>;
  deleteTask(taskId: string): Promise<void>;

  appendEvent(taskId: string, event: TaskEvent): Promise<void>;
  readEvents(taskId: string, sinceSeq?: number): Promise<TaskEvent[]>;

  savePatch(taskId: string, patch: PatchRecord, diffText: string): Promise<void>;
  getPatch(taskId: string, patchId: string): Promise<{ meta: PatchRecord; diff: string }>;

  saveCommandOutput(taskId: string, command: CommandRecord, stdout: string, stderr: string): Promise<void>;
}
```

### 9.2 任务列表索引

为了快速显示任务历史，维护一个 `tasks/index.json`：

```json
{
  "schemaVersion": "1.0.0",
  "tasks": [
    {
      "id": "task_20260510_001",
      "title": "增加 JWT 登录接口",
      "status": "completed",
      "createdAt": "...",
      "updatedAt": "...",
      "teamId": "java-spring-team",
      "workflowId": "code-edit-workflow",
      "summary": "修改 5 个文件，测试通过"
    }
  ]
}
```

Task 页历史列表只读 `index.json`，进入详情再读 task 目录。

### 9.3 事件写入一致性

事件写入顺序：

```text
1. 生成 seq
2. append events.jsonl
3. 更新 task.json current status
4. 更新 tasks/index.json
5. 推送 WebSocket / Webview event
```

如果中途失败：

```text
事件已写但状态未更新 → 下次启动时 replay events 修复 task.json
状态已更新但事件未写 → 视为严重错误，写入 diagnostics
```

建议 MVP 简化：先不做事务，用 append + 定期 snapshot。

---

## 10. AutoGen Service 配置同步设计

### 10.1 Extension 是配置主控

配置主存储在 VS Code Extension 侧。

AutoGen Service 启动时由 Extension 传入：

```text
runtime settings
model settings
agent configs
team configs
workflow configs
tool permissions
safety config
```

传入方式：

```text
启动参数 / env：Runtime 基础配置、密钥
HTTP POST /api/config/sync：完整非敏感配置
```

### 10.2 同步接口

```http
POST /api/config/sync
```

请求：

```json
{
  "schemaVersion": "1.0.0",
  "workspaceId": "workspace_hash_001",
  "effectiveConfig": {
    "agents": [],
    "teams": [],
    "workflows": [],
    "toolPermissions": {},
    "safety": {},
    "modelSettings": {
      "providerId": "openai-compatible",
      "baseUrl": "http://localhost:11434/v1",
      "model": "qwen2.5-coder:7b",
      "hasApiKey": true
    }
  }
}
```

响应：

```json
{
  "ok": true,
  "configVersion": "20260510_031200",
  "warnings": []
}
```

### 10.3 密钥同步

密钥不通过 `/api/config/sync` 明文传。

建议：

```text
方式一：Extension 启动 AutoGen Service 时通过 env 注入当前 Provider API Key
方式二：AutoGen Service 每次需要 Key 时请求 Extension Secret Proxy
```

MVP 用方式一。

进阶版本用方式二：

```http
POST /tool/secret/get
```

但该接口只允许本机 service 调用，并需要一次性 session token。

---

## 11. 配置迁移设计

### 11.1 schemaVersion

所有 JSON 配置必须包含：

```json
{
  "schemaVersion": "1.0.0"
}
```

### 11.2 MigrationManager

```ts
export interface Migration {
  id: string;
  from: string;
  to: string;
  apply(input: any): Promise<any>;
}
```

迁移记录：

```json
{
  "applied": [
    {
      "id": "20260510_add_runtime_provider",
      "appliedAt": "2026-05-10T03:12:00+09:00"
    }
  ]
}
```

### 11.3 启动时迁移流程

```text
1. 读取 globalStorageUri/migrations/applied.json
2. 扫描所有配置文件
3. 检查 schemaVersion
4. 备份原文件到 .bak
5. 执行迁移
6. 写入新配置
7. 更新 applied.json
8. 失败则恢复备份
```

---

## 12. 导入导出配置设计

### 12.1 导出配置

Settings 页“导出配置”输出 ZIP：

```text
autogen-code-config-export.zip
├─ manifest.json
├─ agents.json
├─ teams.json
├─ workflows.json
├─ tool-permissions.json
├─ safety.json
├─ model-providers.redacted.json
└─ README.txt
```

`manifest.json`：

```json
{
  "exportedAt": "2026-05-10T03:12:00+09:00",
  "extensionVersion": "0.1.0",
  "schemaVersion": "1.0.0",
  "containsSecrets": false,
  "workspaceScoped": true
}
```

注意：

```text
默认不导出 API Key
默认不导出任务历史
默认不导出代码片段
可以选择“导出模板配置”或“导出当前项目配置”
```

### 12.2 导入配置

导入流程：

```text
1. 用户选择 ZIP / JSON
2. 读取 manifest
3. 校验 schemaVersion
4. 展示导入预览
5. 用户选择覆盖/合并
6. 写入 workspace-config 或 global templates
7. 刷新 UI
```

冲突策略：

```text
同 ID：询问覆盖 / 生成副本 / 跳过
新 ID：直接导入
schema 不兼容：执行迁移或拒绝
```

---

## 13. 清理与保留策略

### 13.1 任务历史清理

Settings 页：

```text
保留最近 N 个任务
保留最近 N 天任务
清空失败任务
清空所有任务历史
```

清理时：

```text
删除 tasks/<taskId>
更新 tasks/index.json
保留 runtime 日志不动
保留配置不动
```

### 13.2 日志清理

默认：

```text
extension.log 最大 20MB
agent-service.log 最大 50MB
保留最近 10 个滚动日志
```

### 13.3 缓存清理

清理对象：

```text
indexes/
tmp/
cache/downloads/
旧 runtime 包
```

不要清理：

```text
workspace-config/
SecretStorage
正在运行 task 目录
```

---

## 14. 安全与脱敏设计

### 14.1 日志脱敏

所有日志写入前执行：

```ts
function redactSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_\-]{20,}/g, "sk-***REDACTED***")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer ***REDACTED***")
    .replace(/api[_-]?key\s*[:=]\s*[^\s]+/gi, "api_key=***REDACTED***");
}
```

### 14.2 任务历史中的代码内容

任务事件可能包含代码片段、文件路径、业务逻辑。默认：

```text
不上传
不同步
不写入 globalState
只保存在当前 workspace storageUri
支持用户清空
```

### 14.3 SecretStorage 访问审计

每次读取 secret 时写入摘要日志：

```json
{
  "type": "secret.access",
  "providerId": "openai-compatible",
  "purpose": "runtime.start",
  "timestamp": "...",
  "success": true
}
```

不能记录 secret 值。

---

## 15. UI 控件与存储映射

### 15.1 Settings Tab

| 控件 | 存储目标 | 说明 |
|---|---|---|
| Provider | global-settings.json / workspace override | 默认模型供应商 |
| Base URL | model-providers.json | 非敏感 |
| Model | model-providers.json | 非敏感 |
| Fallback Model | model-providers.json | 非敏感 |
| API Key | SecretStorage | 敏感 |
| Service URL | global-settings.json/runtime | 非敏感 |
| Host | global-settings.json/runtime | 非敏感 |
| Port | global-settings.json/runtime | 非敏感 |
| Python Path | global-settings.json/runtime | 本机路径 |
| Log Level | global-settings.json/runtime | 非敏感 |
| Workspace Storage Path | global-settings.json/history | 可选 |
| Use SecretStorage | global-settings.json/security | 如果关闭，仍建议强制使用 SecretStorage |
| Max Files Read | safety.json | 安全策略 |
| Max Context Tokens | safety.json | 上下文策略 |

### 15.2 Agents Tab

| 控件 | 存储目标 |
|---|---|
| Agent Name | agents.json |
| Role | agents.json |
| Description | agents.json |
| Model | agents.json/model |
| Temperature | agents.json/model |
| Max Turns | agents.json/limits |
| Max Tool Calls | agents.json/limits |
| Timeout | agents.json/limits |
| System Prompt | agents.json/systemPrompt |
| Response Format | agents.json/responseFormat |
| Stop Condition | agents.json/stopCondition |
| Output JSON Schema | agents.json/outputSchema |
| Tool Checkboxes | agents.json/tools |
| Context Scope | agents.json/contextScope |

### 15.3 Team Tab

| 控件 | 存储目标 |
|---|---|
| Team Name | teams.json/name |
| Team Mode | teams.json/mode |
| Max Turns | teams.json/limits |
| Retry Limit | teams.json/limits |
| Termination | teams.json/termination |
| Agent Order | teams.json/agentOrder |
| Set Default | teams.json/isDefault |

### 15.4 Tools Tab

| 控件 | 存储目标 |
|---|---|
| Permission Matrix | tool-permissions.json/matrix |
| Command Allowlist | tool-permissions.json/commandAllowlist |
| Command Blocklist | tool-permissions.json/commandBlocklist |
| Sensitive File Blocklist | safety.json/fileAccess/sensitivePatterns |
| Global Safety Switches | safety.json/workspaceGuard / patch / command |
| Tool Schema | tool-registry.json |

### 15.5 Workflow Tab

| 控件 | 存储目标 |
|---|---|
| Workflow Name | workflows.json/name |
| Description | workflows.json/description |
| JSON Version | workflows.json/version |
| Workflow Type | workflows.json/type |
| Failure Strategy | workflows.json/failureStrategy |
| Retry Limit | workflows.json/failureStrategy |
| Node Timeout | workflows.json/nodeDefaults |
| Confirm Policy | workflows.json/approvalPolicy |
| Nodes / Edges | workflows.json/nodes / edges |
| Set Default | workflows.json/isDefault |

### 15.6 Run Tab

| 控件 | 存储目标 |
|---|---|
| Last Selected Team | workspaceState |
| Last Selected Workflow | workspaceState |
| Last Mode | workspaceState |
| Target Agent | workspaceState |
| Current Task ID | workspaceState |
| Task History | storageUri/tasks/index.json |
| Events | storageUri/tasks/<taskId>/events.jsonl |
| Patch | storageUri/tasks/<taskId>/patches |
| Commands | storageUri/tasks/<taskId>/commands |

---

## 16. Webview / Extension 消息设计

### 16.1 保存设置

```json
{
  "type": "settings.save",
  "requestId": "req_001",
  "payload": {
    "scope": "global",
    "settings": {
      "runtime": {
        "pythonPath": "C:/Python311/python.exe",
        "port": 8765,
        "logLevel": "info"
      },
      "model": {
        "providerId": "openai-compatible",
        "baseUrl": "http://localhost:11434/v1",
        "model": "qwen2.5-coder:7b"
      }
    }
  }
}
```

### 16.2 保存密钥

```json
{
  "type": "settings.secret.save",
  "requestId": "req_002",
  "payload": {
    "providerId": "openai-compatible",
    "secretKind": "apiKey",
    "value": "sk-..."
  }
}
```

### 16.3 导出配置

```json
{
  "type": "config.export",
  "requestId": "req_003",
  "payload": {
    "scope": "workspace",
    "includeTaskHistory": false,
    "includeSecrets": false
  }
}
```

### 16.4 导入配置

```json
{
  "type": "config.import",
  "requestId": "req_004",
  "payload": {
    "mode": "merge"
  }
}
```

Extension 通过 `showOpenDialog` 选择文件，不应让 Webview 直接访问本地路径。

---

## 17. 运行时启动配置流程

### 17.1 启动 AutoGen Service

```text
1. UI 点击 Start Runtime
2. Webview → Extension: runtime.start
3. Extension 读取 EffectiveConfig
4. Extension 从 SecretStorage 读取 API Key
5. Extension 检查 Python Path
6. Extension spawn Python AutoGen Service
7. Extension 等待 /health
8. Extension 调用 /api/config/sync
9. Extension 打开 WebSocket
10. UI 状态变为 running
```

### 17.2 Runtime 启动环境变量

```text
AUTOGEN_CODE_WORKSPACE_ID
AUTOGEN_CODE_SERVICE_PORT
AUTOGEN_CODE_LOG_LEVEL
AUTOGEN_PROVIDER_ID
AUTOGEN_BASE_URL
AUTOGEN_MODEL
AUTOGEN_API_KEY
AUTOGEN_CONFIG_VERSION
```

### 17.3 Runtime Health 返回

```json
{
  "ok": true,
  "runtimeProvider": "autogen",
  "pythonVersion": "3.11.8",
  "packages": {
    "autogen-agentchat": "x.x.x",
    "autogen-ext": "x.x.x",
    "fastapi": "x.x.x"
  },
  "configVersion": "20260510_031200",
  "uptimeSec": 32
}
```

---

## 18. 错误码设计

| 错误码 | 场景 | UI 提示 |
|---|---|---|
| STORAGE_NO_WORKSPACE | 未打开工作区 | 请先打开项目目录 |
| STORAGE_READ_FAILED | 配置读取失败 | 配置文件读取失败，可尝试恢复默认 |
| STORAGE_WRITE_FAILED | 配置写入失败 | 保存失败，请检查权限 |
| SECRET_SAVE_FAILED | SecretStorage 保存失败 | API Key 保存失败 |
| CONFIG_SCHEMA_INVALID | 配置格式错误 | 配置校验失败，查看详情 |
| CONFIG_MIGRATION_FAILED | 迁移失败 | 配置迁移失败，已恢复备份 |
| TASK_STORE_FULL | 任务历史过大 | 请清理任务历史 |
| LOG_WRITE_FAILED | 日志写入失败 | 日志写入失败，不影响主流程 |
| RUNTIME_SECRET_MISSING | 缺少 API Key | 请在 Settings 中配置 API Key |
| RUNTIME_CONFIG_SYNC_FAILED | 配置同步失败 | AutoGen Service 配置同步失败 |

---

## 19. 测试用例

### 19.1 SecretStorage 测试

```text
1. 保存 API Key 后刷新 UI，应显示 hasApiKey=true，不显示明文
2. 删除 API Key 后 Runtime 启动应提示缺少密钥
3. 导出配置时不包含 API Key
4. 日志中不出现 sk- 开头密钥
```

### 19.2 配置读写测试

```text
1. 保存 Agent Prompt 后重新打开 VS Code，配置仍存在
2. 当前 workspace 覆盖模型后，不影响其他 workspace
3. global 设置修改后，新 workspace 使用新默认值
4. 配置文件损坏时，提示恢复默认，不崩溃
```

### 19.3 任务存储测试

```text
1. 创建任务后生成 task.json 和 events.jsonl
2. WebSocket 断开后按 sinceSeq 补发事件
3. Patch 生成后保存 diff 和 meta
4. 清空任务历史后 index.json 同步更新
```

### 19.4 迁移测试

```text
1. 旧 schemaVersion 配置可自动迁移
2. 迁移失败时可恢复 .bak
3. 已迁移记录不会重复执行
```

### 19.5 安全测试

```text
1. API Key 不进入普通 JSON 文件
2. 任务历史不写入 globalState
3. 敏感文件路径不会被保存到可同步配置
4. 导出配置默认不包含任务历史和密钥
```

---

## 20. Codex 开发任务拆分

### Task 10-1：实现 StoragePaths

目标：封装 globalStorageUri、storageUri、logUri 路径。

修改文件：

```text
src/storage/StoragePaths.ts
```

验收标准：

```text
能返回 global config 路径
能返回 workspace config 路径
无 workspace 时抛出明确错误
```

### Task 10-2：实现 SecretStore

目标：封装 VS Code SecretStorage。

修改文件：

```text
src/storage/SecretStore.ts
```

验收标准：

```text
支持 get/set/delete API Key
返回时不暴露明文
保存失败有错误码
```

### Task 10-3：实现 ConfigStore

目标：读写 Agents、Teams、Workflows、Tools、Safety、Runtime 配置。

修改文件：

```text
src/storage/ConfigStore.ts
src/storage/schemas/*.ts
```

验收标准：

```text
配置文件不存在时使用默认值
保存后可重新读取
schema 校验失败有错误提示
```

### Task 10-4：实现 TaskStore

目标：保存任务、事件、patch、命令输出。

修改文件：

```text
src/storage/TaskStore.ts
```

验收标准：

```text
创建任务目录
追加 events.jsonl
保存 patch diff
保存 command stdout/stderr
维护 tasks/index.json
```

### Task 10-5：实现配置导入导出

目标：支持 Settings 页导入/导出配置 ZIP。

修改文件：

```text
src/storage/ConfigImportExport.ts
```

验收标准：

```text
导出不包含 API Key
导入前展示预览
支持覆盖/合并/跳过
```

### Task 10-6：实现迁移管理

目标：支持 schemaVersion 升级。

修改文件：

```text
src/storage/MigrationManager.ts
```

验收标准：

```text
自动备份旧配置
迁移失败可恢复
记录已应用 migration
```

### Task 10-7：联调 Runtime 配置同步

目标：Extension 读取配置并同步给 AutoGen Service。

修改文件：

```text
src/runtime/RuntimeClient.ts
agent-service/api/config.py
```

验收标准：

```text
runtime.start 时读取 SecretStorage
/api/config/sync 收到完整非敏感配置
/health 返回 configVersion
```

---

## 21. 自检清单

### 21.1 覆盖范围自检

- [x] 是否覆盖 VS Code workspaceState/globalState/SecretStorage/storageUri/globalStorageUri/logUri？
- [x] 是否区分小型状态、大型文件、密钥、日志、任务历史？
- [x] 是否设计 Agent/Team/Workflow/Tools/Settings 配置文件结构？
- [x] 是否设计 Task/Event/Patch/Command 存储结构？
- [x] 是否设计 SecretStorage key 命名和读写方式？
- [x] 是否说明 API Key 不进入普通 JSON？
- [x] 是否设计配置覆盖规则？
- [x] 是否设计 Runtime 配置同步？
- [x] 是否设计导入导出？
- [x] 是否设计配置迁移？
- [x] 是否设计日志脱敏？
- [x] 是否设计清理策略？

### 21.2 联调自检

- [x] Settings 页控件是否能映射到具体存储位置？
- [x] Agents 页控件是否能映射到 agents.json？
- [x] Team 页控件是否能映射到 teams.json？
- [x] Workflow 页控件是否能映射到 workflows.json？
- [x] Tools 页控件是否能映射到 tool-permissions.json / safety.json？
- [x] Run 页任务数据是否能映射到 TaskStore？
- [x] AutoGen Service 是否能通过 /api/config/sync 获取配置？
- [x] Runtime 启动是否能从 SecretStorage 获取密钥？

### 21.3 安全自检

- [x] 是否避免密钥进入导出包？
- [x] 是否避免任务历史进入 Settings Sync？
- [x] 是否设计日志脱敏？
- [x] 是否保留用户清理任务历史能力？
- [x] 是否防止 Webview 直接访问本地路径？

---

## 22. 下一份文档建议

下一份建议生成：

```text
11_安全边界与沙箱策略详细设计.md
```

重点内容：

```text
workspace 外访问禁止
敏感文件保护
工具权限执行链
命令白名单/黑名单
Patch 应用安全
Terminal 沙箱策略
Runtime 进程隔离
日志脱敏
供应链风险
AutoGen Agent 越权防护
```
