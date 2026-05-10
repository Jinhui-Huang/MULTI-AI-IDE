# 06_Team 与 Workflow 编排详细设计

> 文档版本：v1.0  
> 适用项目：AutoGen VS Code 多 Agent 编程插件  
> 对应 UI：`Team` Tab、`Workflow` Tab，以及 `Run` Tab 中的 Team / Workflow / Mode 选择器  
> 目标读者：VS Code 插件开发、AutoGen Service 开发、后端 WorkflowRunner 开发、Codex 执行开发任务

---

## 1. 文档目标

本文件详细设计 **Team 与 Workflow 编排模块**，用于把前面设计的 AutoGen 控制台 UI 真正落地为可配置、可保存、可执行、可恢复、可调试的多 Agent 工作流系统。

本模块解决的问题：

1. 如何配置多个 Agent 组成一个 Team。
2. 如何配置 Team 的执行模式，例如顺序执行、RoundRobin、Selector、Manual。
3. 如何把 UI 中的 Workflow 节点转换成后端可执行流程。
4. 如何在 IDE 场景中插入人工确认节点，例如计划确认、Patch 确认、命令确认。
5. 如何处理失败重试、失败回退、超时、取消、暂停、恢复。
6. 如何把 AutoGen 的 Team 能力和自研 WorkflowRunner 解耦。
7. 如何让后续从 AutoGen 切换到 Microsoft Agent Framework / LangGraph / 自研 Runtime 时，Team 和 Workflow 配置尽量不变。

---

## 2. 资料依据与设计取舍

### 2.1 AutoGen Team 能力依据

AutoGen AgentChat 提供多 Agent Team 概念，一个 Team 是一组协作完成共同目标的 Agent。官方文档中 AgentChat 支持预设 Team，如 `RoundRobinGroupChat`、`SelectorGroupChat` 等。`RoundRobinGroupChat` 适合固定轮询，`SelectorGroupChat` 则通过模型选择下一位发言 Agent。

AutoGen 官方 reference 也把 team 相关实现放在 `autogen_agentchat.teams` 模块下，预定义 team 继承自 `BaseGroupChat`。

### 2.2 AutoGen Termination Condition 依据

AutoGen 的 termination condition 是一个可调用对象，接收自上一次调用以来的消息序列，如果应该终止则返回 `StopMessage`，否则返回 `None`。官方还提供 `MaxMessageTermination` 等条件，用于限制对话轮数和防止无限循环。

### 2.3 Human-in-the-loop 依据

AutoGen 提供 `UserProxyAgent`，可作为用户代理在 Team 运行过程中提供反馈。官方说明它可以被加入 team 中，team 会决定何时调用它向用户请求反馈。  
但 IDE 场景中，用户确认往往需要和 VS Code UI、Patch、命令执行、Diff 预览绑定，因此本文推荐：

> MVP 阶段不要把所有人工确认都交给 AutoGen 内部 `UserProxyAgent`，而是在自研 WorkflowRunner 中显式建模 HumanApproval 节点。

这样更容易：

- 暂停任务；
- 展示 UI 确认卡片；
- 保存状态；
- 超时处理；
- 恢复任务；
- 后期替换 Runtime。

### 2.4 总体设计取舍

本项目采用：

```text
UI 配置 Team / Workflow
        ↓
WorkflowRunner 负责流程推进
        ↓
AgentRuntimeAdapter 负责调用 AutoGen
        ↓
AutoGen AssistantAgent / Team 执行单个步骤或小组对话
```

也就是说：

```text
AutoGen 负责 Agent 能力
WorkflowRunner 负责 IDE 业务流程
Team / Workflow 配置保持框架无关
```

---

## 3. 概念定义

### 3.1 Agent

Agent 是单个 AI 角色，例如：

- PlannerAgent：拆任务；
- CodebaseAgent：分析代码；
- DeveloperAgent：生成 Patch；
- ReviewerAgent：审查 Patch；
- TesterAgent：执行测试；
- SummaryAgent：总结结果。

Agent 配置详见 `05_Agent配置与Prompt模板详细设计.md`。

### 3.2 Team

Team 是一组 Agent 的组合，描述“有哪些 Agent 参与”和“Team 级别执行策略”。

示例：

```text
Java Spring Boot Team
- PlannerAgent
- CodebaseAgent
- DeveloperAgent
- ReviewerAgent
- TesterAgent
- SummaryAgent
```

Team 不直接等于 Workflow。Team 更像“可用人员名单 + 协作模式”。

### 3.3 Workflow

Workflow 描述具体任务如何执行，例如代码修改流程：

```text
User Request
  ↓
PlannerAgent
  ↓
HumanApproval: approve_plan
  ↓
CodebaseAgent
  ↓
DeveloperAgent
  ↓
ReviewerAgent
  ↓
HumanApproval: approve_patch
  ↓
ApplyPatchTool
  ↓
TesterAgent
  ↓
SummaryAgent
```

Workflow 是任务状态机的来源。

### 3.4 Workflow Node

Workflow Node 是流程中的一个步骤。节点类型包括：

```text
agent             调用一个 Agent
team              调用一个 AutoGen Team
tool              调用一个工具
human_approval   等待用户确认
condition         条件分支
loop              循环节点
summary           汇总节点
```

### 3.5 Execution Mode

Execution Mode 表示当前任务按什么方式运行：

```text
auto       自动运行，遇到强制确认节点才停
semi_auto  每个关键节点后停一下，适合代码修改
manual     用户手动选择下一步或下一 Agent
```

