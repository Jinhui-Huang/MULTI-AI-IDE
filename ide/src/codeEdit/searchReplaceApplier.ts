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
   * 支持多层次模糊匹配，确保高成功率
   */
  private applyBlock(content: string, block: SearchReplaceBlock): { success: boolean; newContent?: string; error?: string; blockIndex: number; searchText: string; found: boolean } {
    log.debug(`[SR-APPLY] Applying block ${block.index}`);
    log.debug(`[SR-APPLY]   Search: ${block.search.length} chars`);
    log.debug(`[SR-APPLY]   Replace: ${block.replace.length} chars`);

    // 方法 1: 精确匹配
    let searchIndex = content.indexOf(block.search);
    let matchedSearch = block.search;

    if (searchIndex === -1) {
      log.debug(`[SR-APPLY] Exact match failed, trying fuzzy match...`);

      // 方法 2: Trim 模糊匹配（逐行对比，忽略首尾空格和缩进）
      const searchLines = block.search.split('\n');
      const contentLines = content.split('\n');
      let foundLineIndex = -1;

      // 查找第一行匹配的位置
      const firstSearchLine = searchLines[0].trim();
      if (firstSearchLine) {
        for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
          // 验证从这一行开始的所有行都匹配（trim 后）
          const allMatch = searchLines.every((searchLine, idx) => {
            if (i + idx >= contentLines.length) return false;
            return contentLines[i + idx].trim() === searchLine.trim();
          });

          if (allMatch) {
            foundLineIndex = i;
            log.debug(`[SR-APPLY] Fuzzy match: first line found at line ${i + 1}, checking multi-line block...`);
            break;
          }
        }

        if (foundLineIndex !== -1) {
          // 找到了匹配的块，重构完整的 SEARCH 块（保持原文件的缩进）
          const contentLines = content.split('\n');
          const matchedLines = contentLines.slice(foundLineIndex, foundLineIndex + searchLines.length);

          if (matchedLines.length === searchLines.length) {
            matchedSearch = matchedLines.join('\n');
            searchIndex = content.indexOf(matchedSearch);
            log.debug(`[SR-APPLY] Fuzzy match found at line ${foundLineIndex + 1}, matched ${matchedLines.length} lines`);
          }
        }
      }
    }

    if (searchIndex === -1) {
      log.debug(`[SR-APPLY] Fuzzy match also failed, trying normalized match...`);

      // 方法 3: 归一化匹配（去掉所有空格，只对比内容）
      const normalizeStr = (str: string) => str.replace(/\s+/g, '');
      const normalizedSearch = normalizeStr(block.search);
      const normalizedContent = normalizeStr(content);

      const normalizedIndex = normalizedContent.indexOf(normalizedSearch);
      if (normalizedIndex !== -1) {
        // 反向映射到原始内容中的起始位置
        let charCount = 0;
        let originalIndex = 0;

        while (charCount < normalizedIndex && originalIndex < content.length) {
          if (!/\s/.test(content[originalIndex])) {
            charCount++;
          }
          originalIndex++;
        }

        // 计算需要匹配多少个非空格字符
        const targetChars = normalizedSearch.length;
        let matchedChars = 0;
        let endIndex = originalIndex;

        while (matchedChars < targetChars && endIndex < content.length) {
          if (!/\s/.test(content[endIndex])) {
            matchedChars++;
          }
          endIndex++;
        }

        if (matchedChars === targetChars) {
          matchedSearch = content.substring(originalIndex, endIndex);
          searchIndex = originalIndex;
          log.debug(`[SR-APPLY] Normalized match found at position ${searchIndex}`);
        }
      }
    }

    if (searchIndex === -1) {
      const error = `SEARCH block not found in file (tried: exact, fuzzy, normalized)`;
      log.warn(`[SR-APPLY] ✗ ${error}`);
      log.warn(`[SR-APPLY]   Search block (first 100 chars): ${block.search.substring(0, 100)}`);
      return {
        success: false,
        error,
        blockIndex: block.index,
        searchText: block.search.substring(0, 100),
        found: false,
      };
    }

    // 检查是否有多个匹配（歧义）
    const matchCount = this.countMatches(content, matchedSearch);
    if (matchCount > 1) {
      log.warn(`[SR-APPLY] ⚠ Block ${block.index}: Found ${matchCount} matches (ambiguous), using first match`);
    }

    // 执行替换
    try {
      const newContent = content.replace(matchedSearch, block.replace);

      // 验证替换确实发生了
      if (newContent === content) {
        return {
          success: false,
          error: 'Replace failed (content unchanged)',
          blockIndex: block.index,
          searchText: block.search.substring(0, 100),
          found: true, // 找到了但替换失败
        };
      }

      log.info(`[SR-APPLY] ✓ Block ${block.index}: Replaced ${matchedSearch.length} chars with ${block.replace.length} chars`);

      return {
        success: true,
        newContent,
        blockIndex: block.index,
        searchText: block.search.substring(0, 100),
        found: true,
      };
    } catch (error) {
      const err = error as { message: string };
      return {
        success: false,
        error: `Replace error: ${err.message}`,
        blockIndex: block.index,
        searchText: block.search.substring(0, 100),
        found: true,
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
