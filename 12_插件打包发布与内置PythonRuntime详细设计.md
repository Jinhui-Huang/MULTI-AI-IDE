# 12_插件打包发布与内置PythonRuntime详细设计

> 文档目标：设计 AutoGen VS Code 插件从开发、构建、打包、发布、安装、启动、升级、回滚到运行时诊断的完整方案。  
> 适用项目：基于 VS Code Webview + Extension Host + Python AutoGen Service 的多 Agent 编程插件。  
> 文档版本：v1.0  
> 生成日期：2026-05-10

---

## 1. 资料检索依据

本设计参考以下公开资料和官方文档方向：

1. VS Code 官方扩展发布文档：VS Code 扩展可以发布到 Marketplace，也可以打包成 VSIX 离线安装；发布工具链主要使用 `@vscode/vsce`。  
2. VS Code 官方 platform-specific extensions 文档：VS Code 支持为不同平台发布 platform-specific VSIX，可以通过 `--target` 指定平台，例如 `win32-x64`、`darwin-arm64`、`linux-x64` 等。  
3. VS Code 官方 Bundling Extensions 文档：扩展可以使用 esbuild 或 webpack 打包，减少文件数量、提升加载速度，并便于生产发布。  
4. Python 官方 Windows 文档：Windows embeddable distribution 是适合嵌入到较大应用中的最小 Python 包，不是面向普通终端用户的完整 Python 安装。  
5. Python embeddable 相关实践资料：Python embeddable 包通常不自带 pip/venv，依赖需要由应用安装器或构建流程负责准备。  
6. uv 官方文档：uv 支持 Python 项目管理、依赖安装和 lockfile，可用于固定 Python 依赖版本和提升依赖安装速度。  
7. VS Code Web Extensions 文档：Web 扩展运行环境与桌面 Node Extension Host 不同；本项目需要 Python Service 和本地文件/终端能力，因此 MVP 目标是桌面 VS Code，不支持 vscode.dev Web 扩展模式。

参考链接：

- https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- https://code.visualstudio.com/api/working-with-extensions/bundling-extension
- https://code.visualstudio.com/api/extension-guides/web-extensions
- https://docs.python.org/3/using/windows.html
- https://docs.astral.sh/uv/
- https://github.com/microsoft/vscode-vsce
- https://github.com/microsoft/vscode-platform-specific-sample

---

## 2. 本文档在整体文档体系中的位置

已经完成的文档：

```text
00_项目总览与MVP范围_详细设计.md
01_VSCode插件前端Webview详细设计.md
02_Webview与Extension通信协议详细设计.md
03_Extension与AutoGenService通信接口详细设计.md
04_AutoGen多Agent运行时详细设计.md
05_Agent配置与Prompt模板详细设计.md
06_Team与Workflow编排详细设计.md
07_Tools工具系统与权限控制详细设计.md
08_VSCode文件_Diff_Terminal_Git工具联调详细设计.md
09_Task任务状态机与WebSocket事件详细设计.md
10_配置存储与SecretStorage详细设计.md
11_安全边界与沙箱策略详细设计.md
12_插件打包发布与内置PythonRuntime详细设计.md   ← 本文档
```

本文档解决的问题：

```text
开发阶段怎么启动？
生产阶段怎么打包？
VSIX 怎么生成？
Python Runtime 是否内置？
AutoGen Service 怎么自动启动？
依赖怎么锁版本？
Windows/macOS/Linux 怎么处理？
端口冲突怎么解决？
插件怎么升级？
失败怎么回滚？
日志和诊断怎么做？
```

---

## 3. 总体发布策略

本项目不是普通纯 TypeScript VS Code 插件，而是：

```text
VS Code Extension Host  TypeScript / Node.js
        +
Webview UI              HTML/CSS/JS
        +
Python AutoGen Service  FastAPI + AutoGen
        +
本地工具网关             文件 / Diff / Terminal / Git
```

因此发布策略必须同时处理两类运行时：

```text
1. Node.js Extension Runtime
2. Python AutoGen Runtime
```

建议采用三阶段策略。

---

## 4. 三阶段打包策略

### 4.1 阶段一：开发者模式

面向你自己和 Codex 开发。

特点：

```text
不内置 Python
本机安装 Python
本机创建 venv
Extension 手动启动 Python Service
前端 Webview 从本地 dist 加载
适合快速调试
```

开发启动：

```bash
pnpm install
pnpm watch
cd agent-service
uv sync
uv run python -m agent_service.main
```

VS Code 调试：

```text
F5 → Extension Development Host
```

优点：

```text
开发快
依赖可更新
日志清楚
容易断点调试
```

缺点：

```text
用户不能直接用
环境依赖多
Python 版本不可控
```

---

