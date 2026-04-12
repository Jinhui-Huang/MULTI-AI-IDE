# DAY 6: 完整重构代码编辑功能 - Unified Diff + 预览 UI + 多 LLM 支持

## 📋 概述

完成了从 ACTION/PATH/CONTENT 私有格式向 Unified Diff 标准格式的彻底迁移，实现了：
- 标准化 Unified Diff 格式支持
- 实时代码 diff 预览 UI（Apply/Reject 按钮）
- 多 LLM 智能适配（Claude/GPT/OpenSource 各有专定提示词）
- 代码上下文自动收集 + token 预算管理
- 灵活的 diff 应用策略（fuzzy 匹配 + 行号搜索）

**Commit**: `332f2bc` feat(DAY6): 完整重构代码编辑功能

---

## ✨ 新建文件模块

### 1. `ide/src/codeEdit/` 目录（6 个核心文件）

#### 📄 `contextCollector.ts`
**职责**: 智能收集代码上下文（当前文件 + 相关文件），带 token 预算
- 最大 token 数: 12000（为 system prompt + diff 预留 4000）
- 最多收集相关文件数: 5
- Token 估算公式: `chars / 3.5 ≈ tokens`
- 优先级: 当前文件完整 → 相同目录 .ts 文件 → 其他文件

**核心方法**:
```typescript
async collect(currentFilePath: string): Promise<CollectedContext>
// 返回: { currentFile, relatedFiles, totalTokens, tokenBudget }
```

#### 📄 `promptBuilder.ts`
**职责**: 为不同 LLM 生成最优化的 diff 格式提示词
- 支持 3 种 LLM 类型: Claude, GPT (OpenAI), OpenSource
- 自动检测 LLM 类型（通过 provider 字符串匹配）
- System Prompt: 统一的 Unified Diff 格式要求
- User Prompt: 代码上下文 + 用户请求

**核心方法**:
```typescript
static detectType(provider: string): LLMType
static buildSystemPrompt(llmType: LLMType): string
static buildUserPrompt(context: CollectedContext, userText: string): string
```

#### 📄 `diffParser.ts`
**职责**: 解析 LLM 返回的 Unified Diff 格式
- 支持 markdown 代码块（```diff ... ```）和裸 diff
- 解析文件头（--- a/ +++ b/）
- 解析 hunk 头（@@ -oldStart,oldCount +newStart,newCount @@）
- 解析行类型（context, add, remove）

**核心方法**:
```typescript
static parse(llmResponse: string): DiffParseResult
// 返回: { success, diffs: ParsedDiff[], error? }
// ParsedDiff: { filePath, hunks, addedLines, removedLines }
```

#### 📄 `diffApplier.ts`
**职责**: 将 Unified Diff patch 应用到文件
- 从后往前应用 hunk（避免行号偏移）
- **关键改进**: 灵活的上下文匹配
  - 使用 `trim()` 比较（忽略尾部空格）
  - 失败时搜索 ±50 行范围内的匹配
  - 优先保留原文件行以保持格式
  - 优雅的 EOF 处理

**核心方法**:
```typescript
async apply(diff: CodeDiff): Promise<ApplyDiffResult>
// 返回: { success, filePath, originalContent, newContent, appliedHunks?, error? }

private applyHunk(content: string, hunk: DiffHunk): string
// 处理单个 hunk，支持灵活上下文匹配
```

#### 📄 `codeEditAgent.ts`
**职责**: 核心业务逻辑编排，整合所有模块
- 代码修改请求检测（34 个关键词，中英文）
- 调用 LLM 获取响应（通过 ChatController）
- 解析 diff 并返回待用户确认
- 应用 diff 到文件（刷新编辑器）

**关键特性**:
- `isCodeEditRequest(text)`: 关键词检测
- `analyze(req)`: 分析 → 收集上下文 → 调用 LLM → 解析 diff
- `applyDiffs(diffs)`: 应用 diff 到文件

**代码修改关键词** (34 个):
```
英文: add, modify, fix, refactor, rename, delete, remove, implement, update, change,
      improve, optimize, replace, rewrite, convert, transform, move, copy
中文: 添加, 修改, 修复, 重构, 重命名, 删除, 移除, 实现, 更新, 改变,
      改, 优化, 替换, 重写, 转换, 移动, 复制, 给, 帮我, 加个, 改成, 写个, 生成
```

#### 📄 `index.ts`
**职责**: 统一导出接口
```typescript
export { ContextCollector, type CollectedContext } from './contextCollector';
export { CodeEditPromptBuilder, type LLMType } from './promptBuilder';
export { DiffParser, type DiffParseResult } from './diffParser';
export { DiffApplier, type ApplyDiffResult } from './diffApplier';
export { CodeEditAgent, type CodeEditRequest, type CodeEditResult, type ApplyResult } from './codeEditAgent';
```

---

