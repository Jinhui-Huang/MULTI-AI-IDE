# AutoGen VS Code 插件 UI 控制台接口详细设计文档

适用 UI：`autogen_full_control_ui_config_complete.html`。目标：覆盖所有 Tab、按钮、下拉框、输入框、textarea 控件与 AutoGen / VS Code 联调接口。

## 1. 总体架构

```text
VS Code Webview UI
  ↓ postMessage
VS Code Extension Host / Node
  ↓ HTTP / WebSocket
Python AutoGen Service
  ↓ Tool Gateway
VS Code 文件 / Diff / Terminal / Git 能力
```

## 2. 控件完整映射

### Run 页面控件映射

| 页面/区域 | 控件 | 类型 | Webview事件 | Extension动作 | AutoGen / VS Code 功能 |
| --- | --- | --- | --- | --- | --- |
| Run/顶部 | 运行中 | 状态按钮/下拉 | runtime.openStatus | GET /api/runtime/health；打开运行时状态弹窗 | 查看 AutoGen Service、端口、模型、当前任务状态 |
| Run/顶部 | 暂停 | 按钮 | task.pause | POST /api/tasks/{taskId}/pause | 暂停 WorkflowRunner；停止进入下一 Agent；保存 TaskContext |
| Run/顶部 | ⋯ | 更多菜单 | runtime.openMenu | 打开运行菜单 | 日志、健康检查、重启服务、打开配置目录 |
| Run/Tab | Run / Agents / Team / Tools / Workflow / Settings | Tab按钮 | ui.tab.change | 仅切换 Webview 内部视图 | 不直接调用 AutoGen；用于配置切换 |
| Run/任务区 | 历史 | 按钮 | task.history.open | GET /api/tasks?workspaceId=... | 打开任务历史；恢复/继续/查看旧任务 |
| Run/任务区 | 上下文 | 按钮 | context.open | GET /api/tasks/{taskId}/context 或读取当前 VS Code 上下文 | 管理当前文件、选中代码、终端错误、Git diff、手动 @ 文件 |
| Run/任务区 | Team选择 | 下拉框 | task.option.teamChange | 缓存 taskDraft.teamId | 决定后端加载哪个 Agent Team |
| Run/任务区 | Workflow选择 | 下拉框 | task.option.workflowChange | 缓存 taskDraft.workflowId | 决定 WorkflowRunner 用哪个流程 |
| Run/任务区 | Mode选择 | 下拉框 | task.option.modeChange | 缓存 approvalPolicy | 自动/半自动/手动执行策略 |
| Run/任务区 | Target Agent选择 | 下拉框 | task.option.targetAgentChange | 缓存 targetAgent | 用于手动指定下一条消息给哪个 Agent |
| Run/任务区 | 任务输入 textarea | textarea | task.draft.update | 本地保存草稿 | 作为 TaskContext.userRequest |
| Run/任务区 | 发送给 AutoGen Team | 主按钮 | task.create | POST /api/tasks；打开 WS /ws/tasks/{id} | 创建任务、启动 WorkflowRunner，逐步调用 AutoGen Agent |
| Run/控制条 | 继续 | 按钮 | task.resume | POST /api/tasks/{id}/resume | 从 blocked/paused 节点继续 |
| Run/控制条 | 暂停 | 按钮 | task.pause | POST /api/tasks/{id}/pause | 暂停执行 |
| Run/控制条 | 终止 | 危险按钮 | task.cancel | POST /api/tasks/{id}/cancel | 取消任务；触发 cancellation token；状态 cancelled |
| Run/控制条 | 重跑当前 Agent | 按钮 | task.rerunCurrentAgent | POST /api/tasks/{id}/rerun-current-agent | 使用当前 TaskContext 重新运行当前 Agent |
| Run/控制条 | 切换 Agent | 按钮 | agent.switch.open | 打开切换 Agent 弹窗 | 手动模式下指定下一 Agent |
| Run/控制条 | 复制日志 | 按钮 | task.log.copy | 从本地 state 复制消息/工具调用日志 | 辅助调试 |
| Run/计划卡片 | 接受计划 | 按钮 | plan.approve | POST /api/tasks/{id}/approve-plan | 将 plan.status=approved；进入 CodebaseAgent |
| Run/计划卡片 | 调整计划 | 按钮 | plan.revise.open | 打开计划反馈弹窗 | 用户反馈进入 TaskContext.decisions；重跑 PlannerAgent |
| Run/计划卡片 | 保存为模板 | 按钮 | task.template.open | 打开模板弹窗/POST /api/workflows/templates | 把当前计划保存成 Workflow 模板 |
| Run/Diff卡片 | 查看 Diff | 按钮 | patch.openDiff | GET /api/tasks/{id}/patches/{patchId}；vscode.diff 或内嵌 diff | 展示 unified diff / 虚拟文档 diff |
| Run/Diff卡片 | 应用 Patch | 按钮 | patch.apply | POST /api/tasks/{id}/apply-patch | VS Code/后端校验后 git apply；然后进入 TesterAgent |
| Run/Diff卡片 | 拒绝并说明 | 按钮 | patch.reject.open | 打开拒绝原因弹窗 | reason 写入 TaskContext.decisions；重跑 DeveloperAgent |
| Run/Diff卡片 | 部分应用 | 按钮 | patch.applyPartial.open | 打开文件勾选弹窗 | 只应用选中文件 patch hunks |
| Run/Diff卡片 | 让 AI 解释 | 按钮 | patch.explain | POST /api/tasks/{id}/patches/{patchId}/explain | 调用 Reviewer/Explainer Agent 解释变更 |
| Run/命令确认 | 允许一次 | 按钮 | command.approveOnce | POST /api/tasks/{id}/approvals/{approvalId}/approve | 本次允许 run_command |
| Run/命令确认 | 加入白名单 | 按钮 | command.allowlist.add | PUT /api/tools/command-allowlist | 保存命令白名单并继续 |
| Run/命令确认 | 拒绝 | 危险按钮 | command.reject | POST /api/tasks/{id}/approvals/{approvalId}/reject | 拒绝命令；交给 TesterAgent/DeveloperAgent 走替代路径 |
| Run/底部输入 | 追加消息输入框 | textarea/input | task.userMessage.draft | 本地草稿 | 补充需求或对当前 Agent 发消息 |
| Run/底部输入 | ↑ | 发送按钮 | task.userMessage | POST /api/tasks/{id}/messages | 追加用户消息；targetAgent 可选 |

