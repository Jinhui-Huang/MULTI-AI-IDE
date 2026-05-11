你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 3A：实现 Settings 页配置的本地保存与加载。

当前上下文：
Task 1 已完成：
- VS Code 插件可以编译和启动
- AutoGen Control Webview 可以打开
- Webview ⇄ Extension 的 task.create placeholder 链路可用

Task 2A～2F 已完成：
- Webview 已经有 6 个 Tab：Run / Agents / Team / Tools / Workflow / Settings
- 六个 Tab 可以切换
- Run / Agents / Team / Tools / Workflow / Settings 页面控件框子已补齐
- 所有主要按钮已有 data-action
- 所有主要 input/select/textarea/checkbox 已有 data-field
- webview-bridge.js 可以统一绑定 data-action
- collectFields() 可以收集 data-field
- MessageDispatcher 可以返回 placeholder success
- Webview 空白问题已修复
- event-log 可以显示 sent / response
- settings.apiKey 在日志中已经脱敏

用户当前只有 Gemini API Key。
本项目第一阶段默认使用 Gemini 的 OpenAI-compatible endpoint，不使用 OpenAI key，不默认使用 Ollama。

默认 Settings 必须使用：
- settings.provider = openai_compatible
- settings.baseUrl = https://generativelanguage.googleapis.com/v1beta/openai/
- settings.model = gemini-3-flash-preview
- settings.fallbackModel = gemini-3-flash-preview

API Key 仍然使用 settings.apiKey 字段，并保存到 VS Code SecretStorage。

不要把 provider 写死成 openai。
不要把默认 baseUrl 写成 https://api.openai.com/v1。
不要把默认模型写成 gpt-4.1。
不要把默认模型写成 qwen / ollama。

============================================================
一、本次目标
============================================================

实现 Settings 页配置的本地保存和加载。

必须完成：

1. 实现或修正 ConfigStore。
2. 实现或修正 SecretStore。
3. 实现 settings.save 的真实保存。
4. 实现 settings.load。
5. Webview 初始化时自动触发 settings.load。
6. Settings 页控件能根据 settings.load.result 回填。
7. API Key 使用 VS Code SecretStorage 保存。
8. 普通 Settings 使用 VS Code globalState 保存。
9. settings.apiKey 不允许保存到 globalState。
10. event-log 中不允许出现明文 API Key。
11. npm run compile 通过。

本次不要做：
- Runtime 启动
- Python 服务启动
- AutoGen 接入
- WebSocket
- 模型真实连接测试
- 文件工具
- Diff / Patch
- Git
- Terminal
- Agent / Team / Workflow / Tools 配置真实保存

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. src/extension.ts
2. src/webview/AgentControlPanelProvider.ts
3. src/webview/MessageDispatcher.ts
4. src/storage/ConfigStore.ts
5. src/storage/SecretStore.ts
6. media/webview.html
7. media/webview-bridge.js
8. package.json

可以只读参考：
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
2. src/storage/SecretStore.ts
3. src/webview/MessageDispatcher.ts
4. src/webview/AgentControlPanelProvider.ts
5. media/webview-bridge.js
6. media/webview.html

必要时可以小改：
7. src/extension.ts
8. src/types/messages.ts
9. 新增 src/types/settings.ts

禁止修改：
1. prototype 目录
2. docs 目录，除非只读
3. agent-service 目录
4. src/tools 目录
5. src/runtime 目录
6. config 目录

============================================================
四、Settings 字段保存范围
============================================================

本次只保存 Settings 页字段。

需要保存这些普通字段：

settings.provider
settings.baseUrl
settings.model
settings.fallbackModel
settings.useSecretStorage
settings.serviceUrl
settings.host
settings.port
settings.pythonPath
settings.autogenPackage
settings.logLevel
settings.workspaceStoragePath
settings.maxFilesRead
settings.maxContextTokens
settings.requirePlanApproval
settings.requirePatchApproval
settings.requireCommandApproval
settings.createCheckpointBeforePatch
settings.redactSecretsInLogs

API Key 字段：

settings.apiKey

要求：

1. settings.apiKey 不保存到普通 settings 对象。
2. settings.apiKey 不保存到 globalState。
3. settings.apiKey 必须保存到 VS Code SecretStorage。
4. SecretStorage key 使用：
   autogenAgent.apiKey
5. 如果 settings.useSecretStorage 为 true 且 settings.apiKey 非空，则保存 API Key。
6. 如果 settings.apiKey 为空，不要覆盖已有 SecretStorage 中的 key。
7. 本次不需要实现清空 API Key 的 UI。
8. 回填到 Webview 时，不回填明文 API Key。
9. 如果 API Key 已保存，返回：
   apiKeySaved = true
10. 页面显示：
   API Key saved in SecretStorage

============================================================
五、ConfigStore 要求
============================================================

检查或实现 src/storage/ConfigStore.ts。

