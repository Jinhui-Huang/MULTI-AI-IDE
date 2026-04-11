# 多 AI 协同开发 IDE —— 开发要件与技术方案

## 1. 项目目标

构建一个 **多 AI Agent 协同的软件开发 IDE**,在 IDE 内实现需求分析、架构设计、代码生成、测试、代码评审等开发流程自动化。

项目基于 **Code-OSS(VS Code 开源版)** 进行二次开发,实现类似 Cursor 的 AI 编程能力,但扩展为 **多 Agent 协同开发模式**。

### 核心目标

- 多 AI 角色协同开发代码
- IDE 内自动完成 需求 → 架构 → 编码 → 测试 → Review 闭环
- 支持第三方 AI API 接入(OpenAI / Anthropic / 国产模型)
- 支持本地模型接入(Ollama / vLLM / LM Studio)
- 支持完全离线部署版本(企业内网场景)

### 非目标(明确不做)

- 不重写编辑器内核(沿用 Monaco + Code-OSS)
- 不自研 LSP 协议(复用现有实现)
- 不自研大模型(仅做接入与编排)
- MVP 阶段不做云端多人协同(仅本地单机)

---

## 2. 产品核心功能

### 2.1 AI Agent 体系

| Agent | 职责 | 输入 | 输出 | 依赖模型能力 |
|---|---|---|---|---|
| **PM Agent** | 需求解析、任务拆分 | 用户自然语言需求 | 任务列表、开发计划 | 结构化输出、长上下文 |
| **Lead Agent** | 架构设计、技术选型、任务分配 | PM 任务列表、项目现状 | 架构文档、任务依赖图 | 代码理解、推理 |
| **Dev Agent** | 编写/修改代码、自动补全 | 任务描述、代码上下文 | 代码变更、PR | Tool use、代码生成 |
| **QA Agent** | 生成测试、执行测试、Bug 报告 | Dev 产出的代码 | 测试报告、Bug ticket | Tool use、代码执行 |
| **Review Agent** | Code Review、质量分析、安全扫描 | PR diff、项目规范 | Review 评论、优化建议 | 代码理解、规则推理 |

**协同模式**:采用 **消息驱动 + 共享黑板(Blackboard)** 架构。Agent 之间不直接调用,而是通过任务队列和共享状态进行异步协作,避免循环依赖和上下文污染。

---

### 2.2 IDE 基础功能

#### 2.2.1 代码编辑器
沿用 Code-OSS 原生能力:语法高亮、自动补全、LSP、Git 集成、Debug、终端。

#### 2.2.2 AI 聊天面板
- 侧边栏 WebView 实现
- 支持对话历史、上下文引用(@file、@symbol、@selection)
- 支持流式输出(SSE)
- 支持代码块一键应用(Apply to Editor)

#### 2.2.3 AI 任务系统
任务状态机:

```
TODO → DOING → REVIEW → TEST → DONE
         ↓        ↓       ↓
       FAILED ← ──┴───────┘
```

- 任务持久化到 SQLite
- 支持手动创建、AI 自动拆分
- 任务之间支持依赖(DAG)

#### 2.2.4 Agent 控制台
- 当前 Agent 状态(idle / running / waiting / error)
- Agent 工作日志流式展示
- Agent 执行队列可视化
- 支持手动暂停/重试/取消

---

## 3. 系统架构

### 3.1 架构分层

```
┌─────────────────────────────────────────┐
│   用户层 (User)                          │
├─────────────────────────────────────────┤
│   IDE UI 层 (Code-OSS + WebView)        │  ← TypeScript / React
├─────────────────────────────────────────┤
│   扩展宿主层 (Extension Host)            │  ← Node.js
│   - Chat Controller                      │
│   - Task Controller                      │
│   - Agent Controller                     │
├─────────────────────────────────────────┤
│   Agent 系统 (Agent Runtime)             │
│   - PM / Lead / Dev / QA / Review       │
│   - Tool Registry                        │
├─────────────────────────────────────────┤
│   任务调度系统 (Orchestrator)            │
│   - Task Queue (BullMQ / in-memory)     │
│   - State Manager                        │
├─────────────────────────────────────────┤
│   AI 模型接入层 (Model Gateway)          │
│   - Provider Adapter (OpenAI/Claude/…)  │
│   - Streaming / Tool-use 适配            │
├─────────────────────────────────────────┤
│   外部 AI / 本地模型                     │
└─────────────────────────────────────────┘
```

