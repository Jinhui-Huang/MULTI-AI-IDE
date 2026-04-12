# 📋 AI Agent IDE — 总体进度文档

> 新会话开始时，读取此文件快速恢复上下文
> 恢复指令：「读 TASKS.md + DAY4.md，继续 Phase 3」

---

## 项目概述

基于 VS Code 扩展形态构建多 AI Agent 协同开发 IDE。Phase 1-2 已完成（4 天），Phase 3 开发中。

- **GitHub**: https://github.com/Jinhui-Huang/MULTI-AI-IDE
- **本地路径**: `d:\ai-agent-ide\multi-ai-ide`
- **技术栈**: TypeScript + React + VS Code Extension API + pnpm workspace
- **构建工具**: esbuild + Vite + TypeScript compiler
- **当前状态**: Phase 2 ✅ 完成 | Phase 3 ⏳ 计划中

---

## 📊 核心进度 (DAY 1-4)

```
DAY 1 ✅  Phase 1 前期       57% → pnpm workspace + F5 调试 + Config
DAY 2 ✅  Phase 1 完成      100% → WebView HMR + Chat UI + Ping/Pong  
DAY 3 ✅  Phase 2 前期       60% → AI Gateway + 4 Provider + 流式输出
DAY 4 ✅  Phase 2 完成      100% → 高亮 + 导出 + System Prompt + 多会话

总计: 4 天 | 3460+ 行代码 | 100% 构建成功 | 7/7 测试通过
```

---

## ✅ 已完成功能矩阵

### Phase 1 — 环境搭建 (DAY 1-2) ✅ 100%

| 功能 | DAY | 完成度 | 说明 |
|------|-----|--------|------|
| pnpm workspace | 1 | ✅ | 7 个包 + 依赖管理 |
| F5 调试启动 | 1 | ✅ | 一键启动扩展 + WebView |
| TypeScript + ESLint | 1 | ✅ | 严格模式 + Prettier |
| ConfigManager | 2 | ✅ | 配置系统 + SecretStorage |
| WebView 热重载 | 2 | ✅ | Vite HMR + 双模式 |
| Chat UI 基础 | 2 | ✅ | 消息列表 + 输入框 + 主题适配 |
| Ping/Pong 通信 | 2 | ✅ | 双向 postMessage |

### Phase 2 — AI 集成 (DAY 3-4) ✅ 100%

| 功能 | DAY | 完成度 | 说明 |
|------|-----|--------|------|
| AI Gateway | 3 | ✅ | 统一网关 + 4 Provider 路由 |
| Anthropic Provider | 3 | ✅ | Claude API 流式输出 |
| OpenAI Provider | 3 | ✅ | GPT-4o/3.5 兼容 |
| Ollama Provider | 3 | ✅ | 本地 LLM 支持 |
| Gemini Provider | 3 | ✅ | Google API 支持 |
| 流式输出优化 | 3 | ✅ | rAF 缓冲 + 首 chunk 立即渲染 |
| Markdown 渲染 | 3 | ✅ | 完整 GFM 支持 + 主题适配 |
| 图片上传 | 3 | ✅ | 拖放 + Ctrl+V + 按钮 + 预览 |
| 代码高亮 | 4 | ✅ | highlight.js + 100+ 语言 |
| AI 图片渲染 | 4 | ✅ | 缩略图 + 轻量箱放大 |
| 历史持久化 | 4 | ✅ | localStorage 自动保存 |
| System Prompt | 4 | ✅ | Advanced Settings 面板 |
| 上下文管理 | 4 | ✅ | Token 预算 + 自动截断 |
| 多会话管理 | 4 | ✅ | Tab 切换 + 独立历史 |
| 对话导出 | 4 | ✅ | Markdown + JSON |
| 图片压缩 | 4 | ✅ | 5MB 限制 + 1024px 缩放 |
| .vsix 打包 | 4 | ✅ | 970.87 KB 可发布 |
| Smoke Tests | 4 | ✅ | 7/7 通过 |