---

## 4. Team Tab UI 控件映射

### 4.1 Team Tab 区域结构

Team Tab 推荐分为以下区域：

```text
Team Header
- Team Name
- Default Team 标记
- Team Mode
- Team Runtime Provider
- 操作按钮

Team Settings
- Max Turns
- Retry Limit
- Termination
- Execution Strategy
- Model Override

Agent Order
- Agent 节点列表
- 上移 / 下移 / 移除 / 添加

Templates
- Java Spring Team
- React Team
- Bug Fix Team
- Explain Code Team
```

### 4.2 Team 控件清单

| 控件 | 类型 | 字段 | 说明 | 事件 |
|---|---|---|---|---|
| Team Name | input | `team.name` | Team 显示名称 | `team.form.change` |
| Team Mode | select | `team.mode` | sequential / round_robin / selector / manual | `team.mode.change` |
| Runtime Provider | select | `team.runtimeProvider` | autogen / mock / maf / langgraph | `team.runtime.change` |
| Max Turns | input number | `team.limits.maxTurns` | Team 最大轮数 | `team.form.change` |
| Retry Limit | input number | `team.limits.retryLimit` | 失败最大重试次数 | `team.form.change` |
| Termination | select | `team.termination.type` | max_messages / text_mention / approval / custom | `team.termination.change` |
| Execution Strategy | select | `team.executionStrategy` | serial / parallel / hybrid | `team.strategy.change` |
| Model Override | select | `team.modelOverride.mode` | none / all / by_role | `team.modelOverride.change` |
| 新增 Team | button | - | 创建空 Team | `team.create` |
| 复制 Team | button | - | 复制当前 Team | `team.copy` |
| 删除 Team | button | - | 删除当前 Team | `team.delete` |
| 设为默认 | button | - | 设为当前 workspace 默认 Team | `team.setDefault` |
| 添加 Agent | button | - | 打开 Agent 选择弹窗 | `team.agent.add.open` |
| 移除选中 | button | - | 从 Team 移除 Agent | `team.agent.remove` |
| 上移 | button | - | 调整 Agent 顺序 | `team.agent.moveUp` |
| 下移 | button | - | 调整 Agent 顺序 | `team.agent.moveDown` |
| 保存 Team | button | - | 保存 Team 配置 | `team.save` |
| 恢复默认 | button | - | 恢复模板默认值 | `team.restoreDefault` |
| 使用模板 | button | - | 选择内置模板 | `team.template.apply` |

---

## 5. Workflow Tab UI 控件映射

### 5.1 Workflow Tab 区域结构

Workflow Tab 推荐分为：

```text
Workflow Header
- Workflow Name
- Description
- JSON Version
- Default 标记
- 保存 / 测试 / 导入 / 导出

Workflow Settings
- Workflow Type
- Failure Strategy
- Retry Limit
- Node Timeout
- Confirm Policy

Workflow Builder
- 节点列表
- 节点操作按钮

Node Detail
- 节点名称
- 节点类型
- 绑定 Agent / Tool
- 输入字段
- 输出字段
- 条件表达式
- 失败动作

JSON Preview
- Workflow JSON 预览
```

### 5.2 Workflow 控件清单

| 控件 | 类型 | 字段 | 说明 | 事件 |
|---|---|---|---|---|
| Workflow Name | input | `workflow.name` | 工作流名称 | `workflow.form.change` |
| Description | textarea | `workflow.description` | 工作流说明 | `workflow.form.change` |
| JSON Version | input | `workflow.version` | 配置版本 | `workflow.form.change` |
| Workflow Type | select | `workflow.type` | code_edit / bug_fix / test_generation / explain_code | `workflow.type.change` |
| Failure Strategy | select | `workflow.failureStrategy` | stop / retry / rollback / ask_user / jump_to_node | `workflow.failure.change` |
| Retry Limit | input number | `workflow.retryLimit` | 全局重试次数 | `workflow.form.change` |
| Node Timeout | input number | `workflow.nodeTimeoutSec` | 单节点超时秒数 | `workflow.form.change` |
| Confirm Policy | select | `workflow.confirmPolicy` | always / patch_only / command_only / none | `workflow.confirm.change` |
| 编辑节点 | button | `selectedNodeId` | 打开节点详情 | `workflow.node.edit` |
| 添加后置 | button | `selectedNodeId` | 在节点后添加新节点 | `workflow.node.addAfter` |
| 条件分支 | button | `selectedNodeId` | 为节点添加条件分支 | `workflow.node.addCondition` |
| 上移 | button | `selectedNodeId` | 节点上移 | `workflow.node.moveUp` |
| 下移 | button | `selectedNodeId` | 节点下移 | `workflow.node.moveDown` |
| 添加 Agent 节点 | button | - | 新增 agent 节点 | `workflow.node.addAgent` |
| 添加人工确认 | button | - | 新增 human_approval 节点 | `workflow.node.addHumanApproval` |
| 添加条件分支 | button | - | 新增 condition 节点 | `workflow.node.addCondition` |
| 删除选中节点 | button | `selectedNodeId` | 删除节点 | `workflow.node.delete` |
| 测试运行 | button | - | 使用 mock context 试跑 | `workflow.testRun` |
| 导入 JSON | button | - | 导入 workflow JSON | `workflow.importJson` |
| 导出 JSON | button | - | 导出 workflow JSON | `workflow.exportJson` |
| 设为默认 | button | - | 设为 workspace 默认 workflow | `workflow.setDefault` |
| 另存模板 | button | - | 保存为模板 | `workflow.saveAsTemplate` |
| 保存 Workflow | button | - | 保存当前配置 | `workflow.save` |

