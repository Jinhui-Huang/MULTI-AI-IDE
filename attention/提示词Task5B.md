你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 5B：实现 Diff / Patch 工具的最小闭环：propose_patch、open_diff、apply_patch placeholder 到 VS Code 文件系统安全应用。

当前上下文：
Task 1 已完成：
- VS Code 插件可以编译和启动
- AutoGen Control Webview 可以打开
- Webview ⇄ Extension 基础 placeholder 链路可用

Task 2A～2F 已完成：
- Webview 已经有 6 个 Tab：Run / Agents / Team / Tools / Workflow / Settings
- 所有页面控件框子已补齐
- 所有主要按钮已有 data-action
- 所有主要表单已有 data-field
- event-log 可以显示 sent / response
- settings.apiKey 在日志中已经脱敏

Task 3A～3D 已完成：
- Settings / Agents / Team / Workflow / Tools 配置可以本地保存和加载
- API Key 使用 VS Code SecretStorage
- 普通配置使用 VS Code globalState
- 默认模型配置使用 Gemini OpenAI-compatible

Task 4A～4C 已完成：
- Python Service 可以启动 / 停止 / 健康检查
- task.create 可以创建 placeholder task
- WebSocket placeholder event stream 可以转发到 Webview

Task 5A 已完成：
- VS Code Tool 基础文件工具已实现
- WorkspaceGuard 已实现
- list_files / read_file / search_code 已实现
- 敏感文件拦截已实现
- workspace 外路径拦截已实现

本次只做 Diff / Patch 最小能力。
不要接真实 AutoGen。
不要调用 Gemini。
不要实现 run_command。
不要实现 Git。
不要实现复杂 patch parser。
不要实现多文件复杂冲突处理。

============================================================
一、本次目标
============================================================

实现 VS Code Extension 侧 Diff / Patch 工具的最小闭环：

1. propose_patch：接收一个 proposed patch 对象并保存到内存 PatchStore。
2. open_diff：在 VS Code 中打开 proposed patch 的 diff 预览。
3. apply_patch：在用户确认后，把简单 patch 应用到 workspace 文件。
4. reject_patch：拒绝 patch。
5. Patch 操作必须经过 WorkspaceGuard。
6. Patch 操作不能修改 workspace 外文件。
7. Patch 操作不能修改敏感文件。
8. Patch 应用前必须检查 Tools/Safety 配置中的 confirmApplyPatch。
9. 本次可以只支持“整文件替换型 patch”，不必支持完整 unified diff parser。
10. Webview 点击 patch.openDiff / patch.apply / patch.reject 能调用真实 Extension 逻辑或最小逻辑。
11. npm run compile 通过。

本次不要做：

- 真实 AutoGen 生成 patch
- Gemini 调用
- run_command
- git apply
- Git checkpoint
- Terminal
- 完整 unified diff 解析
- 复杂三方 merge
- 多 workspace 支持

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. src/tools/WorkspaceGuard.ts
2. src/tools/FileTools.ts
3. src/tools/ToolRouter.ts
4. src/tools/DiffTools.ts
5. src/tools/PatchTools.ts
6. src/storage/ConfigStore.ts
7. src/webview/MessageDispatcher.ts
8. src/extension.ts
9. media/webview.html
10. media/webview-bridge.js
11. package.json

可以只读参考：
12. docs/08_VSCode文件_Diff_Terminal_Git工具联调详细设计.md
13. docs/07_Tools工具系统与权限控制详细设计.md
14. docs/11_安全边界与沙箱策略详细设计.md

不要主动阅读其他 docs。
不要修改 prototype / demo。
不要接真实 AutoGen。
不要调用 Gemini。
不要实现 Terminal/Git。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. src/tools/DiffTools.ts
2. src/tools/PatchTools.ts
3. src/tools/ToolRouter.ts
4. src/tools/WorkspaceGuard.ts
5. src/storage/ConfigStore.ts
6. src/webview/MessageDispatcher.ts
7. src/extension.ts
8. media/webview-bridge.js
9. media/webview.html

必要时可以新增：
10. src/tools/PatchStore.ts
11. src/types/patch.ts
12. src/tools/VirtualDocumentProvider.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. agent-service 目录
4. src/runtime 目录
5. config 目录

============================================================
四、Patch 数据结构要求
============================================================

本次不要强行实现完整 unified diff parser。

