# 15_AutoGen 后期升级维护与迁移策略详细设计

> 适用项目：AutoGen + VS Code 插件 + Python Agent Service + ToolGateway 的多 Agent 编程 IDE  
> 文档目标：保证当前 MVP 能快速使用 AutoGen，同时为后续 AutoGen 升级、替换 Microsoft Agent Framework、LangGraph 或自研 Runtime 留出架构空间。  
> 版本：v1.0  
> 日期：2026-05-10

---

## 1. 资料检索依据

本设计基于以下公开资料和官方文档方向整理：

1. Microsoft AutoGen GitHub 仓库当前说明：新用户建议从 Microsoft Agent Framework 开始，现有用户建议参考 AutoGen → Microsoft Agent Framework 迁移指南。
   - https://github.com/microsoft/autogen
2. Microsoft Learn：AutoGen to Microsoft Agent Framework Migration Guide。
   - https://learn.microsoft.com/en-us/agent-framework/migration-guide/from-autogen/
3. Microsoft Agent Framework 1.0 发布文章：Agent Framework 是面向生产的统一 Agent 框架，并提供 AutoGen / Semantic Kernel 迁移路径。
   - https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/
4. Microsoft Agent Framework GitHub：支持 Python 和 .NET，用于构建、编排和部署 AI agents / multi-agent workflows。
   - https://github.com/microsoft/agent-framework
5. AutoGen v0.2 → v0.4 迁移指南：v0.4 引入新的 API 和 breaking changes。
   - https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/migration-guide.html
6. AutoGen AgentChat 官方文档：AssistantAgent、tools、Workbench、run_stream、Teams、Human-in-the-loop、Termination 等能力。
   - https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/agents.html
   - https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/teams.html
   - https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/human-in-the-loop.html
   - https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/termination.html

由此得出的关键结论：

- 当前 MVP 可以继续使用 AutoGen AgentChat。
- 不能把 AutoGen API 写死在业务层。
- 必须抽象 `AgentRuntimeAdapter`、`WorkflowRunner`、`ToolGateway`、`UnifiedEvent`。
- AutoGen 只能作为一个 Runtime Provider，而不是整个 IDE 产品的唯一内核。
- UI、Workflow、Tool、Task 状态机、配置存储必须保持 Runtime 无关。

---

## 2. 维护目标

本项目后期维护目标包括：

```text
1. 当前版本稳定运行 AutoGen。
2. AutoGen 版本升级时只改 Adapter 层。
3. AutoGen 停止新增功能时，可以迁移到 Microsoft Agent Framework。
4. 未来可以接 LangGraph / OpenAI Agents SDK / 自研 Runtime。
5. UI 控制台、任务状态机、ToolGateway 不随 Runtime 大改。
6. Prompt、Tool、Workflow、Agent 配置可版本化、可回滚。
7. 所有任务执行事件统一转换成项目自己的事件协议。
8. 生产环境能灰度切换 Runtime Provider。
```

---

## 3. 长期架构原则

### 3.1 AutoGen 不是产品内核

错误设计：

```text
VS Code UI
  ↓
AutoGen RoundRobinGroupChat
  ↓
直接控制文件 / 终端 / Git
```

这种设计的问题：

```text
1. UI 状态和 AutoGen 原始消息强绑定。
2. 中途确认、暂停、回滚很难控制。
3. AutoGen API 变化会影响所有业务代码。
4. 未来迁移 Runtime 成本极高。
5. 工具权限无法统一管理。
```

正确设计：

```text
VS Code Webview UI
  ↓
VS Code Extension Host
  ↓
Agent Service API
  ↓
TaskManager
  ↓
WorkflowRunner
  ↓
AgentRuntimeAdapter
  ├─ AutoGenAdapter
  ├─ MicrosoftAgentFrameworkAdapter
  ├─ LangGraphAdapter
  ├─ MockRuntimeAdapter
  └─ FutureRuntimeAdapter
  ↓
ToolGateway
  ↓
VS Code Tool Server
```

### 3.2 自研层必须稳定

以下模块必须由项目自研并保持长期稳定：

```text
TaskManager
WorkflowRunner
AgentRuntimeAdapter 接口
ToolGateway
PermissionGuard
ApprovalManager
OutputParser
EventBus
EventStore
ConfigStore
SecretStore
```

AutoGen 只允许出现在：