### Agents 页面控件映射

| 页面/区域 | 控件 | 类型 | Webview事件 | Extension动作 | AutoGen / VS Code 功能 |
| --- | --- | --- | --- | --- | --- |
| Agents/顶部 | + 新增 | 按钮 | agent.create.open | 打开新建 Agent 表单 | 创建 AssistantAgent 配置草稿 |
| Agents/顶部 | 导入 | 按钮 | agent.import | 选择 JSON / POST /api/agents/import | 导入 Agent 配置 |
| Agents/卡片 | 编辑 | 按钮 | agent.select | GET /api/agents/{agentId} | 加载配置到右侧表单 |
| Agents/卡片 | 复制 | 按钮 | agent.copy | POST /api/agents/{agentId}/copy | 复制 Agent 配置 |
| Agents/卡片 | 禁用 | 按钮 | agent.disable | PATCH /api/agents/{id} enabled=false | 禁用后 Team 不调用 |
| Agents/卡片 | 删除 | 危险按钮 | agent.delete | DELETE /api/agents/{id} | 删除或软删除 Agent |
| Agents/编辑器 | 重置 | 按钮 | agent.reset | 重置为最后保存版本 | 丢弃未保存修改 |
| Agents/编辑器 | 保存 Agent | 按钮 | agent.save | PUT /api/agents/{id} | 保存 Agent 配置 |
| Agents/字段 | Agent Name | input | agent.form.change | 更新草稿 name | 映射 AutoGen AssistantAgent.name |
| Agents/字段 | Role | select | agent.form.change | 更新草稿 role | 决定默认 prompt 和工具集 |
| Agents/字段 | Agent Description | input | agent.form.change | 更新 description | 映射 AssistantAgent.description / UI 展示 |
| Agents/字段 | Model | select | agent.form.change | 更新 model | 创建对应 model_client |
| Agents/字段 | Temperature | input number | agent.form.change | 更新 temperature | 传入模型参数 |
| Agents/字段 | Max Turns | input number | agent.form.change | 更新 limits.maxTurns | 单 Agent / workflow 节点最大轮数 |
| Agents/字段 | Max Tool Calls | input number | agent.form.change | 更新 limits.maxToolCalls | 防止工具调用失控 |
| Agents/字段 | Timeout | input number | agent.form.change | 更新 timeoutSeconds | Agent 调用超时 |
| Agents/字段 | System Prompt | textarea | agent.form.change | 更新 systemPrompt | AssistantAgent.system_message |
| Agents/字段 | Response Format | select | agent.form.change | 更新 responseFormat | 控制 Developer/Reviewer 输出 JSON、Patch、Markdown |
| Agents/字段 | Stop Condition | select | agent.form.change | 更新 stopCondition | 节点终止条件：patch_proposed / TERMINATE / max_turns / approval |
| Agents/字段 | Output JSON Schema | textarea/code | agent.form.change | 更新 outputSchema | 后端解析 Agent 输出，校验结构 |
| Agents/字段 | Tools 选择 | checkbox group | agent.tools.change | 更新 agent.tools | 决定注入哪些 AutoGen tools |
| Agents/字段 | Context Scope 选择 | checkbox group | agent.contextScope.change | 更新可见上下文 | 控制当前文件、选中代码、Git diff、RAG、终端等 |
| Agents/底部 | 测试 Agent | 按钮 | agent.test | POST /api/agents/{id}/test | 使用样例上下文单独跑该 Agent |