### 3.2 Agent 调度系统

**核心组件**:

- **Task Queue**:BullMQ(依赖 Redis)或 MVP 阶段使用纯内存队列(better-queue)
- **Agent Worker**:每个 Agent 为独立 Worker 进程,避免阻塞扩展宿主
- **State Manager**:SQLite 持久化任务状态与 Agent 对话历史
- **Tool Registry**:统一注册 Agent 可调用的工具(read_file / write_file / run_shell / search_code 等)

**执行流程**:

```
用户需求
   ↓
PM Agent → 拆分子任务 → 写入 Task Queue
   ↓
Lead Agent → 消费 PM 任务 → 输出架构 + 任务 DAG
   ↓
Dev Agent(可并行) → 消费编码任务 → 产出 diff
   ↓
QA Agent → 生成并执行测试
   ↓
Review Agent → 审查 → 通过/打回
   ↓
合并到工作区
```

### 3.3 代码索引系统

- **AST 解析**:Tree-sitter(多语言支持,增量解析)
- **Symbol 索引**:复用 VS Code LSP
- **语义检索**:MVP 用 BM25(lunr.js / MiniSearch),Phase 4+ 引入向量检索(Qdrant + 本地 embedding 模型如 bge-small)
- **上下文裁剪**:基于文件相关度 + Token 预算动态裁剪

---

## 4. 技术选型与可行性分析

### 4.0 IDE 基座选型：Code-OSS vs 从 0 自研

> 这是整个项目最重要的架构决策，先于其他选型确定。

#### 一个完整 IDE 的工程量

从 0 写 IDE 需要覆盖以下所有层：

```
编辑器内核
├── 文本模型（Piece Tree / Gap Buffer）
├── 光标与选区管理
├── 撤销/重做栈
├── 虚拟滚动（10 万行不卡）
├── 语法高亮（TextMate grammar）
└── 括号匹配、折叠、缩进

语言服务（LSP）        → 自动补全、跳转定义、错误诊断
文件系统              → 文件树、watcher、大文件处理
Git 集成              → diff、blame、冲突解决 UI
调试器（DAP 协议）    → 断点、变量、调用栈
终端                  → xterm.js、跨平台 PTY
扩展系统              → API 设计、沙箱隔离
其他                  → 搜索、多窗口、主题、国际化
```

**VS Code 团队 200+ 人写了 12 年才到今天的状态。**

#### 三种从 0 自研的备选方案

| 方案 | 组成 | 问题 |
|---|---|---|
| Monaco Editor + 自组装 | Monaco + xterm.js + 自写其余 | Monaco 只是编辑器组件，剩余 80% 还要自写。Theia 走这条路，30+ 人花了 3 年，仍不如 VS Code |
| Electron + CodeMirror 6 | 更轻量的编辑器内核 + 自写 IDE 层 | CodeMirror 生态弱，LSP/调试器无现成方案；Zed 用 Rust 走极致性能路线，10 人团队花了 4 年 |
| Neovim/Helix 套 GUI | 有 LSP 和插件系统 | 用户群体局限，GUI 体验差，与主流用户习惯差异大 |

#### Code-OSS vs 从 0 自研 对比

| 维度 | 从 0 自研 | Code-OSS |
|---|---|---|
| 编辑器内核 | 6~12 个月（仅基础可用） | ✅ 开箱即用 |
| LSP / 自动补全 | 3~6 个月 | ✅ 开箱即用 |
| Git 集成 | 2~3 个月 | ✅ 开箱即用 |
| 调试器 | 3~6 个月 | ✅ 开箱即用 |
| 终端 | 1~2 个月 | ✅ 开箱即用 |
| 跨平台稳定性 | 持续踩坑 | ✅ 已解决 |
| 扩展生态 | 0，需自建 | ✅ 数万扩展 |
| **到 AI 功能的时间** | **12 个月以后** | **第 1 周** |
| **单人能否完成 MVP** | 极难 | 可以 |