---

## 6. TeamConfig 数据结构

### 6.1 TypeScript 定义

```ts
export type TeamMode =
  | "sequential"
  | "round_robin"
  | "selector"
  | "manual"
  | "swarm"
  | "custom";

export type RuntimeProvider =
  | "autogen"
  | "microsoft_agent_framework"
  | "langgraph"
  | "mock";

export interface TeamConfig {
  id: string;
  name: string;
  description?: string;
  runtimeProvider: RuntimeProvider;
  mode: TeamMode;
  isDefault: boolean;
  agents: TeamAgentRef[];
  limits: TeamLimits;
  termination: TeamTerminationConfig;
  executionStrategy: TeamExecutionStrategy;
  modelOverride: TeamModelOverride;
  templates?: string[];
  metadata: ConfigMetadata;
}

export interface TeamAgentRef {
  agentId: string;
  alias?: string;
  order: number;
  enabled: boolean;
  roleInTeam: string;
  parallelGroup?: string;
  required?: boolean;
}

export interface TeamLimits {
  maxTurns: number;
  maxMessages: number;
  maxToolCalls: number;
  timeoutSec: number;
  retryLimit: number;
}

export interface TeamTerminationConfig {
  type: "max_messages" | "text_mention" | "approval" | "function_call" | "custom";
  maxMessages?: number;
  text?: string;
  functionName?: string;
  customExpression?: string;
}

export interface TeamExecutionStrategy {
  type: "serial" | "parallel" | "hybrid";
  parallelGroups?: Record<string, string[]>;
  joinPolicy?: "all_success" | "any_success" | "best_effort";
}

export interface TeamModelOverride {
  mode: "none" | "all" | "by_role" | "by_agent";
  model?: string;
  roleModels?: Record<string, string>;
  agentModels?: Record<string, string>;
}

export interface ConfigMetadata {
  createdAt: string;
  updatedAt: string;
  version: string;
  source: "user" | "template" | "system";
}
```

### 6.2 JSON 示例

```json
{
  "id": "team_java_spring_default",
  "name": "Java Spring Boot Team",
  "description": "面向 Java 企业后台项目的代码修改团队",
  "runtimeProvider": "autogen",
  "mode": "sequential",
  "isDefault": true,
  "agents": [
    {
      "agentId": "planner_agent",
      "order": 1,
      "enabled": true,
      "roleInTeam": "planner",
      "required": true
    },
    {
      "agentId": "codebase_agent",
      "order": 2,
      "enabled": true,
      "roleInTeam": "codebase",
      "required": true
    },
    {
      "agentId": "developer_agent",
      "order": 3,
      "enabled": true,
      "roleInTeam": "developer",
      "required": true
    },
    {
      "agentId": "reviewer_agent",
      "order": 4,
      "enabled": true,
      "roleInTeam": "reviewer",
      "required": true
    },
    {
      "agentId": "tester_agent",
      "order": 5,
      "enabled": true,
      "roleInTeam": "tester",
      "required": false
    }
  ],
  "limits": {
    "maxTurns": 16,
    "maxMessages": 64,
    "maxToolCalls": 80,
    "timeoutSec": 1800,
    "retryLimit": 2
  },
  "termination": {
    "type": "max_messages",
    "maxMessages": 64
  },
  "executionStrategy": {
    "type": "serial"
  },
  "modelOverride": {
    "mode": "by_role",
    "roleModels": {
      "planner": "gpt-4.1-mini",
      "developer": "gpt-4.1",
      "reviewer": "gpt-4.1"
    }
  },
  "metadata": {
    "createdAt": "2026-05-10T00:00:00+09:00",
    "updatedAt": "2026-05-10T00:00:00+09:00",
    "version": "1.0.0",
    "source": "template"
  }
}
```

---

## 7. WorkflowConfig 数据结构

### 7.1 TypeScript 定义

```ts
export type WorkflowType =
  | "code_edit"
  | "bug_fix"
  | "test_generation"
  | "explain_code"
  | "refactor"
  | "custom";

export type WorkflowNodeType =
  | "agent"
  | "team"
  | "tool"
  | "human_approval"
  | "condition"
  | "loop"
  | "summary";

export interface WorkflowConfig {
  id: string;
  name: string;
  description?: string;
  type: WorkflowType;
  version: string;
  isDefault: boolean;
  teamId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: WorkflowVariable[];
  policies: WorkflowPolicies;
  uiHints: WorkflowUiHints;
  metadata: ConfigMetadata;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  description?: string;
  agentId?: string;
  teamId?: string;
  toolName?: string;
  approvalType?: ApprovalType;
  inputMapping: Record<string, string>;
  outputMapping: Record<string, string>;
  condition?: WorkflowCondition;
  retryPolicy?: NodeRetryPolicy;
  timeoutSec?: number;
  required: boolean;
  enabled: boolean;
  ui: WorkflowNodeUi;
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  condition?: string;
  label?: string;
  priority: number;
}

export interface WorkflowCondition {
  expression: string;
  trueTarget?: string;
  falseTarget?: string;
}

export interface NodeRetryPolicy {
  maxRetries: number;
  retryOn: string[];
  backoffSec: number;
  onFailure: "stop" | "ask_user" | "jump_to_node" | "skip";
  failureTargetNodeId?: string;
}

export interface WorkflowPolicies {
  failureStrategy: "stop" | "retry" | "rollback" | "ask_user" | "jump_to_node";
  retryLimit: number;
  nodeTimeoutSec: number;
  confirmPolicy: "always" | "patch_only" | "command_only" | "none";
  requirePlanApproval: boolean;
  requirePatchApproval: boolean;
  requireCommandApproval: boolean;
  createCheckpointBeforePatch: boolean;
}

export interface WorkflowVariable {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  defaultValue?: unknown;
  description?: string;
}

export interface WorkflowNodeUi {
  x?: number;
  y?: number;
  color?: string;
  icon?: string;
  collapsed?: boolean;
}

export type ApprovalType =
  | "plan"
  | "patch"
  | "command"
  | "workflow_step"
  | "risk"
  | "custom";
```