### Team 页面控件映射

| 页面/区域 | 控件 | 类型 | Webview事件 | Extension动作 | AutoGen / VS Code 功能 |
| --- | --- | --- | --- | --- | --- |
| Team/顶部 | + 新增 Team | 按钮 | team.create.open | 新建 Team 草稿 | 新建多 Agent 组合 |
| Team/顶部 | 复制 | 按钮 | team.copy | POST /api/teams/{id}/copy | 复制 Team |
| Team/顶部 | 设为默认 | 按钮 | team.setDefault | POST /api/teams/{id}/default | 作为新任务默认 Team |
| Team/顶部 | 删除 | 危险按钮 | team.delete | DELETE /api/teams/{id} | 删除 Team |
| Team/字段 | Team Name | input | team.form.change | 更新 team.name | Team 显示名 |
| Team/字段 | Team Mode | select | team.form.change | 更新 team.mode | Sequential WorkflowRunner / RoundRobinGroupChat / SelectorGroupChat / Manual |
| Team/字段 | Max Turns | input number | team.form.change | 更新 team.maxTurns | Team 总轮数限制 |
| Team/字段 | Retry Limit | input number | team.form.change | 更新 retryLimit | 失败重试次数 |
| Team/字段 | Termination | select | team.form.change | 更新 termination | 完成条件：Summary done / TERMINATE / user stop |
| Team/字段 | 执行策略 | select | team.form.change | 更新 executionPolicy | 串行、部分并行、Review/Test 并行 |
| Team/字段 | 模型覆盖策略 | select | team.form.change | 更新 modelOverridePolicy | 是否全部使用默认模型或按 Agent 自己配置 |
| Team/顺序 | 添加 Agent | 按钮 | team.agent.add | 打开选择 Agent 弹窗 | 加入 participants/order |
| Team/顺序 | 移除选中 | 按钮 | team.agent.remove | 从当前 Team 移除 | 不删除 Agent 本身 |
| Team/顺序 | 上移 / 下移 | 按钮 | team.agent.move | 调整 orderIndex | Sequential 下决定执行顺序 |
| Team/底部 | 保存 Team | 按钮 | team.save | PUT /api/teams/{id} | 保存 Team 配置 |
| Team/底部 | 恢复默认 | 按钮 | team.restoreDefault | 重置内置 Team | 恢复模板配置 |
| Team/模板 | 使用模板 | 按钮 | team.template.use | 复制模板到当前 Team | Java Spring / React / RAG 等模板 |

### Tools 页面控件映射

