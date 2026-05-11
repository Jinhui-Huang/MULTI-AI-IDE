你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 10A：MVP 打包前整理，生成 README、运行说明、环境检查脚本和发布前清理。

当前上下文：
Task 1～9B 已完成或已接近完成：
- VS Code 插件可以启动
- Webview 六个 Tab 已完成
- Settings / Agents / Team / Workflow / Tools 配置可以保存加载
- Gemini OpenAI-compatible 模型配置和健康检查已完成
- Python Service 可以启动 / 停止 / 健康检查
- ToolServer 已完成
- ToolGateway 已完成
- AutoGen 单 Agent / 单 Agent + Tools / 多角色顺序调用 / WorkflowRunner 已完成
- Run 页 task.create 已接入 WorkflowRunner
- WebSocket task.event 已接入 Webview
- Plan / Patch / Command Approval 最小闭环已完成
- 9B 已做或正在做端到端自检和安全回归

本次只做打包前整理和文档，不新增大功能。
不要重构架构。
不要改核心业务逻辑。
不要接新模型。
不要新增 Agent 能力。
不要修改 Demo / prototype。
不要破坏现有功能。

============================================================
一、本次目标
============================================================

完成 MVP 打包前整理：

1. 生成项目 README.md。
2. 生成开发运行说明。
3. 生成用户使用说明。
4. 生成环境检查脚本。
5. 补充 .vscode 推荐配置。
6. 检查 package.json 打包字段。
7. 检查 .vscodeignore。
8. 检查 agent-service/requirements.txt。
9. 检查 npm run compile。
10. 检查 Python Service 基础启动。
11. 确保不会把 API Key、临时文件、缓存、node_modules、venv 打进包。
12. 输出最终自检结果。

本次不要做：

- 不要新增 AutoGen 功能
- 不要新增工具能力
- 不要改 UI 大布局
- 不要改核心执行流程
- 不要实现新 Workflow
- 不要实现新 Agent
- 不要修改 Demo / prototype
- 不要改安全规则放宽

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. package.json
2. README.md
3. .vscodeignore
4. tsconfig.json
5. src/extension.ts
6. src/runtime/RuntimeManager.ts
7. src/webview/MessageDispatcher.ts
8. media/webview.html
9. agent-service/main.py
10. agent-service/requirements.txt
11. docs 目录下已有总览类文档，如果存在

可以阅读：
12. docs/00_*
13. docs/01_*
14. docs/10_*
15. docs/11_*

不要主动大范围阅读所有 docs。
不要修改 prototype / demo。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. README.md
2. package.json
3. .vscodeignore
4. agent-service/requirements.txt
5. .vscode/launch.json
6. .vscode/tasks.json

允许新增：
7. docs/USER_MANUAL.md
8. docs/DEVELOPMENT.md
9. docs/MVP_CHECKLIST.md
10. scripts/check-env.ps1
11. scripts/check-env.bat
12. scripts/run-dev.ps1
13. scripts/run-service.ps1
14. scripts/package-vsix.ps1

必要时可小改：
15. src/extension.ts
16. src/runtime/RuntimeManager.ts

禁止修改：
1. prototype 目录
2. demo 原型文件
3. 核心业务逻辑，除非发现明显打包阻塞 bug
4. src/tools 安全规则
5. Webview 大布局

============================================================
四、README.md 要求
============================================================

生成或完善 README.md。

README.md 必须包含：

1. 项目名称：
   AutoGen Code Agent

2. 项目简介：
   一个 VS Code Webview + Python AutoGen Service 的多 Agent 代码助手 MVP。

3. 当前 MVP 能力：
   - Gemini OpenAI-compatible 配置
   - Settings 保存和 SecretStorage
   - Agents / Team / Workflow / Tools 配置
   - Runtime 启停
   - Python Service
   - ToolServer
   - ToolGateway
   - list_files / read_file / search_code
   - git_status / git_diff
   - propose_patch / open_diff / apply_patch / reject_patch
   - run_command 安全确认
   - WorkflowRunner
   - WebSocket task.event
   - Plan / Patch / Command Approval