要求基于 ExtensionContext 的 globalState。

至少提供这些方法：

1. loadSettings(): Promise<Record<string, unknown>>
2. saveSettings(settings: Record<string, unknown>): Promise<void>
3. getDefaultSettings(): Record<string, unknown>

保存 key：

autogenAgent.settings

默认 settings 必须是 Gemini OpenAI-compatible：

{
  "settings.provider": "openai_compatible",
  "settings.baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai/",
  "settings.model": "gemini-3-flash-preview",
  "settings.fallbackModel": "gemini-3-flash-preview",
  "settings.useSecretStorage": true,
  "settings.serviceUrl": "http://127.0.0.1:8765",
  "settings.host": "127.0.0.1",
  "settings.port": 8765,
  "settings.pythonPath": "python",
  "settings.autogenPackage": "autogen-agentchat",
  "settings.logLevel": "info",
  "settings.workspaceStoragePath": "",
  "settings.maxFilesRead": 30,
  "settings.maxContextTokens": 64000,
  "settings.requirePlanApproval": true,
  "settings.requirePatchApproval": true,
  "settings.requireCommandApproval": true,
  "settings.createCheckpointBeforePatch": true,
  "settings.redactSecretsInLogs": true
}

saveSettings 要求：

1. 保存前移除 settings.apiKey。
2. 保存前移除 apiKey。
3. 合并默认值和用户传入值。
4. 使用 context.globalState.update("autogenAgent.settings", sanitizedSettings)。
5. 不要保存 undefined 字段。
6. 不要抛出未捕获异常。

loadSettings 要求：

1. 读取 globalState。
2. 如果没有保存过，返回默认 settings。
3. 返回值不能包含 settings.apiKey。
4. 返回值不能包含 apiKey。

============================================================
六、SecretStore 要求
============================================================

检查或实现 src/storage/SecretStore.ts。

要求基于 ExtensionContext 的 secrets。

至少提供：

1. saveApiKey(value: string): Promise<void>
2. hasApiKey(): Promise<boolean>
3. deleteApiKey(): Promise<void>
4. getApiKey(): Promise<string | undefined>

SecretStorage key：

autogenAgent.apiKey

要求：

1. saveApiKey 只在 value 非空时保存。
2. hasApiKey 返回是否存在非空 key。
3. deleteApiKey 可以实现但本次不接 UI。
4. getApiKey 可以实现但本次不要把值传给 Webview。
5. 不要在 console.log 或 event-log 输出 API Key。

============================================================
七、MessageDispatcher 要求
============================================================

修改 src/webview/MessageDispatcher.ts。

要求：

1. MessageDispatcher 构造函数可以接收 ConfigStore 和 SecretStore。
2. settings.save 不再是 placeholder。
3. settings.load 是真实读取。
4. 其他 Settings action 暂时仍然 placeholder。
5. 不破坏已有 Run / Agents / Team / Tools / Workflow placeholder action。
6. 未知 action 继续返回 UNKNOWN_ACTION。

settings.save 处理逻辑：

1. 从 message.payload.fields 中读取 Settings 字段。
2. 取出 settings.apiKey。
3. 从待保存普通 settings 中删除 settings.apiKey。
4. 调用 ConfigStore.saveSettings 保存普通 settings。
5. 如果 settings.useSecretStorage 为 true 且 settings.apiKey 非空：
   调用 SecretStore.saveApiKey。
6. 调用 SecretStore.hasApiKey。
7. 返回：

{
  "ok": true,
  "type": "settings.save.result",
  "requestId": "...",
  "payload": {
    "message": "Settings saved",
    "apiKeySaved": true 或 false
  }
}

settings.load 处理逻辑：

1. 调用 ConfigStore.loadSettings。
2. 调用 SecretStore.hasApiKey。
3. 返回：

{
  "ok": true,
  "type": "settings.load.result",
  "requestId": "...",
  "payload": {
    "settings": { ... },
    "apiKeySaved": true 或 false
  }
}

注意：
settings.load.result.payload.settings 里不能包含 settings.apiKey。

============================================================
八、AgentControlPanelProvider 要求
============================================================

修改 src/webview/AgentControlPanelProvider.ts。

要求：

1. 创建 MessageDispatcher 时传入 ConfigStore 和 SecretStore。
2. 如果 ConfigStore / SecretStore 当前在 extension.ts 中创建，则保持结构一致。
3. 如果当前 MessageDispatcher 由 Provider 内部创建，则 Provider 构造函数需要接收 ConfigStore / SecretStore。
4. 不要在 Provider 里实现复杂业务逻辑。
5. Provider 只负责 Webview 加载、消息接收、转发 dispatch、postMessage 回包。

Webview 初始化加载 settings 的推荐方案：

- media/webview-bridge.js DOMContentLoaded 后自动发送 settings.load
- MessageDispatcher 返回 settings.load.result
- webview-bridge.js 收到后回填 Settings 表单