```text
agent_service/runtime/adapters/autogen_adapter.py
agent_service/runtime/adapters/autogen_event_mapper.py
agent_service/runtime/adapters/autogen_model_factory.py
```

业务层禁止直接 import AutoGen。

---

## 4. Runtime Provider 抽象设计

### 4.1 RuntimeProvider 枚举

```ts
export type RuntimeProvider =
  | 'autogen'
  | 'microsoft_agent_framework'
  | 'langgraph'
  | 'mock'
  | 'custom';
```

Settings UI 中应显示：

```text
Agent Runtime Provider
[ AutoGen ▼ ]

可选：
- AutoGen
- Microsoft Agent Framework
- LangGraph
- Mock Runtime
- Custom Runtime
```

即使 MVP 只支持 AutoGen，也必须先保留该字段。

### 4.2 RuntimeSettings

```ts
export interface RuntimeSettings {
  provider: RuntimeProvider;
  serviceUrl: string;
  host: string;
  port: number;
  pythonPath: string;
  packageVersion: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  autoStart: boolean;
  healthCheckIntervalMs: number;
  timeoutMs: number;
  runtimeSpecific: Record<string, unknown>;
}
```

AutoGen 专有配置放入：

```json
{
  "runtimeSpecific": {
    "autogen": {
      "agentchatVersion": "0.x.x",
      "extVersion": "0.x.x",
      "defaultTeamImplementation": "custom_workflow_runner",
      "allowNativeGroupChat": false
    }
  }
}
```

---

## 5. AgentRuntimeAdapter 接口设计

### 5.1 Python 抽象接口

```python
from abc import ABC, abstractmethod
from typing import AsyncIterator

class AgentRuntimeAdapter(ABC):
    @abstractmethod
    async def health(self) -> dict:
        pass

    @abstractmethod
    async def run_agent(
        self,
        task_context: dict,
        agent_config: dict,
        input_payload: dict,
    ) -> AsyncIterator[dict]:
        pass

    @abstractmethod
    async def run_team(
        self,
        task_context: dict,
        team_config: dict,
        input_payload: dict,
    ) -> AsyncIterator[dict]:
        pass

    @abstractmethod
    async def cancel_task(self, task_id: str) -> None:
        pass

    @abstractmethod
    async def pause_task(self, task_id: str) -> None:
        pass

    @abstractmethod
    async def resume_task(self, task_id: str) -> None:
        pass
```

### 5.2 返回事件必须统一

Adapter 不允许把 AutoGen 原始事件直接给 UI。

必须统一成：

```json
{
  "eventId": "evt_001",
  "taskId": "task_001",
  "seq": 18,
  "type": "agent.message",
  "runtimeProvider": "autogen",
  "agentId": "developer_agent",
  "timestamp": "2026-05-10T12:00:00.000Z",
  "payload": {
    "content": "我准备生成 patch。"
  }
}
```

统一事件类型：

```text
task.created
task.started
task.paused
task.resumed
task.cancelled
task.completed
task.failed

step.started
step.completed
step.failed

agent.started
agent.message
agent.completed
agent.failed

tool.call
tool.result
tool.failed

approval.required
approval.approved
approval.rejected

patch.proposed
patch.applied
patch.rejected

command.requested
command.started
command.output
command.completed
command.failed
```

---

## 6. AutoGenAdapter 设计

### 6.1 目录结构

```text
agent-service/
├─ runtime/
│  ├─ base.py
│  ├─ provider_registry.py
│  └─ adapters/
│     ├─ autogen_adapter.py
│     ├─ autogen_agent_factory.py
│     ├─ autogen_model_factory.py
│     ├─ autogen_tool_factory.py
│     ├─ autogen_event_mapper.py
│     └─ autogen_output_parser.py
```

### 6.2 AutoGenAdapter 职责

```text
1. 根据 AgentConfig 创建 AssistantAgent。
2. 根据 ModelSettings 创建 OpenAIChatCompletionClient 或其他 client。
3. 根据 ToolPermission 创建工具函数列表。
4. 调用 agent.run_stream() 或 team.run_stream()。
5. 把 AutoGen 事件映射成 UnifiedEvent。
6. 捕获异常并转换成 runtime.error。
7. 不直接处理 VS Code 文件 / Git / Terminal。
```

### 6.3 AutoGenAdapter 伪代码