4. 安全边界：
   - API Key 使用 VS Code SecretStorage
   - 不写入 globalState
   - 不进入日志
   - 文件访问限制在 workspace 内
   - 敏感文件拦截
   - 命令必须 allowlist + 用户确认
   - patch 必须用户确认
   - Git 只读

5. 环境要求：
   - VS Code 1.92+
   - Node.js
   - npm
   - Python 3.11 推荐
   - Gemini API Key

6. 安装依赖：
   npm install
   pip install -r agent-service/requirements.txt

7. 开发运行：
   npm run compile
   F5 启动 Extension Development Host

8. Python Service 启动方式：
   通过 Webview Settings 页 runtime.start
   或手动：
   python agent-service/main.py --host 127.0.0.1 --port 8765

9. Gemini 配置：
   provider = openai_compatible
   baseUrl = https://generativelanguage.googleapis.com/v1beta/openai/
   model = gemini-3-flash-preview
   fallbackModel = gemini-3-flash-preview

10. 使用步骤：
   - 打开 Settings
   - 保存 API Key
   - runtime.start
   - settings.testModel
   - 打开 Run
   - 输入任务
   - 发送给 AutoGen Team
   - 查看事件流
   - 处理 Plan / Patch / Command Approval

11. 打包：
   npm run package

12. 常见问题：
   - Webview 空白
   - Runtime 启动失败
   - API Key 缺失
   - Gemini 模型连接失败
   - ToolServer 不可用
   - workspace 未打开
   - 读取敏感文件被拒绝
   - 命令不在 allowlist

README 要真实，不要夸大。
未完成的功能必须写清楚是 MVP 或 placeholder。

============================================================
五、docs/USER_MANUAL.md 要求
============================================================

新增或更新 docs/USER_MANUAL.md。

内容基于 6 个 Tab 写：

1. Settings Tab
   - Gemini API Key 配置
   - SecretStorage
   - Runtime 配置
   - 测试模型连接

2. Agents Tab
   - PlannerAgent
   - CodebaseAgent
   - DeveloperAgent
   - ReviewerAgent
   - TesterAgent
   - SummaryAgent

3. Team Tab
   - Java Spring Boot Team
   - Frontend React Team
   - Explain Code Team
   - Bug Fix Team

4. Tools Tab
   - 权限矩阵
   - Command Allowlist
   - Command Blocklist
   - Sensitive File Blocklist
   - Global Safety

5. Workflow Tab
   - Code Edit Workflow
   - Bug Fix Workflow
   - Test Generation Workflow
   - Explain Code Workflow

6. Run Tab
   - 选择 Team / Workflow / Mode
   - 输入任务
   - 发送任务
   - 查看 Timeline
   - 查看 Agent 状态
   - 处理 Plan Approval
   - 处理 Patch Approval
   - 处理 Command Approval
   - 查看 Summary

要求：
- 使用步骤要详细。
- 不要写虚假功能。
- 明确说明 apply_patch / run_command 必须用户确认。
- 明确说明 Git 目前只读。
- 明确说明 Python Service 必须 runtime.start 后才能执行任务。

============================================================
六、docs/DEVELOPMENT.md 要求
============================================================

新增或更新 docs/DEVELOPMENT.md。

必须包含：

1. 项目结构说明：

src/
media/
agent-service/
docs/
scripts/

2. VS Code Extension 侧核心模块：

- extension.ts
- AgentControlPanelProvider
- MessageDispatcher
- ConfigStore
- SecretStore
- RuntimeManager
- ExtensionApiClient
- WebSocketClient
- ToolServer
- ToolRouter
- WorkspaceGuard
- FileTools
- PatchTools
- TerminalTools
- GitTools

3. Python Service 侧核心模块：