#### 核心判断

> 本项目的核心壁垒是 **AI Agent 协同能力**，不是编辑器本身。
>
> 编辑器是载体，AI 能力是价值。花 12 个月重建一个已有完美开源方案的东西，是在用时间成本换来一个竞争力更弱的起点。

**唯一值得考虑从 0 写的场景**（本项目均不符合）：
- 目标用户是非程序员，需要极简 UI
- 专为某垂直语言深度集成编译器
- 核心卖点就是编辑器本身（如 JetBrains）
- 有专职团队 + 充足资金做极致性能优化（如 Zed）

#### UI 形态与长期路线

**扩展阶段 UI 布局**（Phase 1~4）：

```
┌──────┬──────────────────────┬──────────────────┐
│活动栏│    代码编辑区         │  AI Chat 面板    │
│      │                      │  (WebView)        │
│ 🤖   │  function hello() {  │  消息列表         │
│ 📁   │    return "world"    │                  │
│      │  }                   │  [输入框] [发送]  │
└──────┴──────────────────────┴──────────────────┘
│  底部面板：Agent 控制台 / 任务列表 / 终端        │
└─────────────────────────────────────────────────┘
```

- 右侧侧边栏：AI Chat 主交互区（WebView）
- 底部面板：Agent 执行日志、任务队列（新增 Tab）
- 编辑器内：代码 diff 预览、inline Ghost Text 建议
- 状态栏：当前 Agent 状态指示器

**与最终独立 App 的迁移路径**：

```
Phase 1~4: VS Code 扩展（在用户已有 VS Code 里运行）
     ↓ 核心 AI 能力验证完毕后
Phase 5+:  fork Code-OSS，把扩展内置进去
     ↓
最终交付:  独立桌面 App（.exe / .dmg）
           自定义品牌 + 启动页 + 菜单
           用户无需安装 VS Code，即 Cursor/Windsurf 形态
```

迁移成本极低：扩展阶段的 AI 逻辑、WebView UI、Agent 系统 **90%+ 代码直接复用**，只需替换 `vscode.*` API 调用（约占总量 5~10%）。

#### 结论

**选用 Code-OSS，以 VS Code 扩展形式启动，Phase 5 后评估 fork。** 所有精力压在 AI Agent 能力上。

---

### 4.1 技术栈总览

| 分层 | 选型 | 备选 | 说明 |
|---|---|---|---|
| IDE 基座 | Code-OSS (fork) | 从 0 自研 | 见 §4.0，自研不可行 |
| 启动形态 | VS Code 扩展 → fork | - | 扩展先行验证，稳定后 fork |
| 语言 | TypeScript | - | Code-OSS 原生语言 |
| UI 框架 | React + WebView API | Svelte | Code-OSS 官方推荐 React |
| 扩展运行时 | Node.js (Extension Host) | - | VS Code 原生机制 |
| 任务队列 | BullMQ(Phase 3+)/ 内存队列(MVP) | Temporal | MVP 避免引入 Redis 复杂度 |
| 本地存储 | better-sqlite3 | LevelDB | 同步 API、零依赖、性能足够 |
| 向量库 | Qdrant(Phase 4+) | LanceDB | 离线部署友好 |
| AI SDK | 官方 SDK + 自研 Adapter | LangChain.js | LangChain 抽象过重、不稳定 |
| 代码索引 | Tree-sitter + MiniSearch | ctags | Tree-sitter 增量解析性能优 |
| 日志 | pino | winston | pino 性能更好 |
| 测试 | Vitest + Playwright | Jest | Vitest 更快 |

### 4.2 关键技术可行性分析