```python
class AutoGenAdapter(AgentRuntimeAdapter):
    def __init__(self, model_factory, agent_factory, tool_factory, event_mapper):
        self.model_factory = model_factory
        self.agent_factory = agent_factory
        self.tool_factory = tool_factory
        self.event_mapper = event_mapper

    async def run_agent(self, task_context, agent_config, input_payload):
        model_client = self.model_factory.create(agent_config["model"])
        tools = self.tool_factory.create_tools(agent_config, task_context)
        agent = self.agent_factory.create_assistant_agent(
            agent_config=agent_config,
            model_client=model_client,
            tools=tools,
        )

        prompt = self._build_prompt(task_context, agent_config, input_payload)

        async for raw_event in agent.run_stream(task=prompt):
            unified = self.event_mapper.map(raw_event, task_context, agent_config)
            if unified:
                yield unified
```

### 6.4 AutoGen 原始事件映射策略

| AutoGen 原始内容 | 项目统一事件 |
|---|---|
| text message | `agent.message` |
| tool call request | `tool.call` |
| tool call result | `tool.result` |
| TaskResult | `agent.completed` |
| exception | `agent.failed` |
| cancellation | `task.cancelled` |
| human input required | `approval.required` |

注意：AutoGen 原始事件结构后续可能变化，因此只能在 `autogen_event_mapper.py` 内解析。

---

## 7. WorkflowRunner 与 Runtime 解耦

### 7.1 WorkflowRunner 不关心 AutoGen

WorkflowRunner 只调用：

```python
await runtime.run_agent(ctx, agent_config, input_payload)
```

而不是：

```python
AssistantAgent(...)
RoundRobinGroupChat(...)
```

### 7.2 Code Edit Workflow 示例

```python
async def run_code_edit_workflow(ctx):
    runtime = runtime_registry.get(ctx.runtime_provider)

    await run_step(ctx, "planner", runtime)
    await wait_approval_if_needed(ctx, "plan")

    await run_step(ctx, "codebase", runtime)
    await run_step(ctx, "developer", runtime)
    await run_step(ctx, "reviewer", runtime)

    if ctx.review.has_critical_issue:
        await run_step(ctx, "developer", runtime, feedback=ctx.review)

    await wait_approval_if_needed(ctx, "patch")
    await apply_patch(ctx)
    await run_step(ctx, "tester", runtime)

    if not ctx.test.success:
        await run_step(ctx, "developer", runtime, feedback=ctx.test)
        await wait_approval_if_needed(ctx, "patch")

    await run_step(ctx, "summary", runtime)
```

这样未来替换 Runtime 不影响 Workflow。

---

## 8. ToolGateway 稳定协议

### 8.1 工具调用协议

所有 Runtime 都只能通过 ToolGateway 调用工具。

```json
{
  "taskId": "task_001",
  "agentId": "developer_agent",
  "toolName": "read_file",
  "args": {
    "path": "src/main/java/App.java"
  },
  "permissionContext": {
    "requireApproval": false,
    "workspaceRoot": "D:/project/demo"
  }
}
```

### 8.2 工具返回协议

```json
{
  "ok": true,
  "toolName": "read_file",
  "summary": "读取成功，120 行",
  "data": {
    "path": "src/main/java/App.java",
    "content": "..."
  },
  "auditId": "tool_audit_001"
}
```

### 8.3 Tool 不绑定 AutoGen

错误：

```python
def read_file_for_autogen(path: str) -> str:
    ...
```

正确：

```python
async def read_file_tool(args: dict, context: ToolContext) -> ToolResult:
    ...
```

AutoGenToolFactory 只负责把稳定 Tool 包装成 AutoGen 可调用函数。

---

## 9. 配置格式可迁移设计

### 9.1 AgentConfig 中性结构

```json
{
  "id": "developer_agent",
  "name": "DeveloperAgent",
  "role": "developer",
  "description": "生成代码 patch",
  "model": "gpt-4.1",
  "systemPrompt": "...",
  "tools": ["read_file", "search_code", "propose_patch"],
  "responseFormat": "json_schema",
  "outputSchema": {},
  "limits": {
    "maxTurns": 8,
    "maxToolCalls": 20,
    "timeoutMs": 120000
  },
  "runtimeHints": {
    "autogen": {
      "reflectOnToolUse": true
    },
    "microsoft_agent_framework": {},
    "langgraph": {}
  }
}
```

通用字段不绑定 AutoGen；框架专有字段放 `runtimeHints`。

### 9.2 TeamConfig 中性结构

