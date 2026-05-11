你现在在 VS Code 插件项目根目录中工作。

本次只做 Task 10B：发布前最终验收、VSIX 打包验证和安装测试修复。

当前上下文：
Task 1～10A 已完成或接近完成：
- VS Code 插件主体已完成
- Webview 六个 Tab 已完成
- Settings / Agents / Team / Workflow / Tools 配置保存加载已完成
- Gemini OpenAI-compatible 配置和健康检查已完成
- Python Service / RuntimeManager / ToolServer / ToolGateway 已完成
- AutoGen 单 Agent / Tool Agent / 多角色 Agent / WorkflowRunner 已完成
- task.create 已接入 WorkflowRunner
- WebSocket task.event 已接入 Webview
- Plan / Patch / Command Approval 最小闭环已完成
- README / USER_MANUAL / DEVELOPMENT / MVP_CHECKLIST / scripts / .vscodeignore 已整理

本次只做最终验收和打包验证。
不要新增功能。
不要重构架构。
不要改 UI 大布局。
不要修改 Demo / prototype。
不要放宽任何安全规则。

============================================================
一、本次目标
============================================================

完成 MVP 发布前最终检查：

1. npm run compile 必须通过。
2. python -m compileall agent-service 必须通过，或明确说明缺依赖但无语法错误。
3. npm run package 可以生成 VSIX。
4. VSIX 安装后插件能打开 AutoGen Control。
5. VSIX 安装后 media/webview.html / webview.css / webview-bridge.js 能正确加载。
6. VSIX 安装后 agent-service Python 源码仍在包内。
7. VSIX 安装后 runtime.start 能找到 agent-service/main.py。
8. .vscodeignore 没有误排除运行必需文件。
9. package.json 的 contributes / activationEvents / commands / views 全部一致。
10. README 和文档不包含真实 API Key。
11. 安全规则没有被放宽。
12. 输出最终发布前检查结果。

本次主要做：
- 打包前检查
- VSIX 包内容检查
- 安装测试修复
- 路径修复
- .vscodeignore 修复
- package.json 修复
- 文档小修
- 明确最终验收结果

本次不要做：
- 不要新增 Agent 能力
- 不要新增 Tool 能力
- 不要改 WorkflowRunner 逻辑
- 不要改审批逻辑
- 不要自动 apply_patch
- 不要自动 run_command
- 不要改安全边界

============================================================
二、文档阅读规则
============================================================

只阅读本任务列出的文件。

必须阅读：
1. package.json
2. .vscodeignore
3. README.md
4. docs/USER_MANUAL.md
5. docs/DEVELOPMENT.md
6. docs/MVP_CHECKLIST.md
7. src/extension.ts
8. src/webview/AgentControlPanelProvider.ts
9. src/runtime/RuntimeManager.ts
10. media/webview.html
11. media/webview.css
12. media/webview-bridge.js
13. agent-service/main.py
14. agent-service/requirements.txt
15. scripts/check-env.ps1
16. scripts/package-vsix.ps1

可以阅读：
17. tsconfig.json
18. out 目录结构，如果存在
19. 已生成的 VSIX 包内容，如果 package 成功

不要主动阅读所有 docs。
不要修改 prototype / demo。

============================================================
三、允许修改的文件
============================================================

允许修改：
1. package.json
2. .vscodeignore
3. README.md
4. docs/USER_MANUAL.md
5. docs/DEVELOPMENT.md
6. docs/MVP_CHECKLIST.md
7. scripts/check-env.ps1
8. scripts/check-env.bat
9. scripts/run-service.ps1
10. scripts/package-vsix.ps1
11. src/extension.ts
12. src/webview/AgentControlPanelProvider.ts
13. src/runtime/RuntimeManager.ts

必要时可以小改：
14. agent-service/main.py
15. agent-service/requirements.txt

禁止修改：
1. prototype 目录
2. demo 原型文件
3. src/tools 安全规则，除非是明显打包路径 bug
4. WorkflowRunner 核心逻辑
5. Approval 核心逻辑
6. 不要新增大功能

============================================================
四、package.json 最终检查
============================================================

检查 package.json。

必须确认：

1. main 指向：
   ./out/extension.js

2. scripts 至少包含：
   compile
   watch
   package

3. activationEvents 包含：
   onView:autogenAgent.controlPanel
   onCommand:autogenAgent.openPanel
   onCommand:autogenAgent.startTask

4. contributes.viewsContainers.activitybar 中 id：
   autogenAgent

