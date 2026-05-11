你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 3C：实现 Team / Workflow 配置的本地保存、加载和基础管理。

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

本次只做 Team / Workflow 配置保存和加载。
不要接 AutoGen。
不要启动 Python。
不要接 WebSocket。
不要实现真实 Workflow 执行。
不要实现真实工具调用。
不要实现 Tools 配置保存。

============================================================
一、本次目标
============================================================

实现 Team / Workflow 配置的本地保存、加载和基础管理。

必须完成：

1. ConfigStore 增加 Team 配置读写方法。
2. ConfigStore 增加 Workflow 配置读写方法。
3. 实现 teams.load。
4. 实现 team.save。
5. 实现 team.create。
6. 实现 team.copy。
7. 实现 team.delete。
8. 实现 team.setDefault。
9. 实现 team.restoreDefault。
10. team.addAgent / team.removeAgent / team.moveAgentUp / team.moveAgentDown 可以先做基础逻辑或 placeholder，但不能报错。
11. 实现 workflows.load。
12. 实现 workflow.save。
13. 实现 workflow.saveAsTemplate。
14. 实现 workflow.setDefault。
15. workflow.testRun / workflow.exportJson / workflow.importJson 暂时 placeholder。
16. workflow.node.* 暂时 placeholder，不做真实节点编辑。
17. Webview 初始化时能加载 Team / Workflow 列表。
18. Team 页可以显示和回填当前 Team。
19. Workflow 页可以显示和回填当前 Workflow。
20. 修改 Team / Workflow 后保存，刷新或重新打开 Webview 后配置仍然存在。
21. npm run compile 通过。

本次不要做：
- 真实 AutoGen Team
- 真实 WorkflowRunner 执行
- Python 服务
- WebSocket
- 文件工具
- Diff / Patch
- Git
- Terminal
- Tools 配置保存

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
8. docs/06_Team与Workflow编排详细设计.md
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
8. 新增 src/types/team.ts
9. 新增 src/types/workflow.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. agent-service 目录
4. src/tools 目录
5. src/runtime 目录
6. config 目录

============================================================
四、TeamConfig 数据结构要求
============================================================

Team 配置至少包含这些字段：

{
  "id": "java_spring_team",
  "name": "Java Spring Boot Team",
  "mode": "sequential",
  "maxTurns": 20,
  "retryLimit": 2,
  "termination": "workflow_end",
  "executionPolicy": "sequential",
  "modelOverride": "none",
  "default": true,
  "enabled": true,
  "agents": [
    {
      "agentId": "planner_agent",
      "name": "PlannerAgent",
      "role": "planner",
      "order": 1,
      "enabled": true
    }
  ]
}

字段说明：

- id：内部唯一 id，不要用中文。
- name：页面显示名称。
- mode：sequential / round_robin / selector / manual。
- maxTurns：最大总轮数。
- retryLimit：失败重试次数。
- termination：终止条件。
- executionPolicy：执行策略。
- modelOverride：Team 级模型覆盖策略。
- default：是否默认 Team。
- agents：Team 中的 Agent 顺序。

============================================================
五、默认 Teams 要求
============================================================

ConfigStore 必须提供默认 Teams。

默认至少 4 个：

1. Java Spring Boot Team
2. Frontend React Team
3. Explain Code Team
4. Bug Fix Team

默认 id 建议：

- java_spring_team
- frontend_react_team
- explain_code_team
- bug_fix_team

------------------------------------------------------------
1. Java Spring Boot Team
------------------------------------------------------------

id = java_spring_team
name = Java Spring Boot Team
mode = sequential
maxTurns = 20
retryLimit = 2
termination = workflow_end
executionPolicy = sequential
modelOverride = none
default = true
enabled = true

agents 顺序：

1. planner_agent / PlannerAgent / planner
2. codebase_agent / CodebaseAgent / codebase
3. developer_agent / DeveloperAgent / developer
4. reviewer_agent / ReviewerAgent / reviewer
5. tester_agent / TesterAgent / tester
6. summary_agent / SummaryAgent / summary

------------------------------------------------------------
2. Frontend React Team
------------------------------------------------------------

id = frontend_react_team
name = Frontend React Team
mode = sequential
maxTurns = 20
retryLimit = 2
termination = workflow_end
executionPolicy = sequential
modelOverride = none
default = false
enabled = true