```json
{
  "id": "java_spring_team",
  "name": "Java Spring Team",
  "mode": "sequential",
  "agents": [
    "planner_agent",
    "codebase_agent",
    "developer_agent",
    "reviewer_agent",
    "tester_agent"
  ],
  "termination": {
    "type": "max_turns_or_text",
    "maxTurns": 20,
    "text": "TASK_DONE"
  },
  "runtimeProvider": "autogen"
}
```

### 9.3 WorkflowConfig 中性结构

```json
{
  "id": "code_edit_workflow",
  "name": "Code Edit Workflow",
  "version": "1.0.0",
  "nodes": [
    { "id": "planner", "type": "agent", "agentId": "planner_agent" },
    { "id": "plan_approval", "type": "human_approval" },
    { "id": "developer", "type": "agent", "agentId": "developer_agent" },
    { "id": "patch_approval", "type": "human_approval" }
  ],
  "edges": [
    { "from": "planner", "to": "plan_approval" },
    { "from": "plan_approval", "to": "developer" }
  ]
}
```

Workflow 不绑定 AutoGen GroupChat。

---

## 10. 版本锁定策略

### 10.1 Python 依赖锁定

开发阶段 `requirements.in`：

```txt
autogen-agentchat
autogen-ext[openai]
fastapi
uvicorn
pydantic
httpx
```

发布阶段必须生成锁定文件：

```text
requirements.lock
uv.lock
```

禁止生产环境使用：

```txt
autogen-agentchat>=0.x
```

必须使用明确版本：

```txt
autogen-agentchat==0.x.y
autogen-ext==0.x.y
```

### 10.2 Runtime 健康信息必须显示版本

`GET /runtime/health` 返回：

```json
{
  "ok": true,
  "provider": "autogen",
  "pythonVersion": "3.11.9",
  "packages": {
    "autogen-agentchat": "0.x.y",
    "autogen-ext": "0.x.y",
    "fastapi": "0.x.y"
  },
  "adapterVersion": "1.0.0",
  "configSchemaVersion": "1.0.0"
}
```

UI Settings / Runtime 面板显示这些版本。

### 10.3 升级前检查

每次升级 AutoGen 前必须执行：

```text
1. 阅读官方 changelog / migration guide。
2. 执行 Adapter 单元测试。
3. 执行 Tool 调用回归测试。
4. 执行 Code Edit Workflow E2E 测试。
5. 执行 Bug Fix Workflow E2E 测试。
6. 检查 run_stream 事件映射是否变化。
7. 检查 AssistantAgent 参数是否变化。
8. 检查 tools / Workbench 调用方式是否变化。
9. 检查模型 client 参数是否变化。
10. 生成升级报告。
```

---

## 11. Prompt 版本管理

### 11.1 Prompt 不写死在代码里

目录：

```text
agent-service/prompts/
├─ planner_agent/
│  ├─ v1.0.0.md
│  ├─ v1.1.0.md
│  └─ latest.json
├─ developer_agent/
│  ├─ v1.0.0.md
│  └─ latest.json
└─ reviewer_agent/
```

`latest.json`：

```json
{
  "latest": "v1.1.0",
  "stable": "v1.0.0",
  "rollback": "v1.0.0"
}
```

### 11.2 AgentConfig 引用 Prompt 版本

```json
{
  "agentId": "developer_agent",
  "promptRef": "developer_agent@v1.0.0",
  "promptHash": "sha256:..."
}
```

### 11.3 Prompt 回滚

如果升级 Runtime 后 Agent 效果变差，应支持：

```text
1. Runtime 不变，回滚 Prompt。
2. Prompt 不变，回滚 Runtime。
3. 同时回滚 Runtime + Prompt。
```

---

## 12. Output Schema 稳定策略

### 12.1 DeveloperAgent 输出 Schema

```json
{
  "type": "object",
  "required": ["summary", "changedFiles", "patch", "risk", "needsApproval"],
  "properties": {
    "summary": { "type": "string" },
    "changedFiles": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "changeType": { "type": "string" }
        }
      }
    },
    "patch": { "type": "string" },
    "risk": { "type": "string", "enum": ["low", "medium", "high"] },
    "needsApproval": { "type": "boolean" }
  }
}
```

### 12.2 Runtime 不能改变业务输出格式

不管 AutoGen 还是 MAF，最终输出都必须被 OutputParser 转换成同一结构：

```python
class DeveloperOutput:
    summary: str
    changed_files: list[ChangedFile]
    patch: str
    risk: str
    needs_approval: bool
```