---

## 🏗️ 架构总结

### 扩展结构

```typescript
// 扩展 (Extension) — CommonJS
ide/src/
  ├─ extension.ts           // 入口 + ConfigManager 初始化
  ├─ core/config.ts         // 配置管理 + API Key + Provider 设置
  ├─ chat/
  │  ├─ chatViewProvider.ts // WebView 容器 + postMessage
  │  └─ chatController.ts   // 消息构建 + 上下文管理 + 流式转发
  ├─ commands/index.ts      // 命令注册
  ├─ types/protocol.ts      // 消息协议定义
  └─ dist/extension.js      // 编译产物 (400 KB)

// AI 网关 (AI Gateway)
ai-gateway/src/
  ├─ gateway.ts             // 统一网关 + Provider 路由
  ├─ types.ts               // 多模态消息类型
  ├─ providers/
  │  ├─ anthropic.ts        // Anthropic 流式
  │  └─ openai.ts           // OpenAI 兼容 (Ollama/Gemini)
  └─ dist/                  // TypeScript 编译产物

// WebView (Web UI) — ES Module + React
ide/webview/src/
  ├─ main.tsx               // 入口
  ├─ App.tsx                // Chat 页面 + Settings 页面 (400 行)
  ├─ MarkdownRenderer.tsx   // Markdown 渲染 + 代码高亮 (200 行)
  └─ dist/
     ├─ main.js             // React App (1.2 MB, gzip: 412 KB)
     ├─ main.css            // 样式 (0.86 KB)
     └─ index.html          // 模板
```

### 通信协议 (postMessage)

```typescript
// Extension → WebView
type ExtToWebMsg =
  | { type: 'init'; payload: { theme: 'light'|'dark'; config?: {...} } }
  | { type: 'chat/stream'; payload: { id, delta } }
  | { type: 'chat/done'; payload: { id } }
  | { type: 'chat/error'; payload: { id, message } }
  | { type: 'settings/...'; payload: {...} }

// WebView → Extension  
type WebToExtMsg =
  | { type: 'ready' }
  | { type: 'chat/send'; payload: { text, images? } }
  | { type: 'settings/...'; payload: {...} }
```

### 数据流

```
User Input (WebView)
  ↓
formatMessage (图片压缩 5MB 限制)
  ↓
addToCurrentConversation (多会话隔离)
  ↓
trimMessages (4000 tokens 上下文预算)
  ↓
prependSystemPrompt (可配置 Prompt)
  ↓
AIGateway.chatStream()
  ↓
rAF 缓冲 (流式优化)
  ↓
MarkdownRenderer (高亮 + 图片渲染)
  ↓
localStorage (自动保存)
```

---

## 📦 交付物清单

| 物品 | 大小 | 位置 | 用途 |
|------|------|------|------|
| **.vsix** | 970.87 KB | `ide/` | VS Code 扩展包（可发布）|
| **extension.js** | ~400 KB | `ide/dist/` | 编译后扩展 |
| **main.js** | 1.2 MB | `ide/dist/webview/` | React 应用 |
| **main.css** | 0.86 KB | `ide/dist/webview/` | 样式 |

### 文档

- `docs/DAY1.md` — 环境搭建 (pnpm + F5 + Config)
- `docs/DAY2.md` — WebView + Chat UI (HMR + Ping/Pong)
- `docs/DAY3.md` — AI Gateway (4 Provider + 流式)
- `docs/DAY4.md` — 高级功能 (高亮 + 导出 + 多会话)
- `TASKS.md` — 本文 (总体进度)
- `docs/multi_ai_ide_spec.md` — 规格说明书
- `docs/multi_ai_ide_architecture.md` — 架构设计

---

## 🧪 测试结果 ✅ 100%

