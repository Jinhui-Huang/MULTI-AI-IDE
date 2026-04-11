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

**所处阶段: Phase 1 — IDE 基础搭建（尚未开始编码）**

已完成:
- [x] 项目规格文档 (`multi_ai_ide_spec.md`)
- [x] 架构文档 (`multi_ai_ide_architecture.md`)
- [x] 目录骨架创建（`ide/`, `agent-core/`, `ai-gateway/`, `code-indexer/`, `vector-store/`）
- [x] `ide/` 下已有初始代码骨架（`extension.ts`, `chatViewProvider.ts`, `commands/index.ts`, `config.ts`, `logger.ts`, `protocol.ts`, `App.tsx` 等）
- [x] Git 仓库初始化并推送至 GitHub

未完成:
- [ ] pnpm workspace 初始化（根目录 `package.json` + `pnpm-workspace.yaml`）
- [ ] 验证 `ide/` 骨架代码能 F5 启动调试
- [ ] WebView 子项目（`ide/webview/`）能独立 `pnpm dev` 运行
- [ ] 双向消息通道 Ping/Pong 跑通

---

## Phase 1 任务清单（2 周目标）

### Week 1：环境与骨架

| 状态 | ID | 任务 | 备注 |
|------|----|----|------|
| ⬜ | 1.1 | 初始化 pnpm workspace | 根目录 `package.json` + `pnpm-workspace.yaml`，包含 `ide/`、`agent-core/`、`ai-gateway/`、`code-indexer/` |
| ⬜ | 1.2 | 验证扩展骨架可 F5 调试启动 | 命令面板出现 `AI: Open Chat` |
| ⬜ | 1.3 | TypeScript 严格模式 + ESLint + Prettier | `pnpm lint` 通过 |
| ⬜ | 1.4 | Logger 接入 OutputChannel | 日志输出到 VS Code Output 面板 |
| ⬜ | 1.5 | 配置系统读取 `aiAgent.*` 设置 | 可读取 apiKey、model、provider |
| ⬜ | 1.6 | WebView 子项目初始化（Vite + React） | `cd ide/webview && pnpm dev` 可跑 |
| ⬜ | 1.7 | WebviewViewProvider 注册到侧边栏 | 侧边栏出现 AI Agent 自定义面板 |

### Week 2：通信、打包与联调

| 状态 | ID | 任务 | 备注 |
|------|----|----|------|
| ⬜ | 2.1 | WebView 加载 Vite 构建产物 | 侧边栏渲染 React 页面，注意 CSP + nonce |
| ⬜ | 2.2 | 双向消息通道封装（postMessage + 类型） | Ping/Pong 往返跑通 |
| ⬜ | 2.3 | 基础 Chat UI（输入框 + 消息列表，纯 mock） | 输入回显 |
| ⬜ | 2.4 | 构建脚本（扩展 + webview 合并打包） | `pnpm build` 产出 `dist/` |
| ⬜ | 2.5 | vsce 打包 `.vsix` | 可在另一台 VS Code 安装 |
| ⬜ | 2.6 | 至少 1 个 e2e 冒烟测试（Playwright） | 打开 AI Chat 面板成功 |

### Phase 1 完成标准（DoD）

- [ ] `pnpm build` 产出可安装的 `.vsix`
- [ ] `F5` 一键启动调试
- [ ] 侧边栏显示 AI Agent 面板，含输入框与消息列表
- [ ] WebView ↔ Extension 双向通信 demo 跑通
- [ ] 配置项可在 VS Code 设置界面看到
- [ ] OutputChannel 有结构化日志
- [ ] 至少 1 个 e2e 冒烟测试

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