#### ✅ Code-OSS 二次开发可行
- **依据**:Cursor、Windsurf、Trae、VSCodium 均基于 Code-OSS，路线已验证
- **风险**:微软商标限制(需移除 `product.json` 中 MS 品牌资源)、Marketplace 不可直接使用(需改为 Open VSX)
- **应对**:MVP 阶段先以 **VS Code 扩展(.vsix)** 形式开发，不 fork 源码；等核心功能稳定后再 fork，加品牌、打独立包

#### ✅ 多 Agent 编排可行
- **依据**:Claude Code、Cline、Aider、OpenHands 等已验证 Tool-use + 任务循环模式
- **风险**:Agent 死循环、Token 爆炸、工具误操作
- **应对**:硬性步数上限、Token 预算、工具白名单 + 人工确认(destructive 操作)

#### ⚠️ 本地模型接入需要分级
- **依据**:Ollama / LM Studio 提供 OpenAI 兼容接口
- **风险**:本地模型 tool-use 能力弱,复杂 Agent 流程可能失败
- **应对**:Agent 分档——PM/Lead 强制用云端大模型,Dev/QA 可选本地模型；提供模型能力探测

#### ⚠️ 代码索引在大仓库性能风险
- **风险**:10 万+ 文件项目全量 AST 解析慢
- **应对**:增量索引 + 基于 Git 变更的懒加载；MVP 阶段限定 ≤ 5000 文件的项目

#### ✅ 离线部署可行
- **依据**:所有依赖(Node、SQLite、Qdrant、Ollama)均支持离线
- **风险**:Electron 打包体积大(~200MB)
- **应对**:分发时提供基础包 + 模型包分离下载

### 4.3 技术风险清单

| 风险 | 影响 | 概率 | 缓解措施 |
|---|---|---|---|
| Code-OSS 升级破坏兼容 | 高 | 中 | 锁定版本、定期 rebase |
| AI API 限流/涨价 | 中 | 高 | 多 Provider、本地模型兜底 |
| Agent 自动修改代码出错 | 高 | 高 | 沙盒 + diff 预览 + 撤销 |
| Prompt 注入攻击(读到恶意文件) | 高 | 中 | 文件内容标记为 untrusted |
| 本地模型性能不足 | 中 | 高 | 能力探测 + 降级策略 |

---

## 5. MVP 功能范围

第一阶段(MVP)**仅实现**:

- AI Chat 面板(单轮 + 多轮对话)
- 单 Dev Agent(无多 Agent 协同)
- 代码生成与修改(Apply to Editor)
- 项目上下文读取(@file / @selection)
- 基础的 Prompt 模板系统

**MVP 明确不做**:多 Agent、任务队列、向量检索、Review、测试自动化、Git 自动提交。

---

## 6. 开发阶段规划

| 阶段 | 周期 | 目标 | 交付物 |
|---|---|---|---|
| Phase 1 | 2 周 | IDE 基础搭建 | 可运行的扩展骨架 + WebView Chat UI |
| Phase 2 | 2 周 | AI 接入 | 可调用 OpenAI/Claude,支持流式 |
| Phase 3 | 3 周 | Agent 系统 | Dev Agent + Tool use + 任务队列 |
| Phase 4 | 2 周 | 项目理解 | 代码索引 + 上下文检索 |
| Phase 5 | 3 周 | 协同开发 | 多 Agent 流转 + Agent 控制台 |
| **合计** | **12 周** | **MVP 完成** | |

---

## 7. Phase 1 详细开发方案(重点)

> Phase 1 是整个项目的地基,决定后续扩展能力。目标是在 **2 周内** 搭建出一个可运行、可调试、可加载 WebView 的 IDE 扩展骨架。

### 7.1 Phase 1 目标拆解

