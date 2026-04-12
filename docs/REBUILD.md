AI IDE 聊天系统代码读取与修改能力重构需求

1\. 目标



当前 IDE 的聊天系统只能进行文本对话，AI 无法访问项目代码，也无法对代码进行自动修改。



本次重构目标：



实现 AI 能够读取当前 IDE 打开的项目代码，并生成代码修改方案，由 IDE 自动应用修改。



系统应支持：



AI 读取当前文件代码

AI 根据用户请求生成代码修改

AI 以 diff 格式返回修改

IDE 自动解析并应用代码修改

2\. 当前问题



当前系统存在以下问题：



聊天框只发送用户文本到 LLM

LLM 没有项目代码上下文

LLM 无法理解用户请求涉及的代码

IDE 无法自动应用代码修改



当前系统流程：



User Input

↓

Chat UI

↓

LLM

↓

Text Response



目标流程：



User Input

↓

Code Context Collection

↓

Prompt Construction

↓

LLM

↓

Diff Response

↓

Patch Apply

↓

Editor Update

3\. 新功能要求



系统需要支持以下能力：



3.1 代码上下文读取



当用户在聊天框输入请求时，系统必须收集代码上下文。



优先级：



当前编辑器打开的文件

当前文件引用的代码

同一模块相关文件



这些代码应作为 context 发送给 AI。



3.2 Prompt 构造



系统需要构造 AI Prompt，使 AI 能理解项目代码。



Prompt 结构应包含：



用户请求

项目代码上下文

修改要求



示例：



You are a professional software engineer.



The following code is from the user's project.



<code context>



User request:

<user request>



Return the modification in unified diff format.

4\. AI 返回格式



AI 必须返回 unified diff 格式。



示例：



\--- a/UserService.ts

+++ b/UserService.ts

@@

\- function getUser() {

\+ function getUserById(id) {



禁止返回完整文件代码。



如果 AI 返回完整代码，需要转换为 diff。



5\. 代码修改流程



当 AI 返回 diff 时，系统需要：



Receive AI response

↓

Parse diff

↓

Locate affected file

↓

Apply patch

↓

Save file

↓

Refresh editor



IDE 应支持 自动应用或用户确认应用。



6\. 上下文限制



为了避免 prompt 过大，需要限制：



最大文件数量

最大代码长度

最大 token 数量



系统应优先保留：



当前文件

最相关文件

7\. AI 模型支持



系统应支持调用本地模型 API。



例如：



http://localhost:11434/api/v1



模型可能包括：



Qwen coder

Code LLM

其他本地模型



系统应允许配置模型名称。



8\. 错误处理



系统需要处理以下情况：



AI返回：



非 diff 内容

格式错误

修改不存在文件



IDE 应给出提示，而不是直接崩溃。



9\. UI 行为



当 AI 生成代码修改时：



IDE 应：



显示修改 diff

允许用户确认

应用代码修改

更新编辑器内容

10\. 兼容性要求



本次修改必须：



不破坏现有聊天功能

不影响普通文本对话

保持系统稳定

11\. 成功标准



当用户输入：



Add a method getUserById to UserService



系统应：



读取相关代码

发送给 AI

AI 返回 diff

IDE 应用修改



最终代码应被成功更新。



12\. 扩展能力（未来）



未来可能增加：



项目代码索引

AST 分析

向量搜索

多 AI Agent 协作



当前阶段不需要实现。

