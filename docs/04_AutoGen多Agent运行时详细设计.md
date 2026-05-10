# 04_AutoGen 多 Agent 运行时详细设计

> 适用项目：AutoGen + VS Code 插件型 AI Code IDE  
> 对应 UI：`autogen_full_control_ui_config_complete.html`  
> 文档目标：把 VS Code Webview UI 中的 Run / Agents / Team / Tools / Workflow / Settings 配置，落到 Python AutoGen Service 的运行时架构、核心类、事件流、工具调用、人类确认、暂停/恢复/取消、重试与错误处理上。  
> 本文是第 04 份详细设计文档，承接：  
> - `00_项目总览与MVP范围_详细设计.md`  
> - `01_VSCode插件前端Webview详细设计.md`  
> - `02_Webview与Extension通信协议详细设计.md`  
> - `03_Extension与AutoGenService通信接口详细设计.md`

---

## 1. 检索资料依据

本设计参考了以下资料方向，并结合当前项目目标重新抽象：

1. AutoGen AgentChat 官方 Agent 教程  
   - `AssistantAgent` 支持模型、tools、`run()`、`run_stream()`。
   - `run_stream()` 适合把 Agent 中间消息、工具调用、最终结果转换成 UI 实时事件。
   - 资料：AutoGen Agents 官方文档  
     https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/agents.html

2. AutoGen AgentChat Teams 官方文档  
   - AutoGen 提供 `RoundRobinGroupChat`、`SelectorGroupChat`、`MagenticOneGroupChat` 等 Team 形态。
   - IDE 场景下不建议第一版完全依赖自由 Team 对话，而建议由自研 `WorkflowRunner` 顺序驱动 Agent。
   - 资料：AutoGen Teams 官方文档  
     https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/teams.html

3. AutoGen Human-in-the-Loop 官方文档  
   - `UserProxyAgent` 可作为用户代理提供反馈。
   - 但官方也说明这种方式会在 team 运行中等待用户输入；对于 VS Code 插件里的计划确认、Patch 确认、命令确认，更适合由后端 WorkflowRunner 暂停任务并等待 UI approval。
   - 资料：AutoGen Human-in-the-Loop 官方文档  
     https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/human-in-the-loop.html

4. AutoGen Termination 官方文档  
   - 可用 `MaxMessageTermination`、`TextMentionTermination`、`TokenUsageTermination`、`TimeoutTermination` 等停止条件。
   - 本项目在 Team 模式中保留 termination 配置，但主线 Workflow 模式用 workflow node limit、task timeout、tool call limit 统一控制。
   - 资料：AutoGen Termination 官方文档  
     https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/termination.html

5. AutoGen GitHub 状态  
   - AutoGen 官方仓库提示进入 maintenance mode，因此本项目不把 AutoGen 深度绑定到 UI 和业务状态机里，而是把 AutoGen 封装在 `AgentRuntimeAdapter` 后面，后续可替换成 Microsoft Agent Framework、LangGraph 或自研 Agent runtime。
   - 资料：AutoGen GitHub  
     https://github.com/microsoft/autogen

---

## 2. 本文档要解决的问题

这份文档解决 Python AutoGen Service 内部的详细设计问题：

```text
VS Code Webview UI
    ↓ postMessage
VS Code Extension Host
    ↓ HTTP / WebSocket
Python AutoGen Service
    ↓
AutoGen 多 Agent 运行时
```

重点回答：

1. UI 中配置的 Agent、Team、Tools、Workflow、Settings 如何变成 AutoGen 可运行对象。
2. Python Service 内部应该有哪些模块。
3. `AssistantAgent` 如何创建、如何绑定工具、如何流式运行。
4. WorkflowRunner 如何按 UI 配置驱动多 Agent。
5. 人类确认节点如何暂停、恢复、拒绝、重试。
6. AutoGen 工具调用如何转发到 VS Code Extension。
7. Agent 输出如何解析为 Patch、Review、TestResult、Summary。
8. 任务状态、Agent 状态、WebSocket 事件如何同步到 UI。
9. 怎么避免 AutoGen 自由对话失控。
10. MVP 阶段和后续扩展阶段怎么分层。

---

## 3. 运行时总体架构

### 3.1 推荐架构

```text
Python AutoGen Service
├─ FastAPI API Layer
│  ├─ /api/tasks
│  ├─ /api/agents
│  ├─ /api/teams
│  ├─ /api/tools
│  ├─ /api/workflows
│  ├─ /api/settings
│  └─ /ws/tasks/{taskId}
│
├─ Runtime Core
│  ├─ TaskManager
│  ├─ WorkflowRunner
│  ├─ AgentFactory
│  ├─ ModelClientFactory
│  ├─ ToolFactory
│  ├─ ToolPermissionGuard
│  ├─ ApprovalManager
│  ├─ EventMapper
│  └─ RuntimeRegistry
│
├─ AutoGen Adapter
│  ├─ AssistantAgentAdapter
│  ├─ TeamAdapter
│  ├─ RunStreamAdapter
│  └─ OutputParser
│
├─ Tool Gateway
│  ├─ VSCodeToolClient
│  ├─ FileToolAdapter
│  ├─ SearchToolAdapter
│  ├─ PatchToolAdapter
│  ├─ TerminalToolAdapter
│  └─ GitToolAdapter
│
├─ Store
│  ├─ ConfigStore
│  ├─ TaskStore
│  ├─ MessageStore
│  ├─ ToolCallStore
│  ├─ PatchStore
│  └─ RuntimeLogStore
│
└─ Safety
   ├─ PathGuard
   ├─ CommandGuard
   ├─ SensitiveFileGuard
   ├─ PatchGuard
   └─ SecretRedactor
```

### 3.2 设计原则

