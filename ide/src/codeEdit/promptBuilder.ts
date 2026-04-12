import { createLogger } from '../core/logger';
import { CollectedContext } from './contextCollector';

const log = createLogger('CodeEditPromptBuilder');

export type LLMType = 'claude' | 'gpt' | 'llama' | 'mistral' | 'local' | 'unknown';

/**
 * Unified Diff 格式提示词构造器
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
   * 构建系统提示词 - 指导 LLM 返回 unified diff 格式
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

Your task is to analyze code and generate modifications in unified diff format.

## IMPORTANT RULES

1. **Always return code changes ONLY in unified diff format**
2. **DO NOT return full file content** - only the diff
3. **DO NOT return complete code blocks** - only the changes
4. **If no changes are needed, respond: "No changes needed."**

## Unified Diff Format

Return modifications EXACTLY in this format:

\`\`\`diff
--- a/path/to/file.ts
+++ b/path/to/file.ts
@@ -<old_start>,<old_count> +<new_start>,<new_count> @@
 <context_line>
-<removed_line>
+<added_line>
 <context_line>
\`\`\`

Rules for diff format:
- Each line starts with a single space (context), minus sign (removal), or plus sign (addition)
- Context lines must match the original file EXACTLY (including whitespace)
- Include 2-3 context lines before and after changes for clarity
- Handle multiple hunks/files by repeating the \`--- a/\` \`+++ b/\` \`@@\` pattern
- Line numbers in @@ must be accurate`;
  }

  /**
   * GPT 的系统提示词
   */
  private static buildGPTSystemPrompt(): string {
    return `You are a professional code modification assistant.

Your role: Generate code modifications in unified diff format.

## Key Instructions

1. Return changes ONLY in unified diff format
2. Never include full file content
3. Use proper unified diff syntax:

\`\`\`diff
--- a/filename.ts
+++ b/filename.ts
@@ -line_number,count +line_number,count @@
 unchanged line
-removed line
+added line
\`\`\`

4. Include context lines (unchanged lines) to show where changes go
5. If the user's request doesn't require changes, respond: "No changes needed."
6. Only output the diff - no explanations before or after the diff block

Return all modifications as a single diff block or multiple consecutive diff blocks if multiple files are affected.`;
  }

  /**
   * 开源模型 (Llama/Mistral/Ollama) 的系统提示词 - 更简洁
   */
  private static buildOpenSourceSystemPrompt(): string {
    return `你是一个代码修改助手。

任务：生成 unified diff 格式的代码修改。

## 重要规则

1. 只返回 unified diff 格式的代码修改
2. 不要返回完整文件内容
3. 不要返回完整代码块
4. 如果不需要修改，回复："不需要修改"

## Unified Diff 格式

格式示例：

\`\`\`diff
--- a/file.ts
+++ b/file.ts
@@ -10,5 +10,6 @@
 context line
-removed line
+added line
+new line
 context line
\`\`\`

规则：
- 每行以空格（上下文）、减号（删除）或加号（新增）开头
- 上下文行必须与原文件完全匹配
- 每个改动前后至少有 2 行上下文
- 行号必须准确

只输出 diff，不要输出解释。`;
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

    // 提醒返回 diff 格式
    prompt += '## Response Format\n\n';
    prompt += 'Return the modification(s) in unified diff format only. Do not include any explanation before or after the diff.';

    return prompt;
  }
}
