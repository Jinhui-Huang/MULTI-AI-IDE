/**
 * LLM 意图构造器
 * 而不是让 LLM 生成代码，让它生成"修改意图" (JSON 格式)
 * 然后系统根据意图用 AST/LSP 来实际修改代码
 */

import { CollectedContext } from '../codeEdit/contextCollector';
import { createLogger } from '../core/logger';

const log = createLogger('LLMIntentBuilder');

export type LLMType = 'claude' | 'gpt' | 'llama' | 'mistral' | 'local' | 'unknown';

/**
 * LLM 意图构造器
 */
export class LLMIntentBuilder {
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
   * 构建系统提示词 - 指导 LLM 返回意图 JSON
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
   * Claude 系统提示词 - 生成修改意图
   */
  private static buildClaudeSystemPrompt(): string {
    return `You are a professional code modification assistant.

Your task is to analyze code and generate structured modification intents (NOT code).

## IMPORTANT: Return JSON Intents, NOT Code

Return ONLY a JSON object with modification intents. Do NOT return code.

## Intent Format

Each intent must follow this JSON structure:

\`\`\`json
{
  "language": "java|python|javascript|typescript|go|rust|cpp|csharp|kotlin|swift",
  "filePath": "path/to/file.ext",
  "intents": [
    {
      "action": "add_inner_class|add_class|add_method|add_property|modify_method|...",
      "details": {
        // action-specific properties
      }
    }
  ]
}
\`\`\`

## Action Examples

### add_inner_class
\`\`\`json
{
  "action": "add_inner_class",
  "details": {
    "className": "GameBoard",
    "accessModifier": "private",
    "methods": [
      {"name": "moveDown", "returnType": "boolean"},
      {"name": "moveLeft", "returnType": "boolean"}
    ]
  }
}
\`\`\`

### add_method
\`\`\`json
{
  "action": "add_method",
  "details": {
    "methodName": "getUserById",
    "returnType": "User",
    "accessModifier": "public",
    "isStatic": true,
    "parameters": [
      {"name": "id", "type": "String"}
    ]
  }
}
\`\`\`

### add_class
\`\`\`json
{
  "action": "add_class",
  "details": {
    "className": "UserManager",
    "accessModifier": "public",
    "methods": [...]
  }
}
\`\`\`

## Important Rules

1. Return ONLY valid JSON
2. Do NOT return code or code snippets
3. Do NOT include explanations outside the JSON
4. Do NOT use diff or patch format
5. Focus on the intent/what to change, not how
6. Detect the programming language from the file
7. If no changes are needed, return: \`{"intents": []}\`

## Valid Actions

- add_inner_class: Add an inner/nested class
- add_class: Add a new class to file
- add_method: Add a method to existing class
- add_property: Add a property/field
- move_class: Move class to another file
- extract_class: Extract code into new class
- modify_method: Change method implementation
- rename_class: Rename an existing class
- rename_method: Rename an existing method
- change_access_modifier: Change public/private/etc
- add_interface: Add interface/trait
- implement_interface: Implement an interface
- generic_code_insert: Insert arbitrary code`;
  }

  /**
   * GPT 系统提示词
   */
  private static buildGPTSystemPrompt(): string {
    return `You are a code modification assistant that generates structured intents.

DO NOT generate code. Return ONLY JSON.

## JSON Intent Format

\`\`\`json
{
  "language": "java|python|javascript|...",
  "filePath": "path/to/file",
  "intents": [
    {
      "action": "add_inner_class|add_method|add_class|...",
      "details": { /* action-specific */ }
    }
  ]
}
\`\`\`

## Rules

1. Return ONLY JSON - no code, no explanations
2. Use valid action names
3. Include all required details
4. Return empty intents if no changes needed: \`{"intents": []}\`

## Supported Actions

- add_inner_class: Add inner/nested class
- add_class: Add new standalone class
- add_method: Add method to class
- add_property: Add field/property
- add_interface: Add interface
- modify_method: Change method
- rename_class: Rename class
- change_access_modifier: Change visibility`;
  }

  /**
   * 开源模型系统提示词
   */
  private static buildOpenSourceSystemPrompt(): string {
    return `你是一个代码修改助手。

任务：生成代码修改意图（JSON格式），不要生成代码。

## JSON 意图格式

只返回 JSON，不要返回代码：

\`\`\`json
{
  "language": "java|python|javascript|go|rust|cpp",
  "filePath": "path/to/file.ext",
  "intents": [
    {
      "action": "add_inner_class|add_method|...",
      "details": {}
    }
  ]
}
\`\`\`

## 规则

1. 只返回 JSON
2. 不返回代码
3. 不返回解释
4. 不需要修改时返回空: \`{"intents": []}\`

## 支持的操作

- add_inner_class: 添加内部类
- add_class: 添加类
- add_method: 添加方法
- add_property: 添加属性
- add_interface: 添加接口
- modify_method: 修改方法
- rename_class: 重命名类`;
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

    // 强制返回 JSON 意图
    prompt += '## Response Format (MANDATORY)\n\n';
    prompt += 'Return ONLY a JSON object with modification intents. Nothing else.\n\n';
    prompt += 'Do NOT:\n';
    prompt += '- Return code or code snippets\n';
    prompt += '- Return explanations\n';
    prompt += '- Return diff or patch format\n\n';
    prompt += 'Return JSON like:\n';
    prompt += '```json\n';
    prompt += '{\n';
    prompt += '  "language": "java",\n';
    prompt += '  "filePath": "path/to/File.java",\n';
    prompt += '  "intents": [\n';
    prompt += '    {\n';
    prompt += '      "action": "add_inner_class",\n';
    prompt += '      "details": { "className": "GameBoard", ... }\n';
    prompt += '    }\n';
    prompt += '  ]\n';
    prompt += '}\n';
    prompt += '```\n';

    return prompt;
  }
}
