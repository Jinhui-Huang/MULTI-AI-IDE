/**
 * 多语言代码修改引擎
 * 统一协调 LSP、Tree-sitter、规范化的完整流程
 */

import { AgentRuntime } from '../../agent/agentRuntime';
import { createLogger } from '../../core/logger';
import {
  CodeModificationIntent,
  ModificationResult,
  SupportedLanguage,
  LLMGeneratedIntent,
} from './types';
import { LanguageDetector, LanguageCapabilities } from './languageDetector';
import { CodeFormatter } from './formatter';

const log = createLogger('CodeModificationEngine');

/**
 * 多语言代码修改引擎
 */
export class CodeModificationEngine {
  private runtime: AgentRuntime;
  private formatter: CodeFormatter;

  constructor(projectRoot: string) {
    this.runtime = new AgentRuntime(projectRoot);
    this.formatter = new CodeFormatter();
  }

  /**
   * 执行 LLM 生成的意图
   */
  async applyIntents(llmIntent: LLMGeneratedIntent): Promise<ModificationResult[]> {
    log.info(`[CME] Applying ${llmIntent.intents.length} intents to ${llmIntent.filePath}`);

    const results: ModificationResult[] = [];

    for (const intent of llmIntent.intents) {
      const result = await this.applyIntent(intent);
      results.push(result);

      if (!result.success) {
        log.error(`[CME] Intent failed: ${result.error}`);
        break; // 停止继续应用
      }
    }

    return results;
  }

  /**
   * 应用单个修改意图
   */
  async applyIntent(intent: CodeModificationIntent): Promise<ModificationResult> {
    log.info(`[CME] Applying intent: ${intent.action} to ${intent.filePath}`);

    try {
      // 1. 读取原文件
      const originalContent = await this.runtime.readFile(intent.filePath);

      // 2. 检测语言
      const language = intent.language;
      if (!LanguageDetector.isLanguageSupported(language)) {
        return this.errorResult(intent.filePath, originalContent, `Unsupported language: ${language}`);
      }

      // 3. 选择处理方法（LSP > Tree-sitter > Fallback）
      const approach = LanguageCapabilities.getRecommendedApproach(language);
      log.info(`[CME] Using approach: ${approach}`);

      let modifiedContent: string;

      if (approach === 'lsp') {
        modifiedContent = await this.applyViaLSP(originalContent, intent);
      } else if (approach === 'tree-sitter') {
        modifiedContent = await this.applyViaTreeSitter(originalContent, intent);
      } else {
        modifiedContent = await this.applyViaFallback(originalContent, intent);
      }

      // 4. 规范化代码
      const normalizedContent = await this.formatter.format(modifiedContent, language);

      // 5. 验证代码（如果可能）
      const config = LanguageDetector.getLanguageConfig(language);
      if (config) {
        const validation = await config.adapter.validate(normalizedContent);
        if (!validation.valid) {
          return this.errorResult(intent.filePath, originalContent, `Validation failed: ${validation.errors.join(', ')}`);
        }
      }

      // 6. 写回文件
      await this.runtime.writeFile(intent.filePath, normalizedContent);

      return {
        success: true,
        filePath: intent.filePath,
        originalContent,
        modifiedContent: normalizedContent,
        appliedActions: [intent.action],
      };
    } catch (error) {
      const err = error as { message: string };
      log.error(`[CME] Error applying intent: ${err.message}`);
      return this.errorResult(intent.filePath, '', err.message);
    }
  }

  /**
   * 通过 LSP 应用修改（关键语言）
   */
  private async applyViaLSP(content: string, intent: CodeModificationIntent): Promise<string> {
    log.info(`[CME-LSP] Applying via LSP for ${intent.language}`);

    // TODO: 实现 LSP 集成
    // - 启动对应的 LSP 服务器
    // - 使用 LSP 的 textDocument/codeAction 获取重构建议
    // - 应用相应的文本编辑

    // 暂时降级到 Tree-sitter
    return this.applyViaTreeSitter(content, intent);
  }