### 4.2 阶段二：MVP 内测模式

面向小范围测试用户。

特点：

```text
VSIX 打包插件
不强制内置 Python
首次启动检测本机 Python
没有 Python 时提示用户配置 Python Path
自动创建/复用插件私有 venv
自动安装 requirements.lock
```

适合：

```text
技术用户
开发者内测
公司内部测试
```

优点：

```text
VSIX 文件小
跨平台简单
升级 Python 依赖方便
```

缺点：

```text
用户机器必须能安装依赖
网络环境可能失败
国内环境 pip 下载可能慢
依赖安装可能被杀毒软件拦截
```

---

### 4.3 阶段三：正式产品模式

面向普通用户。

特点：

```text
发布 platform-specific VSIX
每个平台内置 Python Runtime
每个平台内置已安装好的 agent-service 依赖
用户不需要安装 Python
插件启动时自动拉起 AutoGen Service
```

目标体验：

```text
安装 VSIX / Marketplace 安装
打开 VS Code
侧边栏出现 AutoGen Code
填 API Key
点击启动
直接使用
```

优点：

```text
用户无感
环境可控
依赖可控
可离线运行 agent-service
```

缺点：

```text
VSIX 体积大
每个平台都要单独构建
升级成本高
安全扫描更严格
发布流程复杂
```

---

## 5. 推荐最终目录结构

项目仓库：

```text
autogen-vscode-agent/
├─ package.json
├─ pnpm-lock.yaml
├─ tsconfig.json
├─ esbuild.js
├─ README.md
├─ CHANGELOG.md
├─ LICENSE
├─ src/
│  ├─ extension.ts
│  ├─ extension/
│  │  ├─ messageRouter.ts
│  │  ├─ webviewProvider.ts
│  │  ├─ runtimeManager.ts
│  │  ├─ configStore.ts
│  │  ├─ secretStore.ts
│  │  ├─ toolServer.ts
│  │  ├─ taskClient.ts
│  │  └─ logger.ts
│  └─ types/
│     ├─ messages.ts
│     ├─ config.ts
│     └─ events.ts
├─ media/
│  ├─ webview.html
│  ├─ webview.css
│  ├─ webview.js
│  └─ icon.svg
├─ agent-service/
│  ├─ pyproject.toml
│  ├─ uv.lock
│  ├─ requirements.lock
│  ├─ agent_service/
│  │  ├─ main.py
│  │  ├─ api/
│  │  ├─ runtime/
│  │  ├─ workflows/
│  │  ├─ tools/
│  │  ├─ storage/
│  │  └─ schemas/
│  └─ README.md
├─ runtime/
│  ├─ win32-x64/
│  │  ├─ python/
│  │  └─ agent-service/
│  ├─ darwin-arm64/
│  │  ├─ python/
│  │  └─ agent-service/
│  └─ linux-x64/
│     ├─ python/
│     └─ agent-service/
├─ scripts/
│  ├─ build-extension.ts
│  ├─ build-webview.ts
│  ├─ build-agent-service.ts
│  ├─ prepare-python-runtime.ts
│  ├─ package-vsix.ts
│  ├─ smoke-test.ts
│  └─ clean.ts
├─ docs/
└─ .vscode/
```

---

## 6. VSIX 内部目录设计

### 6.1 开发者 / 内测版 VSIX

```text
extension.vsix
└─ extension/
   ├─ package.json
   ├─ dist/
   │  └─ extension.js
   ├─ media/
   │  ├─ webview.html
   │  ├─ webview.css
   │  └─ webview.js
   ├─ agent-service/
   │  ├─ pyproject.toml
   │  ├─ requirements.lock
   │  └─ agent_service/
   └─ README.md
```

不包含：

```text
runtime/python
site-packages
```

首次启动时：

```text
检测 Python → 创建 venv → 安装依赖 → 启动服务
```

---

### 6.2 正式 platform-specific VSIX

```text
extension-win32-x64.vsix
└─ extension/
   ├─ package.json
   ├─ dist/
   │  └─ extension.js
   ├─ media/
   ├─ agent-service/
   │  └─ agent_service/
   ├─ runtime/
   │  └─ python/
   │     ├─ python.exe
   │     ├─ python312.zip
   │     ├─ python312._pth
   │     ├─ Lib/
   │     └─ site-packages/
   └─ manifest/
      ├─ runtime-manifest.json
      └─ dependency-manifest.json
```

安装后插件可以直接运行：

```text
extensionPath/runtime/python/python.exe
extensionPath/agent-service/agent_service/main.py
```

---

## 7. package.json 设计

### 7.1 基础 manifest