```text
1. AutoGen 不直接碰 VS Code 文件系统。
2. AutoGen 不直接执行终端命令。
3. AutoGen 不直接 apply patch。
4. AutoGen 只通过 ToolGateway 请求操作。
5. ToolGateway 必须经过权限检查。
6. UI 配置是运行时真实数据源。
7. WorkflowRunner 控制 Agent 执行顺序。
8. Agent 只负责局部推理和输出，不负责全局流程。
9. 所有中间事件必须可观测、可记录、可重放。
10. AutoGen 被封装在 Adapter 层，后续可替换。
```

---

## 4. 推荐目录结构

```text
agent-service/
├─ main.py
├─ requirements.txt
├─ api/
│  ├─ routes_tasks.py
│  ├─ routes_agents.py
│  ├─ routes_teams.py
│  ├─ routes_tools.py
│  ├─ routes_workflows.py
│  ├─ routes_settings.py
│  └─ routes_runtime.py
│
├─ core/
│  ├─ task_manager.py
│  ├─ workflow_runner.py
│  ├─ agent_factory.py
│  ├─ model_client_factory.py
│  ├─ tool_factory.py
│  ├─ permission_guard.py
│  ├─ approval_manager.py
│  ├─ event_bus.py
│  ├─ event_mapper.py
│  └─ runtime_registry.py
│
├─ autogen_runtime/
│  ├─ assistant_adapter.py
│  ├─ team_adapter.py
│  ├─ stream_adapter.py
│  ├─ output_parser.py
│  └─ termination_factory.py
│
├─ tools/
│  ├─ vscode_client.py
│  ├─ file_tools.py
│  ├─ code_search_tools.py
│  ├─ patch_tools.py
│  ├─ terminal_tools.py
│  ├─ git_tools.py
│  └─ tool_schemas.py
│
├─ workflows/
│  ├─ code_edit_workflow.py
│  ├─ bug_fix_workflow.py
│  ├─ test_generation_workflow.py
│  ├─ explain_code_workflow.py
│  └─ workflow_registry.py
│
├─ schemas/
│  ├─ task.py
│  ├─ agent.py
│  ├─ team.py
│  ├─ tool.py
│  ├─ workflow.py
│  ├─ settings.py
│  ├─ events.py
│  └─ approvals.py
│
├─ store/
│  ├─ config_store.py
│  ├─ task_store.py
│  ├─ message_store.py
│  ├─ patch_store.py
│  └─ json_file_store.py
│
├─ safety/
│  ├─ path_guard.py
│  ├─ command_guard.py
│  ├─ patch_guard.py
│  ├─ sensitive_file_guard.py
│  └─ redactor.py
│
└─ tests/
   ├─ test_agent_factory.py
   ├─ test_workflow_runner.py
   ├─ test_permission_guard.py
   ├─ test_tool_gateway.py
   └─ test_event_mapper.py
```

---

## 5. 核心数据模型

### 5.1 TaskContext

`TaskContext` 是整个运行时最核心的数据对象。它把 UI 输入、Workflow 中间结果、Agent 输出、工具调用、审批状态全部集中保存。

```python
from pydantic import BaseModel, Field
from typing import Any, Literal

class TaskContext(BaseModel):
    task_id: str
    workspace_id: str
    workspace_root: str
    user_request: str

    team_id: str
    workflow_id: str
    mode: Literal["auto", "semi_auto", "manual"] = "semi_auto"

    status: str = "created"
    current_node_id: str | None = None
    current_agent_id: str | None = None

    context_refs: list[str] = Field(default_factory=list)
    context_files: list[dict[str, Any]] = Field(default_factory=list)
    selected_text: str | None = None
    terminal_error: str | None = None
    git_diff: str | None = None

    plan: dict[str, Any] | None = None
    codebase_summary: dict[str, Any] | None = None
    patches: list[dict[str, Any]] = Field(default_factory=list)
    review_results: list[dict[str, Any]] = Field(default_factory=list)
    test_results: list[dict[str, Any]] = Field(default_factory=list)
    summary: dict[str, Any] | None = None

    decisions: list[dict[str, Any]] = Field(default_factory=list)
    approvals: list[dict[str, Any]] = Field(default_factory=list)
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    messages: list[dict[str, Any]] = Field(default_factory=list)

    retry_count: int = 0
    max_retry: int = 2
    created_at: str | None = None
    updated_at: str | None = None
```

### 5.2 AgentConfig

对应 UI 的 Agents 页。

```python
class AgentConfig(BaseModel):
    id: str
    name: str
    role: str
    description: str = ""
    enabled: bool = True

    model: str
    temperature: float = 0.2
    max_turns: int = 8
    max_tool_calls: int = 20
    timeout_seconds: int = 120

    system_prompt: str
    response_format: str = "markdown"  # markdown | json | patch | review_json
    stop_condition: str | None = None
    output_json_schema: dict[str, Any] | None = None

    tool_names: list[str] = Field(default_factory=list)
    context_scope: list[str] = Field(default_factory=list)
```

### 5.3 TeamConfig

对应 UI 的 Team 页。

```python
class TeamConfig(BaseModel):
    id: str
    name: str
    description: str = ""
    enabled: bool = True
    default: bool = False

    mode: str = "sequential"  # sequential | round_robin | selector | manual
    execution_policy: str = "serial"  # serial | parallel
    model_override_policy: str = "agent_default"  # agent_default | team_default | force_team_model
    default_model: str | None = None

    agent_order: list[str]
    max_turns: int = 20
    retry_limit: int = 2
    termination: str = "max_messages_or_done"
```

### 5.4 WorkflowConfig

对应 UI 的 Workflow 页。