  /**
   * 通过 Tree-sitter 应用修改（通用语言）
   */
  private async applyViaTreeSitter(content: string, intent: CodeModificationIntent): Promise<string> {
    log.info(`[CME-TreeSitter] Applying via Tree-sitter for ${intent.language}`);

    // TODO: 实现 Tree-sitter 集成
    // - 使用 Tree-sitter 解析代码
    // - 根据意图修改 AST
    // - 生成新代码

    // 暂时降级到 Fallback
    return this.applyViaFallback(content, intent);
  }

  /**
   * 降级方案：规范化 + SEARCH/REPLACE
   */
  private async applyViaFallback(content: string, intent: CodeModificationIntent): Promise<string> {
    log.info(`[CME-Fallback] Applying via normalization + SEARCH/REPLACE`);

    // 这里使用现有的规范化 + 代码插入逻辑
    // 根据 intent.action 生成要插入的代码，然后在合适位置插入

    switch (intent.action) {
      case 'add_inner_class':
        return this.addInnerClass(content, intent);
      case 'add_class':
        return this.addClass(content, intent);
      case 'add_method':
        return this.addMethod(content, intent);
      case 'generic_code_insert':
        return this.insertCode(content, intent);
      default:
        throw new Error(`Unsupported action for fallback: ${intent.action}`);
    }
  }

  /**
   * 添加内部类
   */
  private addInnerClass(content: string, intent: CodeModificationIntent): string {
    const details = intent.details;
    const className = details.className || 'InnerClass';

    // 生成内部类代码
    let innerClassCode = `\n    private class ${className} {\n`;
    if (details.methods) {
      for (const method of details.methods) {
        innerClassCode += `        public void ${method.name}() {\n`;
        innerClassCode += `            // ${method.name} implementation\n`;
        innerClassCode += `        }\n`;
      }
    }
    innerClassCode += `    }\n`;

    // 在类的结尾处插入（倒数第二个 }）
    const lines = content.split('\n');
    let insertPos = -1;

    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() === '}') {
        insertPos = i;
        break;
      }
    }

    if (insertPos > 0) {
      lines.splice(insertPos, 0, innerClassCode);
      return lines.join('\n');
    }

    return content + innerClassCode;
  }

  /**
   * 添加类
   */
  private addClass(content: string, intent: CodeModificationIntent): string {
    const details = intent.details;
    const className = details.className || 'NewClass';

    let classCode = `\n\npublic class ${className} {\n`;
    if (details.methods) {
      for (const method of details.methods) {
        classCode += `    public void ${method.name}() {\n`;
        classCode += `        // ${method.name} implementation\n`;
        classCode += `    }\n`;
      }
    }
    classCode += `}\n`;

    return content + classCode;
  }

  /**
   * 添加方法
   */
  private addMethod(content: string, intent: CodeModificationIntent): string {
    const details = intent.details;
    const methodName = details.methodName || 'newMethod';
    const returnType = details.returnType || 'void';

    let methodCode = `\n    public ${returnType} ${methodName}() {\n`;
    methodCode += `        // ${methodName} implementation\n`;
    methodCode += `    }\n`;

    // 在类的最后一个方法后插入
    const lines = content.split('\n');
    let insertPos = lines.length - 2; // 倒数第二行（最后一个 }）

    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() === '}') {
        insertPos = i;
        break;
      }
    }

    lines.splice(insertPos, 0, methodCode);
    return lines.join('\n');
  }

  /**
   * 通用代码插入
   */
  private insertCode(content: string, intent: CodeModificationIntent): string {
    const details = intent.details;
    const codeToInsert = details.code || '';
    const position = details.position || 'end';

    if (position === 'end') {
      return content + '\n' + codeToInsert + '\n';
    } else if (position === 'start') {
      return codeToInsert + '\n' + content;
    }

    return content;
  }

  /**
   * 生成错误结果
   */
  private errorResult(filePath: string, originalContent: string, error: string): ModificationResult {
    return {
      success: false,
      filePath,
      originalContent,
      modifiedContent: originalContent,
      appliedActions: [],
      error,
    };
  }
}
