你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 3B：实现 Agents 页配置的本地保存、加载和基础管理。

当前上下文：
Task 1 已完成：
- VS Code 插件可以编译和启动
- AutoGen Control Webview 可以打开
- Webview ⇄ Extension 的基础 placeholder 链路可用

Task 2A～2F 已完成：
- Webview 已经有 6 个 Tab：Run / Agents / Team / Tools / Workflow / Settings
- 六个 Tab 可以切换
- Run / Agents / Team / Tools / Workflow / Settings 页面控件框子已补齐
- 所有主要按钮已有 data-action
- 所有主要 input/select/textarea/checkbox 已有 data-field
- webview-bridge.js 可以统一绑定 data-action
- collectFields() 可以收集 data-field
- MessageDispatcher 可以返回 placeholder success
- event-log 可以显示 sent / response
- settings.apiKey 在日志中已经脱敏

Task 3A 已完成或正在完成：
- Settings 页配置可以保存和加载
- ConfigStore 已存在
- SecretStore 已存在
- settings.save / settings.load 已经是真实逻辑
- API Key 使用 VS Code SecretStorage
- 普通 settings 使用 VS Code globalState

用户当前只有 Gemini API Key。
本项目第一阶段默认使用 Gemini 的 OpenAI-compatible endpoint。
Agents 默认模型也应该使用：
- gemini-3-flash-preview

本次只做 Agents 配置保存和加载。
不要接 AutoGen。
不要启动 Python。
不要接 WebSocket。
不要实现真实工具调用。
不要实现 Team / Workflow / Tools 的真实保存。

============================================================
一、本次目标
============================================================

实现 Agents 页配置的本地保存、加载和基础管理。

必须完成：

1. ConfigStore 增加 Agent 配置读写方法。
2. 实现 agents.load。
3. 实现 agent.save。
4. 实现 agent.create。
5. 实现 agent.copy。
6. 实现 agent.disable。
7. 实现 agent.delete。
8. 实现 agent.reset。
9. agent.test 仍然 placeholder，不做真实模型调用。
10. Webview 初始化时能加载 Agent 列表。
11. Agents 页点击 Agent 卡片后能回填该 Agent 配置到表单。
12. 修改 Agent 表单后点击保存，刷新或重新打开 Webview 后配置仍然存在。
13. npm run compile 通过。

本次不要做：
- 真实 AutoGen AssistantAgent
- Prompt 真调用
- 模型连接测试
- Python 服务
- WebSocket
- 文件工具
- Team 保存
- Workflow 保存
- Tools 保存

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
8. docs/05_Agent配置与Prompt模板详细设计.md
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
8. 新增 src/types/agent.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. agent-service 目录
4. src/tools 目录
5. src/runtime 目录
6. config 目录

============================================================
四、AgentConfig 数据结构要求
============================================================

Agent 配置至少包含这些字段：

{
  "id": "developer_agent",
  "name": "DeveloperAgent",
  "role": "developer",
  "description": "负责生成 unified diff patch",
  "model": "gemini-3-flash-preview",
  "temperature": 0.2,
  "maxTurns": 8,
  "maxToolCalls": 20,
  "timeoutSeconds": 120,
  "responseFormat": "json_schema",
  "stopCondition": "TERMINATE",
  "systemPrompt": "...",
  "outputJsonSchema": "...",
  "enabled": true,
  "tools": {
    "list_files": true,
    "read_file": true,
    "search_code": true,
    "propose_patch": true,
    "run_command": false,
    "git_diff": true
  },
  "context": {
    "currentFile": true,
    "selection": true,
    "gitDiff": true,
    "terminalError": false,
    "projectSummary": true,
    "ragResults": false
  }
}

字段说明：

- id：内部唯一 id，不要用中文。
- name：页面显示名称。
- role：planner / codebase / developer / reviewer / tester / summary / custom。
- model：默认 gemini-3-flash-preview。
- enabled：禁用时 false。
- tools：来自 Agents 页 checkbox。
- context：来自 Agents 页 Context Scope checkbox。
- systemPrompt：textarea。
- outputJsonSchema：textarea。

============================================================
五、默认 Agents 要求
============================================================

ConfigStore 必须提供默认 Agents。

默认至少 6 个：