1. **选型落地**:确定以 **VS Code 扩展形态** 开发,而非直接 fork Code-OSS(降低首期复杂度,Phase 5 后再评估 fork)
2. **环境就绪**:Node + pnpm + VS Code Extension 开发环境
3. **骨架代码**:一个可以 `F5` 调试启动的扩展
4. **UI 容器**:侧边栏 WebView,承载后续 Chat UI
5. **消息通道**:Extension Host ↔ WebView 双向通信封装
6. **配置系统**:可读取用户设置(API Key、模型选择)
7. **日志与错误**:统一 logger、错误上报
8. **打包发布**:能产出 `.vsix` 安装包

### 7.2 技术决策:为什么 Phase 1 不 fork Code-OSS?

| 方案 | 优势 | 劣势 | Phase 1 选择 |
|---|---|---|---|
| Fork Code-OSS | 可深度定制菜单/品牌/内置能力 | 编译 1-2 小时、Windows 构建坑多、维护成本高 | ❌ |
| VS Code 扩展(.vsix) | 开发快、热重载、生态兼容 | 无法改品牌、部分 API 受限 | ✅ |

**结论**:Phase 1~4 全部基于扩展开发;Phase 5 后若需要定制启动页/品牌再评估 fork。这样可以把前 8 周全部投入到 AI 能力本身,而不是折腾编译环境。

### 7.3 目录结构设计

整体采用 **Monorepo**，但各包按阶段激活，Phase 1 只写 `ide/`：

```
multi-ai-ide/
├── ide/                          # ★ Phase 1 主战场
│   ├── package.json              # 扩展清单(contributes、activationEvents)
│   ├── tsconfig.json
│   ├── .vscode/
│   │   └── launch.json           # F5 一键调试
│   ├── src/                      # 扩展主体（Node.js / Extension Host）
│   │   ├── extension.ts          # activate / deactivate 入口
│   │   ├── core/
│   │   │   ├── logger.ts         # OutputChannel 日志封装
│   │   │   └── config.ts         # 读取 aiAgent.* 配置项
│   │   ├── chat/
│   │   │   └── chatViewProvider.ts  # WebviewViewProvider（侧边栏容器）
│   │   ├── commands/
│   │   │   └── index.ts          # 注册命令（AI: Open Chat 等）
│   │   └── types/
│   │       └── protocol.ts       # ExtToWebMsg / WebToExtMsg 共享类型
│   └── webview/                  # 前端子项目（Browser / Vite + React）
│       ├── package.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx          # React 入口，发 ready 消息
│           ├── App.tsx           # Chat UI（消息列表 + 输入框）
│           └── vscode.ts         # acquireVsCodeApi 封装
├── agent-core/                   # Phase 3：Agent 调度、Worker、工具
├── ai-gateway/                   # Phase 2：AI API 统一路由
├── code-indexer/                 # Phase 4：代码索引、AST 解析
├── vector-store/                 # Phase 4+：向量检索
├── docs/
└── scripts/
```

**关键设计**:
- `src/`（Node.js）和 `webview/src/`（Browser）严格隔离，不混用运行时 API
- `types/protocol.ts` 两端共用，编译期保证消息契约完整
- WebView 开发时走 Vite HMR，生产走本地文件 URI
- `task-system/` 不单独设包，任务逻辑统一放 `agent-core/scheduler/`，避免重复
- `types/protocol.ts` 双端共享,保证消息契约类型安全

### 7.4 任务分解(2 周)

#### Week 1:环境与骨架

| # | 任务 | 预计 | 验收标准 |
|---|---|---|---|
| 1.1 | 初始化仓库、pnpm workspace | 0.5d | `pnpm install` 通过 |
| 1.2 | 扩展骨架(`yo code` 或手写) | 0.5d | F5 启动新窗口,命令面板可见 `AI: Hello` |
| 1.3 | TypeScript 严格模式 + ESLint + Prettier | 0.5d | `pnpm lint` 通过 |
| 1.4 | Logger(pino)+ 错误类型 | 0.5d | 日志输出到 OutputChannel |
| 1.5 | 配置系统(读取 `aiAgent.*` 设置) | 0.5d | 可读取 apiKey、model |
| 1.6 | WebView 子项目初始化(Vite + React) | 1d | 独立 `pnpm dev` 可跑 |
| 1.7 | WebviewViewProvider 注册到侧边栏 | 1d | 侧边栏出现自定义面板 |