### 12.3 Schema 回归测试

每次升级 Runtime 后，必须测试：

```text
1. PlannerAgent 是否输出 plan JSON。
2. DeveloperAgent 是否输出 patch。
3. ReviewerAgent 是否输出 risk JSON。
4. TesterAgent 是否输出 command / success / summary。
5. SummaryAgent 是否输出 final summary。
```

---

## 13. Microsoft Agent Framework 迁移策略

### 13.1 为什么要准备迁移

公开资料显示，Microsoft 已经把新项目方向引导到 Microsoft Agent Framework，并提供 AutoGen 迁移指南。Microsoft Agent Framework 1.0 文章也明确提到，现在是从 AutoGen / Semantic Kernel 迁移的时机。

因此本项目要做：

```text
先用 AutoGen 完成 MVP，
但从第一天就让 AutoGen 可替换。
```

### 13.2 迁移对象映射

| 当前项目抽象 | AutoGen 实现 | MAF 迁移目标 |
|---|---|---|
| RuntimeProvider | AutoGenAdapter | MicrosoftAgentFrameworkAdapter |
| AgentConfig | AssistantAgent | ChatAgent / Agent 抽象 |
| ToolGateway | AutoGen tools | MAF function / tool 抽象 |
| WorkflowRunner | 自研 | 可继续自研，或迁移到 MAF Workflow |
| UnifiedEvent | AutoGen event mapper | MAF event mapper |
| HumanApproval | 自研 ApprovalManager | MAF human-in-loop / 自研继续保留 |
| ModelClientFactory | OpenAIChatCompletionClient | MAF model client |

### 13.3 分阶段迁移

#### 阶段 A：Adapter 并存

```text
AutoGenAdapter 保持默认
新增 MicrosoftAgentFrameworkAdapter
Settings 增加 Runtime Provider 下拉
```

#### 阶段 B：单 Agent 灰度

优先迁移：

```text
SummaryAgent
ReviewerAgent
CodebaseAgent
```

原因：这些 Agent 对 patch / 工具执行依赖较小，风险低。

#### 阶段 C：工具调用灰度

迁移：

```text
read_file
search_code
git_diff
```

暂缓迁移：

```text
apply_patch
run_command
```

原因：写文件和执行命令风险更高。

#### 阶段 D：DeveloperAgent 迁移

DeveloperAgent 是核心高风险 Agent，必须最后迁移。

检查项：

```text
1. patch 格式是否稳定。
2. changedFiles 是否可解析。
3. risk 是否准确。
4. needsApproval 是否正确。
5. 不允许直接写文件。
```

#### 阶段 E：Workflow 迁移

如果 MAF Workflow 足够稳定，可以考虑把部分 WorkflowRunner 迁移过去。

但建议保留自研 WorkflowRunner 至少一个大版本周期。

---

## 14. 灰度切换策略

### 14.1 Runtime 按任务切换

创建任务时记录：

```json
{
  "taskId": "task_001",
  "runtimeProvider": "autogen"
}
```

新任务可以选择：

```text
Runtime: AutoGen / Microsoft Agent Framework / Mock
```

旧任务继续使用创建时的 Runtime，不允许中途无提示切换。

### 14.2 Runtime 按 Agent 切换

高级模式支持：

```json
{
  "teamId": "java_team",
  "agents": [
    { "agentId": "planner", "runtimeProvider": "maf" },
    { "agentId": "developer", "runtimeProvider": "autogen" },
    { "agentId": "reviewer", "runtimeProvider": "maf" }
  ]
}
```

MVP 阶段不需要实现，但配置结构预留。

### 14.3 A/B 对比

对同一个任务运行两个 Runtime：

```text
AutoGen DeveloperAgent
MAF DeveloperAgent
```

对比：

```text
输出 patch 是否可用
编译是否通过
Token 成本
响应时间
工具调用次数
用户是否采纳
```

---

## 15. 回滚策略

### 15.1 Runtime 回滚

Settings 中保留：

```text
Current Runtime: Microsoft Agent Framework
Previous Runtime: AutoGen
[回滚到 AutoGen]
```

回滚操作：

```text
1. 停止新 Runtime。
2. 恢复 runtimeProvider = autogen。
3. 恢复 AutoGen 依赖版本。
4. 重启 Agent Service。
5. 执行 health check。
6. 执行 smoke test。
```

