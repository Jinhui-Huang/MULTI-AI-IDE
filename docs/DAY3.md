# 📅 DAY 3 — 2026-04-12

## 🎯 目标

完成 AI Gateway 集成、多 Provider 配置系统、流式输出优化、Markdown 渲染和多模态图片支持。

---

## ✅ 完成情况

### 任务 3.1：AI Gateway 多 Provider 集成
**状态：✅ 完成**

| 内容 | 详情 |
|------|------|
| AIGateway 类 | ✅ 统一网关，路由到不同 Provider |
| AnthropicProvider | ✅ 基于 `@anthropic-ai/sdk`，流式输出 |
| OpenAIProvider | ✅ 基于 `openai` SDK，兼容 OpenAI/Ollama/Gemini |
| ChatController | ✅ 消息历史管理、流式转发、取消支持 |
| Provider 注册表 | ✅ anthropic/openai/ollama/gemini 四个 Provider |
| 默认 BaseURL | ✅ ollama→localhost:11434, gemini→googleapis |

---

### 任务 3.2：多 Provider API Key 管理 + AI Settings 页面
**状态：✅ 完成**

| 内容 | 详情 |
|------|------|
| Per-Provider API Key 存储 | ✅ `aiAgent.apiKey.{providerId}` 独立存储到 SecretStorage |
| Provider 配置持久化 | ✅ 存入 VS Code globalState |
| 默认 Provider 预设 | ✅ Anthropic/OpenAI/Gemini/Ollama 四个内置，含预设模型列表 |
| Settings UI 页面 | ✅ WebView 内独立页面，Chat ↔ Settings 切换 |
| Online Provider 卡片 | ✅ 编辑 API Key / BaseURL / Models / Default Model |
| Local AI 卡片 | ✅ 配置 BaseURL + Model，无需 API Key |
| 添加自定义 Local AI | ✅ "+ Add Local" 表单 |
| 删除 Provider | ✅ 非活跃 Provider 可删除 |
| 激活 Provider | ✅ "Use This" 一键切换，高亮显示 |
| 模型选择下拉 | ✅ 活跃 Provider 直接切换模型 |
| Provider 连接测试 | ✅ 每个 Provider 独立 Test 按钮 |
| 旧 API Key 迁移 | ✅ `aiAgent.apiKey` → `aiAgent.apiKey.{provider}` 自动迁移 |
| 命令注册 | ✅ `AI: Open AI Settings` 命令 |