```python
class WorkflowNodeConfig(BaseModel):
    id: str
    type: str  # agent | human_approval | tool | condition | summary
    agent_id: str | None = None
    name: str
    input_keys: list[str] = Field(default_factory=list)
    output_key: str | None = None
    requires_approval: bool = False
    timeout_seconds: int = 120
    retry_limit: int = 1
    on_success: str | None = None
    on_failure: str | None = None

class WorkflowConfig(BaseModel):
    id: str
    name: str
    description: str = ""
    version: str = "1.0.0"
    default: bool = False
    type: str = "code_edit"
    failure_strategy: str = "return_to_developer"
    retry_limit: int = 2
    node_timeout_seconds: int = 120
    confirm_policy: str = "plan_patch_command"
    nodes: list[WorkflowNodeConfig]
```

### 5.5 ToolPermissionConfig

对应 UI 的 Tools 页。

```python
class ToolPermissionConfig(BaseModel):
    agent_id: str
    tool_name: str
    permission: str  # deny | allow | confirm | readonly | whitelist
    parameter_policy: dict[str, Any] = Field(default_factory=dict)
```

### 5.6 RuntimeSettings

对应 UI 的 Settings 页。

```python
class RuntimeSettings(BaseModel):
    provider: str
    base_url: str | None = None
    model: str
    fallback_model: str | None = None
    api_key_ref: str | None = None

    service_url: str = "http://127.0.0.1:8765"
    host: str = "127.0.0.1"
    port: int = 8765
    python_path: str = "python"
    autogen_package: str = "autogen-agentchat"
    log_level: str = "INFO"
    workspace_storage_path: str

    max_files_read: int = 30
    max_context_tokens: int = 64000
    use_vscode_secret_storage: bool = True
```

---

## 6. AutoGen Runtime 核心模块设计

### 6.1 TaskManager

职责：

```text
1. 创建任务。
2. 维护任务状态。
3. 启动 WorkflowRunner。
4. 暂停/恢复/取消任务。
5. 处理用户追加消息。
6. 处理 UI 审批。
7. 保存 TaskContext。
```

接口：

```python
class TaskManager:
    async def create_task(self, request: CreateTaskRequest) -> TaskContext: ...
    async def start_task(self, task_id: str) -> None: ...
    async def pause_task(self, task_id: str) -> None: ...
    async def resume_task(self, task_id: str) -> None: ...
    async def cancel_task(self, task_id: str) -> None: ...
    async def rerun_current_agent(self, task_id: str) -> None: ...
    async def append_user_message(self, task_id: str, message: str, target_agent: str | None) -> None: ...
    async def approve(self, task_id: str, approval_id: str, decision: dict) -> None: ...
```

状态控制建议：

```text
created
planning
waiting_plan_approval
analyzing_codebase
developing_patch
reviewing
waiting_patch_approval
applying_patch
testing
fixing
summarizing
completed
failed
paused
cancelled
```

### 6.2 WorkflowRunner

职责：

```text
1. 读取 WorkflowConfig。
2. 根据节点顺序运行 Agent / Approval / Tool / Condition。
3. 把节点输出写入 TaskContext。
4. 处理失败重试。
5. 处理用户确认。
6. 控制从哪个 Agent 回退。
```

核心伪代码：

```python
class WorkflowRunner:
    async def run(self, ctx: TaskContext, workflow: WorkflowConfig):
        node = self.first_node(workflow)

        while node:
            if await self.is_cancelled(ctx.task_id):
                await self.mark_cancelled(ctx)
                return ctx

            if await self.is_paused(ctx.task_id):
                await self.wait_until_resumed(ctx.task_id)

            ctx.current_node_id = node.id
            await self.emit_node_started(ctx, node)

            try:
                if node.type == "agent":
                    result = await self.run_agent_node(ctx, node)
                    self.write_output(ctx, node.output_key, result)

                elif node.type == "human_approval":
                    result = await self.run_approval_node(ctx, node)
                    self.write_approval(ctx, result)

                elif node.type == "condition":
                    node = self.evaluate_condition(ctx, node)
                    continue

                elif node.type == "tool":
                    result = await self.run_tool_node(ctx, node)
                    self.write_output(ctx, node.output_key, result)

                await self.emit_node_completed(ctx, node)
                node = self.next_node(workflow, node, success=True)

            except Exception as e:
                handled = await self.handle_node_error(ctx, node, e)
                if not handled:
                    raise
                node = self.next_node(workflow, node, success=False)

        ctx.status = "completed"
        await self.emit_task_completed(ctx)
        return ctx
```

### 6.3 AgentFactory

职责：

```text
1. 把 AgentConfig 转成 AutoGen AssistantAgent。
2. 根据 Agent 权限注入 tools。
3. 根据模型配置创建 model_client。
4. 加入 system_message、description、model_client_stream 等参数。
5. 对不同 Agent 使用不同输出格式约束。
```

示例：

```python
from autogen_agentchat.agents import AssistantAgent

class AgentFactory:
    def __init__(self, model_client_factory, tool_factory):
        self.model_client_factory = model_client_factory
        self.tool_factory = tool_factory

    async def create_assistant_agent(self, config: AgentConfig, ctx: TaskContext):
        model_client = self.model_client_factory.create(
            model=config.model,
            temperature=config.temperature,
        )

        tools = []
        for tool_name in config.tool_names:
            tools.append(self.tool_factory.create_tool(
                tool_name=tool_name,
                agent_id=config.id,
                task_context=ctx,
            ))

        system_message = self.build_system_message(config, ctx)

        return AssistantAgent(
            name=config.name,
            model_client=model_client,
            tools=tools,
            system_message=system_message,
            model_client_stream=True,
            reflect_on_tool_use=True,
        )
```

### 6.4 ModelClientFactory

职责：