### 15.2 配置回滚

每次保存配置前生成 snapshot：

```text
config_snapshots/
├─ 2026-05-10T120000Z/
│  ├─ agents.json
│  ├─ teams.json
│  ├─ workflows.json
│  ├─ tools.json
│  └─ settings.json
```

### 15.3 Prompt 回滚

Prompt 有独立版本，允许在 Agents UI 中选择：

```text
Prompt Version
[ v1.1.0 ▼ ]

[回滚到 stable]
```

### 15.4 任务回滚

任务执行修改文件前必须创建 checkpoint：

```text
git diff snapshot
patch backup
file backup
```

回滚不依赖 Runtime。

---

## 16. 兼容性测试设计

### 16.1 Adapter 单元测试

测试文件：

```text
tests/runtime/test_autogen_adapter.py
tests/runtime/test_runtime_contract.py
tests/runtime/test_event_mapper.py
```

测试项：

```text
1. run_agent 返回 agent.started。
2. run_agent 返回 agent.message。
3. 工具调用被转换成 tool.call。
4. 工具结果被转换成 tool.result。
5. 最终返回 agent.completed。
6. 异常返回 agent.failed。
7. cancel_task 生效。
```

### 16.2 Runtime Contract Test

所有 Adapter 都必须通过同一套 Contract Test。

```python
def test_runtime_contract(adapter: AgentRuntimeAdapter):
    events = collect(adapter.run_agent(...))
    assert_has_event(events, "agent.started")
    assert_has_event(events, "agent.completed")
```

### 16.3 Workflow E2E 测试

用 mock workspace：

```text
test-workspaces/
├─ springboot-demo/
├─ react-demo/
└─ python-demo/
```

测试场景：

```text
1. 解释当前文件。
2. 生成简单 Controller。
3. 修复已知 bug。
4. 生成单元测试。
5. 拒绝 patch 后重新生成。
6. run_command 被拦截。
7. 读取敏感文件被拦截。
```

### 16.4 升级验收清单

```text
[ ] AutoGenAdapter 单元测试通过
[ ] EventMapper 单元测试通过
[ ] ToolGateway 测试通过
[ ] Code Edit E2E 通过
[ ] Bug Fix E2E 通过
[ ] Test Generation E2E 通过
[ ] Settings health check 正常
[ ] Webview 实时事件显示正常
[ ] Patch 审批正常
[ ] Command 审批正常
[ ] 回滚功能正常
```

---

## 17. UI 层维护策略

### 17.1 UI 不显示框架专有 API

错误 UI：

```text
AutoGen RoundRobinGroupChat
AutoGen AssistantAgent Config
AutoGen UserProxyAgent
```

正确 UI：

```text
Runtime Provider: AutoGen
Team Mode: Round Robin
Agent Type: Assistant
Human Approval Node
```

内部再映射到 AutoGen。

### 17.2 Settings 增加 Runtime 标签

Settings 页面建议：

```text
Runtime
- Provider
- Runtime Version
- Adapter Version
- Health Status
- Migration Status
- Rollback Runtime
```

### 17.3 Migration Banner

如果检测到当前 Runtime 有迁移建议，UI 显示：

```text
当前 Runtime Provider 为 AutoGen。
Microsoft 已推荐新项目使用 Microsoft Agent Framework。
建议在设置中启用 Runtime Adapter 抽象，并测试 MAF 兼容模式。
[查看迁移报告] [暂不提醒]
```

---

## 18. 日志与诊断策略

### 18.1 Runtime 日志必须包含版本

每次任务启动记录：

```json
{
  "taskId": "task_001",
  "runtimeProvider": "autogen",
  "runtimeVersion": "0.x.y",
  "adapterVersion": "1.0.0",
  "model": "gpt-4.1",
  "workflowId": "code_edit_workflow",
  "agentIds": ["planner", "developer"]
}
```

### 18.2 诊断包

Settings 提供：

```text
[导出诊断包]
```

内容：

```text
diagnostics.zip
├─ runtime_health.json
├─ config_redacted.json
├─ task_events.jsonl
├─ tool_audit.jsonl
├─ extension.log
├─ agent_service.log
└─ version_report.txt
```

必须脱敏：

```text
API Key
.env 内容
私钥
Token
Authorization Header
```

---

## 19. 数据迁移设计

### 19.1 Config Schema Version

所有配置包含：

```json
{
  "schemaVersion": "1.0.0"
}
```