### 7.2 Code Edit Workflow JSON 示例

```json
{
  "id": "workflow_code_edit_default",
  "name": "Code Edit Workflow",
  "description": "用于代码修改任务的标准工作流",
  "type": "code_edit",
  "version": "1.0.0",
  "isDefault": true,
  "teamId": "team_java_spring_default",
  "nodes": [
    {
      "id": "node_plan",
      "type": "agent",
      "name": "Plan",
      "agentId": "planner_agent",
      "inputMapping": {
        "userRequest": "$.task.userRequest",
        "workspaceSummary": "$.workspace.summary"
      },
      "outputMapping": {
        "plan": "$.plan"
      },
      "required": true,
      "enabled": true,
      "ui": { "icon": "list", "color": "orange" }
    },
    {
      "id": "node_approve_plan",
      "type": "human_approval",
      "name": "Approve Plan",
      "approvalType": "plan",
      "inputMapping": {
        "plan": "$.plan"
      },
      "outputMapping": {
        "planApproval": "$.approvals.plan"
      },
      "required": true,
      "enabled": true,
      "ui": { "icon": "check", "color": "yellow" }
    },
    {
      "id": "node_codebase",
      "type": "agent",
      "name": "Analyze Codebase",
      "agentId": "codebase_agent",
      "inputMapping": {
        "plan": "$.plan",
        "workspace": "$.workspace"
      },
      "outputMapping": {
        "codebaseSummary": "$.codebase.summary",
        "relatedFiles": "$.codebase.relatedFiles"
      },
      "required": true,
      "enabled": true,
      "ui": { "icon": "search", "color": "blue" }
    },
    {
      "id": "node_develop",
      "type": "agent",
      "name": "Generate Patch",
      "agentId": "developer_agent",
      "inputMapping": {
        "plan": "$.plan",
        "codebase": "$.codebase"
      },
      "outputMapping": {
        "patch": "$.patch.current"
      },
      "required": true,
      "enabled": true,
      "retryPolicy": {
        "maxRetries": 2,
        "retryOn": ["invalid_patch", "review_rejected", "test_failed"],
        "backoffSec": 0,
        "onFailure": "ask_user"
      },
      "ui": { "icon": "code", "color": "purple" }
    },
    {
      "id": "node_review",
      "type": "agent",
      "name": "Review Patch",
      "agentId": "reviewer_agent",
      "inputMapping": {
        "patch": "$.patch.current",
        "codebase": "$.codebase"
      },
      "outputMapping": {
        "review": "$.review.current"
      },
      "required": true,
      "enabled": true,
      "ui": { "icon": "shield", "color": "green" }
    },
    {
      "id": "node_review_condition",
      "type": "condition",
      "name": "Review Approved?",
      "inputMapping": {
        "review": "$.review.current"
      },
      "outputMapping": {},
      "condition": {
        "expression": "$.review.current.approved == true && $.review.current.riskLevel != 'critical'",
        "trueTarget": "node_approve_patch",
        "falseTarget": "node_develop"
      },
      "required": true,
      "enabled": true,
      "ui": { "icon": "branch", "color": "yellow" }
    },
    {
      "id": "node_approve_patch",
      "type": "human_approval",
      "name": "Approve Patch",
      "approvalType": "patch",
      "inputMapping": {
        "patch": "$.patch.current"
      },
      "outputMapping": {
        "patchApproval": "$.approvals.patch"
      },
      "required": true,
      "enabled": true,
      "ui": { "icon": "diff", "color": "yellow" }
    },
    {
      "id": "node_apply_patch",
      "type": "tool",
      "name": "Apply Patch",
      "toolName": "apply_patch",
      "inputMapping": {
        "patch": "$.patch.current"
      },
      "outputMapping": {
        "applyResult": "$.patch.applyResult"
      },
      "required": true,
      "enabled": true,
      "ui": { "icon": "save", "color": "green" }
    },
    {
      "id": "node_test",
      "type": "agent",
      "name": "Run Tests",
      "agentId": "tester_agent",
      "inputMapping": {
        "patch": "$.patch.current",
        "workspace": "$.workspace"
      },
      "outputMapping": {
        "testResult": "$.test.current"
      },
      "required": false,
      "enabled": true,
      "ui": { "icon": "beaker", "color": "blue" }
    },
    {
      "id": "node_summary",
      "type": "agent",
      "name": "Summary",
      "agentId": "summary_agent",
      "inputMapping": {
        "task": "$.task",
        "patch": "$.patch",
        "test": "$.test"
      },
      "outputMapping": {
        "summary": "$.summary"
      },
      "required": true,
      "enabled": true,
      "ui": { "icon": "file", "color": "gray" }
    }
  ],
  "edges": [
    { "id": "e1", "from": "node_plan", "to": "node_approve_plan", "priority": 1 },
    { "id": "e2", "from": "node_approve_plan", "to": "node_codebase", "priority": 1 },
    { "id": "e3", "from": "node_codebase", "to": "node_develop", "priority": 1 },
    { "id": "e4", "from": "node_develop", "to": "node_review", "priority": 1 },
    { "id": "e5", "from": "node_review", "to": "node_review_condition", "priority": 1 },
    { "id": "e6", "from": "node_review_condition", "to": "node_approve_patch", "condition": "true", "priority": 1 },
    { "id": "e7", "from": "node_review_condition", "to": "node_develop", "condition": "false", "priority": 2 },
    { "id": "e8", "from": "node_approve_patch", "to": "node_apply_patch", "priority": 1 },
    { "id": "e9", "from": "node_apply_patch", "to": "node_test", "priority": 1 },
    { "id": "e10", "from": "node_test", "to": "node_summary", "priority": 1 }
  ],
  "variables": [],
  "policies": {
    "failureStrategy": "ask_user",
    "retryLimit": 2,
    "nodeTimeoutSec": 300,
    "confirmPolicy": "patch_only",
    "requirePlanApproval": true,
    "requirePatchApproval": true,
    "requireCommandApproval": true,
    "createCheckpointBeforePatch": true
  },
  "uiHints": {
    "layout": "vertical_timeline",
    "showNodeDetails": true,
    "showJsonPreview": true
  },
  "metadata": {
    "createdAt": "2026-05-10T00:00:00+09:00",
    "updatedAt": "2026-05-10T00:00:00+09:00",
    "version": "1.0.0",
    "source": "template"
  }
}
```