- main.py
- model_settings
- autogen_adapter
- agent_factory
- workflow_runner
- task_manager
- ws_manager
- tool_gateway

4. 通信链路：

Webview ⇄ Extension
Extension ⇄ Python HTTP
Python ⇄ Extension ToolServer
Python ⇄ Extension WebSocket event
Webview task.event

5. 开发命令：

npm install
npm run compile
npm run watch
python agent-service/main.py
python -m compileall agent-service

6. Debug 流程：

- F5 启动插件
- Settings 保存 Gemini API Key
- runtime.start
- settings.testModel
- Run task.create

7. 常见错误排查。

============================================================
七、docs/MVP_CHECKLIST.md 要求
============================================================

新增 docs/MVP_CHECKLIST.md。

必须包含 checklist：

1. 编译检查：
   - npm run compile
   - python -m compileall agent-service

2. Webview 检查：
   - 六个 Tab 可切换
   - Settings 可保存
   - event-log 正常
   - API Key 脱敏

3. Runtime 检查：
   - runtime.start
   - runtime.health
   - runtime.stop
   - ToolServer health

4. Model 检查：
   - config-safe 不含 API Key
   - model health 可用

5. Tool 检查：
   - list_files
   - read_file
   - search_code
   - git_status
   - git_diff

6. 安全检查：
   - .env 被拒绝
   - ../outside.txt 被拒绝
   - git push 被拒绝
   - npm test && git push 被拒绝
   - patch.apply 需要用户点击
   - command.approveOnce 需要用户点击

7. Workflow 检查：
   - task.create 返回 taskId
   - WebSocket event 正常
   - task.completed 或 task.failed 显示

8. 打包检查：
   - .vscodeignore 正确
   - node_modules 不打包
   - venv 不打包
   - API Key 不打包
   - 生成 vsix

============================================================
八、脚本要求
============================================================

新增 scripts 目录。

------------------------------------------------------------
1. scripts/check-env.ps1
------------------------------------------------------------

PowerShell 脚本检查：

1. node --version
2. npm --version
3. python --version
4. npm run compile
5. python -m compileall agent-service

要求：
- 输出清晰。
- 不安装依赖。
- 不打印 API Key。

------------------------------------------------------------
2. scripts/check-env.bat
------------------------------------------------------------

Windows CMD 版本。

检查：

node --version
npm --version
python --version
npm run compile
python -m compileall agent-service

------------------------------------------------------------
3. scripts/run-service.ps1
------------------------------------------------------------

启动 Python Service：

python agent-service/main.py --host 127.0.0.1 --port 8765

------------------------------------------------------------
4. scripts/package-vsix.ps1
------------------------------------------------------------

执行：

npm run compile
npm run package

要求：
- 如果失败，显示错误。
- 不自动发布 marketplace。

============================================================
九、package.json 检查
============================================================

检查 package.json。

必须确认：

1. name 合理。
2. displayName 合理。
3. description 合理。
4. version 存在。
5. publisher 可以是 local-dev。
6. engines.vscode 正确。
7. main = ./out/extension.js。
8. activationEvents 包含：
   - onView:autogenAgent.controlPanel
   - onCommand:autogenAgent.openPanel
   - onCommand:autogenAgent.startTask

9. contributes.viewsContainers 正确。
10. contributes.views id = autogenAgent.controlPanel。
11. scripts 包含：
   - compile
   - watch
   - package

12. devDependencies 包含：
   - typescript
   - @types/vscode
   - @types/node
   - @vscode/vsce

如果 package 脚本不存在，补：

"package": "vsce package"

如果 @vscode/vsce 不存在，补 devDependency。

不要改 view id，除非发现和代码不一致。

============================================================
十、.vscodeignore 要求
============================================================

新增或检查 .vscodeignore。

必须排除：