### 19.2 Migration Script

目录：

```text
agent-service/migrations/
├─ config_1_0_0_to_1_1_0.py
├─ config_1_1_0_to_1_2_0.py
```

启动时检查：

```python
if config.schema_version < CURRENT_SCHEMA_VERSION:
    backup_config()
    run_migrations()
```

### 19.3 迁移失败处理

```text
1. 保留原配置 backup。
2. 启动失败时提示 UI。
3. 允许恢复旧配置。
4. 不自动删除旧版本配置。
```

---

## 20. 依赖升级流程

### 20.1 标准流程

```text
1. 创建 upgrade/autogen-x.y.z 分支。
2. 修改 requirements.in。
3. 重新生成 lock。
4. 执行单元测试。
5. 执行 E2E 测试。
6. 生成 version_report。
7. 内测 VSIX。
8. 灰度发布。
9. 观察日志和反馈。
10. 正式发布。
```

### 20.2 升级报告模板

```md
# Runtime Upgrade Report

## Upgrade Target
- From: autogen-agentchat 0.x.y
- To: autogen-agentchat 0.x.z

## Breaking Changes
- ...

## Adapter Changes
- ...

## Tool Calling Changes
- ...

## Event Mapping Changes
- ...

## Test Result
- Unit: pass/fail
- E2E: pass/fail

## Rollback Plan
- ...
```

---

## 21. RuntimeProviderRegistry 设计

```python
class RuntimeProviderRegistry:
    def __init__(self):
        self.providers = {}

    def register(self, name: str, factory):
        self.providers[name] = factory

    def create(self, name: str, settings: dict) -> AgentRuntimeAdapter:
        if name not in self.providers:
            raise RuntimeError(f"Unknown runtime provider: {name}")
        return self.providers[name](settings)
```

注册：

```python
registry.register("autogen", AutoGenAdapterFactory())
registry.register("mock", MockRuntimeAdapterFactory())
registry.register("microsoft_agent_framework", MAFAdapterFactory())
```

MVP 阶段：

```text
AutoGenAdapter: 可用
MockRuntimeAdapter: 可用，用于 UI / E2E 测试
MAFAdapter: 占位
LangGraphAdapter: 占位
```

---

## 22. MockRuntimeAdapter 设计

MockRuntimeAdapter 很重要，用于不依赖 AutoGen 的 UI 和流程测试。

```python
class MockRuntimeAdapter(AgentRuntimeAdapter):
    async def run_agent(self, task_context, agent_config, input_payload):
        yield {"type": "agent.started", "agentId": agent_config["id"]}
        yield {"type": "agent.message", "payload": {"content": "mock message"}}
        yield {"type": "agent.completed", "payload": {"output": {}}}
```

用途：

```text
1. UI 联调。
2. WebSocket 测试。
3. WorkflowRunner 测试。
4. CI 中不调用真实模型。
5. Runtime 迁移前后对比。
```

---

## 23. 后期维护里程碑

### 23.1 MVP

```text
AutoGenAdapter
MockRuntimeAdapter
自研 WorkflowRunner
统一事件模型
ToolGateway
版本锁定
```

### 23.2 v1.0

```text
Runtime Provider UI
Runtime Health
Prompt Version
Config Snapshot
Adapter Contract Test
诊断包导出
```

### 23.3 v1.5

```text
MicrosoftAgentFrameworkAdapter 实验版
单 Agent 灰度
A/B 对比
Runtime 回滚
```

### 23.4 v2.0

```text
默认 Runtime 可切换
AutoGenAdapter 保留兼容
部分 Workflow 支持 MAF Workflow
企业部署增强
```

---

## 24. Codex 开发任务拆分

### Task 15-01：新增 RuntimeProvider 抽象

目标：实现 Runtime Provider 中间层。

涉及文件：

```text
agent-service/runtime/base.py
agent-service/runtime/provider_registry.py
agent-service/runtime/adapters/mock_adapter.py
```

验收：

```text
1. 有 AgentRuntimeAdapter 抽象类。
2. 有 RuntimeProviderRegistry。
3. MockRuntimeAdapter 可输出统一事件。
```

### Task 15-02：重构 AutoGen 代码到 AutoGenAdapter

目标：业务层不直接 import AutoGen。

涉及文件：

```text
agent-service/runtime/adapters/autogen_adapter.py
agent-service/runtime/adapters/autogen_agent_factory.py
agent-service/runtime/adapters/autogen_event_mapper.py
```