使用简单安全的 ProposedPatch 结构：

{
  "id": "patch_xxx",
  "taskId": "task_xxx",
  "summary": "Add AuthController",
  "status": "proposed",
  "createdAt": "...",
  "files": [
    {
      "path": "src/main/java/example/AuthController.java",
      "changeType": "add",
      "oldContent": "",
      "newContent": "..."
    },
    {
      "path": "pom.xml",
      "changeType": "modify",
      "oldContent": "...",
      "newContent": "..."
    }
  ]
}

字段说明：

- id：patch 唯一 id。
- taskId：关联 task，可选。
- status：proposed / applied / rejected。
- files：文件变更列表。
- path：workspace 相对路径。
- changeType：add / modify / delete。
- oldContent：旧内容。
- newContent：新内容。

本次 apply_patch 只支持：
- add
- modify

delete 可以先拒绝，返回：
PATCH_DELETE_NOT_SUPPORTED

============================================================
五、PatchStore 要求
============================================================

新增或实现 src/tools/PatchStore.ts。

PatchStore 可以是内存存储。

必须提供：

1. createPatch(input: Partial<ProposedPatch>): ProposedPatch
2. getPatch(patchId: string): ProposedPatch | undefined
3. listPatches(): ProposedPatch[]
4. updatePatchStatus(patchId: string, status: "proposed" | "applied" | "rejected"): ProposedPatch
5. getLatestPatch(): ProposedPatch | undefined

要求：

1. patchId 使用 patch_ + 时间戳 + 随机短 id。
2. createPatch 如果没有 files，就创建一个 placeholder patch。
3. PatchStore 不需要持久化。
4. 不要保存 API Key。
5. 不要读取 workspace 外文件。

============================================================
六、DiffTools 要求
============================================================

实现或修正 src/tools/DiffTools.ts。

必须提供：

openDiff(patch: ProposedPatch): Promise<unknown>

要求：

1. 对 patch.files 中每个文件打开 diff。
2. 使用 vscode.diff 命令。
3. 左侧是 oldContent 虚拟文档。
4. 右侧是 newContent 虚拟文档。
5. 可以只打开第一个文件的 diff，其他文件写入返回结果。
6. 使用 VirtualDocumentProvider 或临时 Uri 实现虚拟内容。
7. 不要直接写文件。
8. 不要调用 git diff。
9. 不要使用外部命令。

如果实现虚拟文档复杂，可以第一版使用 workspace.fs 写入 extension globalStorageUri 下的临时 diff 文件，但必须：
- 临时文件放在 extension storage 内
- 不写入用户 workspace
- 不污染源码目录

返回示例：

{
  "ok": true,
  "message": "Diff opened",
  "patchId": "patch_xxx",
  "openedFiles": ["src/main/java/example/AuthController.java"]
}

============================================================
七、PatchTools 要求
============================================================

实现或修正 src/tools/PatchTools.ts。

必须提供：

1. proposePatch(input: Partial<ProposedPatch>): Promise<unknown>
2. openPatchDiff(patchId?: string): Promise<unknown>
3. applyPatch(patchId?: string): Promise<unknown>
4. rejectPatch(patchId?: string, reason?: string): Promise<unknown>

------------------------------------------------------------
1. proposePatch
------------------------------------------------------------

要求：

1. 创建 ProposedPatch。
2. 如果 input.files 为空，创建一个安全 placeholder patch。
3. placeholder patch 不要覆盖真实重要文件。
4. placeholder 可以使用路径：
   .autogen-placeholder/placeholder.txt
5. 但 apply 时不要默认应用 placeholder，除非用户明确 apply。
6. 返回 patch。

返回：

{
  "ok": true,
  "message": "Patch proposed",
  "patch": {...}
}

------------------------------------------------------------
2. openPatchDiff
------------------------------------------------------------

要求：

1. 如果传 patchId，打开该 patch。
2. 如果没有 patchId，打开 latest patch。
3. 找不到 patch 返回 PATCH_NOT_FOUND。
4. 调用 DiffTools.openDiff。

------------------------------------------------------------
3. applyPatch
------------------------------------------------------------

要求：

1. 如果传 patchId，应用该 patch。
2. 如果没有 patchId，应用 latest patch。
3. 找不到 patch 返回 PATCH_NOT_FOUND。
4. 检查 Tools/Safety 配置：
   - safety.confirmApplyPatch 或 globalSafety.confirmApplyPatch 为 true 时，本次仍允许由用户点击 patch.apply 触发应用，认为已确认。