**Settings 页面结构**：
```
┌─────────────────────────────────┐
│ ← Back    AI Settings           │
├─────────────────────────────────┤
│ Online AI Providers             │
│ ┌─────────────────────────────┐ │
│ │ Anthropic (Claude)  [Active]│ │
│ │ API Key: Configured • 3     │ │
│ │ [Edit] [Test] [model ▾]    │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ OpenAI                      │ │
│ │ API Key: Not set • 4        │ │
│ │ [Edit] [Test] [Use This]   │ │
│ └─────────────────────────────┘ │
│                                 │
│ Local AI (Offline)  [+ Add]     │
│ ┌─────────────────────────────┐ │
│ │ Ollama (Local)              │ │
│ │ URL: localhost:11434 • 4    │ │
│ │ [Edit] [Test] [Use This]   │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

---

### 任务 3.3：流式输出优化
**状态：✅ 完成**

| 内容 | 详情 |
|------|------|
| rAF 缓冲机制 | ✅ `useRef` 累积 delta，`requestAnimationFrame` 批量刷新 |
| 首 chunk 立即渲染 | ✅ 第一个 delta 直接创建消息，后续 buffer |
| 流式光标 | ✅ 末尾闪烁竖线光标动画 |
| 弹跳加载动画 | ✅ 三个圆点弹跳效果替代旧的 blink |
| "Stop generating" | ✅ 输入框上方取消按钮 |
| textarea 多行输入 | ✅ 替代 input，支持 Shift+Enter 换行，自动增高 |

---

### 任务 3.4：Markdown 渲染
**状态：✅ 完成**

| 内容 | 详情 |
|------|------|
| react-markdown 集成 | ✅ `react-markdown` + `remark-gfm` |
| 标题 h1-h4 | ✅ 不同字号 + 分隔线 + 主题色 |
| 代码块 | ✅ 深色背景 + 语言标签 + Copy 按钮 + 等宽字体 |
| 行内代码 | ✅ 高亮背景 + 红/粉色文字 |
| 引用块 | ✅ 左侧彩色竖条 + 背景色 |
| 表格 | ✅ 条纹行 + 边框 + 横向滚动 |
| 链接 | ✅ 蓝色 + 新窗口打开 |
| 列表/粗体/斜体/删除线 | ✅ 完整 GFM 支持 |
| 深色/浅色主题 | ✅ 自适应配色 |
| memo 优化 | ✅ React.memo 避免无变化重渲染 |

---

### 任务 3.5：多模态图片支持
**状态：✅ 完成**

| 内容 | 详情 |
|------|------|
| ChatMessage 多模态类型 | ✅ `content: string \| ContentPart[]`，`ImageContent`/`TextContent` |
| Anthropic 图片格式 | ✅ `{ type: 'image', source: { type: 'base64', ... } }` |
| OpenAI 图片格式 | ✅ `{ type: 'image_url', image_url: { url: 'data:...' } }` |
| 协议扩展 | ✅ `ImageAttachment` 类型，`chat/send` payload 增加 `images` |
| 图片上传按钮 | ✅ SVG 图标按钮，点击打开文件选择器 |
| Ctrl+V 粘贴图片 | ✅ textarea onPaste 拦截剪贴板图片 |
| 拖放图片 | ✅ 输入区域 drag & drop |
| 发送前预览 | ✅ 缩略图 + x 删除按钮 |
| 消息气泡显示图片 | ✅ 用户消息中图片缩略图，点击放大 |
| 纯图片发送 | ✅ 无文本但有图片也可发送 |
| CSP 配置 | ✅ `img-src data: blob:` 允许 base64 图片 |

---

## 🔧 技术细节

### 消息协议（完整）
```typescript
// 扩展 → WebView
type ExtToWebMsg =
  | { type: 'init'; payload: { theme, config? } }
  | { type: 'pong' }
  | { type: 'chat/stream'; payload: { id, delta } }
  | { type: 'chat/done'; payload: { id } }
  | { type: 'chat/error'; payload: { id, message } }
  | { type: 'chat/clear' }
  | { type: 'settings/providers'; payload: AllProvidersConfig }
  | { type: 'settings/testResult'; payload: { providerId, success, message } }

// WebView → 扩展
type WebToExtMsg =
  | { type: 'ready' }
  | { type: 'ping' }
  | { type: 'chat/send'; payload: { text, images? } }
  | { type: 'chat/cancel'; payload: { id } }
  | { type: 'settings/open' }
  | { type: 'settings/getProviders' }
  | { type: 'settings/saveProvider'; payload: ProviderConfig }
  | { type: 'settings/deleteProvider'; payload: { id } }
  | { type: 'settings/setActive'; payload: { providerId, model } }
  | { type: 'settings/testProvider'; payload: { providerId } }
```

### 多模态消息格式
```typescript
// 纯文本
{ role: 'user', content: 'Hello' }

// 图片 + 文本
{ role: 'user', content: [
  { type: 'image', mediaType: 'image/png', data: '<base64>' },
  { type: 'text', text: 'What is this?' }
]}
```

### 流式输出优化原理
```
chunk1 → 立即创建 assistant 消息（isStreamingRef=true）
chunk2 → buffer += delta, 请求 rAF
chunk3 → buffer += delta（同一帧内，复用 rAF）
rAF fire → flush buffer 到 React state（一次 setState）
chunk4 → buffer += delta, 请求下一个 rAF
...
done → flush 剩余 buffer, isStreamingRef=false
```

---

## 📊 构建验证结果

```bash
✅ pnpm build   — 成功
   ├─ ai-gateway build (tsc)
   ├─ ide build (esbuild)
   ├─ ide/webview build (Vite)
   └─ 7 个 TypeScript 包编译

产物：
  ├─ ide/dist/extension.js
  ├─ ide/dist/webview/main.js    (324 KB, gzip: 99.6 KB)
  └─ ide/dist/webview/index.html (0.29 KB)

新增依赖：
  ├─ @anthropic-ai/sdk ^0.88.0
  ├─ openai ^6.34.0
  ├─ react-markdown ^10.1.0
  └─ remark-gfm ^4.0.1
