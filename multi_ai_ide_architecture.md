# 多 AI 协同开发 IDE —— 项目结构与架构

## 1. 总体结构（Monorepo，按阶段激活）

```
multi-ai-ide/
├── ide/                     # ★ Phase 1-2 主战场：VS Code 扩展 + WebView UI
├── agent-core/              # Phase 3：Agent 调度、Worker、工具
├── ai-gateway/              # Phase 2-3：AI API 统一路由
├── code-indexer/            # Phase 4：代码索引、AST 解析
├── vector-store/            # Phase 4+：向量检索（Qdrant）
├── docs/
└── scripts/                 # 根构建脚本
```

**原则**：每个包只在对应 Phase 开始时才写代码，避免空壳目录形成维护负担。
当前激活：`ide/`。其余包保留目录结构，内容为空。

---

## 2. ide/ —— Phase 1 核心（VS Code 扩展）

```
ide/
├── package.json             # 扩展清单（contributes、activationEvents）
├── tsconfig.json
├── .vscode/
│   └── launch.json          # F5 一键调试
├── src/                     # 扩展主体（Node.js，运行在 Extension Host）
│   ├── extension.ts         # activate / deactivate 入口
│   ├── core/
│   │   ├── logger.ts        # OutputChannel 日志
│   │   └── config.ts        # 读取 aiAgent.* 配置项
│   ├── chat/
│   │   └── chatViewProvider.ts  # WebviewViewProvider，侧边栏容器
│   ├── commands/
│   │   └── index.ts         # 注册命令（AI: Open Chat 等）
│   └── types/
│       └── protocol.ts      # ExtToWebMsg / WebToExtMsg 共享类型
└── webview/                 # 前端子项目（Browser，Vite + React）
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx         # React 入口，发送 ready 消息
        ├── App.tsx          # Chat UI（消息列表 + 输入框）
        └── vscode.ts        # acquireVsCodeApi 封装（postMessage / onMessage）
```

**关键设计**：
- `src/`（Node.js）和 `webview/src/`（Browser）严格隔离，不混用运行时 API
- `types/protocol.ts` 被两端同时引用，保证消息类型安全
- WebView 开发时走 Vite HMR（`localhost:5173`），生产走本地文件 URI

---

## 3. agent-core/ —— Phase 3 启动

```
agent-core/src/
├── agents/
│   ├── pmAgent.ts           # 需求解析、任务拆分
│   ├── leadAgent.ts         # 架构设计、任务分配
│   ├── devAgent.ts          # 代码生成、修改
│   ├── qaAgent.ts           # 测试生成与执行
│   └── reviewAgent.ts       # Code Review、安全扫描
├── scheduler/
│   ├── taskQueue.ts         # 任务队列（MVP 内存版，后期 BullMQ）
│   ├── agentRunner.ts       # Agent Worker 执行器
│   └── stateManager.ts      # 任务状态持久化（SQLite）
├── memory/
│   ├── projectMemory.ts     # 项目级共享记忆（Blackboard）
│   └── agentMemory.ts       # Agent 单轮对话历史
└── tools/
    ├── codeEditorTool.ts    # read_file / write_file / apply_diff
    ├── gitTool.ts           # git status / diff / commit
    └── testTool.ts          # 执行测试命令、收集结果
```

**注意**：`task-system/` 不单独设包，任务逻辑统一在 `agent-core/scheduler/` 下。

---

## 4. ai-gateway/ —— Phase 2 启动

```
ai-gateway/src/
├── providers/
│   ├── anthropic.ts         # Claude API（stream + tool use）
│   ├── openai.ts            # OpenAI 兼容接口
│   └── localModel.ts        # Ollama / LM Studio（OpenAI 兼容）
├── prompt/
│   └── promptTemplates.ts   # 各 Agent 的系统提示模板
└── router.ts                # 根据配置路由到对应 Provider
```

---

## 5. code-indexer/ —— Phase 4 启动

```
code-indexer/src/
├── scanner/
│   ├── projectScanner.ts    # 全量/增量文件扫描
│   └── fileWatcher.ts       # 基于 chokidar 的文件变更监听
├── parser/
│   └── treeSitterParser.ts  # Tree-sitter 多语言 AST 解析
└── index/
    ├── symbolIndex.ts       # Symbol → 文件 + 行号 倒排索引
    └── dependencyGraph.ts   # 模块依赖图（import/require 分析）
```

---

## 6. 数据库设计（SQLite，Phase 3+）

```sql
-- 任务表
CREATE TABLE tasks (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL,  -- TODO/DOING/REVIEW/TEST/DONE/FAILED
  agent       TEXT,
  parent_id   TEXT,           -- 子任务支持
  created_at  INTEGER,
  updated_at  INTEGER
);

-- Agent 执行日志
CREATE TABLE agent_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  agent      TEXT    NOT NULL,
  task_id    TEXT,
  level      TEXT,            -- info/warn/error
  message    TEXT    NOT NULL,
  timestamp  INTEGER NOT NULL
);

-- 代码符号索引
CREATE TABLE code_index (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  file    TEXT NOT NULL,
  symbol  TEXT NOT NULL,
  kind    TEXT,               -- function/class/variable
  line    INTEGER
);
```

---

## 7. 各阶段激活的包

| Phase | 激活的包 | 新增能力 |
|---|---|---|
| Phase 1 | `ide/` | 扩展骨架、WebView Chat UI、消息通信 |
| Phase 2 | `ide/` + `ai-gateway/` | 真实 AI API 调用、流式输出 |
| Phase 3 | + `agent-core/` | Dev Agent、任务队列、Tool use |
| Phase 4 | + `code-indexer/` | 代码索引、上下文检索 |
| Phase 5 | 全部 + fork Code-OSS | 多 Agent 协同、独立桌面 App |