#### Week 2:通信、打包与联调

| # | 任务 | 预计 | 验收标准 |
|---|---|---|---|
| 2.1 | WebView 加载 Vite 产物(本地资源 URI) | 1d | 侧边栏渲染 React 页面 |
| 2.2 | 双向消息通道(postMessage 封装 + 类型) | 1d | Ping/Pong 往返 |
| 2.3 | 基础 Chat UI(输入框 + 消息列表,纯前端 mock) | 1d | 输入回显 |
| 2.4 | 命令注册:`AI: Open Chat`、`AI: Clear` | 0.5d | 命令面板可触发 |
| 2.5 | 构建脚本(扩展 + webview 合并打包) | 1d | `pnpm build` 产出 dist/ |
| 2.6 | vsce 打包 `.vsix` | 0.5d | 可在另一台 VS Code 安装 |
| 2.7 | README + 调试文档 | 0.5d | 新开发者可 10 分钟上手 |
| 2.8 | 冒烟测试(Playwright for VS Code) | 0.5d | 1 个 e2e:打开面板成功 |

### 7.5 Phase 1 关键技术点

#### (1) WebView 消息通道封装

定义强类型协议,避免 `any` 满天飞:

```typescript
// src/types/protocol.ts
export type ExtToWebMsg =
  | { type: 'init'; payload: { theme: 'light' | 'dark' } }
  | { type: 'chat/stream'; payload: { id: string; delta: string } }
  | { type: 'chat/done'; payload: { id: string } };

export type WebToExtMsg =
  | { type: 'chat/send'; payload: { text: string } }
  | { type: 'chat/cancel'; payload: { id: string } };
```

扩展侧和 WebView 侧都 import 这个类型,消息处理使用 discriminated union,编译期保证覆盖完整。

#### (2) WebView 资源加载

Vite 构建产物路径需要通过 `webview.asWebviewUri()` 转换,且要设置严格的 CSP。注意 `localResourceRoots` 必须包含 Vite dist 目录。

#### (3) 热重载开发体验

- 扩展主体:`tsc --watch` + VS Code 自动重载
- WebView:Vite dev server + HMR(开发时 WebView 加载 `http://localhost:5173`,生产加载本地文件)
- 通过环境变量切换

#### (4) 配置项设计(package.json contributes)

```json
{
  "aiAgent.provider": { "enum": ["openai", "anthropic", "ollama"] },
  "aiAgent.apiKey": { "type": "string", "scope": "machine-overridable" },
  "aiAgent.model": { "type": "string", "default": "claude-opus-4-6" },
  "aiAgent.baseUrl": { "type": "string" }
}
```

注意:`apiKey` 推荐用 `SecretStorage` 而非普通配置,Phase 2 时切换。

### 7.6 Phase 1 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| Windows 上 node-gyp 编译失败 | 开发阻塞 | 明确 Node 版本(LTS 20)、提供 `.nvmrc` |
| WebView CSP 限制导致 React 加载失败 | UI 无法渲染 | 提前读 VS Code WebView 官方示例,使用 nonce |
| Vite HMR 与 VS Code WebView 冲突 | 开发体验差 | 开发时直接 iframe 加载 dev server,生产走本地文件 |
| 扩展激活事件过宽导致启动慢 | 体验差 | 仅在 `onView:aiAgent.chat` 激活 |
| 类型在扩展/WebView 两端不一致 | 运行时错误 | `types/protocol.ts` 作为 shared 包 |

### 7.7 Phase 1 交付物(Definition of Done)

- [ ] 代码仓库初始化,含 CI(lint + build)
- [ ] `pnpm build` 产出可安装的 `.vsix`
- [ ] `F5` 一键启动调试
- [ ] 侧边栏显示 AI Agent 面板,含输入框与消息列表
- [ ] WebView ↔ Extension 双向通信 demo 可跑通
- [ ] 配置项可在 VS Code 设置界面看到
- [ ] OutputChannel 有结构化日志
- [ ] README 含:环境要求、启动步骤、目录说明、调试技巧
- [ ] 至少 1 个 e2e 冒烟测试

