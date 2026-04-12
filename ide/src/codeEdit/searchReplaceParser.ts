import { createLogger } from '../core/logger';

const log = createLogger('SearchReplaceParser');

/**
 * 单个 SEARCH/REPLACE 块
 */
export interface SearchReplaceBlock {
  search: string;
  replace: string;
  index: number; // 块在文件中的索引
}

/**
 * 解析结果
 */
export interface SearchReplaceParseResult {
  success: boolean;
  blocks: SearchReplaceBlock[];
  rawText: string;
  error?: string;
}

/**
 * SEARCH/REPLACE 块解析器
 * 解析 AI 返回的 SEARCH/REPLACE 格式代码块
 *
 * 格式：
 * <<<<<<< SEARCH
 * <original code>
 * =======
 * <modified code>
 * >>>>>>> REPLACE
 */
export class SearchReplaceParser {
  /**
   * 解析 AI 响应中的 SEARCH/REPLACE 块
   */
  static parse(llmResponse: string): SearchReplaceParseResult {
    log.info('[SR-PARSE] Starting to parse SEARCH/REPLACE blocks');

    if (!llmResponse || llmResponse.length === 0) {
      return {
        success: false,
        blocks: [],
        rawText: llmResponse,
        error: 'Empty response from LLM',
      };
    }

    const blocks: SearchReplaceBlock[] = [];
    const text = llmResponse;

    // 正则表达式匹配 SEARCH/REPLACE 块
    // <<<<<<< SEARCH
    // ...search content...
    // =======
    // ...replace content...
    // >>>>>>> REPLACE
    const blockRegex = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;

    let match;
    let blockIndex = 0;

    while ((match = blockRegex.exec(text)) !== null) {
      const search = match[1];
      const replace = match[2];

      // 验证不为空
      if (!search || !replace) {
        log.warn(`[SR-PARSE] Block ${blockIndex}: search or replace is empty, skipping`);
        continue;
      }

      blocks.push({
        search,
        replace,
        index: blockIndex,
      });

      blockIndex++;
      log.debug(`[SR-PARSE] Found block ${blockIndex}: search=${search.substring(0, 50)}..., replace=${replace.substring(0, 50)}...`);
    }

    if (blocks.length === 0) {
      log.warn('[SR-PARSE] No SEARCH/REPLACE blocks found in response');
      return {
        success: false,
        blocks: [],
        rawText: text,
        error: 'No SEARCH/REPLACE blocks found in response',
      };
    }

    log.info(`[SR-PARSE] Successfully parsed ${blocks.length} SEARCH/REPLACE blocks`);
    blocks.forEach((block, i) => {
      log.info(`[SR-PARSE]   [${i + 1}] search: ${block.search.length} chars, replace: ${block.replace.length} chars`);
    });

    return {
      success: true,
      blocks,
      rawText: text,
    };
  }

  /**
   * 验证块是否可以在文件中找到
   * 返回是否找到 + 可能的位置
   */
  static findBlock(fileContent: string, searchText: string): { found: boolean; index: number } {
    const index = fileContent.indexOf(searchText);
    return {
      found: index !== -1,
      index,
    };
  }

  /**
   * 验证块是否有歧义（多个匹配）
   */
  static countMatches(fileContent: string, searchText: string): number {
    let count = 0;
    let startIndex = 0;

    while ((startIndex = fileContent.indexOf(searchText, startIndex)) !== -1) {
      count++;
      startIndex += searchText.length;
    }

    return count;
  }
}
