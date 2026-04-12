import * as path from 'path';
import { AgentRuntime } from '../agent/agentRuntime';
import { createLogger } from '../core/logger';
import { SearchReplaceBlock } from './searchReplaceParser';

const log = createLogger('SearchReplaceApplier');

/**
 * 单个块应用的结果
 */
export interface BlockApplyResult {
  success: boolean;
  blockIndex: number;
  searchText: string;
  found: boolean;
  matchCount?: number;
  error?: string;
}

/**
 * 文件应用的完整结果
 */
export interface ApplySearchReplaceResult {
  success: boolean;
  filePath: string;
  originalContent: string;
  newContent: string;
  appliedBlocks: number;
  failedBlocks: BlockApplyResult[];
  error?: string;
}

/**
 * SEARCH/REPLACE 块应用器
 * 将 SEARCH/REPLACE 块应用到文件
 */
export class SearchReplaceApplier {
  private runtime: AgentRuntime;

  constructor(projectRoot: string) {
    this.runtime = new AgentRuntime(projectRoot);
  }

  /**
   * 应用多个 SEARCH/REPLACE 块到文件
   */
  async apply(filePath: string, blocks: SearchReplaceBlock[]): Promise<ApplySearchReplaceResult> {
    log.info(`[SR-APPLY] Applying ${blocks.length} blocks to: ${filePath}`);

    try {
      // 1. 标准化文件路径
      const normalizedPath = this.normalizePath(filePath);
      log.debug(`[SR-APPLY] Normalized path: ${normalizedPath}`);

      // 2. 读取原文件
      let fileContent: string;
      try {
        fileContent = await this.runtime.readFile(normalizedPath);
        log.debug(`[SR-APPLY] Read file: ${fileContent.length} chars`);
      } catch (error) {
        log.warn(`[SR-APPLY] File not found: ${normalizedPath}, treating as new file`);
        fileContent = '';
      }

      // 3. 依次应用每个块
      let currentContent = fileContent;
      let appliedBlocks = 0;
      const failedBlocks: BlockApplyResult[] = [];

      for (const block of blocks) {
        const blockResult = this.applyBlock(currentContent, block);

        if (blockResult.success) {
          // 更新内容供下一个块使用
          currentContent = blockResult.newContent!;
          appliedBlocks++;
          log.info(`[SR-APPLY] ✓ Block ${block.index} applied successfully`);
        } else {
          log.error(`[SR-APPLY] ✗ Block ${block.index} failed: ${blockResult.error}`);
          failedBlocks.push(blockResult);
        }
      }

      // 4. 检查是否有成功的修改
      if (appliedBlocks === 0) {
        return {
          success: false,
          filePath: normalizedPath,
          originalContent: fileContent,
          newContent: fileContent,
          appliedBlocks: 0,
          failedBlocks,
          error: failedBlocks.length > 0 ? failedBlocks[0].error : 'No blocks were applied',
        };
      }

      // 5. 写入文件
      await this.runtime.writeFile(normalizedPath, currentContent);
      log.info(`[SR-APPLY] File updated: ${normalizedPath} (${appliedBlocks}/${blocks.length} blocks applied)`);

      return {
        success: true,
        filePath: normalizedPath,
        originalContent: fileContent,
        newContent: currentContent,
        appliedBlocks,
        failedBlocks,
      };
    } catch (error) {
      const err = error as { message: string };
      log.error(`[SR-APPLY] Error: ${err.message}`);
      return {
        success: false,
        filePath,
        originalContent: '',
        newContent: '',
        appliedBlocks: 0,
        failedBlocks: [],
        error: err.message,
      };
    }
  }

  /**
   * 应用单个块到内容
   */
  private applyBlock(content: string, block: SearchReplaceBlock): { success: boolean; newContent?: string; error?: string } {
    log.debug(`[SR-APPLY] Applying block ${block.index}`);
    log.debug(`[SR-APPLY]   Search: ${block.search.length} chars`);
    log.debug(`[SR-APPLY]   Replace: ${block.replace.length} chars`);

    // 1. 检查搜索文本是否存在
    const searchIndex = content.indexOf(block.search);

    if (searchIndex === -1) {
      const error = `SEARCH block not found in file`;
      log.warn(`[SR-APPLY] ✗ ${error}`);
      return {
        success: false,
        error,
      };
    }

    // 2. 检查是否有多个匹配（歧义）
    const matchCount = this.countMatches(content, block.search);
    if (matchCount > 1) {
      log.warn(`[SR-APPLY] ✗ Block ${block.index}: Found ${matchCount} matches (ambiguous), using first match`);
    }

    // 3. 执行替换
    try {
      const newContent = content.replace(block.search, block.replace);

      // 验证替换确实发生了
      if (newContent === content) {
        return {
          success: false,
          error: 'Replace failed (content unchanged)',
        };
      }

      log.debug(`[SR-APPLY] ✓ Block ${block.index}: Replaced ${block.search.length} chars with ${block.replace.length} chars`);

      return {
        success: true,
        newContent,
      };
    } catch (error) {
      const err = error as { message: string };
      return {
        success: false,
        error: `Replace error: ${err.message}`,
      };
    }
  }

  /**
   * 统计匹配数量
   */
  private countMatches(content: string, searchText: string): number {
    let count = 0;
    let startIndex = 0;

    while ((startIndex = content.indexOf(searchText, startIndex)) !== -1) {
      count++;
      startIndex += searchText.length;
    }

    return count;
  }

  /**
   * 标准化文件路径
   */
  private normalizePath(filePath: string): string {
    let normalized = filePath;

    // 移除 a/ 或 b/ 前缀（如果有）
    if (normalized.startsWith('a/')) {
      normalized = normalized.substring(2);
    } else if (normalized.startsWith('b/')) {
      normalized = normalized.substring(2);
    }

    // 移除开头的 / 或 \
    while (normalized.startsWith('/') || normalized.startsWith('\\')) {
      normalized = normalized.substring(1);
    }

    // 统一路径分隔符
    normalized = normalized.replace(/\\/g, '/');

    log.debug(`[SR-APPLY] normalizePath: "${filePath}" → "${normalized}"`);
    return normalized;
  }
}
