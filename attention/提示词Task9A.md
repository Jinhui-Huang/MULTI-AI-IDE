你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 9A：实现 Plan / Patch / Command Approval 的最小真实闭环。

当前上下文：
Task 1 已完成：
- VS Code 插件可以编译和启动
- AutoGen Control Webview 可以打开
- Webview ⇄ Extension 基础链路可用

Task 2A～2F 已完成：
- Webview 已经有 6 个 Tab：Run / Agents / Team / Tools / Workflow / Settings
- 所有页面控件框子已补齐
- 所有主要按钮已有 data-action
- 所有主要表单已有 data-field
- event-log 可以显示 sent / response
- settings.apiKey 在日志中已经脱敏

Task 3A～3D 已完成：
- Settings / Agents / Team / Workflow / Tools 配置可以保存和加载
- API Key 使用 VS Code SecretStorage
- 普通配置使用 VS Code globalState
- Tools / Safety 配置可以保存和加载
- Command Allowlist / Blocklist 已有配置
- Global Safety 已有配置

Task 4A～4C 已完成：
- Python Service 可以启动 / 停止 / 健康检查
- Python Service 已有 WebSocket /ws/tasks/{taskId}
- Extension WebSocketClient 可以连接 Python Service
- Webview 可以显示 task.event

Task 5A～5D 已完成：
- list_files / read_file / search_code 已实现
- WorkspaceGuard / SensitiveFileGuard 已实现
- propose_patch / open_diff / apply_patch / reject_patch 已实现
- run_command 安全确认闭环已实现
- git_status / git_diff 只读工具已实现

Task 6A 已完成：
- Extension ToolServer 已实现
- Python Service 可以通过 ToolGateway 调用 Extension ToolServer

Task 7A～7D 已完成：
- Gemini OpenAI-compatible 模型健康检查已实现
- AutoGen 单 Agent run-once 已实现
- AutoGen 单 Agent + ToolGateway 已实现
- AgentFactory + 多角色 Agent 顺序调用已实现

Task 8A～8C 已完成：
- Python Service 已有最小 WorkflowRunner
- Run 页 task.create 已接入真实 WorkflowRunner
- /api/tasks/start-workflow 可立即返回 taskId
- Extension 会自动连接 /ws/tasks/{taskId}
- Webview 能实时显示 workflow.step / agent.message / tool.call / patch.proposed / task.completed 等真实事件
- 当前还没有 Plan / Patch / Command approval 的真实闭环

本次只做审批闭环。
不要实现复杂 Workflow 暂停恢复。
不要实现多分支 retry。
不要实现 Team GroupChat。
不要让 AI 自动确认。
不要绕过用户确认。

============================================================
一、本次目标
============================================================

实现最小真实 Approval 闭环：

1. Plan Approval：
   - WorkflowRunner 生成 plan 后发布 approval.required
   - Webview 显示 Plan Approval
   - 用户点击 plan.approve / plan.revise
   - Extension 转发到 Python Service
   - Python Service 记录 approval 决策

2. Patch Approval：
   - DeveloperAgent 输出 patch / proposedPatch 时发布 patch.proposed
   - Webview 保存 currentPatchId 或 patch 内容引用
   - 用户点击 patch.openDiff / patch.apply / patch.reject
   - patch.openDiff 打开 Diff
   - patch.apply 调用已有 PatchTools.applyPatch
   - patch.reject 调用已有 PatchTools.rejectPatch

3. Command Approval：
   - run_command 仍然只创建 pending command
   - Webview 显示 currentCommandId
   - 用户点击 command.approveOnce / command.reject / command.addAllowlist
   - Extension 调用已有 TerminalTools 真实逻辑

4. 所有 approval 操作都要写 event-log。
5. 所有 approval 操作都要返回明确结果。
6. 不允许自动 approve。
7. 不允许自动 apply patch。
8. 不允许自动 execute command。
9. npm run compile 通过。

本次不要做：
- 复杂 Workflow 暂停恢复
- AI 自动继续执行
- 自动 apply_patch
- 自动 run_command
- Git 写操作
- Team GroupChat
- RoundRobinGroupChat
- SelectorGroupChat
- 多任务并发管理复杂逻辑

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. agent-service/runtime/workflow_runner.py
2. agent-service/runtime/task_manager.py
3. agent-service/main.py
4. src/webview/MessageDispatcher.ts
5. src/runtime/RuntimeManager.ts
6. src/runtime/ExtensionApiClient.ts
7. src/tools/PatchTools.ts
8. src/tools/PatchStore.ts
9. src/tools/TerminalTools.ts
10. src/tools/CommandStore.ts
11. media/webview.html
12. media/webview-bridge.js
13. package.json