5. 每个文件 path 必须是 workspace 相对路径。
6. 每个文件必须通过 WorkspaceGuard。
7. 每个文件必须通过敏感文件检查。
8. changeType=add：
   - 如果文件已存在，返回 PATCH_TARGET_EXISTS。
   - 创建父目录。
   - 写入 newContent。
9. changeType=modify：
   - 如果文件不存在，返回 FILE_NOT_FOUND。
   - 如果 oldContent 非空，且当前文件内容与 oldContent 不一致：
     返回 PATCH_CONTENT_MISMATCH。
   - 如果 oldContent 为空，可以直接覆盖，但要在返回 warning 中说明。
   - 写入 newContent。
10. changeType=delete：
    - 本次不支持，返回 PATCH_DELETE_NOT_SUPPORTED。
11. 全部成功后 patch.status = applied。
12. 如果中途失败，不要继续应用后续文件。
13. 本次不要求 rollback。
14. 不要修改 workspace 外文件。
15. 不要修改敏感文件。

返回：

{
  "ok": true,
  "message": "Patch applied",
  "patchId": "patch_xxx",
  "files": [...]
}

------------------------------------------------------------
4. rejectPatch
------------------------------------------------------------

要求：

1. 找到 patch。
2. status 改为 rejected。
3. 保存 reason 到 patch 对象。
4. 返回：

{
  "ok": true,
  "message": "Patch rejected",
  "patch": {...}
}

============================================================
八、ToolRouter 要求
============================================================

修改 src/tools/ToolRouter.ts。

新增支持工具：

1. propose_patch
2. open_diff
3. apply_patch
4. reject_patch

工具调用示例：

{
  "tool": "propose_patch",
  "args": {
    "summary": "Add placeholder file",
    "files": [
      {
        "path": ".autogen-placeholder/placeholder.txt",
        "changeType": "add",
        "oldContent": "",
        "newContent": "hello"
      }
    ]
  }
}

{
  "tool": "open_diff",
  "args": {
    "patchId": "patch_xxx"
  }
}

{
  "tool": "apply_patch",
  "args": {
    "patchId": "patch_xxx"
  }
}

{
  "tool": "reject_patch",
  "args": {
    "patchId": "patch_xxx",
    "reason": "User rejected"
  }
}

未知工具继续返回 UNKNOWN_TOOL。

不要破坏 list_files / read_file / search_code。

============================================================
九、MessageDispatcher 要求
============================================================

修改 src/webview/MessageDispatcher.ts。

将这些 action 从 placeholder 改为调用 PatchTools / ToolRouter：

1. patch.openDiff
2. patch.apply
3. patch.reject
4. patch.explain 可以继续 placeholder
5. patch.applyPartial 可以继续 placeholder

另外新增开发测试 action：

1. patch.debug.proposePlaceholder

如果 UI 没有这个按钮，可以加到 Run 页 Patch 区域或 Tools Debug 区域。

patch.debug.proposePlaceholder 逻辑：

1. 创建 placeholder patch：
   path = .autogen-placeholder/placeholder.txt
   changeType = add
   oldContent = ""
   newContent = "AutoGen placeholder patch\n"
2. 返回 patch。
3. Webview 日志显示 patchId。

patch.openDiff 逻辑：

1. 从 payload.patchId 或当前 latest patch 取 patch。
2. 调用 openPatchDiff。
3. 返回结果。

patch.apply 逻辑：

1. 从 payload.patchId 或当前 latest patch 取 patch。
2. 调用 applyPatch。
3. 返回结果。

patch.reject 逻辑：

1. 从 payload.patchId 或当前 latest patch 取 patch。
2. 调用 rejectPatch。
3. 返回结果。

错误返回格式：

{
  "ok": false,
  "type": "patch.apply.result",
  "requestId": "...",
  "error": {
    "code": "PATCH_NOT_FOUND",
    "message": "..."
  }
}

不要破坏 Run / Settings / Agents / Team / Workflow / Tools 其他 action。

============================================================
十、Webview 要求
============================================================

修改 media/webview.html 和 media/webview-bridge.js。

如果 Run 页 Patch 区域没有测试按钮，增加：