## 🔗 修改的文件

### 1. `ide/src/types/protocol.ts`
**新增类型定义**:
```typescript
// Diff 相关类型
type DiffLineType = 'context' | 'add' | 'remove';

interface DiffLine {
  type: DiffLineType;
  content: string;
}

interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

interface CodeDiff {
  filePath: string;
  hunks: DiffHunk[];
  addedLines: number;
  removedLines: number;
}

// Extension → WebView 消息
type ExtToWebMsg = 
  | { type: 'code/diffPreview'; payload: { messageId: string; diffs: CodeDiff[] } }
  | { type: 'code/applyResult'; payload: { success: boolean; appliedFiles?: string[]; error?: string } }
  | { type: 'current_file_changed'; payload: { filePath: string | null; fileName: string | null; exists: boolean } }
  | ...

// WebView → Extension 消息
type WebToExtMsg =
  | { type: 'code/applyDiffs'; payload: { messageId: string } }
  | { type: 'code/rejectDiffs'; payload: { messageId: string } }
  | ...
```

### 2. `ide/src/chat/chatViewProvider.ts`
**主要修改**:
- ✅ 导入 `CodeEditAgent`（替代 AgentCore）
- ✅ 初始化 `codeEditAgent` 在构造函数
- ✅ 新增 `pendingDiffs` 状态管理
- ✅ 修改 `handleChatSend()` 实现代码请求检测和路由
- ✅ 新增 `handleApplyDiffs()` 和 `handleRejectDiffs()` 消息处理器
- ✅ 流式消息显示进度步骤

**流程**:
```
user text
  ↓ isCodeEditRequest?
  ├─ 是 → CodeEditAgent.analyze() → code/diffPreview
  └─ 否 → ChatController.sendMessage() (普通聊天)
```

### 3. `ide/webview/src/App.tsx`
**新增内容**:
- ✅ 新增 `DiffPreview` React 组件
- ✅ 处理 `code/diffPreview` 消息
- ✅ 处理 `code/applyResult` 消息
- ✅ Apply/Reject 按钮调用

**DiffPreview 组件特性**:
- 文件列表展开/折叠
- 逐行显示 diff（context/add/remove 颜色区分）
- Hunk 头显示行号信息
- Apply 和 Reject 按钮

---

## 🎯 关键流程

### 完整的代码编辑流程

```
1️⃣ 用户在聊天输入代码修改请求
   ↓ chat/send 消息

2️⃣ chatViewProvider.handleChatSend()
   ├─ isCodeEditRequest() 检测
   ├─ 如果是代码请求 → 进入代码编辑流程
   └─ 如果不是 → 进入普通聊天流程

3️⃣ CodeEditAgent.analyze()
   ├─ 📂 ContextCollector.collect()
   │  └─ 读取当前文件 + 相关文件，按 token 限制裁剪
   │
   ├─ 🔨 CodeEditPromptBuilder
   │  ├─ detectType(provider) → LLMType
   │  ├─ buildSystemPrompt() → diff 格式规范
   │  └─ buildUserPrompt() → 代码上下文 + 用户请求
   │
   ├─ 🤖 ChatController.sendMessage()
   │  └─ LLM 流式调用，返回完整响应
   │
   ├─ 📋 DiffParser.parse()
   │  └─ 解析 Unified Diff 格式
   │
   └─ 返回 { success, diffs }

4️⃣ code/diffPreview → WebView
   ├─ DiffPreview 组件展示所有修改
   ├─ 文件 + 行数统计
   └─ Apply/Reject 按钮

5️⃣ 用户确认 (Apply or Reject)
   
   如果 Apply:
   ├─ code/applyDiffs → Extension
   ├─ CodeEditAgent.applyDiffs()
   │  └─ DiffApplier.apply() (for each diff)
   ├─ 写入文件 + 刷新编辑器
   └─ code/applyResult → WebView (成功提示)
   
   如果 Reject:
   ├─ code/rejectDiffs → Extension
   ├─ 清除 pendingDiffs
   └─ code/applyResult → WebView (取消提示)
```

---

## 🎬 测试方法

### 前置条件
1. `npm run build` 成功（✓ 已验证）
2. VSCode 中按 F5 启动调试

### 测试步骤

#### 场景 1: 成功的代码修改请求
1. 打开任意 `.ts` 文件（如 `ide/src/extension.ts`）
2. 在聊天框输入: `Add a method to get file stats from this file`
3. 预期:
   - ✓ 聊天面板显示进度步骤
   - ✓ 生成 Diff 预览（绿/红行区分）
   - ✓ Apply 和 Reject 按钮可点击
4. 点击 Apply
   - ✓ 文件被修改
   - ✓ 编辑器自动打开并显示修改
   - ✓ 聊天显示成功提示