.git/**
.vscode/**
node_modules/**
out/**/*.map
src/**
tsconfig.json
*.vsix
prototype/**
docs/**/*.tmp
**/__pycache__/**
**/*.pyc
agent-service/.venv/**
agent-service/venv/**
agent-service/.pytest_cache/**
agent-service/.mypy_cache/**
.env
*.pem
*.key
id_rsa
id_ed25519
credentials.json

注意：

是否排除 agent-service 源码要谨慎。

如果 VSIX 运行时需要 agent-service，那么不要排除：
agent-service/main.py
agent-service/**/*.py
agent-service/requirements.txt

也就是说：
- 排除 agent-service 的缓存和虚拟环境
- 不排除 agent-service 源码

============================================================
十一、.vscode 配置要求
============================================================

如果没有 .vscode/launch.json，可以新增。

要求支持 Extension Development Host：

{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "npm: compile"
    }
  ]
}

如果没有 .vscode/tasks.json，可以新增 compile task。

不要加入用户机器绝对路径。

============================================================
十二、agent-service/requirements.txt 检查
============================================================

必须至少包含：

fastapi
uvicorn
httpx
autogen-agentchat
autogen-ext[openai]

如果已有其他必要依赖，保留。

不要加入无关大型依赖。
不要加入用户本地路径。

============================================================
十三、安全清理要求
============================================================

检查项目中是否存在明显敏感信息。

不要扫描过大目录。
重点检查：

1. README.md
2. docs
3. scripts
4. package.json
5. agent-service
6. src

确认没有：

1. 真实 Gemini API Key
2. Authorization: Bearer 明文
3. .env 内容
4. 私钥
5. 个人绝对路径，例如 D:\xxx\secret
6. 测试 token

如果发现，删除或替换为：

<YOUR_GEMINI_API_KEY>

============================================================
十四、不要做的事情
============================================================

本次不要做：

1. 不要新增功能。
2. 不要重构核心逻辑。
3. 不要修改 ToolServer 安全规则。
4. 不要放宽 WorkspaceGuard。
5. 不要开启 shell:true。
6. 不要自动 apply_patch。
7. 不要自动 run_command。
8. 不要接新模型。
9. 不要修改 Demo / prototype。
10. 不要删除已有 Debug action。
11. 不要把 agent-service 源码排除出 VSIX。
12. 不要把 API Key 写进任何文档。

============================================================
十五、验收标准
============================================================

完成后必须满足：

1. README.md 存在且内容完整。
2. docs/USER_MANUAL.md 存在。
3. docs/DEVELOPMENT.md 存在。
4. docs/MVP_CHECKLIST.md 存在。
5. scripts/check-env.ps1 存在。
6. scripts/check-env.bat 存在。
7. scripts/run-service.ps1 存在。
8. scripts/package-vsix.ps1 存在。
9. package.json scripts.package 可用。
10. .vscodeignore 存在且不排除 agent-service 源码。
11. .vscode/launch.json 可用于 F5 调试。
12. agent-service/requirements.txt 包含必要依赖。
13. npm run compile 通过。
14. python -m compileall agent-service 通过，或者输出明确缺依赖但无语法错误。
15. 文档中没有真实 API Key。
16. 文档中没有误导性“自动安全执行”描述。
17. 文档明确说明 patch / command 必须用户确认。
18. 没有修改 Demo / prototype。
19. 没有新增大功能。
20. 没有破坏现有源码。

运行验收命令：

npm run compile

python -m compileall agent-service

如果需要打包，运行：

npm run package

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. README.md 包含哪些内容。
5. USER_MANUAL 包含哪些内容。
6. DEVELOPMENT 包含哪些内容。
7. MVP_CHECKLIST 包含哪些检查项。
8. scripts 新增了哪些脚本。
9. .vscodeignore 是否确认不排除 agent-service 源码。
10. npm run compile 是否通过。
11. python -m compileall agent-service 是否通过。
12. npm run package 是否通过，如果未运行说明原因。
13. 是否确认没有写入真实 API Key。
14. 是否确认没有修改 Demo / prototype。
15. 下一步建议执行哪个 Task。