1. PlannerAgent
2. CodebaseAgent
3. DeveloperAgent
4. ReviewerAgent
5. TesterAgent
6. SummaryAgent

默认 id 建议：

- planner_agent
- codebase_agent
- developer_agent
- reviewer_agent
- tester_agent
- summary_agent

默认 model 全部使用：

gemini-3-flash-preview

------------------------------------------------------------
1. PlannerAgent 默认配置
------------------------------------------------------------

id = planner_agent
name = PlannerAgent
role = planner
description = 负责需求拆分和执行计划
temperature = 0.2
maxTurns = 3
maxToolCalls = 5
timeoutSeconds = 120
responseFormat = json
stopCondition = TERMINATE
enabled = true

systemPrompt 示例：

你是 PlannerAgent，负责把用户的代码需求拆成明确的执行计划。
你只负责计划，不写代码，不生成 patch，不执行命令。
你的输出必须包含 taskSummary、assumptions、steps、filesToInspect、approvalRequired。
如果信息不足，指出需要 CodebaseAgent 检查的文件或目录。

tools 默认：
- list_files: true
- read_file: false
- search_code: false
- propose_patch: false
- run_command: false
- git_diff: false

context 默认：
- currentFile: true
- selection: true
- gitDiff: false
- terminalError: false
- projectSummary: true
- ragResults: false

------------------------------------------------------------
2. CodebaseAgent 默认配置
------------------------------------------------------------

id = codebase_agent
name = CodebaseAgent
role = codebase
description = 负责理解项目结构和相关代码
temperature = 0.1
maxTurns = 6
maxToolCalls = 20
timeoutSeconds = 180
responseFormat = json
stopCondition = TERMINATE
enabled = true

systemPrompt 示例：

你是 CodebaseAgent，负责理解当前项目结构和相关代码。
你必须优先使用 list_files、read_file、search_code 等工具理解项目。
不要凭空猜测项目结构。
不要生成代码修改。
不要生成 patch。
你的输出必须包含 projectType、framework、relevantFiles、existingPatterns、risks、recommendedChangeScope。

tools 默认：
- list_files: true
- read_file: true
- search_code: true
- propose_patch: false
- run_command: false
- git_diff: true

context 默认：
- currentFile: true
- selection: true
- gitDiff: true
- terminalError: false
- projectSummary: true
- ragResults: false

------------------------------------------------------------
3. DeveloperAgent 默认配置
------------------------------------------------------------

id = developer_agent
name = DeveloperAgent
role = developer
description = 负责根据上下文生成 unified diff patch
temperature = 0.2
maxTurns = 8
maxToolCalls = 30
timeoutSeconds = 240
responseFormat = json_schema
stopCondition = TERMINATE
enabled = true

systemPrompt 示例：

你是 DeveloperAgent，负责根据 PlannerAgent 的计划和 CodebaseAgent 的分析生成代码修改。
重要规则：
1. 不要直接修改文件。
2. 所有修改必须通过 propose_patch。
3. patch 必须是 unified diff。
4. 不要访问 workspace 外文件。
5. 不要读取敏感文件。
6. 如果需要执行命令，交给 TesterAgent。
7. 如果信息不足，说明缺少哪些文件或上下文。
你的输出必须包含 summary、changedFiles、patch、risk、needsApproval。

outputJsonSchema 默认：

{
  "summary": "string",
  "changedFiles": [
    {
      "path": "string",
      "changeType": "add|modify|delete",
      "reason": "string"
    }
  ],
  "patch": "string",
  "risk": "low|medium|high",
  "needsApproval": true
}

tools 默认：
- list_files: true
- read_file: true
- search_code: true
- propose_patch: true
- run_command: false
- git_diff: true

context 默认：
- currentFile: true
- selection: true
- gitDiff: true
- terminalError: false
- projectSummary: true
- ragResults: false

------------------------------------------------------------
4. ReviewerAgent 默认配置
------------------------------------------------------------

id = reviewer_agent
name = ReviewerAgent
role = reviewer
description = 负责审查 patch 的风险、风格和正确性
temperature = 0.1
maxTurns = 5
maxToolCalls = 15
timeoutSeconds = 180
responseFormat = json
stopCondition = TERMINATE
enabled = true