**Phase 1 不做的事**(划清边界):
- ❌ 不接入真实 AI API(Phase 2)
- ❌ 不实现流式响应(Phase 2)
- ❌ 不读取项目文件(Phase 2)
- ❌ 不做 Prompt 模板(Phase 2)
- ❌ 不做任务队列(Phase 3)

---

## 8. 总开发周期

- 预计周期:**12 周(约 3 个月)**
- 单人可完成 MVP
- Phase 1 完成即具备 demo 能力,可向内部演示

---

## 9. 后续扩展(Phase 6+)

- 自动 PR 生成
- 自动 Bug 修复闭环
- 自动文档生成
- 自动部署(CI/CD 集成)
- 云端多人协同
- 企业版:审计日志、权限控制、私有模型管理

---

## 10. 核心差异化优势与技术方案

> 本节基于与 OpenCode（140K+ Stars 的开源 AI 编码代理）等竞品的对比分析，明确本项目的差异化方向。

### 10.1 Token 消耗优化体系

Token 消耗是 AI 编码工具的核心成本瓶颈。本项目从架构层面系统性地降低 token 消耗，目标是在同等任务下 **比单 Agent 方案降低 60-80% 的 token 开销**。

#### 10.1.1 上下文精准裁剪（Phase 4）

- 基于 **Tree-sitter** 对源码进行 AST 解析，提取与当前任务相关的函数、类、接口定义
- 结合 **向量检索（BM25 → Qdrant）** 做语义级上下文匹配，只投喂相关代码片段
- 避免将整个文件或项目塞给 LLM，预计减少 **60-80% 的输入 token**

#### 10.1.2 模型智能路由（Phase 2-3）

不同角色的 Agent 按任务复杂度自动选择最优模型，在 `ai-gateway` 层实现路由策略：

| Agent 角色 | 推荐模型 | 原因 |
|-----------|---------|------|
| PM Agent | Claude Opus / GPT-4o | 需要强推理能力做需求分析 |
| Lead Agent | Claude Sonnet / GPT-4o | 架构决策需要平衡能力与成本 |
| Dev Agent | Claude Sonnet / DeepSeek | 代码生成任务，中等模型即可胜任 |
| QA Agent | Claude Haiku / GPT-4o-mini | 格式检查、测试验证，小模型足够 |
| Review Agent | Claude Sonnet | 代码审查需要理解力但不需要最强推理 |

通过模型分级路由，综合成本可降低 **5-10 倍**。

#### 10.1.3 Prompt 缓存（Phase 2）

- 利用 Anthropic **Prompt Caching** 能力，对重复的系统提示词、项目上下文等前缀部分缓存
- 缓存命中时输入 token 成本降低 **90%**
- 特别适合多 Agent 共享相同项目背景的场景

#### 10.1.4 增量 Diff 传递（Phase 3）

- Agent 之间传递代码变更时，只传 **diff 内容**而非完整文件
- 大文件场景下可减少 **70%+** 的传输 token
- 黑板系统记录文件快照，Agent 仅需读取增量变更

#### 10.1.5 黑板上下文摘要（Phase 3）

- 共享黑板定期对历史上下文进行 **压缩摘要**
- 防止多轮对话导致上下文无限膨胀
- 使用小模型（Haiku）做摘要，大模型只消费压缩后的上下文

#### 10.1.6 本地小模型兜底（Phase 2）

- 通过 Ollama / vLLM 接入本地模型，部分简单任务（格式化、命名建议、简单补全）零 API 成本
- 项目已规划 `ollama` 作为 provider，无额外架构改动

#### 10.1.7 Token 消耗可视化（Phase 3）

- GUI 界面实时展示每个 Agent 的 token 消耗量
- 支持按任务、按角色、按模型维度的成本统计
- 用户可手动调整路由策略以控制预算
- 这是终端工具（如 OpenCode）无法提供的透明度优势