| 页面/区域 | 控件 | 类型 | Webview事件 | Extension动作 | AutoGen / VS Code 功能 |
| --- | --- | --- | --- | --- | --- |
| Tools/顶部 | 批量编辑 | 按钮 | tool.permission.batchEdit | 打开批量编辑弹窗 | 批量设置多个 Agent 的工具权限 |
| Tools/顶部 | 保存权限 | 按钮 | tool.permission.save | PUT /api/tools/permissions | 保存权限矩阵 |
| Tools/矩阵 | 权限格子 | 可切换单元格 | tool.permission.toggle | 更新 draftPermissions[agent][tool] | deny / allow / confirm / readonly / whitelist |
| Tools/全局安全 | 保存全局安全 | 按钮 | tool.globalSafety.save | PUT /api/tools/global-safety | 保存 IDE 安全边界 |
| Tools/全局安全 | 禁止 workspace 外访问 | checkbox | tool.globalSafety.change | 更新 forbidOutsideWorkspace | 工具执行前校验路径 |
| Tools/全局安全 | 禁止直接写文件 | checkbox | tool.globalSafety.change | 更新 patchOnly | 所有写入走 propose_patch |
| Tools/全局安全 | apply_patch 强制确认 | checkbox | tool.globalSafety.change | 更新 requirePatchApproval | Human Approval 节点 |
| Tools/全局安全 | run_command 强制确认 | checkbox | tool.globalSafety.change | 更新 requireCommandApproval | 命令执行确认卡片 |
| Tools/全局安全 | 危险工具全局禁止 | checkbox | tool.globalSafety.change | 更新 dangerousToolsDisabled | 禁止 git_push/npm_publish/ssh 等 |
| Tools/Registry | + 新增工具 | 按钮 | tool.create.open | 新建工具 schema | 新增 AutoGen tool adapter |
| Tools/Registry | 测试工具 | 按钮 | tool.test | POST /api/tools/{name}/test | 以 mock 参数测试工具 |
| Tools/Registry | Schema | 按钮 | tool.schema.open | 打开参数 Schema 编辑器 | 编辑 JSON schema / Python 函数签名 |
| Tools/Schema | 工具参数 Schema textarea | textarea/code | tool.schema.change | 更新 selectedTool.schema | 生成 tool 参数校验 |
| Tools/Preview | 工具返回值预览 | textarea/readonly | tool.preview.update | 显示上次测试结果 | 检查 ToolResult 摘要是否适合 LLM |
| Tools/日志 | 工具日志开关 | checkbox | tool.logging.change | 更新 logToolCalls/logToolResults | 控制审计日志 |
| Tools/白名单 | Command Allowlist | textarea | command.allowlist.change | 更新 allowlist | 允许无需确认或可确认的命令 |
| Tools/黑名单 | Command Blocklist | textarea | command.blocklist.change | 更新 blocklist | 无条件禁止危险命令 |
| Tools/敏感文件 | Sensitive File Blocklist | textarea | sensitiveFiles.change | 更新敏感文件模式 | 阻止 read_file/search_code 读取敏感文件 |
| Tools/底部 | 保存 | 按钮 | tools.saveAll | PUT /api/tools/config | 保存工具相关所有配置 |

### Workflow 页面控件映射