```bash
# 构建验证
✅ pnpm lint    — 0 errors (ESLint)
✅ pnpm build   — 所有 7 包编译成功
✅ pnpm test    — 7/7 Smoke Tests 通过

# Smoke Tests 详情
✓ package.json exists and is valid
✓ dist/extension.js exists and has size
✓ dist/webview/main.js exists and has size  
✓ dist/webview/main.css exists
✓ package.json has valid VS Code contributions
✓ .vsix package file exists
✓ .vscodeignore file exists and configured
```

---

## 🚀 Phase 3 计划 (DAY 5-8)

### 目标

完成 **Dev Agent** 系统，使 AI 具备代码修改和自动执行能力。

### 工作量估算

| DAY | 优先级 | 任务 | 时间 |
|-----|--------|------|------|
| 5 | P0 | Tool Registry + read/write file | 210 min |
| 5-6 | P0 | Dev Agent + Tool Use API | 150 min |
| 6 | P1 | Git 工具集 + exec_command | 150 min |
| 7 | P0 | Task Queue + 消息驱动 | 120 min |
| 7-8 | P1 | Agent Console + Live Monitor | 120 min |
| 8 | P2 | E2E 测试 + 文档 | 150 min |

**合计**: ~900 分钟 ≈ 4 天

### 关键组件

```typescript
// Tool Registry
class ToolRegistry {
  register(tool: Tool): void;
  call(name: string, args: any): Promise<any>;
  listTools(): Tool[];
}

// Dev Agent
class DevAgent {
  processMessage(userMessage: string): Promise<AgentResponse>;
  executeTool(toolName: string, args: any): Promise<any>;
}

// Task Queue
class TaskQueue {
  enqueue(task: AgentTask): void;
  process(): Promise<void>;
  getStatus(taskId: string): TaskStatus;
}
```

---

## 🔧 关键技术决策记录

### 架构选型

| 决策 | 方案 | 理由 | 权衡 |
|------|------|------|------|
| **IDE 基座** | VS Code 扩展 (Phase 1-4) | 快速迭代、开发体验好 | Phase 5+ 评估 fork Code-OSS |
| **AI 集成** | 官方 SDK + 自研 Adapter | 低耦合、不依赖 LangChain | 需要维护适配层 |
| **消息协议** | postMessage + 类型化 | WebView ↔ Extension 天然隔离 | 无法共享内存 |
| **状态管理** | localStorage (WebView) + globalState (Extension) | 简单可靠、自动持久化 | 不适合大数据 |

### 技术栈决策

| 层级 | 选择 | 替代方案 | 为什么选这个 |
|------|------|---------|------------|
| **构建** | esbuild + Vite | Webpack / Rollup | 速度快、配置简单 |
| **WebView** | React + Vite | Vue / Svelte | 生态大、组件库多 |
| **Markdown** | react-markdown + remark-gfm | MDX / marked | 轻量、完全可控渲染 |
| **代码高亮** | highlight.js | Prism / Shiki | 支持语言多、体积适中 |
| **包管理** | pnpm workspace | npm / yarn | 幽灵依赖少、速度快 |

### AI Provider 设计

| Provider | 实现库 | 理由 | 局限 |
|----------|--------|------|------|
| **Anthropic** | @anthropic-ai/sdk | 官方 SDK、功能完整 | 依赖最新版本 |
| **OpenAI** | openai SDK | 官方维护、API 成熟 | 仅支持 GPT 系列 |
| **Ollama** | OpenAI 兼容接口 | 复用 OpenAI Provider | 需要本地服务 |
| **Gemini** | googleapis 兼容 | 免费配额充足 | API 成熟度一般 |

**统一网关设计**：不同 Provider 转换为统一的 `ContentPart[]` 格式，Gateway 路由请求。好处是 Provider 可插拔，坏处是需要格式转换。

### 上下文管理策略