验收：

```text
1. grep 业务层无 autogen 直接引用。
2. WorkflowRunner 只调用 runtime.run_agent。
3. AutoGen 事件被转换成统一事件。
```

### Task 15-03：Settings 增加 Runtime Provider 配置

涉及文件：

```text
src/webview/settings.ts
src/config/runtimeConfig.ts
agent-service/config/runtime_settings.py
```

验收：

```text
1. UI 可选择 Runtime Provider。
2. 配置保存 runtimeProvider。
3. health 显示 provider 和版本。
```

### Task 15-04：实现 Runtime Contract Test

涉及文件：

```text
tests/runtime/test_runtime_contract.py
```

验收：

```text
1. MockRuntimeAdapter 通过测试。
2. AutoGenAdapter 通过基础测试。
3. CI 可以运行测试。
```

### Task 15-05：实现 Prompt 版本管理

涉及文件：

```text
agent-service/prompts/
agent-service/prompt_registry.py
```

验收：

```text
1. AgentConfig 可引用 promptRef。
2. 可加载 stable/latest。
3. 可回滚 Prompt。
```

### Task 15-06：实现配置快照与回滚

涉及文件：

```text
src/config/configSnapshot.ts
agent-service/config/config_migration.py
```

验收：

```text
1. 保存配置前自动生成 snapshot。
2. Settings UI 可恢复快照。
3. 迁移失败可回滚。
```

### Task 15-07：实现诊断包导出

涉及文件：

```text
src/diagnostics/exportDiagnostics.ts
agent-service/api/diagnostics.py
```

验收：

```text
1. 可导出 diagnostics.zip。
2. API Key 被脱敏。
3. 包含 runtime_health 和日志。
```

---

## 25. 自检清单

### 25.1 架构自检

```text
[ ] AutoGen 只出现在 AutoGenAdapter 相关文件中。
[ ] WorkflowRunner 不 import AutoGen。
[ ] UI 不消费 AutoGen 原始事件。
[ ] ToolGateway 不依赖 AutoGen。
[ ] AgentConfig / TeamConfig / WorkflowConfig 是 Runtime 中性的。
[ ] Settings 有 Runtime Provider 字段。
[ ] MockRuntimeAdapter 可用于测试。
```

### 25.2 升级自检

```text
[ ] requirements.lock 锁定 AutoGen 版本。
[ ] health 接口返回 AutoGen 版本。
[ ] Adapter Contract Test 通过。
[ ] run_stream 事件映射测试通过。
[ ] Tool 调用测试通过。
[ ] Patch 输出测试通过。
[ ] Command 审批测试通过。
[ ] 回滚方案可执行。
```

### 25.3 迁移自检

```text
[ ] MicrosoftAgentFrameworkAdapter 有占位接口。
[ ] Runtime Provider 可以按任务切换。
[ ] Runtime 切换不影响 UI 事件。
[ ] Runtime 切换不影响 ToolGateway。
[ ] Prompt 有版本号。
[ ] Config 有 schemaVersion。
[ ] 迁移脚本可备份和恢复。
```

### 25.4 安全自检

```text
[ ] 新 Runtime 不能绕过 PermissionGuard。
[ ] 新 Runtime 不能直接访问 workspace 文件。
[ ] 新 Runtime 不能直接执行命令。
[ ] Tool 调用必须经过审计日志。
[ ] API Key 不进入普通日志。
[ ] 诊断包脱敏。
```

---

## 26. 最终结论

本项目可以在 MVP 阶段使用 AutoGen 作为核心 Agent Runtime，但必须从一开始就按可替换架构实现。

最终维护策略是：

```text
1. AutoGen 用于当前 MVP 快速落地。
2. 项目核心是 WorkflowRunner + ToolGateway + TaskManager。
3. AutoGen 只封装在 AutoGenAdapter 内。
4. UI 和配置保持 Runtime 中性。
5. 统一事件、统一工具协议、统一输出 Schema。
6. 版本锁定、Prompt 版本化、配置快照和诊断包必须实现。
7. 后续通过 MicrosoftAgentFrameworkAdapter 灰度迁移。
8. 迁移失败可以回滚 Runtime、Prompt 和配置。
```

一句话：

```text
现在用 AutoGen，
但不要把产品做成 AutoGen 的附属品；
要把 AutoGen 做成你的 IDE Agent Runtime 插件之一。
```