```text
1. 支持 OpenAI。
2. 支持 OpenAI-compatible。
3. 支持 Ollama / LM Studio。
4. 支持 fallback model。
5. 支持从 VS Code SecretStorage 引用 API Key。
```

示例：

```python
from autogen_ext.models.openai import OpenAIChatCompletionClient

class ModelClientFactory:
    def __init__(self, settings_store, secret_provider):
        self.settings_store = settings_store
        self.secret_provider = secret_provider

    def create(self, model: str, temperature: float = 0.2):
        settings = self.settings_store.get_runtime_settings()
        api_key = self.secret_provider.get(settings.api_key_ref)

        kwargs = {
            "model": model,
            "api_key": api_key,
            "temperature": temperature,
        }

        if settings.base_url:
            kwargs["base_url"] = settings.base_url

        return OpenAIChatCompletionClient(**kwargs)
```

注意：真实代码需要按照当前安装版本的 `OpenAIChatCompletionClient` 参数签名调整。

### 6.5 ToolFactory

职责：

```text
1. 把 UI Tools 配置转换为 AutoGen 可调用 Python 函数。
2. 每个工具执行前调用 ToolPermissionGuard。
3. 每个工具执行后写入 ToolCallStore。
4. 工具结果通过 EventBus 推送到 Webview。
5. 需要确认的工具向 ApprovalManager 发起 approval_required。
```

示例：

```python
class ToolFactory:
    def create_tool(self, tool_name: str, agent_id: str, task_context: TaskContext):
        if tool_name == "read_file":
            return self.wrap_tool(agent_id, task_context, self.file_tools.read_file)
        if tool_name == "search_code":
            return self.wrap_tool(agent_id, task_context, self.search_tools.search_code)
        if tool_name == "propose_patch":
            return self.wrap_tool(agent_id, task_context, self.patch_tools.propose_patch)
        if tool_name == "run_command":
            return self.wrap_tool(agent_id, task_context, self.terminal_tools.run_command)
        raise ValueError(f"Unknown tool: {tool_name}")

    def wrap_tool(self, agent_id, ctx, func):
        async def wrapped(**kwargs):
            await self.permission_guard.check(agent_id, func.__name__, kwargs, ctx)
            await self.event_bus.emit_tool_call(ctx.task_id, agent_id, func.__name__, kwargs)
            result = await func(ctx=ctx, **kwargs)
            await self.event_bus.emit_tool_result(ctx.task_id, agent_id, func.__name__, result)
            return result
        wrapped.__name__ = func.__name__
        wrapped.__doc__ = func.__doc__
        return wrapped
```

### 6.6 ApprovalManager

职责：

```text
1. 为 plan / patch / command / tool_call 创建 approval request。
2. 通过 WebSocket 推送 approval_required。
3. 暂停当前 workflow node。
4. 等待 UI 通过 HTTP 提交 approve / reject / revise。
5. 把审批结果写回 TaskContext。
```

示例：

```python
class ApprovalManager:
    async def request_approval(self, ctx: TaskContext, approval_type: str, payload: dict):
        approval_id = generate_id("approval")
        approval = {
            "id": approval_id,
            "type": approval_type,
            "status": "pending",
            "payload": payload,
        }
        ctx.approvals.append(approval)
        await self.task_store.save(ctx)
        await self.event_bus.emit(ctx.task_id, {
            "type": "approval_required",
            "approvalId": approval_id,
            "approvalType": approval_type,
            "payload": payload,
        })
        return await self.wait_for_decision(ctx.task_id, approval_id)
```

---

## 7. Agent 运行模式设计

### 7.1 MVP 推荐：WorkflowRunner 顺序驱动模式

MVP 不建议直接用 AutoGen 的自由 `RoundRobinGroupChat` 跑完整 IDE 修改任务。原因：

```text
1. UI 很难准确显示当前步骤。
2. 人类确认点不好插入。
3. Patch / Test / Review 的回退逻辑不好控制。
4. 容易出现 Agent 无限对话。
5. 失败重试不稳定。
```

MVP 推荐：

```text
User Request
  ↓
WorkflowRunner
  ↓
PlannerAgent.run_stream()
  ↓
Plan Approval
  ↓
CodebaseAgent.run_stream()
  ↓
DeveloperAgent.run_stream()
  ↓
ReviewerAgent.run_stream()
  ↓
Patch Approval
  ↓
Apply Patch Tool
  ↓
TesterAgent.run_stream()
  ↓
失败则回到 DeveloperAgent
  ↓
SummaryAgent.run_stream()
```

### 7.2 进阶：AutoGen Team 模式

Team 页可提供：

```text
sequential
round_robin
selector
manual
```

其中：

```text
sequential  → 自研 WorkflowRunner
round_robin → AutoGen RoundRobinGroupChat
selector    → AutoGen SelectorGroupChat
manual      → UI 手动选择下一个 Agent
```

Team 模式适合：

```text
1. 研究/调试多 Agent 对话。
2. 文档分析。
3. 方案讨论。
4. 非直接修改代码任务。
```

代码修改任务仍以 WorkflowRunner 为主。

---

## 8. `run_stream()` 事件映射设计

### 8.1 为什么使用 `run_stream()`

UI 需要实时显示：

```text
Agent 开始
模型流式输出
工具调用
工具结果
Patch 提出
审批等待
命令执行结果
Agent 完成
```

AutoGen 的 `run_stream()` 可以逐步产出事件，适合转发到 WebSocket。

### 8.2 EventMapper

职责：

```text
1. 把 AutoGen 内部消息转换为前端统一事件。
2. 脱敏敏感字段。
3. 压缩过长工具结果。
4. 保存 MessageStore。
```

统一事件格式：

```json
{
  "type": "agent_message",
  "taskId": "task_001",
  "agent": "DeveloperAgent",
  "content": "我将生成 AuthController...",
  "timestamp": 1710000000000
}
```