```json
{
  "name": "autogen-code-agent",
  "displayName": "AutoGen Code Agent",
  "description": "Multi-agent code assistant powered by AutoGen runtime.",
  "version": "0.1.0",
  "publisher": "your-publisher",
  "engines": {
    "vscode": "^1.90.0"
  },
  "categories": [
    "AI",
    "Other"
  ],
  "activationEvents": [
    "onView:autogenCodeAgent.mainView",
    "onCommand:autogenCodeAgent.open",
    "onStartupFinished"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "autogenCodeAgent",
          "title": "AutoGen Code",
          "icon": "media/icon.svg"
        }
      ]
    },
    "views": {
      "autogenCodeAgent": [
        {
          "id": "autogenCodeAgent.mainView",
          "name": "AutoGen Code"
        }
      ]
    },
    "commands": [
      {
        "command": "autogenCodeAgent.open",
        "title": "AutoGen Code: Open"
      },
      {
        "command": "autogenCodeAgent.restartRuntime",
        "title": "AutoGen Code: Restart Runtime"
      },
      {
        "command": "autogenCodeAgent.openLogs",
        "title": "AutoGen Code: Open Logs"
      }
    ],
    "configuration": {
      "title": "AutoGen Code Agent",
      "properties": {
        "autogenCodeAgent.runtime.provider": {
          "type": "string",
          "default": "autogen",
          "enum": ["autogen", "mock"],
          "description": "Agent runtime provider."
        },
        "autogenCodeAgent.runtime.pythonPath": {
          "type": "string",
          "default": "",
          "description": "External Python path. Leave empty to use bundled runtime when available."
        },
        "autogenCodeAgent.runtime.port": {
          "type": "number",
          "default": 8765,
          "description": "Preferred AutoGen service port."
        },
        "autogenCodeAgent.runtime.autoStart": {
          "type": "boolean",
          "default": true,
          "description": "Start AutoGen service automatically."
        },
        "autogenCodeAgent.runtime.logLevel": {
          "type": "string",
          "enum": ["debug", "info", "warn", "error"],
          "default": "info"
        }
      }
    }
  }
}
```

### 7.2 重要设计点

不要把 API Key 放进 `settings.json`。

```text
API Key 只进入 VS Code SecretStorage。
package.json 里只声明非敏感配置。
```

---

## 8. TypeScript 插件构建设计

### 8.1 构建工具选择

推荐：

```text
esbuild
```

原因：

```text
速度快
配置简单
适合 VS Code Extension 打包
输出单文件 dist/extension.js
```

VS Code 官方文档也支持用 esbuild 或 webpack 来打包扩展。

### 8.2 esbuild 配置

`scripts/build-extension.ts`：

```ts
import * as esbuild from "esbuild";

const production = process.argv.includes("--production");

await esbuild.build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  platform: "node",
  format: "cjs",
  sourcemap: !production,
  minify: production,
  sourcesContent: false,
  target: "node18"
});
```

### 8.3 npm scripts

```json
{
  "scripts": {
    "clean": "tsx scripts/clean.ts",
    "compile": "tsx scripts/build-extension.ts",
    "watch": "tsx scripts/build-extension.ts --watch",
    "build:webview": "tsx scripts/build-webview.ts",
    "build:agent": "tsx scripts/build-agent-service.ts",
    "build": "pnpm clean && pnpm compile && pnpm build:webview && pnpm build:agent",
    "package": "pnpm build && vsce package",
    "package:win32-x64": "pnpm build && vsce package --target win32-x64",
    "package:darwin-arm64": "pnpm build && vsce package --target darwin-arm64",
    "package:linux-x64": "pnpm build && vsce package --target linux-x64"
  }
}
```

---

## 9. Webview 资源打包设计

### 9.1 Webview 文件

建议生产打包后：

```text
media/
├─ webview.html
├─ webview.css
├─ webview.js
└─ assets/
```

插件加载：

```ts
const htmlPath = vscode.Uri.joinPath(context.extensionUri, "media", "webview.html");
let html = await vscode.workspace.fs.readFile(htmlPath);
```

### 9.2 CSP nonce

生产版本必须加 CSP：

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src {{webviewCspSource}} https: data:; style-src {{webviewCspSource}} 'unsafe-inline'; script-src 'nonce-{{nonce}}';">
```

脚本：

```html
<script nonce="{{nonce}}" src="{{webviewJsUri}}"></script>
```

### 9.3 不使用外链 CDN

禁止：

```html
<script src="https://cdn..."></script>
```

原因：

```text
VS Code Webview CSP 限制
离线环境不可用
安全审查困难
```

---

## 10. Python AutoGen Service 构建设计

### 10.1 Python 项目结构

```text
agent-service/
├─ pyproject.toml
├─ uv.lock
├─ requirements.lock
├─ agent_service/
│  ├─ __init__.py
│  ├─ main.py
│  ├─ api/
│  ├─ runtime/
│  ├─ workflows/
│  ├─ tools/
│  ├─ storage/
│  └─ schemas/
```

### 10.2 pyproject.toml

```toml
[project]
name = "autogen-code-agent-service"
version = "0.1.0"
requires-python = ">=3.11,<3.13"
dependencies = [
  "fastapi",
  "uvicorn",
  "pydantic",
  "httpx",
  "autogen-agentchat",
  "autogen-ext[openai]"
]