```typescript
// Token 预算实现
Token 估算: 1 token ≈ 4 个字符（粗略）
预算: 4000 tokens（可配置）
策略: 保留最新消息，舍弃早期消息

为什么用粗略估算？
❌ tokenizer 库体积大 (~500KB)
❌ 每次估算需要编码解码，性能开销
✅ 粗略估算够用，避免超限
✅ 可在设置中手动调整预算
```

### 流式输出优化

```typescript
// rAF 缓冲机制
chunk1 → 立即创建消息，isStreaming=true
chunk2 → buffer += delta, 请求 rAF
chunk3 → buffer += delta (同一帧复用 rAF)
rAF fire → 一次 setState 刷新 buffer
...
done → flush 剩余，isStreaming=false

优势：
✅ 避免每个 chunk 都 setState（高频更新）
✅ 60 FPS 流畅渲染
✅ 减少 React re-render 次数

为什么不用 `React 18 useTransition`？
❌ 不稳定，在 WebView 中表现不一致
✅ rAF 是原生浏览器 API，最可靠
```

### 多会话设计

```typescript
// localStorage 数据结构
{
  conversations: [
    {
      id: "uuid",
      title: "first user message (50 chars)",
      messages: [...],
      createdAt: timestamp
    },
    ...
  ],
  currentConvId: "uuid"
}

为什么不用 IndexedDB？
✅ localStorage 足够（消息数量限制为 100）
❌ IndexedDB 异步操作复杂，WebView 中兼容性问题

为什么用 first message 作为标题？
✅ 自动生成，用户不需要手动命名
✅ 通常第一句就能代表对话主题
❌ 不够精准时可手动编辑（未实现）
```

### 图片处理策略

```typescript
// 上传限制
- 单张: 5 MB 上限
- 尺寸: 大于 1024×1024px 自动缩放
- 格式: JPEG 85% 质量（平衡质量与大小）
- 编码: base64（兼容所有 Provider）

为什么 5 MB？
✅ 不超过 API 请求体限制（通常 10-50 MB）
✅ base64 后 ~33% 体积膨胀，5 MB → 6-7 MB 可接受
❌ 太小（1 MB）体验不好，太大（10 MB）转换慢

为什么 1024×1024px？
✅ 足够清晰用于代码截图
✅ 降低 API 处理成本
❌ 过小丢失细节，过大传输慢
```

### 开发体验优化

```typescript
// 双模式设计
生产模式 (默认 F5)
├─ 加载编译产物 (dist/)
└─ 扩展代码修改需重启

开发模式 (Extension (Dev with WebView HMR))
├─ WebView 连接 localhost:5173
├─ 文件改动 → HMR 自动刷新 (无需重启)
└─ 扩展代码改动 → 自动重编译 + 重载

为什么分两种模式？
✅ 开发快速迭代（HMR 无需重启）
✅ 生产验证真实构建产物
❌ 配置较复杂，需要两个调试配置

关键文件:
- .vscode/launch.json: 两个调试配置
- ide/scripts/build.mjs: watch 支持
- ide/webview/vite.config.ts: HMR 配置
```

### 长期技术战略 (Phase 3+)

#### 任务队列设计

```typescript
// MVP (Phase 2)
- 内存队列: 简单数组 + 状态机
- 优点: 快速验证，无依赖
- 局限: 进程重启丢失任务

// Phase 3
- 考虑 BullMQ + Redis
- 理由: 分布式任务，持久化，重试机制
- 权衡: 需要 Redis 依赖，部署复杂度增加
```

#### 向量检索策略

```typescript
// MVP (Phase 3-4)
- BM25 + MiniSearch
- 原理: 基于 TF-IDF 的全文搜索
- 场景: 本地代码检索，文件名/内容关键词匹配
- 优点: 轻量级，无外部依赖，速度快
- 局限: 不支持语义相似性

// Phase 4+ 长期规划
- 引入 Qdrant (向量数据库)
- 流程: 代码 → Embedding (OpenAI/Anthropic) → 向量化 → Qdrant 检索
- 场景: 语义搜索，上下文检索，RAG
- 优点: 支持模糊匹配，上下文理解
- 权衡: 需要 Embedding 费用，Qdrant 部署，数据同步复杂
```