agents 顺序可以复用默认 6 个 Agent。

------------------------------------------------------------
3. Explain Code Team
------------------------------------------------------------

id = explain_code_team
name = Explain Code Team
mode = sequential
maxTurns = 10
retryLimit = 1
termination = workflow_end
executionPolicy = sequential
modelOverride = none
default = false
enabled = true

agents 顺序建议：

1. codebase_agent
2. summary_agent

------------------------------------------------------------
4. Bug Fix Team
------------------------------------------------------------

id = bug_fix_team
name = Bug Fix Team
mode = sequential
maxTurns = 24
retryLimit = 3
termination = workflow_end
executionPolicy = sequential
modelOverride = none
default = false
enabled = true

agents 顺序：

1. planner_agent
2. codebase_agent
3. developer_agent
4. reviewer_agent
5. tester_agent
6. summary_agent

============================================================
六、WorkflowConfig 数据结构要求
============================================================

Workflow 配置至少包含这些字段：

{
  "id": "code_edit",
  "name": "Code Edit Workflow",
  "description": "用于代码修改任务",
  "type": "code_edit",
  "failureStrategy": "fallback_to_developer",
  "retryLimit": 2,
  "nodeTimeoutSeconds": 180,
  "confirmPolicy": "confirm_plan_and_patch",
  "jsonVersion": 1,
  "default": true,
  "enabled": true,
  "nodes": [
    {
      "id": "planner",
      "name": "PlannerAgent",
      "type": "agent",
      "agentId": "planner_agent",
      "inputFields": ["userRequest", "context"],
      "outputFields": ["plan"],
      "onFailure": "retry",
      "maxRetries": 1,
      "timeoutSeconds": 120
    }
  ]
}

字段说明：

- id：内部唯一 id。
- name：页面显示名称。
- type：code_edit / bug_fix / test_generation / explain_code / custom。
- failureStrategy：失败策略。
- retryLimit：整体重试次数。
- nodeTimeoutSeconds：默认节点超时。
- confirmPolicy：确认策略。
- jsonVersion：配置版本。
- default：是否默认 Workflow。
- nodes：节点数组。

============================================================
七、默认 Workflows 要求
============================================================

ConfigStore 必须提供默认 Workflows。

默认至少 4 个：

1. Code Edit Workflow
2. Bug Fix Workflow
3. Test Generation Workflow
4. Explain Code Workflow

默认 id 建议：

- code_edit
- bug_fix
- test_generation
- explain_code

------------------------------------------------------------
1. Code Edit Workflow
------------------------------------------------------------

id = code_edit
name = Code Edit Workflow
type = code_edit
failureStrategy = fallback_to_developer
retryLimit = 2
nodeTimeoutSeconds = 180
confirmPolicy = confirm_plan_and_patch
jsonVersion = 1
default = true
enabled = true

节点顺序：

1. planner
   - type = agent
   - agentId = planner_agent

2. plan_approval
   - type = human_approval
   - name = Plan Approval

3. codebase
   - type = agent
   - agentId = codebase_agent

4. developer
   - type = agent
   - agentId = developer_agent

5. reviewer
   - type = agent
   - agentId = reviewer_agent

6. patch_approval
   - type = human_approval
   - name = Patch Approval

7. tester
   - type = agent
   - agentId = tester_agent

8. summary
   - type = agent
   - agentId = summary_agent

------------------------------------------------------------
2. Bug Fix Workflow
------------------------------------------------------------

id = bug_fix
name = Bug Fix Workflow
type = bug_fix
failureStrategy = fallback_to_developer
retryLimit = 3
nodeTimeoutSeconds = 180
confirmPolicy = confirm_plan_and_patch
default = false
enabled = true

节点可以与 code_edit 类似。

------------------------------------------------------------
3. Test Generation Workflow
------------------------------------------------------------

id = test_generation
name = Test Generation Workflow
type = test_generation
failureStrategy = retry_current_node
retryLimit = 2
nodeTimeoutSeconds = 180
confirmPolicy = always_confirm_patch
default = false
enabled = true

节点建议：

1. codebase
2. developer
3. reviewer
4. patch_approval
5. tester
6. summary

------------------------------------------------------------
4. Explain Code Workflow
------------------------------------------------------------