事件类型映射：

| AutoGen 侧事件 | UI 事件 | 说明 |
|---|---|---|
| agent started | `agent_status` | Agent 状态变 running |
| text chunk | `agent_stream_chunk` | 流式文本 |
| final message | `agent_message` | 完整消息 |
| tool call request | `tool_call` | 工具调用卡片 |
| tool result | `tool_result` | 工具结果卡片 |
| task result | `agent_result` | Agent 节点完成 |
| exception | `runtime_error` | 异常卡片 |

### 8.3 流式消费伪代码

```python
class RunStreamAdapter:
    async def run_agent_stream(self, agent, task: str, ctx: TaskContext):
        await self.event_bus.emit_agent_status(ctx.task_id, agent.name, "running")

        collected = []
        async for event in agent.run_stream(task=task):
            ui_event = self.event_mapper.map(event, ctx)
            if ui_event:
                await self.event_bus.emit(ctx.task_id, ui_event)
            collected.append(event)

        await self.event_bus.emit_agent_status(ctx.task_id, agent.name, "done")
        return self.output_parser.parse(agent.name, collected)
```

---

## 9. Agent 输入构造设计

每个 Agent 不应该拿到完整 TaskContext，而应该只拿必要字段。

### 9.1 PlannerAgent 输入

```text
用户需求
当前项目简要信息
当前模式
安全约束
输出格式要求
```

Prompt 拼接：

```text
用户需求：{user_request}
项目：{workspace_summary}
请输出：
1. 任务拆分
2. 预计修改范围
3. 需要读取的文件/搜索关键词
4. 风险点
5. 是否需要用户确认
```

### 9.2 CodebaseAgent 输入

```text
用户需求
Planner 输出计划
项目文件树摘要
可用工具：list_files/read_file/search_code/git_diff
```

要求：

```text
必须先调用工具分析项目。
不要凭空假设包名、类名、依赖。
输出 relatedFiles、projectSummary、frameworkHints。
```

### 9.3 DeveloperAgent 输入

```text
用户需求
已批准计划
CodebaseAgent 输出
相关文件内容
工具权限
Patch 输出规范
```

要求：

```text
所有修改必须通过 propose_patch。
禁止直接要求覆盖整个项目。
禁止输出无法 apply 的伪 diff。
```

### 9.4 ReviewerAgent 输入

```text
用户需求
Patch
相关文件摘要
项目约束
```

输出：

```json
{
  "riskLevel": "low|medium|high",
  "hasCriticalIssue": false,
  "issues": [],
  "suggestions": [],
  "approved": true
}
```

### 9.5 TesterAgent 输入

```text
用户需求
已应用 Patch
项目类型
可用命令白名单
上次测试日志
```

要求：

```text
只能请求执行白名单命令。
优先 mvn test / gradle test / npm test / pnpm build。
如果失败，必须总结错误原因和建议修复文件。
```

---

## 10. OutputParser 设计

### 10.1 为什么需要 OutputParser

Agent 输出不能直接作为业务数据使用。必须解析成结构化结果：

```text
PlanResult
CodebaseResult
PatchResult
ReviewResult
TestResult
SummaryResult
```

### 10.2 PlanResult

```python
class PlanResult(BaseModel):
    summary: str
    steps: list[str]
    expected_files: list[str]
    search_queries: list[str]
    risks: list[str]
    requires_approval: bool = True
```

### 10.3 CodebaseResult

```python
class CodebaseResult(BaseModel):
    project_type: str
    framework: str | None = None
    related_files: list[str]
    read_files: list[str]
    search_queries: list[str]
    summary: str
    missing_info: list[str] = []
```

### 10.4 PatchResult

```python
class PatchResult(BaseModel):
    summary: str
    changed_files: list[dict]
    patch_text: str
    risk_level: str
    requires_approval: bool = True
```

### 10.5 ReviewResult

```python
class ReviewResult(BaseModel):
    approved: bool
    risk_level: str
    has_critical_issue: bool
    issues: list[dict]
    suggestions: list[str]
```

### 10.6 TestResult

```python
class TestResult(BaseModel):
    command: str
    exit_code: int
    success: bool
    summary: str
    stdout_ref: str | None = None
    stderr_ref: str | None = None
    fix_suggestions: list[str] = []
```

### 10.7 解析策略

优先级：

```text
1. 如果 Agent 按 JSON Schema 输出，直接解析 JSON。
2. 如果 propose_patch 工具返回 patchId，直接用工具结果。
3. 如果模型输出 markdown，从代码块中提取 diff/json。
4. 如果解析失败，触发 parser_repair，让同 Agent 或 ParserAgent 修复格式。
5. 仍失败则任务进入 failed，需要用户介入。
```

---

## 11. ToolGateway 与 VS Code 联调设计

### 11.1 工具调用方向

```text
AutoGen Agent
  ↓ Python tool function
ToolPermissionGuard
  ↓
ToolGateway
  ↓ HTTP/WebSocket
VS Code Extension Tool Server
  ↓
VS Code API / Node API
```

### 11.2 VSCodeToolClient

```python
class VSCodeToolClient:
    def __init__(self, extension_tool_url: str):
        self.base_url = extension_tool_url

    async def read_file(self, workspace_id: str, path: str) -> dict: ...
    async def list_files(self, workspace_id: str, path: str) -> dict: ...
    async def search_code(self, workspace_id: str, query: str) -> dict: ...
    async def open_diff(self, workspace_id: str, patch_id: str) -> dict: ...
    async def apply_patch(self, workspace_id: str, patch_id: str) -> dict: ...
    async def run_command(self, workspace_id: str, command: str) -> dict: ...
    async def git_diff(self, workspace_id: str) -> dict: ...
    async def git_status(self, workspace_id: str) -> dict: ...
```