5. contributes.views.autogenAgent 中 view id：
   autogenAgent.controlPanel

6. src/extension.ts 中 registerWebviewViewProvider 使用：
   autogenAgent.controlPanel

7. commands 中至少包含：
   autogenAgent.openPanel
   autogenAgent.startTask

8. categories 合理：
   AI
   Other

9. publisher 可以继续 local-dev。

不要随意改 view id。
如果 package.json 和代码不一致，统一修成 autogenAgent.controlPanel。

============================================================
五、.vscodeignore 最终检查
============================================================

检查 .vscodeignore。

必须排除：

.git/**
.vscode/**
node_modules/**
src/**
out/**/*.map
*.vsix
prototype/**
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

必须不能排除：

1. out/**
2. media/**
3. agent-service/main.py
4. agent-service/**/*.py
5. agent-service/requirements.txt
6. README.md
7. package.json

如果发现 agent-service/** 被整体排除，必须修正。
如果发现 media/** 被排除，必须修正。
如果发现 out/** 被排除，必须修正。

============================================================
六、Webview 资源路径检查
============================================================

检查 AgentControlPanelProvider.ts。

必须确认：

1. webview.html 从 extensionUri/media/webview.html 读取。
2. webview.css 使用 webview.asWebviewUri。
3. webview-bridge.js 使用 webview.asWebviewUri。
4. localResourceRoots 包含 media 目录。
5. enableScripts = true。
6. CSP placeholder 能替换。
7. webview.html 加载失败时显示 fallback HTML。
8. 不使用 process.cwd() 读取 media。
9. 不使用开发机绝对路径。

VSIX 安装后必须仍然能加载 media 文件。

============================================================
七、Python Service 路径检查
============================================================

检查 RuntimeManager.ts。

必须确认：

1. agent-service/main.py 路径基于 extensionUri 或 extensionPath。
2. 不使用 process.cwd() 假设当前目录。
3. VSIX 安装后能定位到 extension 安装目录下的 agent-service/main.py。
4. runtime.start 使用 settings.pythonPath。
5. cwd 设置为 extension 根目录或合适目录。
6. env 中包含：
   AUTOGEN_IDE_TOOL_SERVER_URL
   AUTOGEN_IDE_MODEL_PROVIDER
   AUTOGEN_IDE_MODEL_BASE_URL
   AUTOGEN_IDE_MODEL_NAME
   AUTOGEN_IDE_FALLBACK_MODEL
   AUTOGEN_IDE_MODEL_API_KEY
7. 不打印 API Key。
8. 如果 main.py 不存在，返回明确 RUNTIME_START_FAILED。

============================================================
八、VSIX 包内容检查
============================================================

执行：

npm run package

打包成功后，检查 VSIX 内容。

可以用以下方式之一：

1. 用 unzip / 7zip 查看 VSIX。
2. 用 vsce ls，如果可用。
3. 用脚本列出包内容。

必须确认 VSIX 内包含：

1. extension/package.json
2. extension/out/extension.js
3. extension/media/webview.html
4. extension/media/webview.css
5. extension/media/webview-bridge.js
6. extension/media/icon.svg
7. extension/agent-service/main.py
8. extension/agent-service/requirements.txt
9. extension/agent-service 下必要 py 文件
10. extension/README.md

必须确认 VSIX 内不包含：

1. node_modules
2. .git
3. .venv
4. venv
5. __pycache__
6. .env
7. *.pem
8. *.key
9. id_rsa
10. id_ed25519
11. 真实 API Key

如果包内容不对，修正 .vscodeignore 或 package.json files 配置。

============================================================
九、安装测试要求
============================================================

如果当前环境可以执行 code 命令，尝试：

code --install-extension <生成的.vsix>

如果不能执行 code 命令，不要失败，说明环境不支持，并完成静态检查。

安装后验证：

1. 打开新的 Extension Host 或普通 VS Code。
2. 左侧 Activity Bar 有 AutoGen 图标。
3. 点击 AutoGen，AutoGen Control 能打开。
4. 页面不是空白。
5. 顶部显示 Webview bridge initialized。
6. 六个 Tab 可以切换。
7. Settings 页能显示。
8. Runtime start 按钮存在。
9. event-log 能写日志。

如果无法自动验证，至少确保代码层面满足。

============================================================
十、README / 文档最终检查
============================================================

检查 README.md 和 docs。

必须确认：

1. 没有真实 API Key。
2. Gemini API Key 示例使用：
   <YOUR_GEMINI_API_KEY>

3. baseUrl 正确：
   https://generativelanguage.googleapis.com/v1beta/openai/

4. model 默认：
   gemini-3-flash-preview

5. 明确写出：
   API Key 保存到 VS Code SecretStorage。

6. 明确写出：
   patch.apply 必须用户确认。

7. 明确写出：
   run_command 必须用户确认。

8. 明确写出：
   Git 当前只读。

9. 明确写出：
   Python Service 需要 runtime.start。

10. 不夸大成完全自动化商用成熟产品。
    应写成 MVP / development version。

============================================================
十一、脚本最终检查
============================================================

检查 scripts。

1. check-env.ps1：
   - node --version
   - npm --version
   - python --version
   - npm run compile
   - python -m compileall agent-service

2. check-env.bat：
   - 同上

3. run-service.ps1：
   - python agent-service/main.py --host 127.0.0.1 --port 8765

4. package-vsix.ps1：
   - npm run compile
   - npm run package

要求：

1. 不包含用户绝对路径。
2. 不包含 API Key。
3. 不自动安装全局依赖。
4. 不自动发布 marketplace。

============================================================
十二、安全最终检查
============================================================

在源码和文档中快速检查敏感内容。

重点搜索这些关键词：

1. AIza
2. GEMINI_API_KEY
3. AUTOGEN_IDE_MODEL_API_KEY
4. Bearer
5. sk-
6. .pem
7. id_rsa
8. password
9. secret

要求：

1. 示例可以保留 placeholder。
2. 真实 key 必须删除。
3. Authorization header 不能带真实值。
4. 文档中的 SecretStorage 描述可以保留。
5. 代码中变量名 apiKey 可以保留，但不能有真实值。

============================================================
十三、最终命令检查
============================================================

必须运行：

npm run compile

建议运行：

python -m compileall agent-service

必须尝试运行：

npm run package

如果 npm run package 失败：

1. 修正可控问题。
2. 如果是缺少 vsce 依赖，检查 package.json devDependencies。
3. 如果是环境问题，说明原因。

============================================================
十四、不要做的事情
============================================================

本次不要做：

1. 不要新增功能。
2. 不要改 Agent 行为。
3. 不要改 WorkflowRunner 逻辑。
4. 不要放宽 WorkspaceGuard。
5. 不要放宽 SensitiveFileGuard。
6. 不要放宽 CommandGuard。
7. 不要开启 shell:true。
8. 不要自动 apply_patch。
9. 不要自动 run_command。
10. 不要删除 Debug action。
11. 不要修改 Demo / prototype。
12. 不要把 agent-service 源码排除出 VSIX。
13. 不要把 API Key 写进任何文件。

============================================================
十五、验收标准
============================================================

完成后必须满足：

1. npm run compile 通过。
2. python -m compileall agent-service 通过，或明确说明环境依赖问题但无语法错误。
3. npm run package 通过并生成 VSIX，或明确说明环境原因。
4. VSIX 包含 out/extension.js。
5. VSIX 包含 media 文件。
6. VSIX 包含 agent-service 源码。
7. VSIX 不包含 node_modules。
8. VSIX 不包含 venv / .venv。
9. VSIX 不包含 .env / pem / key / 私钥。
10. Webview 资源路径适配 VSIX 安装环境。
11. Python Service 路径适配 VSIX 安装环境。
12. package.json view id 和代码注册 id 一致。
13. README / docs 没有真实 API Key。
14. README / docs 明确说明 patch / command 必须用户确认。
15. scripts 不包含用户绝对路径和 API Key。
16. 没有修改 Demo / prototype。
17. 没有新增功能。
18. 没有放宽安全规则。

完成后输出：

1. 阅读了哪些文件。
2. 修改了哪些文件。
3. 新增了哪些文件。
4. package.json 检查结果。
5. .vscodeignore 修复了哪些内容。
6. VSIX 包内容检查结果。
7. Webview 资源路径是否适配 VSIX。
8. Python Service 路径是否适配 VSIX。
9. README / docs 是否确认无真实 API Key。
10. scripts 是否确认无绝对路径和 API Key。
11. npm run compile 是否通过。
12. python -m compileall agent-service 是否通过。
13. npm run package 是否通过。
14. 是否确认没有修改 Demo / prototype。
15. 是否确认没有放宽安全规则。
16. 下一步建议执行哪个 Task。