[tool.uv]
package = false
```

### 10.3 requirements.lock

生产环境不要浮动版本。

开发期：

```bash
uv lock
uv export --format requirements-txt --output-file requirements.lock
```

MVP 内测安装：

```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
```

正式内置 runtime：

```bash
python -m pip install -r requirements.lock --target runtime/python/Lib/site-packages
```

---

## 11. Python Runtime 方案对比

### 11.1 方案 A：使用用户本机 Python

```text
插件检测 pythonPath
没有则检测 PATH 中 python / python3
创建插件私有 venv
安装 requirements.lock
```

优点：

```text
VSIX 小
实现快
跨平台简单
```

缺点：

```text
用户机器环境不可控
安装失败率高
网络依赖强
```

适用：

```text
开发阶段
内测阶段
技术用户
```

### 11.2 方案 B：内置 Python Runtime

```text
每个平台打包一个 Python Runtime
依赖预安装
插件直接启动 runtime 中的 Python
```

优点：

```text
用户无感
运行稳定
依赖可控
离线可用
```

缺点：

```text
VSIX 大
跨平台构建复杂
Python 安全更新要跟进
```

适用：

```text
正式版
面向普通用户
企业内部分发
```

### 11.3 方案 C：独立安装器

```text
VS Code 插件很小
另有 Agent Runtime Installer
插件检测本地 runtime
没有则提示下载安装
```

优点：

```text
插件小
runtime 可独立升级
适合商业产品
```

缺点：

```text
开发复杂
安装链路多
用户体验略差
```

适用：

```text
后期商业化
Code-OSS 自研 IDE
企业部署
```

### 11.4 推荐路线

```text
MVP：方案 A
内测：方案 A + 自动创建 venv
正式：方案 B 或 C
商业化：方案 C
```

---

## 12. Windows 内置 Python Runtime 设计

### 12.1 推荐方式

使用 Python embeddable distribution。

结构：

```text
runtime/win32-x64/python/
├─ python.exe
├─ pythonw.exe
├─ python312.dll
├─ python312.zip
├─ python312._pth
├─ Lib/
│  └─ site-packages/
└─ DLLs/
```

### 12.2 _pth 配置

Python embeddable 通过 `_pth` 控制路径。必须确保 site-packages 可用。

示例：

```text
python312.zip
.
Lib
Lib\site-packages
import site
```

如果不配置 `import site` 和 `Lib\site-packages`，第三方包可能无法导入。

### 12.3 准备流程

```bash
# 1. 下载 Python embeddable zip
# 2. 解压到 runtime/win32-x64/python
# 3. 配置 python312._pth
# 4. 使用完整 Python 或同 runtime pip 安装依赖到 Lib/site-packages
# 5. 运行 smoke test
```

### 12.4 Smoke Test

```bash
runtime/win32-x64/python/python.exe -c "import fastapi, uvicorn, autogen_agentchat; print('ok')"
```

---

## 13. macOS / Linux Runtime 设计

Python 官方没有与 Windows embeddable 完全等价的通用方案。建议三种路线：

### 13.1 初期路线

```text
不内置 macOS/Linux Python
要求用户配置 Python Path
插件自动创建 venv
```

### 13.2 中期路线

```text
使用独立 Runtime Installer
每个平台下载对应 runtime
存放到 globalStorageUri/runtime
```

### 13.3 后期路线

```text
商业产品安装器统一安装：
- VS Code 插件
- Python Runtime
- Agent Service
```

建议不要一开始就把 macOS/Linux runtime 都塞进 VSIX，否则维护成本非常高。

---

## 14. Platform-specific VSIX 设计

VS Code 支持 platform-specific extension package。正式版可以这样发布：

```bash
vsce package --target win32-x64
vsce package --target win32-arm64
vsce package --target darwin-x64
vsce package --target darwin-arm64
vsce package --target linux-x64
```

推荐初期只支持：

```text
win32-x64
darwin-arm64
linux-x64
```

原因：

```text
Windows x64 是主力用户
Mac Apple Silicon 常见
Linux x64 常见
```

每个平台的 `runtime-manifest.json`：

```json
{
  "platform": "win32-x64",
  "python": {
    "version": "3.12.3",
    "path": "runtime/win32-x64/python/python.exe"
  },
  "agentService": {
    "version": "0.1.0",
    "entry": "agent-service/agent_service/main.py"
  },
  "dependencies": {
    "lock": "requirements.lock",
    "builtAt": "2026-05-10T00:00:00Z"
  }
}
```

---

## 15. RuntimeManager 详细设计

### 15.1 职责

Extension 侧 `RuntimeManager` 负责：

```text
检测 runtime
选择 Python
创建 venv
安装依赖
启动 AutoGen Service
停止 Service
重启 Service
健康检查
端口冲突处理
日志收集
异常恢复
```

### 15.2 Python 选择优先级

```text
1. Settings 中用户指定 pythonPath
2. 插件内置 runtime Python
3. 插件 globalStorageUri 中下载的 runtime
4. PATH 中 python
5. PATH 中 python3
6. 提示用户配置
```

### 15.3 TypeScript 接口

```ts
export interface RuntimeInfo {
  mode: "bundled" | "external" | "venv" | "missing";
  pythonPath?: string;
  serviceUrl?: string;
  port?: number;
  pid?: number;
  status: "stopped" | "starting" | "running" | "failed";
  version?: {
    python?: string;
    autogenAgentchat?: string;
    autogenExt?: string;
    service?: string;
  };
}