### 11.3 read_file 工具

Agent 侧函数：

```python
async def read_file(path: str) -> str:
    """读取当前 workspace 内指定相对路径文件。禁止访问 workspace 外文件。"""
```

执行步骤：

```text
1. PermissionGuard 检查 agent_id 是否允许 read_file。
2. SensitiveFileGuard 检查是否命中 .env、id_rsa、*.pem 等黑名单。
3. PathGuard 检查路径不越界。
4. ToolGateway 请求 VS Code Extension。
5. 返回内容前做长度限制和脱敏。
6. 推送 tool_result。
```

### 11.4 propose_patch 工具

```python
async def propose_patch(patch: str, summary: str) -> str:
    """提交 unified diff patch。不会直接应用，只生成 patch proposal。"""
```

步骤：

```text
1. PatchGuard 校验 patch 格式。
2. PatchGuard 校验修改文件都在 workspace 内。
3. PatchGuard 校验不修改敏感文件。
4. 保存 patch_proposal。
5. 推送 patch_proposed。
6. 返回 patchId。
```

### 11.5 run_command 工具

```python
async def run_command(command: str, reason: str) -> str:
    """请求执行命令。必须符合命令白名单，并可能需要用户确认。"""
```

步骤：

```text
1. CommandGuard 检查命令是否在 allowlist。
2. 如果需要确认，ApprovalManager 推送 command approval。
3. 用户允许后，调用 VS Code Terminal 工具。
4. 返回 stdout/stderr 摘要。
5. 完整日志保存为文件引用。
```

---

## 12. 权限检查设计

### 12.1 ToolPermissionGuard

```python
class ToolPermissionGuard:
    async def check(self, agent_id: str, tool_name: str, args: dict, ctx: TaskContext):
        permission = self.permission_store.get(agent_id, tool_name)

        if permission == "deny":
            raise PermissionError(f"{agent_id} cannot use {tool_name}")

        if permission == "readonly":
            self.ensure_readonly_tool(tool_name)

        if permission == "whitelist":
            self.check_whitelist(tool_name, args)

        if permission == "confirm":
            decision = await self.approval_manager.request_approval(
                ctx, "tool_call", {"tool": tool_name, "args": args}
            )
            if decision["action"] != "approve":
                raise PermissionError("User rejected tool call")
```

### 12.2 Global Safety

Tools 页中的 Global Safety 对应：

```text
[x] 禁止访问 workspace 外文件
[x] 禁止直接写文件，只允许 propose_patch
[x] apply_patch 必须确认
[x] run_command 必须确认
[x] 危险工具全局禁止
[x] 工具调用完整记录
```

这些不是 UI 装饰，必须在后端强制执行。

---

## 13. 暂停、恢复、取消设计

### 13.1 暂停

UI 点击暂停：

```text
Webview → Extension → AutoGen Service /api/tasks/{taskId}/pause
```

后端：

```python
class RuntimeRegistry:
    paused_tasks: set[str]
    cancel_tokens: dict[str, CancellationToken]
```

行为：

```text
1. 如果当前 Agent 正在流式输出，不强制中断模型请求，标记 pause_requested。
2. 当前 Agent 结束后不进入下一节点。
3. 如果当前在工具调用前，直接暂停。
4. 推送 task_status = paused。
```

### 13.2 恢复

```text
1. 清除 paused 标记。
2. 从 TaskContext.current_node_id 继续。
3. 推送 task_status = running。
```

### 13.3 取消

```text
1. 设置 cancel flag。
2. 尝试中断当前 run_stream。
3. 当前任务 status = cancelled。
4. 不再执行后续节点。
5. 保留所有已有日志和 patch。
```

### 13.4 重跑当前 Agent

```text
1. 读取 current_agent_id。
2. 移除该 Agent 上次输出或标记 superseded。
3. 保留之前上下文和用户反馈。
4. 重新调用该 Agent。
```

---

## 14. 人类确认节点设计

### 14.1 Plan Approval

```text
PlannerAgent 输出计划
  ↓
WorkflowRunner 创建 approval_required(plan)
  ↓
UI 显示「接受计划 / 调整计划 / 保存模板」
  ↓
用户接受：进入 CodebaseAgent
用户调整：重新 PlannerAgent
用户取消：任务 cancelled
```

### 14.2 Patch Approval

```text
DeveloperAgent propose_patch
  ↓
ReviewerAgent 审查
  ↓
WorkflowRunner 创建 approval_required(patch)
  ↓
UI 显示「查看 Diff / 应用 Patch / 拒绝并说明 / 部分应用」
  ↓
用户应用：调用 apply_patch
用户拒绝：回 DeveloperAgent
用户部分应用：生成 partial patch request
```

### 14.3 Command Approval

```text
TesterAgent 请求 run_command
  ↓
CommandGuard 判断需要确认
  ↓
approval_required(command)
  ↓
UI 显示「允许一次 / 加入白名单 / 拒绝」
```

---

## 15. 典型 Workflow 详细设计

### 15.1 Code Edit Workflow

```text
N1 PlannerAgent
  输出 plan
  ↓
N2 Human Approval: Plan
  ↓ approve
N3 CodebaseAgent
  输出 codebase_summary, related_files
  ↓
N4 DeveloperAgent
  输出 patch
  ↓
N5 ReviewerAgent
  输出 review_result
  ↓
条件：review.hasCriticalIssue?
  是 → 回 N4 DeveloperAgent，附带 review feedback
  否 → N6 Human Approval: Patch
  ↓ approve
N7 ApplyPatch Tool
  ↓
N8 TesterAgent
  输出 test_result
  ↓
条件：test.success?
  是 → N9 SummaryAgent
  否 → 回 N4 DeveloperAgent，附带 test failure
```