可以只读参考：
14. docs/09_Task任务状态机与WebSocket事件详细设计.md
15. docs/08_VSCode文件_Diff_Terminal_Git工具联调详细设计.md
16. docs/11_安全边界与沙箱策略详细设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要实现复杂 Workflow 暂停恢复。
不要自动 apply_patch。
不要自动 run_command。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. agent-service/runtime/task_manager.py
2. agent-service/runtime/workflow_runner.py
3. agent-service/main.py
4. src/runtime/ExtensionApiClient.ts
5. src/runtime/RuntimeManager.ts
6. src/webview/MessageDispatcher.ts
7. src/tools/PatchTools.ts
8. src/tools/PatchStore.ts
9. src/tools/TerminalTools.ts
10. src/tools/CommandStore.ts
11. media/webview.html
12. media/webview-bridge.js

必要时可以新增：
13. agent-service/runtime/approval_manager.py
14. agent-service/schemas/approval.py
15. src/types/approval.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. src/tools 安全逻辑，除非是 bug 修复
4. config 目录
5. 不要大改 Settings / Agents / Team / Workflow / Tools 保存逻辑

============================================================
四、Approval 数据结构要求
============================================================

定义 ApprovalRecord：

{
  "id": "approval_xxx",
  "taskId": "task_xxx",
  "type": "plan",
  "status": "pending",
  "title": "Plan approval required",
  "summary": "...",
  "payload": {},
  "decision": null,
  "createdAt": "...",
  "decidedAt": null
}

type 可用值：

- plan
- patch
- command

status 可用值：

- pending
- approved
- revised
- rejected
- applied
- expired

decision 示例：

{
  "action": "approve",
  "message": "Approved by user"
}

============================================================
五、Python Approval API 要求
============================================================

在 Python Service 中新增最小 Approval API。

新增接口：

POST /api/tasks/{task_id}/approvals

用于创建 approval 记录。

请求：

{
  "type": "plan",
  "title": "Plan approval required",
  "summary": "...",
  "payload": {}
}

返回：

{
  "ok": true,
  "approval": {...}
}

新增接口：

POST /api/tasks/{task_id}/approvals/{approval_id}/decide

请求：

{
  "action": "approve",
  "message": "..."
}

action 可用值：

- approve
- revise
- reject

返回：

{
  "ok": true,
  "approval": {...}
}

新增接口：

GET /api/tasks/{task_id}/approvals

返回：

{
  "ok": true,
  "approvals": [...]
}

要求：

1. 使用 TaskManager 或 ApprovalManager 内存保存。
2. 不需要持久化。
3. 不需要真正暂停/恢复 Workflow。
4. 决策后发布 task.event：
   - approval.decided
5. 不返回 API Key。
6. task 不存在返回 TASK_NOT_FOUND。
7. approval 不存在返回 APPROVAL_NOT_FOUND。

============================================================
六、WorkflowRunner Plan Approval 事件要求
============================================================

修改 workflow_runner.py。

PlannerAgent 完成后：

1. 生成 plan approval record。
2. 发布 approval.required 事件：

{
  "type": "approval.required",
  "payload": {
    "approvalId": "approval_xxx",
    "approvalType": "plan",
    "title": "Plan approval required",
    "summary": "PlannerAgent 生成了执行计划，请确认。",
    "contentPreview": "..."
  }
}

注意：

1. 本次不要求 Workflow 真暂停。
2. 可以继续执行后续步骤。
3. 但 UI 必须能看到 approvalId。
4. 用户点击 plan.approve 后能记录 decision。
5. 后续 Task 再做真正暂停恢复。

============================================================
七、Patch Approval 要求
============================================================

DeveloperAgent 输出后：

1. 如果检测到 proposedPatch / patch / diff / changedFiles，发布 patch.proposed 事件。
2. patch.proposed payload 中要尽量包含：
   - patchId，可选
   - summary
   - contentPreview
   - files，可选
   - needsApproval = true

如果当前 DeveloperAgent 只是输出文本，无法生成 ProposedPatch 结构，则：

1. 创建一个 PatchStore placeholder patch。
2. patch 内容可以是 Developer 输出里的 proposedPatch 文本。
3. 如果无法安全解析文件路径，不要应用。
4. patch.apply 应返回 PATCH_NOT_APPLICABLE 或 PATCH_NOT_FOUND，而不是乱写文件。

更推荐：
- 本次 patch.proposed 只负责 UI 识别和 openDiff/apply 已有测试 patch。
- 不强行把 LLM 文本解析成真实 patch。

要求：

1. patch.openDiff 使用 currentPatchId 或 latest patch。
2. patch.apply 必须用户点击后才执行。
3. patch.reject 必须用户点击后才执行。
4. patch.apply 仍然走 WorkspaceGuard / SensitiveFileGuard。
5. 不自动调用 patch.apply。

