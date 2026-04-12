AI IDE 代码修改系统重构需求
1. 重构目标

当前系统使用 diff / patch merge 来修改代码，但该方式存在稳定性问题：

AI 生成的 diff 行号不准确
patch merge 容易错位
文件变化后 patch 无法应用
merge 失败率较高

本次重构目标：

实现一个 基于 SEARCH / REPLACE 的代码修改系统，提高代码修改稳定性。

2. 当前问题

当前代码修改流程：

User Request
↓
AI Generate Diff
↓
Patch Parser
↓
Merge Patch
↓
Write File

问题：

diff 行号错误
patch context mismatch
merge 错误位置

需要改为：

User Request
↓
Context Builder
↓
AI Generate SEARCH/REPLACE
↓
Patch Parser
↓
Replace Code Block
↓
Write File
3. 新代码修改协议

AI 必须使用 SEARCH / REPLACE block。

格式：

<<<<<<< SEARCH
<original code>
=======
<modified code>
>>>>>>> REPLACE

示例：

<<<<<<< SEARCH
function getUser() {
    return user;
}
=======
function getUserById(id) {
    return user;
}
>>>>>>> REPLACE

规则：

SEARCH block 必须包含完整原始代码
REPLACE block 为修改后的代码
不允许返回 diff
不允许返回完整文件
4. Patch Parser 要求

系统需要解析 AI 返回的 block。

示例解析流程：

Find SEARCH block
↓
Extract original code
↓
Extract replacement code
↓
Locate original code in file
↓
Replace with new code

如果未找到 SEARCH 内容：

不执行修改
返回错误信息
5. Replace 逻辑

Replace 必须满足：

精确匹配 SEARCH 内容
如果多个匹配，选择最接近上下文位置
替换后保持文件格式

示例：

fileContent.replace(searchBlock, replaceBlock)
6. 多修改支持

AI 可以返回多个 block：

<<<<<<< SEARCH
code1
=======
code1_modified
>>>>>>> REPLACE

<<<<<<< SEARCH
code2
=======
code2_modified
>>>>>>> REPLACE

系统必须：

按顺序执行
每次修改后更新文件内容
7. 错误处理

需要处理：

SEARCH 不存在
SEARCH block not found in file

解决：

不修改文件
提示 AI 重新生成
部分修改成功

系统应：

记录成功修改
返回失败位置
8. Prompt 修改

系统必须更新 AI Prompt：

You must return code modifications using SEARCH/REPLACE blocks.

Do not return unified diff.

Do not return the full file.

Only return the minimal code blocks that need modification.
9. UI 行为

当 AI 返回修改时：

IDE 应：

显示修改 diff
允许用户确认
应用修改
刷新编辑器
10. 安全规则

系统必须限制：

最大修改 block 数量
最大修改字符数
只允许修改当前项目文件
11. 兼容性要求

此次重构必须：

保留现有聊天功能
不影响普通对话
只替换代码修改系统
12. 成功标准

当用户输入：

Add a method getUserById to UserService

系统应：

AI 返回 SEARCH/REPLACE block
系统解析 block
替换代码
文件成功修改
13. 扩展能力（未来）

未来可扩展：

AST patch
语义 merge
自动冲突修复
多文件修改

当前阶段不需要实现。

14. 开发任务

AI 需要：

实现 SEARCH/REPLACE parser
替换 diff parser
修改 AI prompt
实现 replace engine
支持多 block patch
添加错误处理
15. 实现优先级

优先级顺序：

1 SEARCH/REPLACE parser
2 Replace engine
3 Prompt 修改
4 UI preview
5 错误处理
16. 最终系统流程
User Input
↓
Collect Code Context
↓
AI Generate SEARCH/REPLACE
↓
Parse Blocks
↓
Replace Code
↓
Save File
↓
Refresh Editor
17. 重构目标结果

重构后系统应：

减少 merge 错位
提高代码修改成功率
提高 AI 修改稳定性

目标成功率：

> 90% code modification success