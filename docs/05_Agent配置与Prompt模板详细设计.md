# 05_Agent配置与Prompt模板详细设计

> 文档目标：为“AutoGen + VS Code 插件式 AI Code Agent”项目定义完整的 Agent 配置模型、Prompt 模板、输出结构、工具权限、上下文输入规则和自检标准。本文档用于指导 Codex / 开发者实现 `Agents` Tab、AutoGen Service 的 `AgentFactory`、Prompt 管理、结构化输出解析和后续维护。

---

## 1. 资料依据与设计约束

### 1.1 资料依据

本设计参考以下资料方向：

1. AutoGen AgentChat 官方文档：`AssistantAgent` 可通过 `name`、`model_client`、`tools`、`system_message` 等参数构造 Agent，并通过 `run()` / `run_stream()` 执行任务；工具调用结果可以通过 `reflect_on_tool_use=True` 让模型反思总结。  
   参考：AutoGen Agents 官方文档。  
   https://microsoft.github.io/autogen/stable//user-guide/agentchat-user-guide/tutorial/agents.html

2. AutoGen 官方文档说明支持结构化输出，应用可以用预定义 Schema / Pydantic 模型约束输出，用于后端解析。  
   参考：AutoGen Structured Output 文档。  
   https://microsoft.github.io/autogen/stable//user-guide/core-user-guide/cookbook/structured-output-agent.html

3. AutoGen 官方仓库已标注维护模式，新项目需要考虑未来迁移到 Microsoft Agent Framework，因此本项目 Agent 配置必须保持中立，不直接把配置字段绑定到 AutoGen 专有类名。  
   参考：AutoGen GitHub 仓库说明。  
   https://github.com/microsoft/autogen

4. VS Code 扩展中的敏感信息应通过 `ExtensionContext.secrets` 保存；普通配置可以保存到扩展存储或项目级配置中。  
   参考：VS Code Common Capabilities / SecretStorage 文档。  
   https://code.visualstudio.com/api/extension-capabilities/common-capabilities

### 1.2 设计约束

本项目中的 Agent 配置必须满足：

1. **UI 可配置**：Agents Tab 中可以编辑名称、角色、模型、Prompt、工具权限、上下文范围、输出格式。
2. **运行时可替换**：配置不直接绑定 AutoGen 的类名，后续可迁移到 Microsoft Agent Framework / LangGraph / 自研 Runtime。
3. **输出可解析**：Developer / Reviewer / Tester 等关键 Agent 必须输出 JSON，不能只输出自然语言。
4. **权限可控**：Agent 只能调用 UI 配置中允许的工具。
5. **Prompt 可版本化**：每个 Agent 的 Prompt 必须有版本号，方便升级、回滚和 AB 测试。
6. **IDE 安全优先**：任何 Agent 不允许直接修改文件；代码修改必须通过 `propose_patch`，再由用户确认。

---

## 2. Agent 配置总模型

### 2.1 AgentConfig JSON

```json
{
  "id": "developer_agent",
  "name": "DeveloperAgent",
  "role": "developer",
  "description": "根据项目上下文生成代码修改 patch",
  "enabled": true,
  "runtimeProvider": "autogen",
  "model": {
    "provider": "openai-compatible",
    "modelName": "gpt-4.1",
    "temperature": 0.2,
    "topP": 1.0,
    "maxOutputTokens": 8192,
    "timeoutSeconds": 120
  },
  "prompt": {
    "version": "2026-05-10-v1",
    "systemPrompt": "...",
    "developerInstruction": "...",
    "responseFormat": "json_schema",
    "outputSchemaId": "developer_patch_result_v1"
  },
  "tools": {
    "allowed": [
      "list_files",
      "read_file",
      "search_code",
      "git_diff",
      "propose_patch"
    ],
    "denied": [
      "apply_patch",
      "run_command"
    ],
    "requireApproval": []
  },
  "contextPolicy": {
    "allowCurrentFile": true,
    "allowSelection": true,
    "allowOpenTabs": true,
    "allowGitDiff": true,
    "allowTerminalError": false,
    "allowProjectSummary": true,
    "allowRagChunks": true,
    "maxFiles": 20,
    "maxCharsPerFile": 20000,
    "maxTotalContextTokens": 64000
  },
  "limits": {
    "maxTurns": 6,
    "maxToolCalls": 20,
    "maxRetries": 2,
    "stopCondition": "json_output_valid"
  },
  "audit": {
    "logPrompt": false,
    "logToolArgs": true,
    "logToolResultSummary": true,
    "logFullToolResult": false
  }
}
```