### 15.2 Bug Fix Workflow

```text
N1 CodebaseAgent 读取报错和相关文件
N2 DeveloperAgent 生成修复 patch
N3 ReviewerAgent 审查
N4 Human Approval patch
N5 ApplyPatch
N6 TesterAgent 执行复现/测试命令
N7 失败则回 DeveloperAgent
N8 SummaryAgent
```

### 15.3 Test Generation Workflow

```text
N1 CodebaseAgent 分析目标类/函数
N2 TesterAgent 生成测试 patch
N3 ReviewerAgent 审查测试质量
N4 Human Approval patch
N5 ApplyPatch
N6 Run Test
N7 SummaryAgent
```

### 15.4 Explain Code Workflow

```text
N1 CodebaseAgent 读取选中代码/当前文件
N2 ExplainerAgent 输出解释
N3 ReviewerAgent 检查解释是否基于真实代码
N4 SummaryAgent
```

该 workflow 不需要 Patch Approval。

---

## 16. WebSocket 事件清单

AutoGen Runtime 必须推送：

```text
task_created
task_status
workflow_node_started
workflow_node_completed
agent_status
agent_message
agent_stream_chunk
tool_call
tool_result
approval_required
approval_resolved
patch_proposed
patch_applied
patch_rejected
command_requested
command_started
command_completed
test_result
runtime_error
task_completed
task_failed
task_cancelled
```

示例：

```json
{
  "type": "workflow_node_started",
  "taskId": "task_001",
  "nodeId": "developer",
  "agent": "DeveloperAgent",
  "timestamp": 1710000000000
}
```

```json
{
  "type": "patch_proposed",
  "taskId": "task_001",
  "patchId": "patch_001",
  "summary": "新增 JWT 登录接口",
  "files": [
    {"path": "src/main/java/.../AuthController.java", "changeType": "add"},
    {"path": "pom.xml", "changeType": "modify"}
  ]
}
```

---

## 17. 错误处理设计

### 17.1 错误分类

```text
MODEL_ERROR        模型 API 失败
TOOL_ERROR         工具执行失败
PERMISSION_DENIED  权限拒绝
APPROVAL_REJECTED  用户拒绝
PATCH_INVALID      patch 格式错误
PATCH_APPLY_FAILED patch 应用失败
COMMAND_FAILED     命令执行失败
PARSER_ERROR       Agent 输出解析失败
WORKFLOW_ERROR     流程配置错误
RUNTIME_ERROR      AutoGen Service 内部错误
```

### 17.2 错误策略

| 错误 | 默认动作 |
|---|---|
| MODEL_ERROR | 使用 fallback model 重试一次 |
| TOOL_ERROR | 通知当前 Agent，允许其改用其他工具 |
| PERMISSION_DENIED | 推送权限错误，等待用户修改权限或取消 |
| APPROVAL_REJECTED | 按 workflow 规则回退或取消 |
| PATCH_INVALID | 要求 DeveloperAgent 重新输出 patch |
| PATCH_APPLY_FAILED | 推送错误详情，允许 DeveloperAgent 修复 patch |
| COMMAND_FAILED | TesterAgent 总结失败并回 DeveloperAgent |
| PARSER_ERROR | Parser repair，失败则进入人工处理 |
| WORKFLOW_ERROR | 任务 failed |

---

## 18. 配置热更新设计

UI 中修改 Agents / Team / Tools / Workflow / Settings 后：

```text
1. 未运行任务：立即生效。
2. 正在运行任务：默认下次任务生效。
3. 如果用户选择“应用到当前任务”：
   - Agent prompt/model：下一个 node 生效。
   - Tool permission：下一次 tool call 生效。
   - Workflow：不建议中途替换，只允许暂停后人工确认。
   - Settings model：下一个 Agent 生效。
```

UI 应显示：

```text
当前修改：立即生效 / 下次任务生效 / 当前任务暂停后生效
```

---

## 19. 安全与审计设计

### 19.1 必须记录

```text
1. 用户任务原文。
2. 每个 Agent 输入摘要。
3. 每个 Agent 输出。
4. 每次工具调用参数。
5. 每次工具结果摘要。
6. 每次 approval 决策。
7. 每个 patch。
8. 每次命令执行。
9. 每次配置变更。
```

### 19.2 必须脱敏

```text
API Key
.env 内容
SSH 私钥
数据库密码
Token
Cookie
Authorization Header
```

### 19.3 禁止默认执行

```text
rm / del / format
curl / wget 下载执行脚本
powershell 任意脚本
ssh / scp
npm publish
git push
docker run --privileged
修改 workspace 外文件
读取敏感文件
```

---

## 20. MVP 实现顺序

### 阶段 1：基础运行时

```text
1. FastAPI 服务启动。
2. Runtime health。
3. TaskManager 创建任务。
4. AgentFactory 创建一个 AssistantAgent。
5. run_stream 转 WebSocket。
6. UI 能看到 Agent 消息。
```

### 阶段 2：工具调用

```text
1. read_file。
2. list_files。
3. search_code。
4. propose_patch。
5. tool_call / tool_result 事件。
```

### 阶段 3：WorkflowRunner

```text
1. PlannerAgent。
2. CodebaseAgent。
3. DeveloperAgent。
4. ReviewerAgent。
5. 手动 Patch Approval。
```

### 阶段 4：VS Code 工具联调

```text
1. open_diff。
2. apply_patch。
3. run_command。
4. git_diff。
5. terminal output。
```

### 阶段 5：完整控制台配置

```text
1. Agents 保存。
2. Team 保存。
3. Tools 权限保存。
4. Workflow 保存。
5. Settings 保存。
```

