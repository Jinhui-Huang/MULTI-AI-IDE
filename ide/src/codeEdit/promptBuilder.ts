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

Your task is to analyze code and generate modifications in SEARCH/REPLACE format.

## IMPORTANT RULES

1. **Always return code changes ONLY in SEARCH/REPLACE blocks**
2. **DO NOT return unified diff format**
3. **DO NOT return full file content**
4. **DO NOT return complete code blocks unless they are part of the search/replace**
5. **If no changes are needed, respond: "No changes needed."**

## SEARCH/REPLACE Format

Return modifications EXACTLY in this format:

\`\`\`
<<<<<<< SEARCH
<original code to find - must be EXACT>
=======
<modified code>
>>>>>>> REPLACE
\`\`\`

Rules for SEARCH/REPLACE:
- SEARCH section must contain the EXACT original code (complete and unchanged)
- REPLACE section is the modified code
- Return ONLY the minimal code blocks that need modification
- Multiple blocks are supported for multiple modifications
- Each block must be separated clearly

Example:
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

Your role: Generate code modifications in SEARCH/REPLACE format.

## Key Instructions

1. Return changes ONLY in SEARCH/REPLACE format
2. Never return unified diff or full file content
3. Use proper SEARCH/REPLACE syntax:

<<<<<<< SEARCH
original code
=======
modified code
>>>>>>> REPLACE

4. The SEARCH section must be the exact original code
5. The REPLACE section is the modified code
6. If the user's request doesn't require changes, respond: "No changes needed."
7. For multiple modifications, return multiple blocks
8. Only output the blocks - no explanations before or after

Important: The SEARCH code must match the file exactly, including whitespace and formatting.`;
  }

  /**
   * 开源模型 (Llama/Mistral/Ollama) 的系统提示词 - 更简洁
   */
  private static buildOpenSourceSystemPrompt(): string {
    return `你是一个代码修改助手。

任务：生成 SEARCH/REPLACE 格式的代码修改。

## 重要规则

1. 只返回 SEARCH/REPLACE 格式的代码修改
2. 不要返回 unified diff
3. 不要返回完整文件内容
4. 如果不需要修改，回复："不需要修改"

## SEARCH/REPLACE 格式

格式示例：

<<<<<<< SEARCH
原始代码（必须与文件完全匹配）
=======
修改后的代码
>>>>>>> REPLACE

规则：
- SEARCH 部分必须是文件中的精确原始代码
- REPLACE 部分是修改后的代码
- 只返回需要修改的最小代码块
- 多个修改时返回多个块
- 每个块要清晰分开

示例：

<<<<<<< SEARCH
function getUser() {
    return user;
}
=======
function getUserById(id) {
    return this.users.find(u => u.id === id);
}
>>>>>>> REPLACE

只输出代码块，不要输出解释。`;
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

    // 提醒返回 SEARCH/REPLACE 格式
    prompt += '## Response Format\n\n';
    prompt += 'Return the modification(s) in SEARCH/REPLACE format only. Do not include any explanation before or after the blocks.';

    return prompt;
  }
}
