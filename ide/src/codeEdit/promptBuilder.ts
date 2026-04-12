import { createLogger } from '../core/logger';
import { CollectedContext } from './contextCollector';

const log = createLogger('CodeEditPromptBuilder');

export type LLMType = 'claude' | 'gpt' | 'llama' | 'mistral' | 'local' | 'unknown';

/**
 * SEARCH/REPLACE 格式提示词构造器
 * 为不同 LLM 生成优化的系统和用户提示词
 */
export class CodeEditPromptBuilder {
  /**
   * 检测 LLM 类型
   */
  static detectType(provider: string): LLMType {
    const normalized = provider.toLowerCase();

    if (normalized.includes('claude') || normalized.includes('anthropic')) {
      return 'claude';
    }
    if (normalized.includes('gpt') || normalized.includes('openai')) {
      return 'gpt';
    }
    if (normalized.includes('llama')) {
      return 'llama';
    }
    if (normalized.includes('mistral')) {
      return 'mistral';
    }
    if (normalized.includes('ollama') || normalized.includes('local')) {
      return 'local';
    }

    return 'unknown';
  }

  /**
   * 构建系统提示词 - 指导 LLM 返回 SEARCH/REPLACE 格式
   */
  static buildSystemPrompt(llmType: LLMType): string {
    switch (llmType) {
      case 'claude':
        return this.buildClaudeSystemPrompt();
      case 'gpt':
        return this.buildGPTSystemPrompt();
      case 'llama':
      case 'mistral':
      case 'local':
        return this.buildOpenSourceSystemPrompt();
      default:
        return this.buildOpenSourceSystemPrompt();
    }
  }

  /**
   * Claude 的系统提示词 - 最宽松，理解复杂格式
   */
  private static buildClaudeSystemPrompt(): string {
    return `You are a professional software engineer assistant specializing in code modifications.

Your task is to analyze code and generate modifications in SEARCH/REPLACE format ONLY.

## ⚠️ CRITICAL RULES - READ CAREFULLY

1. **ALWAYS return code changes ONLY in SEARCH/REPLACE blocks**
2. **NEVER return unified diff format (with @@ -1,10 +1,10 @@ markers)**
3. **NEVER return full file content**
4. **NEVER return explanations, comments, or text outside the blocks**
5. **NEVER return code in diff format like:**
   - Lines starting with "-" and "+"
   - @@ line numbers @@
   - "---" and "+++" file markers
6. **If no changes are needed, respond: "No changes needed."**

## ✅ CORRECT SEARCH/REPLACE Format

Return modifications EXACTLY in this format - NOTHING ELSE:

<<<<<<< SEARCH
<original code to find - must be EXACT>
=======
<modified code>
>>>>>>> REPLACE

## Rules for SEARCH/REPLACE

1. SEARCH section: Must contain EXACT original code (character-for-character match)
2. REPLACE section: The modified version of that code
3. Return ONLY minimal code blocks that need changes
4. Multiple blocks supported for multiple modifications
5. Each block separated by blank lines
6. No explanations, no comments, no text outside blocks

## ❌ WRONG Examples (NEVER do this):

❌ WRONG - Unified Diff Format:
\`\`\`
@@ -1,5 +1,5 @@
-public class Game {
+public class Game {
-    private static void startGame() {
+    private void startGame() {
\`\`\`

❌ WRONG - Full File:
\`\`\`
public class Game {
    public static void main(String[] args) {
        // entire file content...
    }
}
\`\`\`

## ✅ CORRECT Example:

<<<<<<< SEARCH
class User {
  name: string;
}
=======
class User {
  name: string;

  getUserById(id: string) {
    return this.findById(id);
  }
}
>>>>>>> REPLACE`;
  }