---

## 21. 关键代码骨架

### 21.1 Task API

```python
@app.post("/api/tasks")
async def create_task(req: CreateTaskRequest):
    ctx = await task_manager.create_task(req)
    asyncio.create_task(task_manager.start_task(ctx.task_id))
    return {"taskId": ctx.task_id, "status": ctx.status}
```

### 21.2 WorkflowRunner 调用 Agent

```python
async def run_agent_node(self, ctx: TaskContext, node: WorkflowNodeConfig):
    agent_config = self.config_store.get_agent(node.agent_id)
    agent = await self.agent_factory.create_assistant_agent(agent_config, ctx)
    task_prompt = self.prompt_builder.build(agent_config, ctx, node)
    result = await self.stream_adapter.run_agent_stream(agent, task_prompt, ctx)
    parsed = self.output_parser.parse_for_agent(agent_config.role, result)
    return parsed
```

### 21.3 Tool Function

```python
async def read_file(path: str) -> str:
    """读取 workspace 内文件。"""
    return await tool_gateway.read_file(ctx=current_ctx, agent_id=current_agent_id, path=path)
```

实际实现时不要用全局变量 `current_ctx`，应该通过闭包注入：

```python
def make_read_file_tool(ctx, agent_id):
    async def read_file(path: str) -> str:
        return await tool_gateway.read_file(ctx=ctx, agent_id=agent_id, path=path)
    return read_file
```

---

## 22. 单元测试设计

必须写的测试：

```text
test_agent_factory_creates_tools
test_tool_permission_deny
test_tool_permission_confirm
test_path_guard_blocks_outside_workspace
test_sensitive_file_blocked
test_command_allowlist
test_patch_guard_blocks_outside_workspace
test_workflow_runner_code_edit_success
test_workflow_runner_review_failure_returns_to_developer
test_approval_manager_waits_and_resumes
test_event_mapper_agent_message
test_event_mapper_tool_call
```

---

## 23. 与 UI 控件的对应关系

| UI 控件 | Runtime 模块 |
|---|---|
| Send Task | TaskManager.create_task + WorkflowRunner.run |
| Pause | TaskManager.pause_task |
| Resume | TaskManager.resume_task |
| Cancel | TaskManager.cancel_task |
| Rerun Current Agent | WorkflowRunner.rerun_node |
| Switch Agent | Manual mode next_agent |
| Accept Plan | ApprovalManager.resolve(plan, approve) |
| Revise Plan | PlannerAgent rerun with feedback |
| View Diff | PatchStore.get + Extension open_diff |
| Apply Patch | PatchToolAdapter.apply_patch |
| Reject Patch | ApprovalManager.resolve(patch, reject) |
| Partial Apply | PatchToolAdapter.partial_apply |
| Allow Command | ApprovalManager.resolve(command, approve) |
| Save Agent | ConfigStore.save_agent |
| Save Team | ConfigStore.save_team |
| Save Tool Permissions | ConfigStore.save_tool_permissions |
| Save Workflow | ConfigStore.save_workflow |
| Save Settings | ConfigStore.save_runtime_settings |
| Restart Runtime | RuntimeRegistry.restart |

---

## 24. 自检清单

### 24.1 覆盖性自检

- [x] 覆盖 AutoGen Service 内部模块结构。
- [x] 覆盖 AgentFactory。
- [x] 覆盖 ModelClientFactory。
- [x] 覆盖 ToolFactory。
- [x] 覆盖 WorkflowRunner。
- [x] 覆盖 TaskContext。
- [x] 覆盖 ApprovalManager。
- [x] 覆盖 OutputParser。
- [x] 覆盖 run_stream 到 WebSocket 事件映射。
- [x] 覆盖暂停、恢复、取消、重跑。
- [x] 覆盖 plan / patch / command 三类人工确认。
- [x] 覆盖 ToolGateway 与 VS Code Extension 联调。
- [x] 覆盖安全权限和审计。

### 24.2 与 UI 对齐自检

- [x] Run 页按钮有 Runtime 对应模块。
- [x] Agents 页配置有 AgentConfig 对应字段。
- [x] Team 页配置有 TeamConfig 对应字段。
- [x] Tools 页权限有 ToolPermissionConfig 对应字段。
- [x] Workflow 页配置有 WorkflowConfig 对应字段。
- [x] Settings 页配置有 RuntimeSettings 对应字段。

### 24.3 MVP 可开发性自检

- [x] 可以先只实现单 Agent run_stream。
- [x] 可以再接 read_file / propose_patch 工具。
- [x] 可以逐步实现 WorkflowRunner。
- [x] 不依赖 AutoGen Studio。
- [x] 不需要一开始实现 RoundRobin / Selector。
- [x] AutoGen 被封装在 Adapter 层，后续可替换。

### 24.4 风险自检

- [x] 避免 AutoGen 直接读写本地文件。
- [x] 避免 AutoGen 直接执行命令。
- [x] Patch 应用前必须审批。
- [x] 命令执行前必须审批或白名单。
- [x] 敏感文件默认阻断。
- [x] 工具调用有完整日志。

---

## 25. 下一份文档建议

下一份建议生成：

```text
05_Agent配置与Prompt模板详细设计.md
```

该文档应详细写：

```text
1. PlannerAgent Prompt
2. CodebaseAgent Prompt
3. DeveloperAgent Prompt
4. ReviewerAgent Prompt
5. TesterAgent Prompt
6. SummaryAgent Prompt
7. 每个 Agent 的输入上下文
8. 每个 Agent 的工具权限
9. 每个 Agent 的输出 JSON Schema
10. Patch 输出规范
11. Review 输出规范
12. TestResult 输出规范
13. Prompt 版本管理
14. Prompt 调试和验收用例
```