export class RuntimeManager {
  async resolvePython(): Promise<string>;
  async ensureVenv(): Promise<void>;
  async installDependencies(): Promise<void>;
  async start(): Promise<RuntimeInfo>;
  async stop(): Promise<void>;
  async restart(): Promise<RuntimeInfo>;
  async health(): Promise<RuntimeInfo>;
  async openLogs(): Promise<void>;
}
```

---

## 16. AutoGen Service 启动设计

### 16.1 启动命令

开发模式：

```bash
python -m agent_service.main --host 127.0.0.1 --port 8765
```

生产模式：

```bash
runtime/python/python.exe -m agent_service.main --host 127.0.0.1 --port 8765
```

### 16.2 spawn 示例

```ts
const child = spawn(pythonPath, [
  "-m",
  "agent_service.main",
  "--host",
  "127.0.0.1",
  "--port",
  String(port)
], {
  cwd: agentServiceDir,
  env: {
    ...process.env,
    AUTOGEN_CODE_AGENT_STORAGE: storageDir,
    AUTOGEN_CODE_AGENT_LOG_DIR: logDir,
    AUTOGEN_CODE_AGENT_SESSION_TOKEN: sessionToken
  },
  stdio: ["ignore", "pipe", "pipe"]
});
```

### 16.3 启动超时

```text
默认 20 秒
超过后标记 runtime.failed
展示 stderr 摘要
提供“查看日志”“重试”“配置 Python Path”按钮
```

### 16.4 健康检查

```http
GET /health
```

返回：

```json
{
  "ok": true,
  "serviceVersion": "0.1.0",
  "python": "3.12.3",
  "autogenAgentchat": "x.x.x",
  "runtimeProvider": "autogen",
  "startedAt": "2026-05-10T00:00:00Z"
}
```

---

## 17. 端口冲突处理

### 17.1 默认端口

```text
8765
```

### 17.2 冲突检测

启动前检查端口是否可用。

逻辑：

```text
1. 尝试请求 http://127.0.0.1:8765/health
2. 如果响应且 session token 匹配，复用
3. 如果响应但 token 不匹配，视为端口被占用
4. 选择 8766 ~ 8799 中可用端口
5. 更新 runtimeInfo.serviceUrl
```

### 17.3 UI 显示

Settings / Runtime 区域显示：

```text
Service URL: http://127.0.0.1:8767
Port: 8767
Status: Running
```

---

## 18. 本地 Session Token 安全

AutoGen Service 只监听：

```text
127.0.0.1
```

同时要求 Extension 请求带 token：

```http
Authorization: Bearer <session-token>
```

token 由 Extension 启动服务时生成：

```ts
crypto.randomBytes(32).toString("hex")
```

传给 Python：

```text
AUTOGEN_CODE_AGENT_SESSION_TOKEN
```

Python 中间件校验：

```python
@app.middleware("http")
async def auth_middleware(request, call_next):
    if request.url.path == "/health":
        return await call_next(request)

    token = request.headers.get("authorization", "").replace("Bearer ", "")
    if token != settings.session_token:
        return JSONResponse({"error": "unauthorized"}, status_code=401)

    return await call_next(request)
```

---

## 19. 日志目录设计

VS Code Extension 侧：

```text
context.logUri/
├─ extension.log
├─ runtime-manager.log
├─ tool-server.log
└─ webview.log
```

AutoGen Service 侧：

```text
context.globalStorageUri/autogen-code-agent/logs/
├─ service.log
├─ tasks/
│  └─ task_001.log
├─ tool-calls/
│  └─ tool_call_001.json
└─ crashes/
   └─ crash_20260510.log