---

## 8. Team 模式设计

### 8.1 sequential

顺序执行模式。适合 IDE 代码任务。

```text
Planner → Codebase → Developer → Reviewer → Tester
```

特点：

- 状态清晰；
- UI 容易展示；
- 方便中途确认；
- 方便失败回退；
- 最适合 MVP。

实现建议：

```text
sequential 不直接使用 AutoGen GroupChat
由 WorkflowRunner 逐个调用 AgentRuntimeAdapter.run_agent()
```

### 8.2 round_robin

轮询模式。可映射到 AutoGen `RoundRobinGroupChat`。

适用场景：

- 多 Agent 共同讨论方案；
- 设计评审；
- 文档讨论；
- 不要求强状态机的任务。

不建议用于首版代码修改，因为：

- Patch 生成边界不清晰；
- 用户确认点不好插入；
- 失败重试不如 WorkflowRunner 清晰。

### 8.3 selector

选择器模式。可映射到 AutoGen `SelectorGroupChat`。

适用场景：

- 需要模型判断下一步由哪个 Agent 执行；
- 任务类型复杂；
- 专家 Agent 较多。

风险：

- 成本更高；
- 可控性弱；
- UI 状态预测更难；
- 需要更强 termination condition。

### 8.4 manual

手动模式。

UI 每一步让用户选择：

```text
下一步让谁处理？
[Planner] [Developer] [Reviewer] [Tester]
```

适用场景：

- 调试 Agent；
- 高风险代码修改；
- 用户想强控制流程。

### 8.5 swarm / custom

预留模式，不作为 MVP 实现。

---

## 9. WorkflowRunner 设计

### 9.1 核心职责

WorkflowRunner 负责：

```text
1. 加载 TeamConfig 和 WorkflowConfig
2. 创建 TaskContext
3. 按节点顺序执行
4. 调用 AgentRuntimeAdapter
5. 调用 ToolGateway
6. 处理 HumanApproval
7. 处理条件分支
8. 处理重试和失败回退
9. 推送 WebSocket 事件
10. 保存每一步状态
```

### 9.2 Python 接口设计

```python
class WorkflowRunner:
    def __init__(
        self,
        config_store: ConfigStore,
        task_store: TaskStore,
        runtime_adapter: AgentRuntimeAdapter,
        tool_gateway: ToolGateway,
        approval_manager: ApprovalManager,
        ws_manager: WebSocketManager,
    ):
        ...

    async def start_task(self, request: TaskCreateRequest) -> TaskContext:
        ...

    async def resume_task(self, task_id: str) -> None:
        ...

    async def pause_task(self, task_id: str) -> None:
        ...

    async def cancel_task(self, task_id: str) -> None:
        ...

    async def run_node(self, ctx: TaskContext, node: WorkflowNode) -> NodeResult:
        ...
```

### 9.3 执行伪代码

```python
async def run_workflow(ctx: TaskContext, workflow: WorkflowConfig):
    current_node_id = workflow.start_node_id

    while current_node_id:
        if ctx.cancel_requested:
            await mark_cancelled(ctx)
            return

        if ctx.pause_requested:
            await mark_paused(ctx)
            return

        node = workflow.get_node(current_node_id)
        await emit_node_started(ctx, node)

        try:
            result = await run_node(ctx, node)
            await save_node_result(ctx, node, result)
            await emit_node_completed(ctx, node, result)
        except Exception as exc:
            result = await handle_node_failure(ctx, node, exc)
            if result.should_stop:
                await mark_failed(ctx, exc)
                return

        current_node_id = resolve_next_node(workflow, ctx, node, result)

    await mark_completed(ctx)
```

---

## 10. Node 执行设计

### 10.1 Agent Node

Agent Node 调用一个 Agent。

输入：

```json
{
  "nodeId": "node_develop",
  "agentId": "developer_agent",
  "input": {
    "plan": "$.plan",
    "codebase": "$.codebase"
  }
}
```