id = explain_code
name = Explain Code Workflow
type = explain_code
failureStrategy = stop
retryLimit = 1
nodeTimeoutSeconds = 120
confirmPolicy = no_confirm
default = false
enabled = true

节点建议：

1. codebase
2. summary

============================================================
八、ConfigStore 要求
============================================================

修改 src/storage/ConfigStore.ts。

增加 Team 方法：

1. loadTeams(): Promise<TeamConfig[]>
2. saveTeams(teams: TeamConfig[]): Promise<void>
3. getDefaultTeams(): TeamConfig[]
4. saveTeam(team: TeamConfig): Promise<TeamConfig[]>
5. createTeam(partial?: Partial<TeamConfig>): Promise<TeamConfig[]>
6. copyTeam(teamId: string): Promise<TeamConfig[]>
7. deleteTeam(teamId: string): Promise<TeamConfig[]>
8. setDefaultTeam(teamId: string): Promise<TeamConfig[]>
9. resetTeams(): Promise<TeamConfig[]>

保存 key：

autogenAgent.teams

要求：

1. 如果没有保存过 Teams，loadTeams 返回 getDefaultTeams。
2. saveTeams 使用 context.globalState.update。
3. saveTeam 根据 id 更新现有 Team。
4. 如果 id 不存在，则追加。
5. createTeam 创建 Custom Team。
6. copyTeam 复制指定 Team，生成新 id。
7. deleteTeam 删除指定 Team，但不要允许删除最后一个 Team。
8. setDefaultTeam 把指定 Team default 设为 true，其他 Team 设为 false。
9. resetTeams 恢复默认 Teams。

增加 Workflow 方法：

1. loadWorkflows(): Promise<WorkflowConfig[]>
2. saveWorkflows(workflows: WorkflowConfig[]): Promise<void>
3. getDefaultWorkflows(): WorkflowConfig[]
4. saveWorkflow(workflow: WorkflowConfig): Promise<WorkflowConfig[]>
5. createWorkflow(partial?: Partial<WorkflowConfig>): Promise<WorkflowConfig[]>
6. copyWorkflow(workflowId: string): Promise<WorkflowConfig[]>
7. deleteWorkflow(workflowId: string): Promise<WorkflowConfig[]>
8. setDefaultWorkflow(workflowId: string): Promise<WorkflowConfig[]>
9. resetWorkflows(): Promise<WorkflowConfig[]>

保存 key：

autogenAgent.workflows

要求：

1. 如果没有保存过 Workflows，loadWorkflows 返回 getDefaultWorkflows。
2. saveWorkflows 使用 context.globalState.update。
3. saveWorkflow 根据 id 更新现有 Workflow。
4. 如果 id 不存在，则追加。
5. createWorkflow 创建 Custom Workflow。
6. copyWorkflow 复制指定 Workflow，生成新 id。
7. deleteWorkflow 删除指定 Workflow，但不要允许删除最后一个 Workflow。
8. setDefaultWorkflow 把指定 Workflow default 设为 true，其他 Workflow 设为 false。
9. resetWorkflows 恢复默认 Workflows。

============================================================
九、MessageDispatcher 要求
============================================================

修改 src/webview/MessageDispatcher.ts。

Team action 改为真实配置操作：

必须实现：

1. teams.load
2. team.save
3. team.create
4. team.copy
5. team.delete
6. team.setDefault
7. team.restoreDefault

这些可以先 placeholder 或基础逻辑：
8. team.addAgent
9. team.removeAgent
10. team.moveAgentUp
11. team.moveAgentDown
12. team.useTemplate

Workflow action 改为真实配置操作：

必须实现：

1. workflows.load
2. workflow.save
3. workflow.saveAsTemplate
4. workflow.setDefault

这些暂时 placeholder：
5. workflow.testRun
6. workflow.exportJson
7. workflow.importJson
8. workflow.node.select
9. workflow.node.edit
10. workflow.node.addAfter
11. workflow.node.moveUp
12. workflow.node.moveDown
13. workflow.node.delete
14. workflow.node.addAgent
15. workflow.node.addHumanApproval
16. workflow.node.addCondition

------------------------------------------------------------
1. teams.load
------------------------------------------------------------

返回：

{
  "ok": true,
  "type": "teams.load.result",
  "requestId": "...",
  "payload": {
    "teams": [...]
  }
}