```

日志要求：

```text
API Key 脱敏
文件内容默认不完整记录
命令输出超过长度写文件
错误堆栈保留
```

---

## 20. 配置目录设计

```text
globalStorageUri/
├─ config/
│  ├─ agents.json
│  ├─ teams.json
│  ├─ workflows.json
│  ├─ tools.json
│  ├─ settings.json
│  └─ migrations.json
├─ runtime/
│  ├─ python/
│  └─ venv/
├─ logs/
├─ tasks/
└─ cache/
```

Workspace 级：

```text
storageUri/
├─ workspace-config.json
├─ task-history.jsonl
├─ events/
├─ patches/
└─ checkpoints/
```

---

## 21. 依赖版本锁定策略

### 21.1 Node 依赖

```text
pnpm-lock.yaml 必须提交
package.json 版本不要全部写 *
CI 中使用 pnpm install --frozen-lockfile
```

### 21.2 Python 依赖

```text
uv.lock 必须提交
requirements.lock 必须生成并提交
正式构建必须使用 lock 文件
```

### 21.3 AutoGen 版本

不要使用：

```text
autogen-agentchat>=...
```

建议：

```text
autogen-agentchat==具体版本
autogen-ext==具体版本
```

升级流程：

```text
单独分支升级
运行兼容性测试
运行 Agent smoke test
验证 UI 事件结构
生成升级报告
```

---

## 22. CI/CD 设计

### 22.1 GitHub Actions 任务

```text
lint
typecheck
unit-test
build-extension
build-webview
build-agent-service
smoke-test
package-vsix
upload-artifacts
```

### 22.2 workflow 示例

```yaml
name: build-vsix

on:
  push:
    tags:
      - "v*"

jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
        target: [win32-x64, darwin-arm64, linux-x64]
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: npx @vscode/vsce package --target ${{ matrix.target }}
      - uses: actions/upload-artifact@v4
        with:
          name: autogen-code-agent-${{ matrix.target }}
          path: "*.vsix"
```

注意：实际 matrix 要避免在不匹配 OS 上构建不可用 runtime。Platform-specific VSIX 可以在统一环境打包，但内置 runtime 的准备通常必须按平台分别处理。

---

## 23. 发布渠道设计

### 23.1 内测发布

```text
GitHub Releases 上传 VSIX
用户手动 Install from VSIX
```

### 23.2 Marketplace 发布

```bash
vsce login your-publisher
vsce publish
```

或：

```bash
vsce publish --target win32-x64
```

### 23.3 Open VSX 发布

如果目标支持 VSCodium / Code-OSS，可以考虑 Open VSX Registry。  
但第一版建议先专注 VS Code Marketplace / 手动 VSIX。

---

## 24. 升级策略

### 24.1 插件升级

VS Code Marketplace 自动升级插件。

注意：

```text
插件升级后 extensionPath 会变化
不能把用户数据放 extensionPath
用户数据必须放 globalStorageUri / storageUri
```

### 24.2 Runtime 升级

内置 runtime 随插件版本升级。

启动时检查：

```text
runtime-manifest.json version
globalStorageUri/runtime 当前版本
```

策略：

```text
如果内置 runtime 版本较新：
  迁移配置
  清理旧 runtime cache
  重建 health info
```

### 24.3 配置升级

使用 migrations：

```json
{
  "schemaVersion": 3,
  "appliedMigrations": [
    "001_initial",
    "002_add_runtime_provider",
    "003_add_tool_safety"
  ]
}
```

迁移代码：

```ts
interface Migration {
  id: string;
  from: number;
  to: number;
  run(configDir: Uri): Promise<void>;
}
```

---

## 25. 回滚策略

### 25.1 插件回滚

用户可以安装旧 VSIX。  
需要保证配置向后兼容。

### 25.2 Runtime 回滚

保留最近两个 runtime 版本：

```text
globalStorageUri/runtime/
├─ current -> runtime-0.1.2
├─ runtime-0.1.1/
└─ runtime-0.1.2/
```

如果新 runtime 启动失败：

```text
自动尝试上一个 runtime
提示用户已回滚
写入 crash log
```

### 25.3 配置回滚

每次迁移前备份：

```text
config/backups/config-20260510-030000.zip
```

---

## 26. Startup Flow 启动流程

```text
1. Extension activate
2. 初始化 Logger
3. 初始化 ConfigStore
4. 初始化 SecretStore
5. 初始化 WebviewProvider
6. 如果 autoStart=true：
   6.1 RuntimeManager.resolvePython()
   6.2 RuntimeManager.ensureDependencies()
   6.3 RuntimeManager.start()
   6.4 RuntimeManager.health()