#### 场景 2: 拒绝修改
1. 同上，生成 Diff 预览
2. 点击 Reject
   - ✓ Diff 预览关闭
   - ✓ 聊天显示取消提示
   - ✓ 文件保持原状

#### 场景 3: 普通聊天（不是代码请求）
1. 输入: `What is TypeScript?`
2. 预期:
   - ✓ 进入普通聊天路径（无 Diff 预览）
   - ✓ LLM 返回文本答案

#### 场景 4: 无当前文件
1. 关闭编辑器（无当前文件）
2. 输入: `Add a new method to this file`
3. 预期:
   - ✓ 进入普通聊天路径
   - ✓ 提示"无当前文件"

---

## 📊 与原系统的对比

| 维度 | 旧系统 | 新系统 |
|------|--------|--------|
| **格式** | ACTION/PATH/CONTENT (私有) | Unified Diff (标准) |
| **预览** | ❌ 无 | ✅ DiffPreview UI |
| **确认** | 自动应用 | ✅ Apply/Reject 按钮 |
| **上下文** | 简单 (1 文件) | ✅ 智能 (多文件) |
| **Token 限制** | ❌ 无 | ✅ 12000 token 预算 |
| **行匹配** | 严格 (exact) | ✅ 灵活 (fuzzy + 搜索) |
| **LLM 适配** | 单一 | ✅ Claude/GPT/OpenSource |
| **路径处理** | 有问题 | ✅ 标准化处理 |
| **错误处理** | 基础 | ✅ 详细日志 + 回滚 |

---

## 🔧 技术细节

### Token 预算管理
```
总预算: 16000 tokens
├─ System Prompt: ~800 tokens (固定)
├─ 代码上下文: 最多 12000 tokens
│  ├─ 当前文件: 优先级最高 (完整保留)
│  └─ 相关文件: 按大小顺序添加，超出则截断
└─ LLM 响应 + Diff: 预留 ~3200 tokens
```

### 灵活的 Diff 应用策略
1. **精确匹配**: 优先尝试原始行号位置
2. **模糊匹配**: 首个 context 行 trim() 比较
3. **范围搜索**: 在 ±50 行范围内查找匹配
4. **回退策略**: 找不到时使用原始 diff 行（保持格式）
5. **边界处理**: EOF 超出时自动调整 deleteCount

### 完整的错误处理
- ❌ LLM 调用失败 → 返回错误信息
- ❌ Diff 解析失败 → 显示 raw response
- ❌ 文件应用失败 → 回滚到原文件
- ❌ 文件读取失败 → 新建文件

---

## 📝 日志记录

系统使用详细日志记录，便于调试：

```
[ANALYZE]    分析流程相关
[CODE-EDIT]  diff 应用相关
[LLM]        LLM 调用相关
```

示例:
```
[ANALYZE] Starting analysis
[ANALYZE] Request: "Add a method getUserById..."
[ANALYZE] isCodeRequest: true
[ANALYZE] 📂 Collecting context...
[ANALYZE]    ✓ Collected 8432/12000 tokens
🤖 Calling LLM...
[CODE-EDIT] ✅ Generated 1 diffs
```

---

## ✅ 验证清单

- [x] npm run build 成功
- [x] 所有模块正确导入
- [x] 类型定义完整（protocol.ts）
- [x] chatViewProvider 正确集成 CodeEditAgent
- [x] devAgentPanel 正确集成 CodeEditAgent
- [x] WebView DiffPreview 组件完整
- [x] 消息处理完整 (code/diffPreview, code/applyResult)
- [x] 代码注释清晰
- [x] Git commit 完成
- [ ] VSCode F5 调试测试（下一步）
- [ ] 实际代码修改测试（下一步）

---

## 🚀 下一步

1. 启动 VSCode 调试 (F5)
2. 打开测试文件
3. 输入代码修改请求
4. 验证 Diff 预览显示
5. 点击 Apply 确认修改生效
6. 记录任何问题并调整

---

## 📚 相关文件

- 新建: `ide/src/codeEdit/` (6 个文件)
- 修改: `ide/src/chat/chatViewProvider.ts`
- 修改: `ide/src/types/protocol.ts`
- 修改: `ide/webview/src/App.tsx`
- 删除: 7 个旧系统文件 (agentCore, llmPromptBuilder 等)
- 测试: `test-diff-flow.js`

---

## 💡 关键设计决策

1. **使用 ChatController**: 复用流式/历史/token 裁剪逻辑
2. **不复用 AgentCore**: 完全替换为 CodeEditAgent
3. **Unified Diff 标准**: 便于与其他工具集成
4. **用户确认机制**: Apply/Reject 保证安全性
5. **多 LLM 支持**: 通过提示词优化适配不同模型
6. **灵活上下文匹配**: 解决实际应用中的行号偏移问题

---

**完成日期**: 2026-04-13  
**工作时间**: DAY 6 (重构)  
**状态**: ✅ 完成，待 VSCode 集成测试