### 2.2 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 内部唯一 ID，不随显示名变化 |
| `name` | string | UI 展示名称，也是 AutoGen Agent name 的来源 |
| `role` | enum | `planner/codebase/developer/reviewer/tester/summary/custom` |
| `description` | string | UI 展示和 Agent 选择说明 |
| `enabled` | boolean | 是否启用 |
| `runtimeProvider` | string | 当前使用 `autogen`，未来可替换 |
| `model` | object | 模型参数 |
| `prompt` | object | Prompt 与输出格式配置 |
| `tools` | object | 工具权限配置 |
| `contextPolicy` | object | 上下文输入范围 |
| `limits` | object | 运行限制 |
| `audit` | object | 日志记录策略 |

---

## 3. Agents Tab UI 字段映射

### 3.1 Agent 列表卡片

每个 Agent 卡片显示：

```text
Agent Name
Role / Description
Model
Enabled 状态
Tools 数量
Prompt Version
[编辑] [复制] [禁用/启用] [删除] [测试]
```

对应事件：

| UI 操作 | Webview Message | Extension API | AutoGen Service API |
|---|---|---|---|
| 点击卡片 | `agent.select` | `agentClient.getAgent(id)` | `GET /api/agents/{id}` |
| 新增 | `agent.create` | `agentClient.create()` | `POST /api/agents` |
| 复制 | `agent.copy` | `agentClient.copy(id)` | `POST /api/agents/{id}/copy` |
| 禁用/启用 | `agent.toggleEnabled` | `agentClient.toggle(id)` | `PATCH /api/agents/{id}/enabled` |
| 删除 | `agent.delete` | `agentClient.delete(id)` | `DELETE /api/agents/{id}` |
| 测试 | `agent.test` | `agentClient.test(payload)` | `POST /api/agents/{id}/test` |

### 3.2 Agent 编辑表单

| 控件 | 类型 | 字段 | 说明 |
|---|---|---|---|
| Agent Name | input | `name` | 显示名 |
| Role | select | `role` | 角色类型 |
| Description | input/textarea | `description` | 角色说明 |
| Model Provider | select | `model.provider` | OpenAI-compatible / Ollama / Azure 等 |
| Model Name | input/select | `model.modelName` | 模型名 |
| Temperature | number | `model.temperature` | 默认 0.2 |
| Max Output Tokens | number | `model.maxOutputTokens` | 默认 8192 |
| Timeout | number | `model.timeoutSeconds` | 默认 120 |
| System Prompt | textarea | `prompt.systemPrompt` | 主 Prompt |
| Developer Instruction | textarea | `prompt.developerInstruction` | 补充指令 |
| Response Format | select | `prompt.responseFormat` | text / json / json_schema |
| Output JSON Schema | textarea | `prompt.outputSchema` | 输出 Schema |
| Stop Condition | select | `limits.stopCondition` | 停止条件 |
| Max Turns | number | `limits.maxTurns` | 单 Agent 最大轮数 |
| Max Tool Calls | number | `limits.maxToolCalls` | 最大工具调用数 |
| Tools | checkbox group | `tools.*` | 工具授权 |
| Context Scope | checkbox group | `contextPolicy.*` | 上下文授权 |

---

## 4. AgentFactory 运行时构造设计

### 4.1 目标

`AgentFactory` 负责把 UI 配置的 `AgentConfig` 转成具体运行时 Agent。当前实现是 AutoGen `AssistantAgent`，后续可替换。

### 4.2 接口