7. Webview 收到 runtime.status
8. 用户可创建任务
```

伪代码：

```ts
export async function activate(context: vscode.ExtensionContext) {
  const logger = new Logger(context.logUri);
  const configStore = new ConfigStore(context);
  const secretStore = new SecretStore(context);
  const runtimeManager = new RuntimeManager(context, configStore, logger);

  const webviewProvider = new MainWebviewProvider(
    context,
    runtimeManager,
    configStore,
    secretStore,
    logger
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("autogenCodeAgent.mainView", webviewProvider)
  );

  const settings = await configStore.getSettings();
  if (settings.runtime.autoStart) {
    await runtimeManager.startSafely();
  }
}
```

---

## 27. 生产启动失败处理

### 27.1 Python 不存在

UI 提示：

```text
未找到 Python Runtime
[选择 Python 路径] [打开设置] [查看帮助]
```

### 27.2 依赖缺失

UI 提示：

```text
AutoGen Service 依赖缺失
[重新安装依赖] [查看日志] [打开 Runtime 目录]
```

### 27.3 端口冲突

UI 提示：

```text
8765 端口被占用，已切换到 8766
```

如果无法找到端口：

```text
无法启动 AutoGen Service
[重试] [修改端口范围] [查看日志]
```

### 27.4 Service 崩溃

UI 提示：

```text
AutoGen Service 异常退出
[重启] [查看崩溃日志] [复制诊断信息]
```

---

## 28. 诊断信息导出

Settings 页增加按钮：

```text
导出诊断包
```

导出内容：

```text
diagnostics.zip
├─ extension-info.json
├─ runtime-info.json
├─ settings-redacted.json
├─ recent-errors.log
├─ service-health.json
└─ task-summary.json
```

必须脱敏：

```text
API Key
Authorization token
.env 内容
文件正文
用户隐私路径可选脱敏
```

---

## 29. VS Code Web 环境说明

本项目 MVP 不支持：

```text
vscode.dev
github.dev
browser web extension host
```

原因：

```text
需要本地 Python Service
需要本地文件系统工具
需要 Terminal / Git / Patch 能力
```

package.json 中不声明 `browser` entry。

UI 中如果检测到 Web 环境：

```ts
if (vscode.env.uiKind === vscode.UIKind.Web) {
  showUnsupported("当前版本需要桌面 VS Code。");
}
```

---

## 30. Remote Development 注意事项

VS Code Remote SSH / WSL / Containers 会影响 Extension Host 运行位置。

需要判断：

```ts
vscode.env.remoteName
```

场景：

```text
本地窗口 + Remote SSH：
Extension Host 可能在远程机器
Python Service 也会在远程机器启动
workspace 文件在远程机器
Webview 在本地 UI
```

策略：

```text
MVP：允许 Remote，但提示 runtime 会在 remote host 启动
安全：仍然只监听 127.0.0.1 of remote extension host
工具：使用 VS Code workspace.fs 优先
```

UI 显示：

```text
Remote: ssh-remote
Runtime Location: Remote Host
```

---

## 31. 文件体积控制

VSIX 体积过大会影响安装。

控制策略：

```text
Extension TS 打包成单文件
Webview 静态资源压缩
不打包测试文件
不打包 __pycache__
不打包 .venv
不打包 node_modules
内置 runtime 只保留必要文件
日志不进入 VSIX
```

`.vscodeignore`：

```text
.vscode/**
src/**
scripts/**
test/**
**/*.map
**/__pycache__/**
**/*.pyc
agent-service/.venv/**
node_modules/**
.git/**
docs/**
```

注意：如果通过 esbuild 打包，`node_modules` 可以不进入 VSIX，但要确保 runtime 依赖已经被 bundle 或列为 external。

---

## 32. 版本号策略

使用 SemVer：

```text
0.1.0 MVP
0.2.0 增加 Agent 配置
0.3.0 增加 Workflow Builder
1.0.0 稳定公开版
```

版本字段：

```text
package.json version
agent-service version
runtime-manifest version
config schemaVersion
```

启动时检查：

```text
extension version
service version
config schema version
runtime version
```

不一致时提示迁移。

---

## 33. MVP 发布清单

### 33.1 开发检查

```text
pnpm install --frozen-lockfile
pnpm compile
pnpm test
uv sync
uv run python -m agent_service.main --smoke
```

### 33.2 功能检查

```text
Webview 能打开
Settings 能保存
Runtime 能启动
Health check 通过
task.create 成功
WebSocket 事件正常
read_file 工具正常
patch.openDiff 正常
run_command 确认正常
```

### 33.3 打包检查

```text
vsce package 成功
VSIX 能离线安装
安装后 Webview 正常
Runtime 能启动
日志能打开
卸载后用户数据保留
```

### 33.4 安全检查

```text
API Key 不出现在 settings.json
API Key 不出现在日志
Service 只监听 127.0.0.1
请求需要 session token
禁止 workspace 外路径
run_command 白名单有效
```

---

## 34. Codex 开发任务拆分

### Task 12-1：添加 package.json 发布配置

目标：

```text
补充 commands、configuration、views、activationEvents。
```

修改文件：

```text
package.json
```

验收：

```text
F5 后左侧出现 AutoGen Code 视图。
```

---

### Task 12-2：接入 esbuild 打包

目标：

```text
将 src/extension.ts 打包为 dist/extension.js。
```

修改文件：

```text
scripts/build-extension.ts
package.json
```

验收：

```text
pnpm compile 成功生成 dist/extension.js。
```

---

### Task 12-3：实现 RuntimeManager

目标：

```text
检测 Python、启动 AutoGen Service、health check。
```

修改文件：

```text
src/extension/runtimeManager.ts
```

验收：

```text
Settings 页面点击 Start Runtime 后 service 状态变为 running。
```

---

### Task 12-4：实现 Python 外部 venv 模式

目标：

```text
首次启动创建插件私有 venv 并安装 requirements.lock。
```

修改文件：

```text
src/extension/runtimeManager.ts
agent-service/requirements.lock
```

验收：

```text
没有内置 runtime 时，也能用用户 Python 启动服务。
```

---

### Task 12-5：实现 session token

目标：

```text
Extension 启动 service 时生成 token，HTTP 请求带 Authorization。
```

修改文件：

```text
src/extension/taskClient.ts
agent-service/agent_service/api/middleware.py
```

验收：

```text
无 token 请求返回 401。
```

---

### Task 12-6：实现日志目录

目标：

```text
Extension 和 Python Service 均写入 logUri/globalStorageUri 日志。
```

修改文件：

```text
src/extension/logger.ts
agent-service/agent_service/logging.py
```

验收：

```text
Settings → Open Runtime Logs 能打开日志目录。
```

---

### Task 12-7：实现 VSIX 打包脚本

目标：

```text
pnpm package 生成 VSIX。
```

修改文件：

```text
package.json
.vscodeignore
```

验收：

```text
vsce package 成功。
```

---

### Task 12-8：实现 platform-specific 构建预留

目标：

```text
添加 package:win32-x64 等脚本。
```

修改文件：

```text
package.json
scripts/package-vsix.ts
```

验收：

```text
能生成带 target 的 VSIX。
```

---

### Task 12-9：实现诊断包导出

目标：

```text
Settings 页面导出 diagnostics.zip。
```

修改文件：

```text
src/extension/diagnostics.ts
```

验收：

```text
导出的 zip 中不包含 API Key。
```

---

### Task 12-10：实现启动失败 UI 事件

目标：

```text
Runtime 启动失败时推送 runtime.status 和 error。
```

修改文件：

```text
src/extension/runtimeManager.ts
src/extension/webviewProvider.ts
```

验收：

```text
Python Path 错误时 UI 显示可操作错误。
```

---

## 35. 自检清单

### 35.1 架构自检

```text
[x] 区分了开发、内测、正式三种打包模式
[x] 说明了 Extension 和 Python Runtime 的边界
[x] 说明了 VSIX 内部目录
[x] 说明了 platform-specific VSIX
[x] 说明了内置 Python 与外部 Python 的取舍
```

### 35.2 构建自检

```text
[x] 覆盖 TypeScript 打包
[x] 覆盖 Webview 资源打包
[x] 覆盖 Python Service 依赖锁定
[x] 覆盖 requirements.lock / uv.lock
[x] 覆盖 .vscodeignore
```

### 35.3 Runtime 自检

```text
[x] 设计了 RuntimeManager
[x] 设计了 Python 选择优先级
[x] 设计了 venv / bundled runtime
[x] 设计了端口冲突处理
[x] 设计了健康检查
[x] 设计了启动失败处理
```

### 35.4 安全自检

```text
[x] Service 只监听 127.0.0.1
[x] 使用 session token
[x] API Key 不放 settings.json
[x] 日志脱敏
[x] 诊断包脱敏
```

### 35.5 发布自检

```text
[x] 覆盖 VSIX 打包
[x] 覆盖 Marketplace 发布
[x] 覆盖 GitHub Release 内测
[x] 覆盖升级
[x] 覆盖回滚
```

---

## 36. 下一份文档建议

下一份：

```text
13_MVP开发顺序与验收清单.md
```

重点应写：

```text
1. 先做哪些功能
2. 每个 Sprint 的目标
3. Codex 每个任务怎么验收
4. MVP 到内测的检查清单
5. 失败时怎么缩小范围
```