```

---

## 📝 修改文件清单

### AI Gateway（6 个文件）
- `ai-gateway/package.json` — 添加 SDK 依赖
- `ai-gateway/src/index.ts` — 导出 Gateway + 类型
- `ai-gateway/src/types.ts` — **新增** 多模态 ContentPart 类型
- `ai-gateway/src/gateway.ts` — **新增** AIGateway 统一网关类
- `ai-gateway/src/providers/anthropic.ts` — **新增** Anthropic 流式 Provider
- `ai-gateway/src/providers/openai.ts` — **新增** OpenAI 兼容 Provider

### IDE Extension（6 个文件）
- `ide/package.json` — 新增命令 + Provider enum
- `ide/src/extension.ts` — 添加旧 key 迁移
- `ide/src/core/config.ts` — **重写** per-provider key + provider 配置管理
- `ide/src/chat/chatViewProvider.ts` — Settings 消息处理 + 图片透传 + CSP
- `ide/src/chat/chatController.ts` — **新增** 多模态消息构建
- `ide/src/commands/index.ts` — 新增 openSettings 命令
- `ide/src/types/protocol.ts` — Settings/Image 消息类型

### WebView UI（3 个文件）
- `ide/webview/package.json` — 添加 markdown 依赖
- `ide/webview/src/App.tsx` — Settings 页面 + 图片上传 + 流式优化
- `ide/webview/src/MarkdownRenderer.tsx` — **新增** Markdown 渲染组件

**总计：16 个文件修改/新增，~2000 行代码**

---

## 🚧 DAY 3 未完成 / 待开发功能

以下功能已有基础但尚未实施，留待下次会话继续：

| 优先级 | 功能 | 说明 |
|--------|------|------|
| **P0** | 代码语法高亮 | 当前代码块仅有背景色区分，需集成 highlight.js 或 Prism.js 实现语言级语法着色 |
| **P0** | AI 回复中的图片渲染 | 部分模型会在回复中返回图片（如 DALL-E），需在 assistant 消息中渲染图片 |
| **P1** | 对话历史持久化 | 当前消息历史仅在内存中，关闭 WebView 即丢失，需持久化到 globalState 或文件 |
| **P1** | 多轮对话上下文管理 | 长对话需要 token 截断策略，避免超出模型上下文窗口 |
| **P1** | System Prompt 配置 | Settings 中应支持自定义 System Prompt |
| **P2** | 导出对话 | 支持导出为 Markdown / JSON |
| **P2** | vsce 打包 .vsix | 打包分发验证 |
| **P2** | E2E 冒烟测试 | Playwright 自动化测试 |
| **P2** | 图片压缩/限制 | 大图片需要压缩或限制尺寸，避免 base64 过大导致请求失败 |
| **P3** | 多会话管理 | 支持多个独立对话 tab |
| **P3** | 搜索历史消息 | 对话内搜索 |

---

## 🔗 关键代码位置

- AI 网关入口：[ai-gateway/src/gateway.ts](../ai-gateway/src/gateway.ts)
- 多模态类型：[ai-gateway/src/types.ts](../ai-gateway/src/types.ts)
- Anthropic Provider：[ai-gateway/src/providers/anthropic.ts](../ai-gateway/src/providers/anthropic.ts)
- OpenAI Provider：[ai-gateway/src/providers/openai.ts](../ai-gateway/src/providers/openai.ts)
- 配置管理：[ide/src/core/config.ts](../ide/src/core/config.ts)
- Chat 控制器：[ide/src/chat/chatController.ts](../ide/src/chat/chatController.ts)
- WebView 容器：[ide/src/chat/chatViewProvider.ts](../ide/src/chat/chatViewProvider.ts)
- 消息协议：[ide/src/types/protocol.ts](../ide/src/types/protocol.ts)
- Chat + Settings UI：[ide/webview/src/App.tsx](../ide/webview/src/App.tsx)
- Markdown 渲染：[ide/webview/src/MarkdownRenderer.tsx](../ide/webview/src/MarkdownRenderer.tsx)

---

**生成时间**：2026-04-12
**下次检查点**：DAY 4（语法高亮 + 持久化 + System Prompt）