| 页面/区域 | 控件 | 类型 | Webview事件 | Extension动作 | AutoGen / VS Code 功能 |
| --- | --- | --- | --- | --- | --- |
| Workflow/顶部 | 测试运行 | 按钮 | workflow.testRun | POST /api/workflows/{id}/test-run | 用 mock TaskContext 跑一遍流程 |
| Workflow/顶部 | 导入 JSON | 按钮 | workflow.importJson | 选择 JSON / POST /api/workflows/import | 导入 Workflow 配置 |
| Workflow/顶部 | 导出 JSON | 按钮 | workflow.exportJson | GET /api/workflows/{id}.json | 导出给 Codex/版本管理 |
| Workflow/顶部 | 设为默认 | 按钮 | workflow.setDefault | POST /api/workflows/{id}/default | 作为新任务默认流程 |
| Workflow/顶部 | 另存模板 | 按钮 | workflow.saveAsTemplate | POST /api/workflows/{id}/templates | 保存模板 |
| Workflow/顶部 | 保存 Workflow | 按钮 | workflow.save | PUT /api/workflows/{id} | 保存流程配置 |
| Workflow/字段 | Workflow Name | input | workflow.form.change | 更新 name | 流程显示名 |
| Workflow/字段 | Workflow Type | select | workflow.form.change | 更新 type | Code Edit / Bug Fix / Test Generation / Explain Code |
| Workflow/字段 | Workflow Description | input/textarea | workflow.form.change | 更新 description | 描述流程用途 |
| Workflow/字段 | Workflow JSON Version | input | workflow.form.change | 更新 version | 配置版本 |
| Workflow/字段 | Failure Strategy | select | workflow.form.change | 更新 failureStrategy | 失败后回到上一 Agent / 终止 / 跳过 |
| Workflow/字段 | Retry Limit | input number | workflow.form.change | 更新 retryLimit | 节点失败重试次数 |
| Workflow/字段 | Node Timeout | input | workflow.form.change | 更新 nodeTimeout | 每个节点超时 |
| Workflow/字段 | Confirm Policy | select | workflow.form.change | 更新 confirmPolicy | Plan+Patch+Command 等确认策略 |
| Workflow/节点 | 编辑节点 | 按钮 | workflow.node.edit | 打开节点配置弹窗 | 配置 agent、input/output、条件、确认 |
| Workflow/节点 | 添加后置 | 按钮 | workflow.node.addAfter | 在当前节点后插入 | 新增节点 |
| Workflow/节点 | 条件分支 | 按钮 | workflow.node.addCondition | 添加 if/else edge | 失败/成功分支 |
| Workflow/节点 | 上移 / 下移 | 按钮 | workflow.node.move | 调整节点顺序 | Sequential order |
| Workflow/底部 | + 添加 Agent 节点 | 按钮 | workflow.node.addAgent | 添加 Agent Node | 对应 run_agent(agentId, ctx) |
| Workflow/底部 | + 添加人工确认 | 按钮 | workflow.node.addHumanApproval | 添加 Human Approval Node | 阻塞并等待 UI approve/reject |
| Workflow/底部 | + 添加条件分支 | 按钮 | workflow.node.addCondition | 添加 Conditional Node | 按 review/test result 路由 |
| Workflow/底部 | 删除选中节点 | 危险按钮 | workflow.node.delete | 删除节点及相关边 | 更新 workflow graph |
| Workflow/JSON | Workflow JSON Preview | textarea/readonly | workflow.json.preview | 展示当前配置 JSON | 给后端 WorkflowRunner 直接使用 |

### Settings 页面控件映射

| 页面/区域 | 控件 | 类型 | Webview事件 | Extension动作 | AutoGen / VS Code 功能 |
| --- | --- | --- | --- | --- | --- |
| Settings/模型 | 测试连接 | 按钮 | settings.model.test | POST /api/settings/model/test | 测试 provider/baseUrl/model/apiKey |
| Settings/模型 | 保存设置 | 按钮 | settings.model.save | PUT /api/settings/model | 保存模型配置 |
| Settings/模型 | Provider | select | settings.model.change | 更新 provider | OpenAI Compatible / OpenAI / Azure / Ollama / LM Studio |
| Settings/模型 | Base URL | input | settings.model.change | 更新 baseUrl | 传给 OpenAIChatCompletionClient 或兼容 client |
| Settings/模型 | Model | input | settings.model.change | 更新 model | 默认模型 |
| Settings/模型 | Fallback Model | input | settings.model.change | 更新 fallbackModel | 失败或轻任务备用模型 |
| Settings/模型 | Max Tokens | input number | settings.model.change | 更新 maxTokens | 模型输出上限 |
| Settings/模型 | Timeout | input | settings.model.change | 更新 timeout | 模型请求超时 |
| Settings/模型 | API Key | input password | settings.model.change | 更新 apiKey | 建议保存到 VS Code SecretStorage |
| Settings/Runtime | 启动 | 按钮 | runtime.start | POST /api/runtime/start | 拉起 Python AutoGen Service |
| Settings/Runtime | 停止 | 按钮 | runtime.stop | POST /api/runtime/stop | 停止服务 |
| Settings/Runtime | 重启 | 按钮 | runtime.restart | POST /api/runtime/restart | 重启服务 |
| Settings/Runtime | Service URL | input | settings.runtime.change | 更新 serviceUrl | Extension 调用 AutoGen Service 地址 |
| Settings/Runtime | Host | input | settings.runtime.change | 更新 host | 服务监听 host |
| Settings/Runtime | Port | input number | settings.runtime.change | 更新 port | 服务端口 |
| Settings/Runtime | Python Path | input | settings.runtime.change | 更新 pythonPath | Extension spawn 的 Python |
| Settings/Runtime | AutoGen Package | input | settings.runtime.change | 更新 packageName | 依赖检测用 |
| Settings/Runtime | Log Level | select | settings.runtime.change | 更新 logLevel | DEBUG/INFO/WARN/ERROR |
| Settings/Runtime | Workspace Storage Path | input | settings.runtime.change | 更新 storagePath | 配置、日志、任务历史存储目录 |
| Settings/Runtime | 健康检查 | 按钮 | runtime.health | GET /api/runtime/health | 确认 AutoGen Service 可用 |
| Settings/Runtime | 查看 Runtime 日志 | 按钮 | runtime.openLogs | 打开日志 Webview/输出通道 | 排查 Python 服务问题 |
| Settings/Runtime | 打开配置目录 | 按钮 | runtime.openConfigDir | vscode.env.openExternal / reveal file | 打开配置目录 |
| Settings/Runtime | 保存 Runtime | 按钮 | settings.runtime.save | PUT /api/settings/runtime | 保存 Runtime 配置 |
| Settings/安全 | 恢复默认 | 按钮 | settings.restoreDefault | POST /api/settings/restore-default | 恢复全局默认 |
| Settings/安全 | 保存安全策略 | 按钮 | settings.safety.save | PUT /api/settings/safety | 保存上下文/安全策略 |
| Settings/安全 | Max Files Read | input number | settings.safety.change | 更新 maxFilesRead | 限制 Agent 读取文件数量 |
| Settings/安全 | Max Context Tokens | input number | settings.safety.change | 更新 maxContextTokens | 限制上下文 token |
| Settings/安全 | Use VS Code SecretStorage | checkbox | settings.safety.change | 更新 useSecretStorage | API Key 安全存储 |
| Settings/配置 | 导入配置 | 按钮 | settings.import | 选择配置 JSON | 导入 agents/teams/tools/workflows/settings |
| Settings/配置 | 导出配置 | 按钮 | settings.export | 导出 JSON | 备份/迁移配置 |
| Settings/配置 | 清空任务历史 | 危险按钮 | taskHistory.clear | DELETE /api/tasks/history | 清空历史记录 |