systemPrompt 示例：

你是 ReviewerAgent，负责审查 DeveloperAgent 生成的 patch。
你需要检查：
1. 是否符合用户需求。
2. 是否可能破坏现有代码。
3. 是否有安全风险。
4. 是否有明显编译错误。
5. 是否符合项目风格。
6. 是否需要用户确认。
你不能直接修改代码。
你只能输出 review 结果和修复建议。

tools 默认：
- list_files: true
- read_file: true
- search_code: true
- propose_patch: false
- run_command: false
- git_diff: true

context 默认：
- currentFile: true
- selection: true
- gitDiff: true
- terminalError: false
- projectSummary: true
- ragResults: false

------------------------------------------------------------
5. TesterAgent 默认配置
------------------------------------------------------------

id = tester_agent
name = TesterAgent
role = tester
description = 负责测试命令建议和测试失败分析
temperature = 0.1
maxTurns = 5
maxToolCalls = 10
timeoutSeconds = 300
responseFormat = json
stopCondition = TERMINATE
enabled = true

systemPrompt 示例：

你是 TesterAgent，负责判断应该运行什么测试命令，并根据测试输出分析失败原因。
你不能擅自执行危险命令。
执行命令前必须等待用户确认。
优先使用项目已有测试命令，例如 mvn test、gradle test、npm test、pnpm test、python -m pytest。
你的输出必须包含 recommendedCommand、reason、expectedResult、needsApproval。

tools 默认：
- list_files: false
- read_file: false
- search_code: false
- propose_patch: false
- run_command: true
- git_diff: true

context 默认：
- currentFile: false
- selection: false
- gitDiff: true
- terminalError: true
- projectSummary: true
- ragResults: false

------------------------------------------------------------
6. SummaryAgent 默认配置
------------------------------------------------------------

id = summary_agent
name = SummaryAgent
role = summary
description = 负责总结任务结果
temperature = 0.2
maxTurns = 2
maxToolCalls = 0
timeoutSeconds = 60
responseFormat = markdown
stopCondition = TERMINATE
enabled = true

systemPrompt 示例：

你是 SummaryAgent，负责总结本次任务结果。
你需要输出：
1. 用户需求摘要
2. 实际修改内容
3. 涉及文件
4. 测试结果
5. 风险和后续建议
6. 是否需要用户手动操作

tools 默认全部 false。

context 默认：
- currentFile: false
- selection: false
- gitDiff: true
- terminalError: true
- projectSummary: true
- ragResults: false

============================================================
六、ConfigStore 要求
============================================================

修改 src/storage/ConfigStore.ts。

增加至少这些方法：

1. loadAgents(): Promise<AgentConfig[]>
2. saveAgents(agents: AgentConfig[]): Promise<void>
3. getDefaultAgents(): AgentConfig[]
4. saveAgent(agent: AgentConfig): Promise<AgentConfig[]>
5. createAgent(partial?: Partial<AgentConfig>): Promise<AgentConfig[]>
6. deleteAgent(agentId: string): Promise<AgentConfig[]>
7. copyAgent(agentId: string): Promise<AgentConfig[]>
8. setAgentEnabled(agentId: string, enabled: boolean): Promise<AgentConfig[]>
9. resetAgents(): Promise<AgentConfig[]>

保存 key：

autogenAgent.agents

要求：

1. 如果没有保存过 Agents，loadAgents 返回 getDefaultAgents。
2. saveAgents 使用 context.globalState.update。
3. saveAgent 根据 id 更新现有 Agent。
4. 如果 id 不存在，则追加。
5. createAgent 创建 custom Agent。
6. copyAgent 复制指定 Agent，生成新 id。
7. deleteAgent 删除指定 Agent，但不要允许删除最后一个 Agent。
8. setAgentEnabled 修改 enabled。
9. resetAgents 恢复默认 6 个 Agents。
10. 所有默认模型必须是 gemini-3-flash-preview。
11. 不要保存 API Key 到 Agent 配置。

============================================================
七、MessageDispatcher 要求
============================================================

修改 src/webview/MessageDispatcher.ts。

Agents action 改为真实配置操作：

必须实现：

1. agents.load
2. agent.save
3. agent.create
4. agent.copy
5. agent.disable
6. agent.delete
7. agent.reset