```python
class AgentFactory:
    def __init__(self, model_factory, tool_factory, prompt_registry):
        self.model_factory = model_factory
        self.tool_factory = tool_factory
        self.prompt_registry = prompt_registry

    async def create_agent(self, agent_config: AgentConfig, task_context: TaskContext):
        model_client = self.model_factory.create(agent_config.model)
        tools = self.tool_factory.create_tools_for_agent(agent_config, task_context)
        system_message = self.prompt_registry.render_system_prompt(agent_config, task_context)

        return AssistantAgent(
            name=agent_config.name,
            model_client=model_client,
            tools=tools,
            system_message=system_message,
            reflect_on_tool_use=True
        )
```

### 4.3 注意点

1. 业务代码不要直接 `import AssistantAgent` 到处创建。
2. 所有 AutoGen 相关代码集中在 `adapters/autogen_adapter.py` 或 `agent_factory.py`。
3. Prompt 渲染时只注入必要上下文，不要把整个 TaskContext 全塞进去。
4. ToolFactory 必须根据 Agent 权限过滤工具。

---

## 5. Prompt 设计总原则

### 5.1 每个 Agent Prompt 的通用结构

```text
你是谁：角色定义
你要做什么：职责范围
你不能做什么：禁止行为
你可以使用什么工具：工具范围
你能看到什么上下文：上下文范围
你必须输出什么格式：结构化输出要求
失败时怎么处理：失败策略
```

### 5.2 通用禁止行为

所有 Agent 都必须包含以下禁止规则：

```text
禁止编造已经读取过但实际没有读取的文件内容。
禁止声称已经修改文件，除非工具返回成功。
禁止直接要求用户手动复制大段代码覆盖文件。
禁止访问 workspace 外路径。
禁止读取敏感文件，例如 .env、id_rsa、*.pem、credentials.json。
禁止执行破坏性命令，例如 rm、del、format、git push、npm publish。
涉及代码修改时，必须通过 propose_patch 输出 unified diff。
```

### 5.3 输出格式规则

除非是纯解释类任务，否则 Agent 输出应采用 JSON：

```json
{
  "type": "agent_result",
  "summary": "简短总结",
  "status": "success|need_more_context|blocked|failed",
  "data": {},
  "warnings": [],
  "nextActions": []
}
```

---

## 6. PlannerAgent 详细设计

### 6.1 职责

PlannerAgent 负责把用户需求拆成可执行步骤，不直接读取大量文件，不写代码，不生成 patch。

### 6.2 允许工具

MVP 阶段：

```text
无工具，或仅允许 get_project_summary
```

进阶阶段：

```text
get_project_summary
git_status
```

### 6.3 输入上下文

```json
{
  "userRequest": "用户原始需求",
  "workspaceSummary": "项目基本信息",
  "selectedContextRefs": ["current_file", "git_diff"],
  "currentWorkflow": "code_edit"
}
```

### 6.4 System Prompt 模板

```text
你是 PlannerAgent，负责为代码 IDE 中的多 Agent 开发任务制定执行计划。

你的职责：
1. 理解用户需求。
2. 判断任务类型：代码修改、Bug 修复、测试生成、代码解释、重构、文档生成。
3. 拆分执行步骤。
4. 判断需要哪些 Agent 参与。
5. 判断是否需要用户确认。
6. 判断需要读取哪些类型的上下文。

限制：
1. 不要写代码。
2. 不要生成 patch。
3. 不要声称已经读取项目文件。
4. 如果需求不清楚，输出 clarificationQuestions。
5. 输出必须符合 PlannerResult JSON Schema。
```

### 6.5 输出 Schema