### 弹窗 / 抽屉控件映射

| 页面/区域 | 控件 | 类型 | Webview事件 | Extension动作 | AutoGen / VS Code 功能 |
| --- | --- | --- | --- | --- | --- |
| Modal/调整计划 | 反馈 textarea | textarea | plan.revise.draft | 本地草稿 | PlannerAgent 重新规划输入 |
| Modal/调整计划 | 提交给 PlannerAgent | 按钮 | plan.revise.submit | POST /api/tasks/{id}/revise-plan | 重跑 PlannerAgent |
| Modal/拒绝 Patch | 拒绝原因 textarea | textarea | patch.reject.draft | 本地草稿 | DeveloperAgent 重写依据 |
| Modal/拒绝 Patch | 让 DeveloperAgent 重写 | 按钮 | patch.reject.submit | POST /api/tasks/{id}/reject-patch | 拒绝并重跑 DeveloperAgent |
| Modal/切换 Agent | Agent select | select | agent.switch.targetChange | 本地草稿 | 指定下一个处理 Agent |
| Modal/切换 Agent | 继续 | 按钮 | agent.switch.submit | POST /api/tasks/{id}/switch-agent | 手动模式切换当前 Agent |
| Modal/部分应用 | 文件勾选列表 | checkbox list | patch.partial.select | 本地选择 selectedFiles | 决定部分应用哪些文件 |
| Modal/部分应用 | 应用选择 | 按钮 | patch.applyPartial.submit | POST /api/tasks/{id}/apply-patch-partial | 只应用选中变更 |
| Modal/Runtime | 查看日志 | 按钮 | runtime.openLogs | 打开输出通道/日志面板 | 查看 Python 服务日志 |
| Modal/Runtime | 健康检查 | 按钮 | runtime.health | GET /api/runtime/health | 刷新运行状态 |
| Modal/Runtime | 重启服务 | 按钮 | runtime.restart | POST /api/runtime/restart | 重启 AutoGen Service |
| Modal/任务控制 | 继续/暂停/重跑/切换/终止 | 按钮组 | task.control.* | 对应任务控制 API | 在当前任务弹窗内快速控制 |
| Modal/任务历史 | 打开/恢复/继续/查看 | 按钮组 | task.history.* | GET/POST tasks history APIs | 恢复上下文或查看旧任务 |

## 3. HTTP API 设计