<button data-action="patch.debug.proposePlaceholder">生成测试 Patch</button>

要求：

1. 点击 patch.debug.proposePlaceholder 后，event-log 显示 patchId。
2. 保存 currentPatchId 到前端状态。
3. 点击 patch.openDiff 时，如果有 currentPatchId，把 patchId 带给 Extension。
4. 点击 patch.apply 时，如果有 currentPatchId，把 patchId 带给 Extension。
5. 点击 patch.reject 时，如果有 currentPatchId，把 patchId 带给 Extension。
6. 如果没有 currentPatchId，也允许 Extension 使用 latest patch。
7. apply 成功后日志显示 Patch applied。
8. reject 成功后日志显示 Patch rejected。

不要大改 Run 页 UI。

============================================================
十一、安全要求
============================================================

必须保证：

1. apply_patch 不能写 workspace 外路径。
2. apply_patch 不能写敏感文件。
3. apply_patch 不能删除文件。
4. apply_patch 不能执行命令。
5. apply_patch 不能调用 Git。
6. apply_patch 只在用户点击 patch.apply 后发生。
7. propose_patch 只保存 patch，不写文件。
8. open_diff 只打开 diff，不写 workspace。
9. 文件内容不要无限制写入 event-log。
10. 错误要明确返回。

============================================================
十二、错误码要求
============================================================

至少支持这些错误码：

PATCH_NOT_FOUND
PATCH_TARGET_EXISTS
PATCH_CONTENT_MISMATCH
PATCH_DELETE_NOT_SUPPORTED
PATH_OUTSIDE_WORKSPACE
SENSITIVE_FILE_BLOCKED
FILE_NOT_FOUND
PATCH_APPLY_FAILED
DIFF_OPEN_FAILED

错误返回格式：

{
  "ok": false,
  "error": {
    "code": "PATCH_NOT_FOUND",
    "message": "Patch not found"
  }
}

============================================================
十三、不要做的事情
============================================================

本次不要做：

1. 不要接 AutoGen。
2. 不要调用 Gemini。
3. 不要启动 Python。
4. 不要改 Python Service。
5. 不要实现 WebSocket 新逻辑。
6. 不要实现 run_command。
7. 不要实现 Git。
8. 不要实现完整 unified diff parser。
9. 不要实现复杂 rollback。
10. 不要读取 API Key。
11. 不要修改 Demo / prototype。
12. 不要修改 docs。

============================================================
十四、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. patch.debug.proposePlaceholder 可以创建 patch。
3. patch.openDiff 可以打开 VS Code diff 预览。
4. patch.apply 可以把 placeholder patch 应用到 workspace 内安全路径。
5. patch.reject 可以拒绝 patch。
6. apply_patch 拒绝 workspace 外路径。
7. apply_patch 拒绝敏感文件。
8. apply_patch 不支持 delete，并返回 PATCH_DELETE_NOT_SUPPORTED。
9. propose_patch 不直接写文件。
10. open_diff 不直接写 workspace 文件。
11. ToolRouter 支持 propose_patch / open_diff / apply_patch / reject_patch。
12. list_files / read_file / search_code 不受影响。
13. Settings / Agents / Team / Workflow / Tools 配置保存不受影响。
14. 没有接 AutoGen / Gemini / Python / WebSocket / Terminal / Git。
15. 没有修改 Demo / prototype / docs。

运行验收命令：

npm run compile

手动测试建议：

1. 打开一个普通 workspace。
2. 点击“生成测试 Patch”。
3. 点击“查看 Diff”。
4. 确认 VS Code 打开 diff。
5. 点击“应用 Patch”。
6. 确认 workspace 下出现：
   .autogen-placeholder/placeholder.txt
7. 再次点击同一个 patch apply，应返回 PATCH_TARGET_EXISTS 或内容冲突。
8. 点击“拒绝”测试 reject 逻辑。

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. PatchStore 实现了哪些方法。
5. DiffTools 如何打开 diff。
6. PatchTools 支持哪些操作。
7. ToolRouter 新增了哪些工具。
8. patch.debug.proposePlaceholder 是否可用。
9. patch.openDiff 是否可用。
10. patch.apply 是否可用。
11. npm run compile 是否通过。
12. 是否确认没有接 AutoGen / Gemini / Python / WebSocket / Terminal / Git。
13. 下一步建议执行哪个 Task。