执行：

```python
result = await runtime_adapter.run_agent(
    agent_config=agent_config,
    context=agent_input,
    task_context=ctx,
)
```

输出写入：

```text
$.patch.current
```

### 10.2 Team Node

Team Node 调用一个 AutoGen Team 或其他 Runtime Team。

适合设计讨论，不建议 MVP 首版依赖。

```python
async for event in runtime_adapter.run_team(team_config, context):
    await ws_manager.emit(event)
```

### 10.3 Tool Node

Tool Node 调用工具，例如 `apply_patch`。

执行前：

1. 检查工具权限；
2. 判断是否需要用户确认；
3. 检查敏感路径；
4. 创建 checkpoint。

```python
result = await tool_gateway.call_tool(
    tool_name=node.tool_name,
    args=resolved_args,
    ctx=ctx,
)
```

### 10.4 HumanApproval Node

HumanApproval Node 不调用 LLM，而是暂停任务等待 UI。

流程：

```text
WorkflowRunner 到达人类确认节点
  ↓
创建 approval_request
  ↓
WebSocket 推送 approval.required
  ↓
任务状态变为 waiting_approval
  ↓
用户在 UI 点击 approve / reject / revise
  ↓
Extension 调用 AutoGen Service approval API
  ↓
WorkflowRunner 继续或回退
```

Approval 类型：

```text
plan
patch
command
risk
workflow_step
custom
```

### 10.5 Condition Node

Condition Node 根据 TaskContext 判断下一步。

示例：

```text
$.review.current.approved == true
```

MVP 可以先实现简单 JSONPath + 比较运算：

```text
==
!=
>
>=
<
<=
contains
exists
```

不要一开始支持任意 Python eval，避免安全问题。

---

## 11. Termination 设计

### 11.1 Team 层 Termination

Team 层 termination 用于 AutoGen Team 模式。

支持：

```text
max_messages
text_mention
function_call
approval
custom
```

AutoGenAdapter 映射：

```python
def build_termination(config: TeamTerminationConfig):
    if config.type == "max_messages":
        return MaxMessageTermination(config.maxMessages)
    if config.type == "text_mention":
        return TextMentionTermination(config.text)
    if config.type == "function_call":
        return FunctionCallTermination(config.functionName)
    ...
```

### 11.2 Workflow 层 Termination

Workflow 层 termination 由 WorkflowRunner 控制：

```text
任务完成
用户取消
节点失败且策略为 stop
达到 retry limit
达到 total timeout
人工确认被拒绝且无回退节点
```

---

## 12. Human Approval 详细设计

### 12.1 ApprovalRequest 结构

```ts
export interface ApprovalRequest {
  id: string;
  taskId: string;
  nodeId: string;
  type: ApprovalType;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  options: ApprovalOption[];
  status: "pending" | "approved" | "rejected" | "revised" | "expired";
  createdAt: string;
  expiresAt?: string;
}

export interface ApprovalOption {
  id: string;
  label: string;
  action: "approve" | "reject" | "revise" | "open_diff" | "apply_partial";
  style: "primary" | "secondary" | "danger";
}
```

### 12.2 Plan Approval

UI 按钮：

```text
接受计划
调整计划
保存为模板
```

API：

```http
POST /api/tasks/{taskId}/approvals/{approvalId}/respond
```

Payload：

```json
{
  "action": "approve",
  "feedback": ""
}
```

调整计划：

```json
{
  "action": "revise",
  "feedback": "不要修改 SecurityConfig，先只新增 Controller 和 Service"
}
```

### 12.3 Patch Approval

UI 按钮：

```text
查看 Diff
应用 Patch
拒绝并说明
部分应用
让 AI 解释
```

拒绝：

```json
{
  "action": "reject",
  "feedback": "项目已有 TokenService，不要新增 JwtUtil"
}
```

部分应用：

```json
{
  "action": "apply_partial",
  "selectedFiles": [
    "src/main/java/com/demo/AuthController.java",
    "src/main/java/com/demo/AuthService.java"
  ]
}
```

---

## 13. Team 与 Workflow API 设计

### 13.1 Team API

```http
GET    /api/teams
GET    /api/teams/{teamId}
POST   /api/teams
PUT    /api/teams/{teamId}
DELETE /api/teams/{teamId}
POST   /api/teams/{teamId}/copy
POST   /api/teams/{teamId}/set-default
POST   /api/teams/{teamId}/restore-default
POST   /api/teams/{teamId}/agents
DELETE /api/teams/{teamId}/agents/{agentId}
POST   /api/teams/{teamId}/agents/{agentId}/move
```

### 13.2 Workflow API

```http
GET    /api/workflows
GET    /api/workflows/{workflowId}
POST   /api/workflows
PUT    /api/workflows/{workflowId}
DELETE /api/workflows/{workflowId}
POST   /api/workflows/{workflowId}/copy
POST   /api/workflows/{workflowId}/set-default
POST   /api/workflows/{workflowId}/test-run
POST   /api/workflows/import
GET    /api/workflows/{workflowId}/export
POST   /api/workflows/{workflowId}/nodes
PUT    /api/workflows/{workflowId}/nodes/{nodeId}
DELETE /api/workflows/{workflowId}/nodes/{nodeId}
POST   /api/workflows/{workflowId}/nodes/{nodeId}/move
```

---

## 14. Webview 消息协议

### 14.1 Team 消息