| 方法 | 路径 | 用途 | 请求体 | 返回/行为 |
| --- | --- | --- | --- | --- |
| GET | /api/config/full | 读取全部配置 | 无 | 返回 agents、teams、tools、workflows、settings，用于 UI 初始化 |
| POST | /api/tasks | 创建任务并启动执行 | TaskCreateRequest | 返回 taskId；后台创建 TaskContext 并启动 WorkflowRunner |
| GET | /api/tasks/{taskId} | 读取任务详情 | path taskId | 返回任务状态、消息、patch、toolCalls、approvals |
| POST | /api/tasks/{taskId}/pause | 暂停任务 | 无 | 保存当前状态，不继续下一节点 |
| POST | /api/tasks/{taskId}/resume | 继续任务 | 无 | 从 paused/blocked 继续 |
| POST | /api/tasks/{taskId}/cancel | 终止任务 | reason? | 取消执行，释放资源 |
| POST | /api/tasks/{taskId}/rerun-current-agent | 重跑当前 Agent | feedback? | 使用当前 ctx 重新运行 currentAgent |
| POST | /api/tasks/{taskId}/switch-agent | 切换 Agent | targetAgentId | 手动模式指定下一 Agent |
| POST | /api/tasks/{taskId}/messages | 追加用户消息 | content,targetAgent | 加入 TaskContext.messages/decisions |
| POST | /api/tasks/{taskId}/approve-plan | 批准计划 | planId | 进入下一 workflow 节点 |
| POST | /api/tasks/{taskId}/revise-plan | 调整计划 | feedback | 重跑 PlannerAgent |
| GET | /api/tasks/{taskId}/patches/{patchId} | 读取 patch | 无 | 返回 unified diff 和变更文件列表 |
| POST | /api/tasks/{taskId}/apply-patch | 应用 patch | patchId | 校验后应用 patch |
| POST | /api/tasks/{taskId}/apply-patch-partial | 部分应用 | patchId,files | 只应用选中文件变更 |
| POST | /api/tasks/{taskId}/reject-patch | 拒绝 patch | reason | 记录原因并重跑 DeveloperAgent |
| POST | /api/tasks/{taskId}/patches/{patchId}/explain | 解释 patch | patchId | 调用 Explainer/Reviewer Agent |
| POST | /api/tasks/{taskId}/approvals/{approvalId}/approve | 批准人工确认 | approvalType | 批准命令/patch/计划等 |
| POST | /api/tasks/{taskId}/approvals/{approvalId}/reject | 拒绝人工确认 | reason | 拒绝并进入失败/修正路径 |
| GET | /api/agents | Agent 列表 | 无 | 返回 Agent 配置 |
| PUT | /api/agents/{agentId} | 保存 Agent | AgentConfig | 保存 name/model/prompt/tools/context/limits |
| POST | /api/agents | 新建 Agent | AgentConfig | 创建 Agent |
| DELETE | /api/agents/{agentId} | 删除 Agent | 无 | 删除/软删除 |
| POST | /api/agents/{agentId}/test | 测试 Agent | sampleContext | 单独调用 Agent |
| GET | /api/teams | Team 列表 | 无 | 返回 Team 配置 |
| PUT | /api/teams/{teamId} | 保存 Team | TeamConfig | 保存 mode/order/limits/policy |
| POST | /api/teams/{teamId}/default | 设默认 Team | 无 | 更新默认配置 |
| GET | /api/tools/permissions | 工具权限 | 无 | 返回矩阵 |
| PUT | /api/tools/permissions | 保存工具权限 | PermissionMatrix | 保存权限矩阵 |
| PUT | /api/tools/global-safety | 保存全局安全 | GlobalSafety | 保存安全边界 |
| PUT | /api/tools/command-allowlist | 保存命令白名单 | commands[] | 保存 allowlist |
| PUT | /api/tools/command-blocklist | 保存命令黑名单 | commands[] | 保存 blocklist |
| GET | /api/workflows | Workflow 列表 | 无 | 返回流程配置 |
| PUT | /api/workflows/{workflowId} | 保存 Workflow | WorkflowConfig | 保存 nodes/edges/policies |
| POST | /api/workflows/{workflowId}/test-run | 测试运行 | mockTaskContext | 不改文件的 dry-run |
| GET | /api/settings | 读取设置 | 无 | 返回 model/runtime/safety |
| PUT | /api/settings/model | 保存模型设置 | ModelSettings | 保存 provider/baseUrl/model/apiKeyRef |
| POST | /api/settings/model/test | 测试模型连接 | ModelSettings | 发起一次轻量模型调用 |
| PUT | /api/settings/runtime | 保存 Runtime | RuntimeSettings | 保存 serviceUrl/pythonPath/port/logLevel |
| POST | /api/runtime/start | 启动 Runtime | 无 | spawn Python 服务 |
| POST | /api/runtime/stop | 停止 Runtime | 无 | 停止服务 |
| POST | /api/runtime/restart | 重启 Runtime | 无 | 重启服务 |
| GET | /api/runtime/health | 健康检查 | 无 | 返回 ok/version/port/model |