```json
{
  "type": "object",
  "required": ["taskType", "summary", "steps", "requiredAgents", "approvalPoints", "risks"],
  "properties": {
    "taskType": {
      "type": "string",
      "enum": ["code_edit", "bug_fix", "test_generation", "explain_code", "refactor", "doc_generation", "unknown"]
    },
    "summary": { "type": "string" },
    "steps": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "title", "agent", "description"],
        "properties": {
          "id": { "type": "string" },
          "title": { "type": "string" },
          "agent": { "type": "string" },
          "description": { "type": "string" },
          "needsApproval": { "type": "boolean" }
        }
      }
    },
    "requiredAgents": {
      "type": "array",
      "items": { "type": "string" }
    },
    "approvalPoints": {
      "type": "array",
      "items": { "type": "string" }
    },
    "risks": {
      "type": "array",
      "items": { "type": "string" }
    },
    "clarificationQuestions": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

### 6.6 示例输出

```json
{
  "taskType": "code_edit",
  "summary": "为 Spring Boot 项目增加 JWT 登录接口",
  "steps": [
    {
      "id": "plan-1",
      "title": "分析项目结构",
      "agent": "CodebaseAgent",
      "description": "读取 pom.xml、Controller、Service、安全配置",
      "needsApproval": false
    },
    {
      "id": "plan-2",
      "title": "生成代码 patch",
      "agent": "DeveloperAgent",
      "description": "新增 AuthController、AuthService、JwtUtil、DTO",
      "needsApproval": true
    }
  ],
  "requiredAgents": ["CodebaseAgent", "DeveloperAgent", "ReviewerAgent", "TesterAgent"],
  "approvalPoints": ["plan", "patch", "command"],
  "risks": ["可能需要修改 Spring Security 配置"],
  "clarificationQuestions": []
}
```

---

## 7. CodebaseAgent 详细设计

### 7.1 职责

CodebaseAgent 负责理解项目结构，定位相关文件，整理给 DeveloperAgent 使用的上下文。

### 7.2 允许工具

```text
list_files
read_file
read_files
search_code
search_symbol
git_diff
git_status
get_project_summary
```

禁止：

```text
propose_patch
apply_patch
run_command
```

### 7.3 输入上下文

```json
{
  "userRequest": "用户需求",
  "plan": "PlannerAgent 输出",
  "workspaceRoot": "工作区根目录",
  "contextRefs": ["current_file", "git_diff"]
}
```

### 7.4 System Prompt 模板

```text
你是 CodebaseAgent，负责分析当前 VS Code 工作区中的代码结构。

你的职责：
1. 根据用户需求和计划，判断需要读取哪些文件。
2. 使用 list_files、search_code、read_file 工具获取真实代码内容。
3. 总结项目技术栈、目录结构、关键类、相关方法、已有风格。
4. 输出 DeveloperAgent 需要的最小上下文。

限制：
1. 必须先调用工具，不允许凭空猜测项目结构。
2. 不要生成代码修改。
3. 不要输出 patch。
4. 不要读取敏感文件。
5. 不要读取 workspace 外文件。
6. 输出必须符合 CodebaseAnalysisResult JSON Schema。
```

### 7.5 输出 Schema

```json
{
  "type": "object",
  "required": ["projectType", "frameworks", "relevantFiles", "architectureSummary", "implementationHints", "missingContext"],
  "properties": {
    "projectType": { "type": "string" },
    "frameworks": {
      "type": "array",
      "items": { "type": "string" }
    },
    "relevantFiles": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["path", "reason", "readStatus"],
        "properties": {
          "path": { "type": "string" },
          "reason": { "type": "string" },
          "readStatus": { "type": "string", "enum": ["read", "not_read", "blocked"] },
          "summary": { "type": "string" }
        }
      }
    },
    "architectureSummary": { "type": "string" },
    "implementationHints": {
      "type": "array",
      "items": { "type": "string" }
    },
    "missingContext": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

---

## 8. DeveloperAgent 详细设计

### 8.1 职责

DeveloperAgent 根据计划和项目上下文生成代码修改方案，必须通过 `propose_patch` 提交 unified diff。

### 8.2 允许工具

```text
list_files
read_file
read_files
search_code
git_diff
propose_patch
```

禁止：

```text
apply_patch
run_command
git_commit
git_push
```

### 8.3 输入上下文

```json
{
  "userRequest": "用户需求",
  "plan": "计划",
  "codebaseAnalysis": "项目分析",
  "relatedFileContents": [],
  "previousReview": null,
  "previousTestResult": null,
  "userDecisions": []
}
```

### 8.4 System Prompt 模板