------------------------------------------------------------
2. team.save
------------------------------------------------------------

从 message.payload.fields 读取 Team 表单。

字段映射：

team.id -> id
team.name -> name
team.mode -> mode
team.maxTurns -> maxTurns
team.retryLimit -> retryLimit
team.termination -> termination
team.executionPolicy -> executionPolicy
team.modelOverride -> modelOverride

如果 fields 里没有 team.id，则根据 team.name 生成 id。

如果当前表单没有 agents 详细数组，可以保留已有 Team 的 agents。
如果是新 Team，就使用默认 6 个 Agent 顺序。

保存后返回：

{
  "ok": true,
  "type": "team.save.result",
  "requestId": "...",
  "payload": {
    "message": "Team saved",
    "teams": [...],
    "team": {...}
  }
}

------------------------------------------------------------
3. team.create
------------------------------------------------------------

创建一个新的 Custom Team。

默认值：

name = Custom Team
mode = sequential
maxTurns = 20
retryLimit = 2
termination = workflow_end
executionPolicy = sequential
modelOverride = none
default = false
enabled = true
agents = 默认 6 个 Agent 顺序

返回 teams 和新 team。

------------------------------------------------------------
4. team.copy
------------------------------------------------------------

根据当前 selected team id 复制。

如果 payload 中没有 teamId，可以从 fields["team.id"] 取。
如果都没有，复制 java_spring_team。

复制后：
- id 加 _copy 或 _copy_数字
- name 加 Copy
- default = false

返回 teams 和新 team。

------------------------------------------------------------
5. team.delete
------------------------------------------------------------

删除当前 team id。
如果没有 id，返回错误：
TEAM_ID_REQUIRED

如果只剩一个 Team，不允许删除，返回错误：
CANNOT_DELETE_LAST_TEAM

------------------------------------------------------------
6. team.setDefault
------------------------------------------------------------

根据当前 team id 设置默认 Team。
如果没有 id，返回 TEAM_ID_REQUIRED。

返回 teams 和 team。

------------------------------------------------------------
7. team.restoreDefault
------------------------------------------------------------

恢复默认 Teams。

返回默认 teams。

------------------------------------------------------------
8. workflows.load
------------------------------------------------------------

返回：

{
  "ok": true,
  "type": "workflows.load.result",
  "requestId": "...",
  "payload": {
    "workflows": [...]
  }
}

------------------------------------------------------------
9. workflow.save
------------------------------------------------------------

从 message.payload.fields 读取 Workflow 表单。

字段映射：

workflow.id -> id
workflow.name -> name
workflow.description -> description
workflow.type -> type
workflow.failureStrategy -> failureStrategy
workflow.retryLimit -> retryLimit
workflow.nodeTimeoutSeconds -> nodeTimeoutSeconds
workflow.confirmPolicy -> confirmPolicy
workflow.jsonVersion -> jsonVersion
workflow.jsonPreview -> jsonPreview

如果 fields 里没有 workflow.id，则根据 workflow.name 生成 id。

如果 workflow.jsonPreview 是合法 JSON，并且里面有 nodes，可以尝试使用其中 nodes。
如果 JSON 不合法，不要报错阻断保存，可以保留已有 nodes 或默认 nodes，并在返回 payload.warning 里提示：
Invalid workflow.jsonPreview ignored

保存后返回：

{
  "ok": true,
  "type": "workflow.save.result",
  "requestId": "...",
  "payload": {
    "message": "Workflow saved",
    "workflows": [...],
    "workflow": {...},
    "warning": "..."
  }
}

------------------------------------------------------------
10. workflow.saveAsTemplate
------------------------------------------------------------

复制当前 Workflow 作为新模板。

name 加 Template
id 加 _template 或 _template_数字
default = false

返回 workflows 和新 workflow。

------------------------------------------------------------
11. workflow.setDefault
------------------------------------------------------------

根据当前 workflow id 设置默认 Workflow。
如果没有 id，返回 WORKFLOW_ID_REQUIRED。

返回 workflows 和 workflow。

------------------------------------------------------------
12. 其他 Team / Workflow action
------------------------------------------------------------

暂时 placeholder success，不实现真实逻辑。

------------------------------------------------------------
13. 未知 action
------------------------------------------------------------

继续返回 UNKNOWN_ACTION。