============================================================
九、webview-bridge.js 要求
============================================================

修改 media/webview-bridge.js。

必须实现：

1. DOMContentLoaded 后自动发送 settings.load。
2. 收到 settings.load.result 后，调用 applyFields(settings) 回填表单。
3. 实现 applyFields(fields)。
4. 如果 apiKeySaved 为 true，显示 API Key saved in SecretStorage。
5. 不要把真实 API Key 写入页面。
6. settings.apiKey 日志必须脱敏。

applyFields(fields) 要支持：

- input[type=text]
- input[type=number]
- input[type=password]
- input[type=checkbox]
- select
- textarea

回填规则：

1. 根据 data-field 找控件。
2. checkbox 使用 checked = Boolean(value)。
3. number input 使用 String(value)。
4. select 使用 value。
5. textarea 使用 value。
6. password input 不回填 settings.apiKey 明文。

初始化流程：

DOMContentLoaded 后：
1. 初始化已有事件绑定。
2. 写日志：Webview bridge initialized。
3. 发送 settings.load。
4. 写日志：→ sent: settings.load。

收到 settings.load.result：
1. 写日志：← response: settings.load.result。
2. applyFields(payload.settings)。
3. 如果 payload.apiKeySaved 为 true，更新 #api-key-status。

收到 settings.save.result：
1. 写日志：← response: settings.save.result。
2. 如果 payload.apiKeySaved 为 true，更新 #api-key-status。
3. 显示 Settings saved。

日志脱敏要求：

如果日志内容中包含 key：
- settings.apiKey
- apiKey

显示值必须是 "***"。

可以实现函数：

sanitizeForLog(value)

要求：
- 不改变真实发送 payload。
- 只用于 event-log 显示。
- 支持嵌套对象。

============================================================
十、HTML 要求
============================================================

检查 media/webview.html 的 Settings 页。

如果没有 API Key 状态展示，增加：

<div id="api-key-status" class="form-hint"></div>

确保 Settings 页至少存在以下 data-field：

settings.provider
settings.baseUrl
settings.model
settings.fallbackModel
settings.apiKey
settings.useSecretStorage
settings.serviceUrl
settings.host
settings.port
settings.pythonPath
settings.autogenPackage
settings.logLevel
settings.workspaceStoragePath
settings.maxFilesRead
settings.maxContextTokens
settings.requirePlanApproval
settings.requirePatchApproval
settings.requireCommandApproval
settings.createCheckpointBeforePatch
settings.redactSecretsInLogs

如果字段缺失，只补 Settings 页缺失字段。
不要动其他页面结构。

============================================================
十一、不要做的事情
============================================================

本次不要做：

1. 不要实现 Runtime 启动。
2. 不要实现 runtime.health 真实检查。
3. 不要实现 settings.testModel 真实模型连接。
4. 不要实现 settings.import / export 真实文件操作。
5. 不要实现 AutoGen。
6. 不要启动 Python。
7. 不要接 WebSocket。
8. 不要实现文件工具。
9. 不要实现 Diff/Patch。
10. 不要实现 Git。
11. 不要实现 Terminal。
12. 不要保存 Agent / Team / Tools / Workflow 配置。
13. 不要修改 Demo / prototype。
14. 不要修改 docs。

============================================================
十二、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. Webview 打开后自动触发 settings.load。
3. Settings 页控件能回填 Gemini 默认设置。
4. 默认 provider 是 openai_compatible。
5. 默认 baseUrl 是 https://generativelanguage.googleapis.com/v1beta/openai/。
6. 默认 model 是 gemini-3-flash-preview。
7. 默认 fallbackModel 是 gemini-3-flash-preview。
8. 修改 Settings 页字段后点击 settings.save，返回 Settings saved。
9. 刷新 / 重新打开 Webview 后，普通 Settings 字段仍然存在。
10. settings.apiKey 不存入 globalState。
11. settings.apiKey 使用 SecretStorage 保存。
12. event-log 中不出现明文 API Key。
13. 如果 API Key 已保存，页面显示 API Key saved in SecretStorage。
14. Run / Agents / Team / Tools / Workflow 页已有 placeholder action 不受影响。
15. 没有接 AutoGen / Python / WebSocket / 真实工具。
16. 没有修改 Demo / prototype / docs。

运行验收命令：

npm run compile

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. ConfigStore 实现了哪些方法。
5. SecretStore 实现了哪些方法。
6. settings.save 是否真实保存。
7. settings.load 是否能回填。
8. 默认配置是否已改成 Gemini OpenAI-compatible。
9. API Key 是否使用 SecretStorage。
10. 是否确认 API Key 不会明文进入 event-log。
11. npm run compile 是否通过。
12. 是否确认没有接 AutoGen / Python / WebSocket / 真实工具。
13. 下一步建议执行哪个 Task。