#### Agent 协同架构

```typescript
// 设计原则: 消息驱动 + 共享黑板

// Phase 3: 单 Dev Agent
- 消息类型: 
  type AgentMessage = 
    | { type: 'task', payload: AgentTask }
    | { type: 'tool_call', payload: ToolCall }
    | { type: 'result', payload: any }
    
// Phase 4-5: 多 Agent 流转
Agent Flow:
  PM Agent (需求分析)
    ↓ 任务分解 →
  Lead Agent (架构设计)
    ↓ 技术方案 →
  Dev Agent (代码实现)
    ↓ 代码 →
  QA Agent (测试验证)
    ↓ 测试报告 →
  Review Agent (代码审查)
    ↓ 反馈 →
  [回到 Dev Agent]

// Blackboard (共享黑板)
- 数据结构: { task, requirements, design, code, tests, review }
- 读写: 各 Agent 读取 + 更新对应字段
- 同步: 消息驱动，Agent 完成→发布事件→其他 Agent 监听

为什么用 Blackboard？
✅ 解耦: Agent 之间不直接通信，通过黑板交互
✅ 可追溯: 完整的版本历史，支持回滚
✅ 扩展: 新增 Agent 只需监听相关事件
❌ 复杂: 需要事件同步、冲突解决机制
```

---

## 🎯 与竞品对标

### 现有能力 ✅

- ✅ 多 AI Provider (Anthropic/OpenAI/Ollama/Gemini)
- ✅ 流式聊天 + Markdown 渲染
- ✅ 图片上传 + 多模态
- ✅ 代码高亮 (100+ 语言)
- ✅ 对话导出 + 多会话
- ✅ System Prompt 自定义
- ✅ 上下文管理 (Token 预算)

### 缺失功能 ❌ (Phase 3)

- ❌ AI 代码修改
- ❌ 命令执行
- ❌ Dev Agent + Tool Use
- ❌ 任务自动化

---

## 📝 常用命令

```bash
# 开发工作流
pnpm install              # 安装依赖
pnpm build                # 编译所有包
pnpm watch                # 监听编译
pnpm lint                 # ESLint 检查
pnpm test                 # Smoke Tests

# IDE 专用
cd ide
pnpm build                # 编译扩展
pnpm package              # 打包 .vsix

# WebView 专用
cd ide/webview
pnpm dev                  # Vite dev server (HMR)
pnpm build                # 生产构建

# 调试
# F5 启动 → 选择 "Extension (Dev with WebView HMR)" → Vite 开发
```

---

## 📚 快速参考

### 关键文件

- [extension.ts](./ide/src/extension.ts) — 扩展入口
- [config.ts](./ide/src/core/config.ts) — 配置管理
- [chatViewProvider.ts](./ide/src/chat/chatViewProvider.ts) — WebView 容器
- [chatController.ts](./ide/src/chat/chatController.ts) — 消息控制
- [gateway.ts](./ai-gateway/src/gateway.ts) — AI 网关
- [App.tsx](./ide/webview/src/App.tsx) — Chat UI (400 行)
- [MarkdownRenderer.tsx](./ide/webview/src/MarkdownRenderer.tsx) — 渲染器

### 恢复上下文

```bash
# 新会话开始时
1. 读 TASKS.md (本文)
2. 读 DAY4.md (最新进展)
3. 读 docs/multi_ai_ide_spec.md (功能规格)
4. pnpm build 验证环境
```

---

**最后更新**: 2026-04-12 (DAY 4 完成)  
**下次检查点**: DAY 5 (Phase 3 开始)  
**预期完成**: 2026-04-18 (DAY 8)