```text
你是 DeveloperAgent，负责在 VS Code 项目中生成可审查的代码修改。

你的职责：
1. 根据用户需求、计划和 CodebaseAgent 的分析生成代码修改。
2. 修改必须符合现有项目结构和代码风格。
3. 所有修改必须输出 unified diff patch。
4. 必须调用 propose_patch 工具提交 patch。
5. 如果上下文不足，输出 need_more_context，不要强行生成。

限制：
1. 不允许直接写文件。
2. 不允许调用 apply_patch。
3. 不允许执行命令。
4. 不要覆盖无关文件。
5. 不要生成无法应用的 patch。
6. 不要把完整项目文件全部重写。
7. 输出必须符合 DeveloperPatchResult JSON Schema。
```

### 8.5 输出 Schema

```json
{
  "type": "object",
  "required": ["status", "summary", "changedFiles", "patch", "riskLevel", "needsApproval"],
  "properties": {
    "status": {
      "type": "string",
      "enum": ["success", "need_more_context", "blocked", "failed"]
    },
    "summary": { "type": "string" },
    "changedFiles": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["path", "changeType", "reason"],
        "properties": {
          "path": { "type": "string" },
          "changeType": { "type": "string", "enum": ["add", "modify", "delete"] },
          "reason": { "type": "string" }
        }
      }
    },
    "patch": { "type": "string" },
    "riskLevel": { "type": "string", "enum": ["low", "medium", "high"] },
    "risks": {
      "type": "array",
      "items": { "type": "string" }
    },
    "needsApproval": { "type": "boolean" },
    "testSuggestions": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

### 8.6 Patch 规则

DeveloperAgent 输出的 patch 必须满足：

```text
1. 使用 unified diff 格式。
2. 文件路径相对 workspace root。
3. 新文件使用 /dev/null 标记。
4. 不允许修改 .env、*.pem、id_rsa、credentials.json。
5. 不允许修改 workspace 外路径。
6. 每个文件修改都必须有 reason。
```

---

## 9. ReviewerAgent 详细设计

### 9.1 职责

ReviewerAgent 审查 DeveloperAgent 生成的 patch，判断是否安全、可编译、符合风格。

### 9.2 允许工具

```text
read_file
search_code
git_diff
```

禁止：

```text
propose_patch
apply_patch
run_command
```

### 9.3 System Prompt 模板

```text
你是 ReviewerAgent，负责审查 AI 生成的代码修改。

你的职责：
1. 检查 patch 是否符合用户需求。
2. 检查是否破坏现有架构。
3. 检查是否有安全风险。
4. 检查是否可能编译失败。
5. 检查是否需要补充测试。
6. 输出是否允许进入用户 patch 确认阶段。

限制：
1. 不要直接修改 patch。
2. 不要执行命令。
3. 不要应用 patch。
4. 输出必须符合 ReviewResult JSON Schema。
```

### 9.4 输出 Schema

```json
{
  "type": "object",
  "required": ["approved", "riskLevel", "summary", "issues", "requiredFixes", "suggestions"],
  "properties": {
    "approved": { "type": "boolean" },
    "riskLevel": { "type": "string", "enum": ["low", "medium", "high", "critical"] },
    "summary": { "type": "string" },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["severity", "file", "message"],
        "properties": {
          "severity": { "type": "string", "enum": ["info", "warning", "error", "critical"] },
          "file": { "type": "string" },
          "lineHint": { "type": "string" },
          "message": { "type": "string" }
        }
      }
    },
    "requiredFixes": {
      "type": "array",
      "items": { "type": "string" }
    },
    "suggestions": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

---

## 10. TesterAgent 详细设计

### 10.1 职责

TesterAgent 负责决定测试命令、请求用户确认执行命令、分析测试输出，并给 DeveloperAgent 反馈修复建议。

### 10.2 允许工具

```text
run_command
read_terminal_output
git_diff
read_file
```

`run_command` 必须需要用户确认或命令白名单。

### 10.3 System Prompt 模板