```ts
send("team.save", { team: currentTeam });
send("team.delete", { teamId });
send("team.setDefault", { teamId });
send("team.agent.add", { teamId, agentId });
send("team.agent.remove", { teamId, agentId });
send("team.agent.move", { teamId, agentId, direction: "up" });
send("team.template.apply", { templateId });
```

### 14.2 Workflow 消息

```ts
send("workflow.save", { workflow: currentWorkflow });
send("workflow.testRun", { workflowId, mockContext });
send("workflow.importJson", { jsonText });
send("workflow.exportJson", { workflowId });
send("workflow.setDefault", { workflowId });
send("workflow.node.edit", { workflowId, nodeId, patch });
send("workflow.node.addAgent", { workflowId, afterNodeId, agentId });
send("workflow.node.addHumanApproval", { workflowId, afterNodeId, approvalType: "patch" });
send("workflow.node.addCondition", { workflowId, afterNodeId, condition });
send("workflow.node.delete", { workflowId, nodeId });
```

---

## 15. WebSocket 事件设计

WorkflowRunner 应推送：

```json
{
  "type": "workflow.started",
  "taskId": "task_001",
  "workflowId": "workflow_code_edit_default"
}
```

```json
{
  "type": "workflow.node.started",
  "taskId": "task_001",
  "nodeId": "node_develop",
  "nodeName": "Generate Patch"
}
```

```json
{
  "type": "workflow.node.completed",
  "taskId": "task_001",
  "nodeId": "node_develop",
  "durationMs": 12800
}
```

```json
{
  "type": "workflow.node.failed",
  "taskId": "task_001",
  "nodeId": "node_test",
  "error": {
    "code": "COMMAND_FAILED",
    "message": "mvn test failed"
  }
}
```

```json
{
  "type": "approval.required",
  "taskId": "task_001",
  "approvalId": "approval_patch_001",
  "approvalType": "patch",
  "title": "DeveloperAgent 准备应用 Patch"
}
```

```json
{
  "type": "workflow.completed",
  "taskId": "task_001",
  "summary": "任务完成，修改 5 个文件，测试通过"
}
```

---

## 16. 内置 Team 模板

### 16.1 Java Spring Boot Team

```text
PlannerAgent
CodebaseAgent
DeveloperAgent
ReviewerAgent
TesterAgent
SummaryAgent
```

默认 Workflow：`code_edit`

### 16.2 Bug Fix Team

```text
BugAnalyzerAgent
CodebaseAgent
DeveloperAgent
TesterAgent
ReviewerAgent
SummaryAgent
```

默认 Workflow：`bug_fix`

### 16.3 Test Generation Team

```text
CodebaseAgent
TesterAgent
ReviewerAgent
SummaryAgent
```

默认 Workflow：`test_generation`

### 16.4 Explain Code Team

```text
CodebaseAgent
ExplainerAgent
SummaryAgent
```

默认 Workflow：`explain_code`

---

## 17. 内置 Workflow 模板

### 17.1 Code Edit Workflow

```text
Plan → Approve Plan → Analyze Codebase → Generate Patch → Review Patch → Approve Patch → Apply Patch → Test → Summary
```

### 17.2 Bug Fix Workflow

```text
Analyze Error → Search Related Code → Generate Fix Patch → Review → Approve Patch → Apply → Run Test → If Failed Back To Generate Fix → Summary
```

### 17.3 Test Generation Workflow

```text
Analyze Code → Generate Test Patch → Review Test → Approve Patch → Apply → Run Test → Summary
```

### 17.4 Explain Code Workflow

```text
Analyze Context → Read Related Files → Explain Architecture → Explain Current File → Suggest Risks
```

---

## 18. 存储设计

### 18.1 文件存储路径

建议：

```text
<globalStorageUri>/config/teams.json
<globalStorageUri>/config/workflows.json
<globalStorageUri>/config/workflow_templates.json
```

Workspace 级覆盖：

```text
<workspaceStorage>/agent-ide/teams.override.json
<workspaceStorage>/agent-ide/workflows.override.json
```

### 18.2 TeamStore 接口

```ts
interface TeamStore {
  listTeams(): Promise<TeamConfig[]>;
  getTeam(id: string): Promise<TeamConfig>;
  saveTeam(team: TeamConfig): Promise<void>;
  deleteTeam(id: string): Promise<void>;
  setDefaultTeam(id: string): Promise<void>;
}
```

### 18.3 WorkflowStore 接口

```ts
interface WorkflowStore {
  listWorkflows(): Promise<WorkflowConfig[]>;
  getWorkflow(id: string): Promise<WorkflowConfig>;
  saveWorkflow(workflow: WorkflowConfig): Promise<void>;
  deleteWorkflow(id: string): Promise<void>;
  setDefaultWorkflow(id: string): Promise<void>;
  importWorkflow(json: string): Promise<WorkflowConfig>;
  exportWorkflow(id: string): Promise<string>;
}
```

---

## 19. 校验规则

### 19.1 Team 校验

保存 Team 前必须校验：

```text
1. Team name 不为空
2. agents 至少一个
3. agentId 必须存在
4. order 不重复
5. maxTurns > 0
6. retryLimit >= 0
7. 默认 Team 同一 scope 只能一个
8. selector 模式必须有 selector model 或 selector prompt
```

### 19.2 Workflow 校验

保存 Workflow 前必须校验：