  /**
   * GPT 的系统提示词
   */
  private static buildGPTSystemPrompt(): string {
    return `You are a professional code modification assistant.

Your ONLY job: Generate code modifications in SEARCH/REPLACE format.

## ⚠️ CRITICAL - READ FIRST

OUTPUT FORMAT REQUIREMENT: You MUST return ONLY SEARCH/REPLACE blocks. Nothing else.

✅ CORRECT FORMAT:
<<<<<<< SEARCH
original code
=======
modified code
>>>>>>> REPLACE

❌ FORBIDDEN FORMATS:
- Do NOT use unified diff (lines with + and -, @@ markers)
- Do NOT return full file content
- Do NOT include explanations or comments
- Do NOT use diff format like "--- file" or "+++ file"

## Detailed Rules

1. **SEARCH section**: Must be EXACT original code from the file
2. **REPLACE section**: Modified version of that code
3. **Multiple changes**: Return multiple blocks separated by blank lines
4. **No explanations**: Only output blocks, nothing before/after
5. **Exact match**: SEARCH must match file exactly (spaces, tabs, newlines)
6. **Minimal blocks**: Only include code that changes

## If no changes needed
Respond: "No changes needed."

IMPORTANT: The SEARCH code must match the file exactly, including whitespace and formatting.`;
  }

  /**
   * 开源模型 (Llama/Mistral/Ollama) 的系统提示词
   */
  private static buildOpenSourceSystemPrompt(): string {
    return `你是一个代码修改助手。

唯一的任务：生成 SEARCH/REPLACE 格式的代码修改。

## ⚠️ 必读 - 格式要求

✅ 正确格式：
<<<<<<< SEARCH
原始代码
=======
修改后的代码
>>>>>>> REPLACE

❌ 禁止的格式：
- 不要返回 unified diff（有 + - @@ 标记的）
- 不要返回完整文件内容
- 不要返回解释或注释
- 不要返回 "---" 或 "+++" 的 diff 格式

## 详细规则

1. SEARCH 部分：必须是文件中的精确原始代码
2. REPLACE 部分：修改后的代码
3. 多个修改：返回多个块，块之间用空行分隔
4. 只输出块：不要在块前后输出解释
5. 精确匹配：SEARCH 必须与文件完全匹配（包括空格、制表符、换行）
6. 最小化块：只包含需要改变的代码

## 如果不需要修改

回复："不需要修改"

## 正确示例

<<<<<<< SEARCH
function getUser() {
    return user;
}
=======
function getUserById(id) {
    return this.users.find(u => u.id === id);
}
>>>>>>> REPLACE

## 错误示例（不要这样做）

❌ 不要返回 diff：
@@ -1,5 +1,5 @@
-function getUser() {
+function getUserById(id) {`;
  }

  /**
   * 构建用户提示词
   */
  static buildUserPrompt(context: CollectedContext, userRequest: string): string {
    let prompt = '';

    // 构建代码上下文部分
    prompt += '## Code Context\n\n';

    if (context.currentFile) {
      prompt += `### Current File: ${context.currentFile.path}\n`;
      prompt += '```\n';
      prompt += context.currentFile.content;
      prompt += '\n```\n\n';
    }

    if (context.relatedFiles.length > 0) {
      prompt += '### Related Files\n\n';
      for (const file of context.relatedFiles) {
        prompt += `#### ${file.path}\n`;
        prompt += '```\n';
        prompt += file.content;
        prompt += '\n```\n\n';
      }
    }

    // 用户请求
    prompt += '## Your Request\n\n';
    prompt += userRequest + '\n\n';

    // 强制格式提醒
    prompt += '## ⚠️ RESPONSE FORMAT (MANDATORY)\n\n';
    prompt += '**IMPORTANT**: You MUST respond ONLY with SEARCH/REPLACE blocks. No other format.\n\n';
    prompt += 'Use this format EXACTLY:\n\n';
    prompt += '<<<<<<< SEARCH\n';
    prompt += '[original code from file]\n';
    prompt += '=======\n';
    prompt += '[modified code]\n';
    prompt += '>>>>>>> REPLACE\n\n';
    prompt += '**DO NOT:**\n';
    prompt += '- Return unified diff format (with @@ -1,5 +1,5 @@ markers)\n';
    prompt += '- Return full file content\n';
    prompt += '- Include explanations or comments\n';
    prompt += '- Use + and - line prefixes\n';
    prompt += '- Return "---" or "+++" file markers\n\n';
    prompt += 'Output ONLY the SEARCH/REPLACE blocks, nothing else.';

    return prompt;
  }
}