```text
你是 TesterAgent，负责验证代码修改是否可构建、可测试。

你的职责：
1. 根据项目类型选择合适测试命令。
2. 命令必须在白名单内，或者请求用户确认。
3. 分析测试输出，定位错误原因。
4. 如果失败，输出给 DeveloperAgent 的修复建议。
5. 如果成功，输出测试通过总结。

限制：
1. 不要执行危险命令。
2. 不要执行 git push、npm publish、rm、del、format、ssh、curl、wget。
3. 不要直接修改文件。
4. 输出必须符合 TestResult JSON Schema。
```

### 10.4 输出 Schema

```json
{
  "type": "object",
  "required": ["status", "command", "exitCode", "summary", "failureAnalysis", "nextAction"],
  "properties": {
    "status": { "type": "string", "enum": ["passed", "failed", "skipped", "blocked"] },
    "command": { "type": "string" },
    "exitCode": { "type": ["integer", "null"] },
    "summary": { "type": "string" },
    "failureAnalysis": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "file": { "type": "string" },
          "message": { "type": "string" },
          "possibleCause": { "type": "string" }
        }
      }
    },
    "nextAction": {
      "type": "string",
      "enum": ["complete", "send_to_developer", "ask_user", "retry_test"]
    }
  }
}
```

### 10.5 命令选择规则

| 项目类型 | 优先命令 |
|---|---|
| Maven Java | `mvn test` |
| Gradle Java | `gradle test` 或 `./gradlew test` |
| Node npm | `npm test` / `npm run build` |
| pnpm | `pnpm test` / `pnpm build` |
| Python | `python -m pytest` |

---

## 11. SummaryAgent 详细设计

### 11.1 职责

SummaryAgent 负责在任务结束后生成用户可读总结，说明改了什么、测试结果、剩余风险、下一步建议。

### 11.2 允许工具

```text
git_diff
git_status
```

### 11.3 System Prompt 模板

```text
你是 SummaryAgent，负责总结本次 AI 编码任务。

你的职责：
1. 总结用户需求。
2. 总结执行过的 Agent 步骤。
3. 总结修改文件。
4. 总结测试结果。
5. 总结剩余风险。
6. 给出下一步建议。

限制：
1. 不要声称没有发生过的修改。
2. 不要省略失败信息。
3. 输出必须清晰、简短、可用于任务历史列表。
```

### 11.4 输出 Schema

```json
{
  "type": "object",
  "required": ["title", "status", "summary", "changedFiles", "testResult", "risks", "nextSteps"],
  "properties": {
    "title": { "type": "string" },
    "status": { "type": "string", "enum": ["completed", "failed", "cancelled", "partial"] },
    "summary": { "type": "string" },
    "changedFiles": {
      "type": "array",
      "items": { "type": "string" }
    },
    "testResult": { "type": "string" },
    "risks": {
      "type": "array",
      "items": { "type": "string" }
    },
    "nextSteps": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

---

## 12. CustomAgent 扩展设计

用户可以在 Agents Tab 新增自定义 Agent。

### 12.1 CustomAgent 配置项

```json
{
  "id": "custom_security_agent",
  "name": "SecurityAgent",
  "role": "custom",
  "description": "专门审查安全风险",
  "baseTemplate": "reviewer",
  "systemPrompt": "...",
  "tools": ["read_file", "search_code", "git_diff"],
  "outputSchemaId": "security_review_result_v1"
}
```

### 12.2 UI 约束

自定义 Agent 必须配置：

```text
Agent Name
Role Description
System Prompt
至少一个输出格式
工具权限
上下文范围
```

---

## 13. PromptRegistry 设计

### 13.1 目录结构

```text
agent-service/
├─ prompts/
│  ├─ planner_agent/
│  │  ├─ 2026-05-10-v1.md
│  │  └─ schema.json
│  ├─ codebase_agent/
│  │  ├─ 2026-05-10-v1.md
│  │  └─ schema.json
│  ├─ developer_agent/
│  │  ├─ 2026-05-10-v1.md
│  │  └─ schema.json
│  ├─ reviewer_agent/
│  ├─ tester_agent/
│  └─ summary_agent/
```

### 13.2 PromptRegistry 接口

```python
class PromptRegistry:
    def load_prompt(self, agent_id: str, version: str) -> str:
        pass

    def render_prompt(self, agent_config: AgentConfig, task_context: TaskContext) -> str:
        pass

    def load_schema(self, schema_id: str) -> dict:
        pass

    def validate_output(self, schema_id: str, output: dict) -> ValidationResult:
        pass
