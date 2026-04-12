import * as fs from 'fs';
import * as path from 'path';
import { AgentRuntime } from '../agent/agentRuntime';
import { createLogger } from '../core/logger';

const log = createLogger('ContextCollector');

export interface FileContext {
  path: string;
  content: string;
  tokens: number;
}

export interface CollectedContext {
  currentFile: FileContext | null;
  relatedFiles: FileContext[];
  totalTokens: number;
  tokenBudget: number;
  truncated: boolean;
}

/**
 * 代码上下文收集器
 * 收集当前文件和相关文件，带 token 预算限制
 */
export class ContextCollector {
  // token 预算：12000 tokens = ~48,000 chars (1 token ≈ 4 chars)
  private readonly MAX_TOKENS = 12000;
  private readonly MAX_FILES = 5;
  private runtime: AgentRuntime;

  constructor(projectRoot: string) {
    this.runtime = new AgentRuntime(projectRoot);
  }

  /**
   * 收集代码上下文
   */
  async collect(currentFilePath: string | undefined): Promise<CollectedContext> {
    log.info(`Collecting context for file: ${currentFilePath}`);

    const context: CollectedContext = {
      currentFile: null,
      relatedFiles: [],
      totalTokens: 0,
      tokenBudget: this.MAX_TOKENS,
      truncated: false,
    };

    // 1. 读取当前文件
    if (currentFilePath) {
      try {
        const content = await this.runtime.readFile(currentFilePath);
        const tokens = this.estimateTokens(content);

        context.currentFile = {
          path: currentFilePath,
          content,
          tokens,
        };
        context.totalTokens = tokens;

        // 检查是否已经超出预算
        if (tokens > this.MAX_TOKENS) {
          log.warn(`Current file exceeds budget: ${tokens} > ${this.MAX_TOKENS}`);
          context.truncated = true;
          return context;
        }

        // 2. 找相关文件
        const relatedFiles = await this.findRelatedFiles(currentFilePath);

        // 3. 按 token 预算加载相关文件
        const remainingTokens = this.MAX_TOKENS - context.totalTokens;
        for (const filePath of relatedFiles) {
          if (context.relatedFiles.length >= this.MAX_FILES) {
            context.truncated = true;
            break;
          }

          try {
            const content = await this.runtime.readFile(filePath);
            const tokens = this.estimateTokens(content);

            if (context.totalTokens + tokens > this.MAX_TOKENS) {
              context.truncated = true;
              break;
            }

            context.relatedFiles.push({
              path: filePath,
              content,
              tokens,
            });
            context.totalTokens += tokens;

            log.debug(`Added related file: ${filePath} (${tokens} tokens)`);
          } catch (error) {
            log.warn(`Failed to read related file: ${filePath}`);
          }
        }
      } catch (error) {
        const err = error as { message: string };
        log.error(`Failed to collect context: ${err.message}`);
      }
    }

    log.info(`Context collected: ${context.totalTokens}/${this.MAX_TOKENS} tokens, ${context.relatedFiles.length} related files`);
    return context;
  }

  /**
   * 找同一目录和相关目录的文件
   */
  private async findRelatedFiles(currentFilePath: string): Promise<string[]> {
    try {
      const allFiles = await this.runtime.getProjectFiles();

      // 提取当前文件的目录
      const currentDir = path.dirname(currentFilePath);
      const fileName = path.basename(currentFilePath);
      const baseName = path.parse(currentFilePath).name;

      // 优先级：
      // 1. 同目录的 .ts/.tsx 文件（除当前文件）
      // 2. 同模块的相关文件（如 types.ts, constants.ts）
      const relatedFiles: string[] = [];

      for (const file of allFiles) {
        if (file === currentFilePath) continue;

        const fileDir = path.dirname(file);
        const fileBase = path.parse(file).name;

        // 同目录
        if (fileDir === currentDir) {
          relatedFiles.push(file);
        }
        // 同模块相关文件（如 UserService 对应 user.types 或 user.constants）
        else if (this.isSameModule(baseName, fileBase)) {
          relatedFiles.push(file);
        }
      }

      return relatedFiles.slice(0, this.MAX_FILES * 2); // 返回超过预期的，让后续 token 检查处理
    } catch (error) {
      log.warn('Failed to find related files');
      return [];
    }
  }

  /**
   * 判断是否为同一模块的相关文件
   */
  private isSameModule(base1: string, base2: string): boolean {
    // 规范化名称（移除 Service, Controller, Model 等后缀）
    const normalize = (name: string) => {
      return name
        .toLowerCase()
        .replace(/service|controller|model|component|hook|util|helper|const|type|interface|dto|vo|enum/, '')
        .replace(/[._-]/g, '');
    };

    const norm1 = normalize(base1);
    const norm2 = normalize(base2);

    // 如果标准化后相同，则认为是同一模块
    return norm1 === norm2 && norm1.length > 2;
  }

  /**
   * 估算 token 数
   * 粗略估计：1 token ≈ 4 chars
   */
  private estimateTokens(content: string): number {
    // 更精确的估算：考虑代码特性
    // 代码通常会产生更多的 token（因为有标点符号、缩进等）
    return Math.ceil(content.length / 3.5);
  }
}