### 10.2 共享黑板（Blackboard）架构

共享黑板是本项目多 Agent 协同的核心机制，区别于 OpenCode 的事件驱动点对点消息模型。

#### 10.2.1 设计理念

- 模拟真实开发团队的 **共享看板/文档** 工作模式
- 所有 Agent 读写同一个共享状态空间，天然解决信息同步问题
- 避免每个 Agent 重新理解完整代码上下文，减少重复 token 消耗

#### 10.2.2 黑板数据结构

```
Blackboard {
  project_context:   项目级信息（技术栈、目录结构、约定）
  task_state:        当前任务状态（需求、设计方案、代码变更、测试结果）
  file_snapshots:    关键文件快照（支持增量 diff）
  agent_messages:    Agent 间的结构化消息队列
  decision_log:      决策记录（架构选型、方案取舍的原因）
  summary:           压缩后的历史摘要
}
```

#### 10.2.3 与竞品对比

| 维度 | OpenCode（事件驱动） | Multi AI IDE（黑板） |
|------|---------------------|---------------------|
| 信息共享 | Agent 间点对点传递，容易信息丢失 | 全局共享，任何 Agent 可读写 |
| 上下文一致性 | 各 Agent 可能持有不同版本的上下文 | 单一数据源，强一致 |
| 新 Agent 加入 | 需要从头注入上下文 | 读黑板即可获取全部背景 |
| Token 效率 | 每次交互需重传上下文 | 引用黑板内容，避免重复传输 |
| 可追溯性 | 消息链分散 | decision_log 集中记录 |

### 10.3 多角色团队流转

本项目的 Agent 体系模拟真实软件开发团队的角色分工，形成完整闭环：

```
用户需求 → PM Agent（需求分析、任务拆解）
         → Lead Agent（架构设计、任务分配）
         → Dev Agent（代码实现）× N 并行
         → QA Agent（测试验证）
         → Review Agent（代码评审）
         → 交付用户
```

#### 关键特性

- **闭环自纠错**：QA Agent 发现问题后，自动回退给 Dev Agent 重做，无需用户介入
- **并行执行**：多个 Dev Agent 可同时处理不同子任务，通过黑板协调避免冲突
- **角色可配置**：用户可跳过不需要的角色（如小任务可跳过 PM 和 Lead，直接给 Dev）

### 10.4 GUI 可视化优势

作为 VS Code 扩展 / 独立 IDE，本项目在可视化方面有终端工具无法比拟的优势：

| 能力 | 说明 |
|------|------|
| **任务流转可视化** | 实时展示 PM→Lead→Dev→QA→Review 的任务状态流转 |
| **Agent 协作看板** | 可视化每个 Agent 的工作状态、输入输出、耗时 |
| **Token 消耗仪表盘** | 按角色/模型/任务维度的成本统计与趋势图 |
| **黑板实时视图** | 查看共享黑板的当前状态，理解 Agent 间的信息流 |
| **决策追溯** | 可视化 decision_log，理解每个架构/设计决策的来源 |
| **代码 Diff 预览** | Agent 生成的代码变更在编辑器内实时预览，支持逐行审查 |

### 10.5 竞品对比总结

| 维度 | OpenCode | Cursor | Multi AI IDE |
|------|----------|--------|-------------|
| 形态 | 终端 CLI | 独立 IDE（闭源） | VS Code 扩展 → 独立 IDE |
| Agent 模型 | 双代理（Plan/Build） | 单 Agent | 多角色团队（5 角色） |
| 协同机制 | 事件驱动 | 无 | 共享黑板 |
| Token 优化 | 模型路由 | Prompt 缓存 | 全链路优化（6 种手段） |
| 代码理解 | 依赖 LLM 上下文 | 自研索引 | Tree-sitter + 向量检索 |
| 成本透明度 | 基础统计 | 不透明 | 多维度可视化 |
| 本地模型 | 支持 | 不支持 | 支持 |
| 开源 | 是 | 否 | 是 |