```text
1. Workflow name 不为空
2. nodes 至少一个
3. node id 唯一
4. edge from/to 必须存在
5. agent node 必须绑定 agentId
6. tool node 必须绑定 toolName
7. human_approval 必须有 approvalType
8. 不允许无终止循环
9. condition expression 不允许任意代码执行
10. outputMapping 目标路径不能冲突，除非显式 allowOverride
```

---

## 20. 错误处理

| 错误码 | 场景 | UI 展示 |
|---|---|---|
| TEAM_AGENT_NOT_FOUND | Team 引用了不存在的 Agent | 红色 toast，定位到 Team 页 |
| TEAM_INVALID_MODE | Team mode 不支持 | 阻止保存 |
| WORKFLOW_NODE_NOT_FOUND | Edge 指向不存在节点 | 节点红色标记 |
| WORKFLOW_CYCLE_DETECTED | 存在无条件循环 | 阻止保存 |
| WORKFLOW_CONDITION_INVALID | 条件表达式错误 | 展示表达式错误 |
| APPROVAL_TIMEOUT | 人工确认超时 | Run 页确认卡片变为 expired |
| NODE_TIMEOUT | 节点执行超时 | 时间线节点失败 |
| RETRY_LIMIT_EXCEEDED | 超过重试次数 | 进入失败处理策略 |

---

## 21. Codex 开发任务拆分

### Task 1：实现 TeamConfig 类型与默认模板

修改文件：

```text
src/types/team.ts
src/config/defaultTeams.ts
```

验收：

```text
能返回 Java Spring Boot Team 默认配置
类型校验通过
```

### Task 2：实现 WorkflowConfig 类型与默认模板

修改文件：

```text
src/types/workflow.ts
src/config/defaultWorkflows.ts
```

验收：

```text
Code Edit Workflow JSON 完整
nodes / edges 校验通过
```

### Task 3：实现 TeamStore

修改文件：

```text
src/storage/teamStore.ts
```

验收：

```text
list / get / save / delete / setDefault 可用
```

### Task 4：实现 WorkflowStore

修改文件：

```text
src/storage/workflowStore.ts
```

验收：

```text
list / get / save / import / export 可用
```

### Task 5：实现 Team Tab 事件处理

修改文件：

```text
src/webview/messageHandlers/teamHandlers.ts
```

验收：

```text
team.save / team.delete / team.setDefault / team.agent.move 能更新 UI
```

### Task 6：实现 Workflow Tab 事件处理

修改文件：

```text
src/webview/messageHandlers/workflowHandlers.ts
```

验收：

```text
workflow.save / workflow.importJson / workflow.exportJson / workflow.testRun 能正常返回
```

### Task 7：实现 Python WorkflowRunner 基础版

修改文件：

```text
agent-service/workflows/runner.py
agent-service/workflows/models.py
```

验收：

```text
能按 Code Edit Workflow 顺序执行 mock agent node
能遇到 human_approval 暂停
```

### Task 8：实现 ApprovalManager

修改文件：

```text
agent-service/approvals/manager.py
agent-service/api/approvals.py
```

验收：

```text
approval.required 可通过 WebSocket 推送
UI approve 后 WorkflowRunner 继续
```

### Task 9：实现 Condition Node

修改文件：

```text
agent-service/workflows/condition.py
```

验收：

```text
支持 JSONPath 简单条件判断
不允许 eval 任意 Python
```

---

## 22. 自检清单

### 22.1 Team 设计自检

- [x] 是否区分 Agent、Team、Workflow？
- [x] 是否支持新增、复制、删除、设默认 Team？
- [x] 是否支持 Agent 顺序调整？
- [x] 是否支持 sequential / round_robin / selector / manual？
- [x] 是否保留 Runtime Provider 字段，避免绑定 AutoGen？
- [x] 是否包含 Team 级别限制和 termination？

### 22.2 Workflow 设计自检

- [x] 是否支持 agent / tool / human_approval / condition 节点？
- [x] 是否支持 Plan Approval 和 Patch Approval？
- [x] 是否支持失败回退 DeveloperAgent？
- [x] 是否支持节点输入输出映射？
- [x] 是否支持导入 / 导出 JSON？
- [x] 是否支持测试运行？
- [x] 是否避免任意代码 eval？

### 22.3 AutoGen 解耦自检

- [x] UI 配置是否不直接依赖 AutoGen 类名？
- [x] 是否通过 RuntimeProvider 和 Adapter 映射 AutoGen？
- [x] 是否避免把 IDE 业务流程完全交给 GroupChat？
- [x] 是否保留后期迁移到其他 Runtime 的可能？

### 22.4 联调自检

- [x] Webview 消息是否覆盖 Team 和 Workflow 所有按钮？
- [x] API 是否覆盖 Team / Workflow CRUD？
- [x] WebSocket 是否覆盖 workflow.node.started / completed / failed？
- [x] Approval 是否有 request / respond 完整链路？

---

## 23. 本文结论

Team 与 Workflow 模块是整个多 Agent IDE 的核心控制层。

设计原则是：

```text
Team 管人员
Workflow 管流程
WorkflowRunner 管执行
AutoGenAdapter 管 Agent 调用
ToolGateway 管 IDE 能力
UI 管可视化控制和确认
```

首版建议：

```text
只实现 sequential + Code Edit Workflow
RoundRobin / Selector 保留配置入口
等 MVP 稳定后再开放高级模式
```

这样可以同时满足：

- AutoGen 多 Agent 能力；
- VS Code IDE 可控性；
- Patch / Diff / Terminal 安全确认；
- 后期 Runtime 可替换；
- UI 时间线可解释；
- 任务状态可恢复。