不要破坏 Run / Settings / Agents / Tools 已有 action。

============================================================
十、Webview 初始化和回填要求
============================================================

修改 media/webview-bridge.js。

必须实现：

1. DOMContentLoaded 后自动发送 teams.load。
2. DOMContentLoaded 后自动发送 workflows.load。
3. 收到 teams.load.result 后渲染 Team 列表或当前 Team。
4. 收到 workflows.load.result 后渲染 Workflow 列表或当前 Workflow。
5. 点击 Team 卡片后，回填该 Team 到 Team 表单。
6. 点击 Workflow 卡片后，回填该 Workflow 到 Workflow 表单。
7. 收到 team.save.result 后，刷新 Team 列表，并回填保存后的 Team。
8. 收到 team.create.result 后，刷新 Team 列表，并回填新 Team。
9. 收到 team.copy.result 后，刷新 Team 列表，并回填复制 Team。
10. 收到 team.delete.result 后，刷新 Team 列表，并回填第一个 Team。
11. 收到 team.restoreDefault.result 后，刷新 Team 列表，并回填默认 Team。
12. 收到 workflow.save.result 后，刷新 Workflow 列表，并回填保存后的 Workflow。
13. 收到 workflow.saveAsTemplate.result 后，刷新 Workflow 列表，并回填新 Workflow。
14. 收到 workflow.setDefault.result 后，刷新 Workflow 列表。
15. 如果返回 warning，要写入 event-log。

如果当前 webview-bridge.js 已经有统一消息处理，不要重写整个文件，只增加 Team / Workflow 相关处理。

============================================================
十一、HTML 要求
============================================================

检查 media/webview.html 的 Team 页。

如果缺少 team.id 字段，需要增加隐藏字段：

<input type="hidden" data-field="team.id">

Team 页必须有 Team 列表容器：

<div id="team-list"></div>

如果当前已有类似容器，可以复用。

Team 表单必须至少包含这些 data-field：

team.id
team.name
team.mode
team.maxTurns
team.retryLimit
team.termination
team.executionPolicy
team.modelOverride

检查 Workflow 页。

如果缺少 workflow.id 字段，需要增加隐藏字段：

<input type="hidden" data-field="workflow.id">

Workflow 页必须有 Workflow 列表容器：

<div id="workflow-list"></div>

Workflow 表单必须至少包含这些 data-field：

workflow.id
workflow.name
workflow.description
workflow.type
workflow.failureStrategy
workflow.retryLimit
workflow.nodeTimeoutSeconds
workflow.confirmPolicy
workflow.jsonVersion
workflow.jsonPreview

如果字段已存在，不要重复创建。
如果缺失，只补 Team / Workflow 页缺失字段。

============================================================
十二、前端渲染要求
============================================================

Team 列表卡片显示：

1. name
2. mode
3. maxTurns
4. default / custom
5. agents 数量

当前选中 Team 要有 active 样式。

点击 Team 卡片：

1. 设置 selectedTeamId。
2. applyFields() 回填表单。
3. 日志显示：
   selected team: Java Spring Boot Team

Workflow 列表卡片显示：

1. name
2. type
3. confirmPolicy
4. default / custom
5. nodes 数量

当前选中 Workflow 要有 active 样式。

点击 Workflow 卡片：

1. 设置 selectedWorkflowId。
2. applyFields() 回填表单。
3. 如果 workflow 有 nodes，更新节点列表展示。
4. 如果 workflow 有 jsonPreview 或可以生成 JSON，回填 workflow.jsonPreview。
5. 日志显示：
   selected workflow: Code Edit Workflow

============================================================
十三、不要做的事情
============================================================

本次不要做：

1. 不要接 AutoGen。
2. 不要启动 Python。
3. 不要接 WebSocket。
4. 不要真实执行 Workflow。
5. 不要真实调用模型。
6. 不要保存 Tools 配置。
7. 不要实现真实 team.addAgent / removeAgent / moveAgentUp / moveAgentDown 复杂逻辑。
8. 不要实现真实 workflow.node.* 编辑逻辑。
9. 不要实现文件工具。
10. 不要实现 Diff/Patch。
11. 不要实现 Terminal。
12. 不要实现 Git。
13. 不要修改 Demo / prototype。
14. 不要修改 docs。

============================================================
十四、验收