============================================================
八、Command Approval 要求

保持现有 TerminalTools 安全闭环。

本次要补 UI 和 message linkage：

1. 如果 Webview 收到 command approval 事件或 command.debug.requestMvnTest 结果：
   - 保存 currentCommandId。
   - 显示命令。
   - 显示 pending 状态。

2. command.approveOnce：
   - 带 currentCommandId。
   - 调用 TerminalTools.approveAndRun。
   - 显示 exitCode / stdout / stderr 摘要。

3. command.reject：
   - 带 currentCommandId。
   - 调用 TerminalTools.rejectCommand。
   - 显示 rejected。

4. command.addAllowlist：
   - 带 currentCommandId。
   - 调用 TerminalTools.addCommandToAllowlist。
   - 显示 allowlist updated。

不要自动执行命令。

============================================================
九、ExtensionApiClient 要求

修改 src/runtime/ExtensionApiClient.ts。

新增：

1. decideApproval(serviceUrl: string, taskId: string, approvalId: string, payload: unknown): Promise<unknown>
2. listApprovals(serviceUrl: string, taskId: string): Promise<unknown>

decideApproval 请求：

POST `${serviceUrl}/api/tasks/${taskId}/approvals/${approvalId}/decide`

listApprovals 请求：

GET `${serviceUrl}/api/tasks/${taskId}/approvals`

要求：

1. 超时 10000ms。
2. 返回 JSON。
3. HTTP 非 2xx 抛 Error。
4. 不打印 API Key。

============================================================
十、RuntimeManager 要求

新增：

1. decideApproval(taskId: string, approvalId: string, payload: unknown): Promise<unknown>
2. listApprovals(taskId: string): Promise<unknown>

逻辑：

1. 确认 Runtime 正在运行。
2. 调用 ExtensionApiClient。
3. 返回结果。
4. Runtime 未启动返回 RUNTIME_NOT_RUNNING。

============================================================
十一、MessageDispatcher 要求

修改 src/webview/MessageDispatcher.ts。

实现真实 Plan Approval action：

------------------------------------------------------------
1. plan.approve
------------------------------------------------------------

逻辑：

1. 从 payload 或 fields 读取：
   - currentTaskId
   - currentPlanApprovalId

2. 如果没有，返回 APPROVAL_ID_REQUIRED。

3. 调用 RuntimeManager.decideApproval(taskId, approvalId, {
   action: "approve",
   message: "Approved from VS Code Webview"
})

4. 返回：

{
  "ok": true,
  "type": "plan.approve.result",
  "payload": {
    "message": "Plan approved",
    "approval": {...}
  }
}

------------------------------------------------------------
2. plan.revise
------------------------------------------------------------

逻辑：

1. 读取 taskId / approvalId。
2. 读取 task.followupMessage 或 plan.reviseMessage。
3. 调用 decideApproval action=revise。
4. 返回 Plan revision requested。

------------------------------------------------------------
3. plan.saveAsTemplate
------------------------------------------------------------

本次仍可以 placeholder，不做真实模板保存。

------------------------------------------------------------
4. patch.openDiff / patch.apply / patch.reject
------------------------------------------------------------

确认已接真实 PatchTools。

如果已经实现，补齐 currentPatchId payload 支持。

要求：

- patch.openDiff 使用 payload.patchId。
- patch.apply 使用 payload.patchId。
- patch.reject 使用 payload.patchId 和 reason。

------------------------------------------------------------
5. command.approveOnce / command.reject / command.addAllowlist
------------------------------------------------------------

确认已接真实 TerminalTools。

如果已经实现，补齐 currentCommandId payload 支持。

要求：

- command.approveOnce 使用 payload.commandId。
- command.reject 使用 payload.commandId。
- command.addAllowlist 使用 payload.commandId。

不要破坏其他 action。

============================================================
十二、Webview 状态要求

修改 media/webview-bridge.js。

前端状态中至少保存：

state.currentTaskId
state.currentPlanApprovalId
state.currentPatchId
state.currentCommandId

当收到 task.create.result：

1. 保存 currentTaskId。

当收到 approval.required：

1. 如果 approvalType=plan：
   - 保存 currentPlanApprovalId。
   - 显示 Plan Approval 区。
   - 显示 summary / contentPreview。

当点击 plan.approve：

1. payload 附加：
   - taskId: state.currentTaskId
   - approvalId: state.currentPlanApprovalId

当点击 plan.revise：

1. payload 附加：
   - taskId
   - approvalId
   - reviseMessage，来自 task.followupMessage 或 plan.reviseMessage

当收到 patch.proposed：