```

### 13.3 Prompt 版本管理

每个 Prompt 修改后生成新版本：

```text
2026-05-10-v1
2026-05-12-v2
2026-05-20-v3
```

任务历史中必须记录：

```json
{
  "agentId": "developer_agent",
  "promptVersion": "2026-05-10-v1",
  "modelName": "gpt-4.1"
}
```

这样后续可以复现问题。

---

## 14. OutputParser 设计

### 14.1 目标

不同模型不一定严格输出 JSON，因此需要统一解析和修复。

### 14.2 解析流程

```text
Agent 原始输出
  ↓
提取 JSON 块
  ↓
JSON parse
  ↓
Schema validate
  ↓
如果失败：请求模型按 schema 修复一次
  ↓
仍失败：标记 output_parse_failed
```

### 14.3 Python 接口

```python
class OutputParser:
    async def parse(self, raw_text: str, schema_id: str) -> ParsedAgentOutput:
        json_text = self.extract_json(raw_text)
        data = json.loads(json_text)
        validation = self.validate(schema_id, data)
        if not validation.ok:
            raise OutputValidationError(validation.errors)
        return ParsedAgentOutput(data=data, raw=raw_text)
```

---

## 15. Agent 测试功能设计

Agents Tab 中的“测试 Agent”按钮用于单独测试 Prompt 和工具权限。

### 15.1 请求

```http
POST /api/agents/{agentId}/test
```

```json
{
  "testInput": "请分析当前项目是否有登录接口",
  "mockContext": true,
  "allowToolCalls": false
}
```

### 15.2 返回

```json
{
  "ok": true,
  "agentId": "planner_agent",
  "durationMs": 3200,
  "rawOutput": "...",
  "parsedOutput": {},
  "schemaValid": true,
  "toolCalls": [],
  "warnings": []
}
```

### 15.3 UI 展示

```text
Test Result
- 状态：通过 / 失败
- 输出格式：Schema Valid / Invalid
- 工具调用：0 次
- 耗时：3.2s
- Token：xxx
[查看原始输出]
[复制]
```

---

## 16. Agent 与 Workflow 的关系

Agent 不直接决定整个任务怎么跑。WorkflowRunner 负责顺序：

```text
Code Edit Workflow:
PlannerAgent
  ↓
Human Approval
  ↓
CodebaseAgent
  ↓
DeveloperAgent
  ↓
ReviewerAgent
  ↓
Human Patch Approval
  ↓
TesterAgent
  ↓
