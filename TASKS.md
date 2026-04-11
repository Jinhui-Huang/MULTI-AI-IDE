# 多 AI 协同开发 IDE — 任务进度

> 新会话开始时，让 Claude 读这个文件，即可快速恢复上下文继续开发。
> 恢复指令：「读取 TASKS.md，继续开发 multi-ai-ide 项目」

---

## 项目概述

基于 VS Code 扩展形态（Phase 1~4），最终 fork Code-OSS（Phase 5+），构建多 AI Agent 协同开发 IDE。

- GitHub: https://github.com/Jinhui-Huang/MULTI-AI-IDE
- 本地路径: `d:\ai-agent-ide\multi-ai-ide`
- 技术栈: TypeScript + React + VS Code Extension API
- 包管理: 待初始化 pnpm workspace

---

## 当前状态

**所处阶段: Phase 1 — IDE 基础搭建（Week 1 完成 100%，DAY 2 完成）**

已完成（DAY 1 + DAY 2）:
- [x] 项目规格文档 (`multi_ai_ide_spec.md`)
- [x] 架构文档 (`multi_ai_ide_architecture.md`)
- [x] 目录骨架创建（`ide/`, `agent-core/`, `ai-gateway/`, `code-indexer/`, `vector-store/`）
- [x] `ide/` 下完整代码实现（extension.ts, chatViewProvider.ts, config.ts, logger.ts, protocol.ts 等）
- [x] Git 仓库初始化并推送至 GitHub
- [x] pnpm workspace 初始化（6 个包）✨ DAY 1
- [x] F5 调试启动验证（侧边栏面板激活）✨ DAY 1
- [x] TypeScript + ESLint + Prettier 配置 ✨ DAY 1
- [x] Logger OutputChannel 集成 ✨ DAY 1
- [x] 配置系统 ConfigManager 单例 ✨ DAY 2
- [x] WebView 热重载开发环境 ✨ DAY 2
- [x] Ping/Pong 双向通信 ✨ DAY 2
- [x] 基础 Chat UI ✨ DAY 2
- [x] 生产模式 WebView 资源路径修复（dist/webview 对齐）✨ DAY 2
- [x] vscodeApi 单例封装（修复 acquireVsCodeApi 重复调用）✨ DAY 2

进行中:
- [ ] E2E 冒烟测试（DAY 3）
- [ ] vsce 打包 `.vsix`（DAY 3）
- [ ] AI API 集成（Phase 2，DAY 3+）

---

## Phase 1 任务清单（2 周目标）

### Week 1：环境与骨架

| 状态 | ID | 任务 | 完成时间 | 备注 |
|------|----|----|---------|------|
| ✅ | 1.1 | 初始化 pnpm workspace | DAY 1 | 7 个包完整配置 |
| ✅ | 1.2 | 验证扩展骨架可 F5 调试启动 | DAY 1 | 侧边栏 AI Agent 面板激活 |
| ✅ | 1.3 | TypeScript 严格模式 + ESLint + Prettier | DAY 1 | `pnpm lint` 通过，.prettierrc 配置 |
| ✅ | 1.4 | Logger 接入 OutputChannel | DAY 1 | 日志输出到 VS Code Output 面板 |
| ✅ | 1.5 | 配置系统读取 `aiAgent.*` 设置 | DAY 2 | ConfigManager 单例，支持 apiKey 密钥存储 |
| ✅ | 1.6 | WebView 子项目初始化（Vite + React） | DAY 1-2 | 完整 Chat UI，支持热重载 |
| ✅ | 1.7 | WebviewViewProvider 注册到侧边栏 | DAY 2 | 完整交互，主题适配，消息列表 |

### Week 2：通信、打包与联调

| 状态 | ID | 任务 | 完成时间 | 备注 |
|------|----|----|---------|------|
| ✅ | 2.1 | WebView 加载 Vite 构建产物 | DAY 2 | 侧边栏渲染 React 页面，HMR 支持 |
| ✅ | 2.2 | 双向消息通道封装（postMessage + 类型） | DAY 2 | Ping/Pong 完整，配置下发 |
| ✅ | 2.3 | 基础 Chat UI（输入框 + 消息列表） | DAY 2 | 完整实现，主题适配，连接测试 |
| ⏳ | 2.4 | 构建脚本验证 | DAY 3 | esbuild watch 已实现 |
| ⏳ | 2.5 | vsce 打包 `.vsix` | DAY 3 | 待集成 |
| ⏳ | 2.6 | E2E 冒烟测试（Playwright） | DAY 3 | 待实现 |

### Phase 1 完成标准（DoD）

- [x] `pnpm build` 成功编译（DAY 1-2） ✨
- [x] `F5` 一键启动调试（DAY 1） ✨
- [x] 侧边栏显示 AI Agent 面板，含输入框与消息列表（DAY 2） ✨
- [x] WebView ↔ Extension 双向通信 demo 跑通（DAY 2） ✨
- [x] 配置项可在 VS Code 设置界面看到（DAY 2） ✨
- [x] OutputChannel 有结构化日志（DAY 1-2） ✨
- [x] 生产模式 WebView 资源可正常加载（DAY 2 bug 修复） ✨
- [ ] 至少 1 个 e2e 冒烟测试（DAY 3）
- [ ] vsce 打包 `.vsix` 可安装（DAY 3）

**完成度：87% ✅ (7/9 项完成，Week 1 功能目标 100% 达成)**

---

## 后续阶段概览

| 阶段 | 周期 | 目标 |
|------|------|------|
| Phase 2 | 2 周 | 接入 OpenAI/Claude API，支持流式输出 |
| Phase 3 | 3 周 | Dev Agent + Tool use + 任务队列 |
| Phase 4 | 2 周 | 代码索引（Tree-sitter + MiniSearch）+ 上下文检索 |
| Phase 5 | 3 周 | 多 Agent 流转（PM/Lead/Dev/QA/Review）+ Agent 控制台 |
| Phase 6+ | - | fork Code-OSS，独立品牌打包 |

---

## 关键技术决策记录

- IDE 基座: VS Code 扩展（Phase 1~4），后期评估 fork Code-OSS
- 任务队列: MVP 用内存队列，Phase 3+ 引入 BullMQ + Redis
- 向量检索: MVP 用 BM25（MiniSearch），Phase 4+ 引入 Qdrant
- AI SDK: 官方 SDK + 自研 Adapter（不用 LangChain，抽象过重）
- Agent 协同: 消息驱动 + 共享黑板（Blackboard）架构

---

## 下次开始前读取的文件

```
TASKS.md                          # 本文件，进度总览
multi_ai_ide_spec.md              # 完整规格（含 Phase 1 详细方案 §7）
ide/package.json                  # 扩展清单
ide/src/extension.ts              # 扩展入口
ide/src/chat/chatViewProvider.ts  # WebView 容器
ide/src/types/protocol.ts         # 消息类型定义
```