1. 保存 currentPatchId，如果 event 有 patchId。
2. 显示 Patch 区。
3. 显示 summary / files / contentPreview。

当点击 patch.openDiff / patch.apply / patch.reject：

1. payload 附加：
   - patchId: state.currentPatchId

当收到 command pending result 或 approval.required type=command：

1. 保存 currentCommandId。
2. 显示 Command Approval 区。

当点击 command.approveOnce / command.reject / command.addAllowlist：

1. payload 附加：
   - commandId: state.currentCommandId

============================================================
十三、Webview 显示要求

Plan 区：

1. 显示 approvalId。
2. 显示 Plan summary。
3. plan.approve 成功后显示：
   Plan approved
4. plan.revise 成功后显示：
   Plan revision requested

Patch 区：

1. 显示 patchId。
2. 显示 patch summary。
3. patch.openDiff 成功后显示：
   Diff opened
4. patch.apply 成功后显示：
   Patch applied
5. patch.reject 成功后显示：
   Patch rejected

Command 区：

1. 显示 commandId。
2. 显示 command。
3. approveOnce 成功后显示 exitCode / durationMs。
4. reject 成功后显示 rejected。
5. addAllowlist 成功后显示 allowlist updated。

event-log 不要无限刷内容。
每条长文本最多 3000 字符。

============================================================
十四、安全要求

必须保证：

1. plan.approve 只记录 approval，不自动执行危险动作。
2. patch.apply 必须用户点击后才执行。
3. command.approveOnce 必须用户点击后才执行。
4. patch.apply 仍然走 WorkspaceGuard。
5. patch.apply 仍然拦截敏感文件。
6. command.approveOnce 仍然走 allowlist / blocklist。
7. command.approveOnce 仍然拦截危险组合命令。
8. 不自动 approve。
9. 不自动 apply patch。
10. 不自动 execute command。
11. API Key 不进入 Webview。
12. API Key 不进入 event-log。
13. API Key 不进入 console。

============================================================
十五、不要做的事情

本次不要做：

1. 不要实现完整 Workflow 暂停恢复。
2. 不要让 plan.approve 恢复 Workflow。
3. 不要让 plan.revise 重新跑 Planner。
4. 不要自动 apply patch。
5. 不要自动执行命令。
6. 不要实现 Git 写操作。
7. 不要实现 Team GroupChat。
8. 不要实现复杂 retry。
9. 不要修改 Demo / prototype。
10. 不要修改 docs。

============================================================
十六、验收标准

完成后必须满足：

1. npm run compile 通过。
2. Python Service 可以启动。
3. task.create 后 Webview 能收到 approval.required plan。
4. Webview 能保存 currentTaskId。
5. Webview 能保存 currentPlanApprovalId。
6. 点击 plan.approve 能调用 Python approval decide API。
7. plan.approve 成功后 event-log 显示 Plan approved。
8. 点击 plan.revise 能记录 revise decision。
9. Webview 收到 patch.proposed 后能显示 Patch 区。
10. patch.openDiff 使用 currentPatchId 或 latest patch。
11. patch.apply 仍然必须用户点击才执行。
12. patch.reject 可以拒绝 patch。
13. command.approveOnce 使用 currentCommandId。
14. command.reject 可以拒绝 pending command。
15. command.addAllowlist 可以更新 allowlist。
16. patch.apply 不会写 workspace 外文件。
17. command.approveOnce 不会执行 blocklist 命令。
18. 没有自动 apply_patch。
19. 没有自动 run_command。
20. Settings / Agents / Team / Workflow / Tools 保存不受影响。
21. API Key 没有进入 Webview / event-log / console。
22. 没有修改 Demo / prototype / docs。

运行验收命令：

npm run compile

手动测试建议：

1. 保存 Gemini API Key。
2. 点击 runtime.start。
3. Run 页输入一个代码分析任务。
4. 点击发送给 AutoGen Team。
5. 等待 Plan Approval 出现。
6. 点击接受计划。
7. 确认 event-log 显示 Plan approved。
8. 点击生成测试 Patch。
9. 点击查看 Diff。
10. 点击应用 Patch。
11. 点击生成测试命令。
12. 点击允许一次或拒绝。
13. 确认所有操作都必须由用户点击触发。

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. Python Approval API 实现了哪些接口。
5. plan.approve / plan.revise 如何调用 approval decide。
6. patch.openDiff / patch.apply / patch.reject 是否支持 currentPatchId。
7. command.approveOnce / command.reject / command.addAllowlist 是否支持 currentCommandId。
8. Webview 保存了哪些 current state。
9. npm run compile 是否通过。
10. 是否确认没有自动 apply_patch / run_command。
11. 是否确认 API Key 没有进入 Webview / event-log / console。
12. 下一步建议执行哪个 Task。