SummaryAgent
```

Agent 配置只描述：

```text
这个 Agent 是谁
能看什么
能用什么工具
应该输出什么
```

Workflow 配置描述：

```text
什么时候调用哪个 Agent
失败后怎么回退
哪些节点需要用户确认
```

---

## 17. 配置保存设计

### 17.1 保存位置

| 配置 | 保存位置 |
|---|---|
| Agent 普通配置 | VS Code globalStorage 或 Agent Service config JSON |
| Prompt 模板 | Agent Service prompts 目录 |
| API Key | VS Code SecretStorage |
| 模型选择 | workspace/global settings |
| 任务历史 | SQLite / JSONL |

### 17.2 Agent 配置文件示例

```text
.agent-ide/
├─ agents/
│  ├─ planner_agent.json
│  ├─ codebase_agent.json
│  ├─ developer_agent.json
│  ├─ reviewer_agent.json
│  ├─ tester_agent.json
│  └─ summary_agent.json
└─ prompts/
```

---

## 18. API 设计

### 18.1 获取 Agent 列表

```http
GET /api/agents
```

返回：

```json
{
  "agents": [
    {
      "id": "developer_agent",
      "name": "DeveloperAgent",
      "role": "developer",
      "enabled": true,
      "modelName": "gpt-4.1",
      "promptVersion": "2026-05-10-v1"
    }
  ]
}
```

### 18.2 获取 Agent 详情

```http
GET /api/agents/{agentId}
```

### 18.3 保存 Agent

```http
PUT /api/agents/{agentId}
```

### 18.4 新增 Agent

```http
POST /api/agents
```

### 18.5 删除 Agent

```http
DELETE /api/agents/{agentId}
```

### 18.6 测试 Agent

```http
POST /api/agents/{agentId}/test
```

---

## 19. Codex 开发任务拆分

### Task 1：实现 AgentConfig 类型定义

修改文件：

```text
agent-service/schemas/agent_config.py
extension/src/types/agent.ts
```

验收标准：

```text
1. TypeScript 和 Python 字段一致。
2. 能序列化 / 反序列化。
3. 默认 Agent 配置可加载。
```

### Task 2：实现 Agents Tab 数据绑定

修改文件：

```text
webview/agents.js
extension/src/messageHandlers/agentHandlers.ts
```

验收标准：

```text
1. 点击 Agent 卡片能加载详情。
2. 编辑字段后点击保存能发送 agent.save。
3. 保存成功后 UI toast 提示。
```

### Task 3：实现 Agent Service API

修改文件：

```text
agent-service/api/agents.py
agent-service/stores/agent_store.py
```

验收标准：

```text
1. GET /api/agents 返回默认 6 个 Agent。
2. PUT /api/agents/{id} 可保存配置。
3. POST /api/agents/{id}/test 可返回测试结果。
```

### Task 4：实现 PromptRegistry

修改文件：

```text
agent-service/prompts/
agent-service/runtime/prompt_registry.py
```

验收标准：

```text
1. 能根据 agentId/version 加载 prompt。
2. 能渲染 TaskContext。
3. 能加载 output schema。
```

### Task 5：实现 OutputParser

修改文件：

```text
agent-service/runtime/output_parser.py
```

验收标准：

```text
1. 能提取 JSON。
2. 能校验 schema。
3. 校验失败返回明确错误。
```

---

## 20. 自检清单

### 20.1 设计完整性

- [x] 覆盖 PlannerAgent。
- [x] 覆盖 CodebaseAgent。
- [x] 覆盖 DeveloperAgent。
- [x] 覆盖 ReviewerAgent。
- [x] 覆盖 TesterAgent。
- [x] 覆盖 SummaryAgent。
- [x] 覆盖 CustomAgent 扩展。
- [x] 定义 AgentConfig JSON。
- [x] 定义 Agents Tab UI 字段映射。
- [x] 定义 PromptRegistry。
- [x] 定义 OutputParser。
- [x] 定义 Agent 测试接口。

### 20.2 AutoGen 联调可行性

- [x] AgentFactory 可以映射到 AutoGen `AssistantAgent`。
- [x] 工具列表可注入到 AutoGen Agent。
- [x] Prompt 可映射到 `system_message`。
- [x] 输出可通过 JSON Schema / Pydantic 校验。
- [x] `reflect_on_tool_use=True` 可用于工具结果总结。

### 20.3 VS Code 插件联调可行性

- [x] Agents Tab 每个控件都有数据字段。
- [x] 主要按钮都有 message type。
- [x] API 接口覆盖列表、详情、保存、删除、测试。
- [x] 敏感信息不放 AgentConfig，API Key 走 SecretStorage。

### 20.4 安全性

- [x] Agent 不允许直接写文件。
- [x] DeveloperAgent 必须走 patch。
- [x] TesterAgent 执行命令必须受限。
- [x] CodebaseAgent 禁止读取敏感文件。
- [x] 所有工具权限由 Tools 配置控制。

---

## 21. 下一份文档建议

下一份建议生成：

```text
06_Team与Workflow编排详细设计.md
```

重点内容：

```text
1. Team 配置 JSON。
2. Sequential / RoundRobin / Selector / Manual 模式。
3. Code Edit / Bug Fix / Test Generation / Explain Code 工作流。
4. Workflow 节点、边、条件分支、失败回退。
5. Team Tab 与 Workflow Tab 的 UI 控件到接口映射。
6. WorkflowRunner 执行算法。
7. 与 AutoGen Team / 单 Agent 调用的映射关系。
```