agent.import 暂时仍然 placeholder。
agent.test 暂时仍然 placeholder。

------------------------------------------------------------
1. agents.load
------------------------------------------------------------

返回：

{
  "ok": true,
  "type": "agents.load.result",
  "requestId": "...",
  "payload": {
    "agents": [...]
  }
}

------------------------------------------------------------
2. agent.save
------------------------------------------------------------

从 message.payload.fields 读取 Agent 表单。

需要把 flat fields 转成 AgentConfig。

字段映射：

agent.name -> name
agent.role -> role
agent.description -> description
agent.model -> model
agent.temperature -> temperature
agent.maxTurns -> maxTurns
agent.maxToolCalls -> maxToolCalls
agent.timeoutSeconds -> timeoutSeconds
agent.responseFormat -> responseFormat
agent.stopCondition -> stopCondition
agent.systemPrompt -> systemPrompt
agent.outputJsonSchema -> outputJsonSchema

checkbox 映射：

agent.tools.list_files -> tools.list_files
agent.tools.read_file -> tools.read_file
agent.tools.search_code -> tools.search_code
agent.tools.propose_patch -> tools.propose_patch
agent.tools.run_command -> tools.run_command
agent.tools.git_diff -> tools.git_diff

agent.context.currentFile -> context.currentFile
agent.context.selection -> context.selection
agent.context.gitDiff -> context.gitDiff
agent.context.terminalError -> context.terminalError
agent.context.projectSummary -> context.projectSummary
agent.context.ragResults -> context.ragResults

如果 fields 里有 agent.id，则使用它。
如果没有 agent.id，则根据 agent.name 生成稳定 id，例如：
developer_agent

保存后返回：

{
  "ok": true,
  "type": "agent.save.result",
  "requestId": "...",
  "payload": {
    "message": "Agent saved",
    "agents": [...],
    "agent": {...}
  }
}

------------------------------------------------------------
3. agent.create
------------------------------------------------------------

创建一个新的 custom Agent：

默认值：
name = CustomAgent
role = custom
model = gemini-3-flash-preview
temperature = 0.2
maxTurns = 5
maxToolCalls = 10
timeoutSeconds = 120
responseFormat = json
stopCondition = TERMINATE
enabled = true

返回：

{
  "ok": true,
  "type": "agent.create.result",
  "payload": {
    "message": "Agent created",
    "agents": [...],
    "agent": {...}
  }
}

------------------------------------------------------------
4. agent.copy
------------------------------------------------------------

根据当前 selected agent id 复制。

如果 payload 中没有 agentId，可以从 fields["agent.id"] 取。
如果都没有，复制 developer_agent。

复制后：
- id 加 _copy 或 _copy_数字
- name 加 Copy

返回 agents 和新 agent。

------------------------------------------------------------
5. agent.disable
------------------------------------------------------------

根据当前 agent id，把 enabled 取反或设置为 false。
如果字段里能提供 enabled，则按字段。
第一版可以直接置 false。

返回 agents。

------------------------------------------------------------
6. agent.delete
------------------------------------------------------------

删除当前 agent id。
如果没有 id，返回错误：
AGENT_ID_REQUIRED

如果只剩一个 Agent，不允许删除，返回错误：
CANNOT_DELETE_LAST_AGENT

------------------------------------------------------------
7. agent.reset
------------------------------------------------------------

恢复默认 6 个 Agents。

返回默认 agents。

------------------------------------------------------------
8. agent.import / agent.test
------------------------------------------------------------

本次仍然 placeholder success，不做真实逻辑。

------------------------------------------------------------
9. 未知 action
------------------------------------------------------------

继续返回 UNKNOWN_ACTION。

不要破坏 Run / Settings / Team / Tools / Workflow 已有 action。

============================================================
八、Webview 初始化和回填要求
============================================================

修改 media/webview-bridge.js。

必须实现：