## 4. WebSocket 事件设计

| 事件类型 | 触发时机 | Payload | UI 动作 |
| --- | --- | --- | --- |
| task_status | 任务状态变化 | { taskId, status } | 更新顶部状态、控制按钮状态 |
| agent_status | Agent 状态变化 | { taskId, agent, status } | 更新 Agent 卡片 running/done/failed/blocked |
| agent_message | Agent 消息 | { taskId, agent, content, role } | 追加到 Run 对话流 |
| tool_call | 工具调用开始 | { taskId, agent, tool, args, callId } | 显示工具调用卡片 |
| tool_result | 工具调用结果 | { callId, status, summary, resultRef } | 更新工具卡片结果 |
| approval_required | 需要用户确认 | { approvalId, approvalType, payload } | 显示计划/patch/命令确认卡片 |
| patch_proposed | 生成 Patch | { patchId, files, risk } | 更新 Diff 卡片 |
| patch_applied | Patch 已应用 | { patchId, files } | 更新状态并进入测试 |
| command_started | 命令开始 | { commandId, command } | 打开/更新 Terminal 卡片 |
| command_output | 命令输出流 | { commandId, stream, chunk } | 追加终端输出 |
| command_finished | 命令结束 | { commandId, exitCode, summary } | 触发 TesterAgent 判断 |
| workflow_step | Workflow 节点变化 | { nodeId, status } | 更新时间线 |
| error | 错误事件 | { code, message, detail } | 显示错误 Toast/卡片 |

## 5. 核心数据模型

### TaskCreateRequest

```json
{ "workspaceRoot":"D:/projects/demo", "userRequest":"增加 JWT 登录接口", "teamId":"java-spring-team", "workflowId":"code-edit", "mode":"semi-auto" }
```

### AgentConfig

```json
{ "id":"developer_agent", "name":"DeveloperAgent", "model":"gpt-4.1", "tools":["read_file","search_code","propose_patch"] }
```

### WorkflowConfig

```json
{ "id":"code-edit", "nodes":[{"type":"agent","agentId":"planner_agent"},{"type":"human_approval","approvalType":"patch"}] }
```

## 6. Webview / VS Code / AutoGen 联调代码骨架

```js
const vscode = acquireVsCodeApi();
function send(type, payload = {}) { vscode.postMessage({ type, payload, requestId: crypto.randomUUID() }); }
window.addEventListener('message', e => applyServerEventToUi(e.data.type, e.data.payload));
```

```ts
webview.webview.onDidReceiveMessage(async (msg) => {
  switch (msg.type) {
    case 'task.create': return taskApi.create(msg.payload);
    case 'patch.openDiff': return diffController.open(msg.payload);
    case 'settings.model.save': return configApi.saveModel(msg.payload);
  }
});
```

```python
async for event in agent.run_stream(task=ctx.to_agent_task(agent_id)):
    await ws_manager.emit_from_autogen_event(ctx.task_id, agent_id, event)
```

## 7. 参考资料

- AutoGen AgentChat Agents 文档：run_stream() 返回异步消息流并以 TaskResult 结束；AssistantAgent 支持工具调用。https://microsoft.github.io/autogen/stable//user-guide/agentchat-user-guide/tutorial/agents.html

- AutoGen AgentChat teams API：RoundRobinGroupChat、SelectorGroupChat 等 Team 类型。https://microsoft.github.io/autogen/stable//reference/python/autogen_agentchat.teams.html

- VS Code Webview API：Webview 内通过 acquireVsCodeApi().postMessage 向扩展发送消息。https://code.visualstudio.com/api/extension-guides/webview

- VS Code API Reference：扩展侧可调用 workspace、window、commands、terminal 等 API。https://code.visualstudio.com/api/references/vscode-api