1. DOMContentLoaded 后自动发送 agents.load。
2. 收到 agents.load.result 后渲染 Agent 列表。
3. 点击 Agent 卡片后，回填该 Agent 到 Agents 表单。
4. 收到 agent.save.result 后，刷新 Agent 列表，并回填保存后的 Agent。
5. 收到 agent.create.result 后，刷新 Agent 列表，并回填新 Agent。
6. 收到 agent.copy.result 后，刷新 Agent 列表，并回填复制出来的 Agent。
7. 收到 agent.disable.result 后，刷新 Agent 列表。
8. 收到 agent.delete.result 后，刷新 Agent 列表，并回填第一个 Agent。
9. 收到 agent.reset.result 后，刷新 Agent 列表，并回填第一个 Agent。

如果当前 webview-bridge.js 已经有统一消息处理，不要重写整个文件，只增加 Agents 相关处理。

============================================================
九、HTML 要求
============================================================

检查 media/webview.html 的 Agents 页。

如果缺少 agent.id 字段，需要增加隐藏字段：

<input type="hidden" data-field="agent.id">

Agents 页必须有一个 Agent 列表容器：

<div id="agent-list"></div>

如果当前已有类似容器，可以复用。

Agent 表单必须至少包含这些 data-field：

agent.id
agent.name
agent.role
agent.description
agent.model
agent.temperature
agent.maxTurns
agent.maxToolCalls
agent.timeoutSeconds
agent.responseFormat
agent.stopCondition
agent.systemPrompt
agent.outputJsonSchema

Tools checkbox 必须至少包含：

agent.tools.list_files
agent.tools.read_file
agent.tools.search_code
agent.tools.propose_patch
agent.tools.run_command
agent.tools.git_diff

Context checkbox 必须至少包含：

agent.context.currentFile
agent.context.selection
agent.context.gitDiff
agent.context.terminalError
agent.context.projectSummary
agent.context.ragResults

如果字段已存在，不要重复创建。
如果缺失，只补 Agents 页缺失字段。

============================================================
十、前端渲染要求
============================================================

Agent 列表卡片显示：

1. name
2. role
3. model
4. enabled / disabled
5. description

当前选中 Agent 要有 active 样式。

点击卡片：

1. 设置 selectedAgentId。
2. applyFields() 回填表单。
3. 日志显示：
   selected agent: DeveloperAgent

agent.save 时：

1. collectFields() 应包含 agent.id。
2. 保存当前表单中的 Agent。

============================================================
十一、不要做的事情
============================================================

本次不要做：

1. 不要接 AutoGen。
2. 不要启动 Python。
3. 不要接 WebSocket。
4. 不要真实调用模型。
5. 不要实现 agent.test 的真实测试。
6. 不要保存 Team 配置。
7. 不要保存 Workflow 配置。
8. 不要保存 Tools 配置。
9. 不要实现文件工具。
10. 不要实现 Diff/Patch。
11. 不要实现 Terminal。
12. 不要实现 Git。
13. 不要修改 Demo / prototype。
14. 不要修改 docs。

============================================================
十二、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. Webview 打开后自动触发 agents.load。
3. Agents 页显示默认 6 个 Agents。
4. 默认模型都是 gemini-3-flash-preview。
5. 点击 Agent 卡片可以回填表单。
6. 修改 Agent 表单后点击保存，返回 Agent saved。
7. 刷新或重新打开 Webview 后，Agent 修改仍然存在。
8. agent.create 可以创建 CustomAgent。
9. agent.copy 可以复制当前 Agent。
10. agent.disable 可以禁用当前 Agent。
11. agent.delete 可以删除当前 Agent，但不能删除最后一个。
12. agent.reset 可以恢复默认 6 个 Agents。
13. agent.import 和 agent.test 仍然是 placeholder。
14. Run / Settings / Team / Tools / Workflow 页已有 placeholder action 不受影响。
15. 没有接 AutoGen / Python / WebSocket / 真实工具。
16. 没有修改 Demo / prototype / docs。

运行验收命令：

npm run compile

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. ConfigStore 新增了哪些 Agent 方法。
5. MessageDispatcher 实现了哪些 Agent action。
6. Webview 是否能加载默认 6 个 Agents。
7. Agent 表单是否能回填。
8. Agent 保存后是否能持久化。
9. 默认模型是否全部是 gemini-3-flash-preview。
10. npm run compile 是否通过。
11. 是否确认没有接 AutoGen / Python / WebSocket / 真实工具。
12. 下一步建议执行哪个 Task。