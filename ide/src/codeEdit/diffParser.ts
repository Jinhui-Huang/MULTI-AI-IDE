import { createLogger } from '../core/logger';
import { CodeDiff, DiffHunk, DiffLine } from '../types/protocol';

const log = createLogger('DiffParser');

export interface DiffParseResult {
  success: boolean;
  diffs: CodeDiff[];
  rawText: string;
  error?: string;
}

/**
 * Unified Diff 格式解析器
 * 解析 LLM 返回的 unified diff 格式，提取文件修改
 */
export class DiffParser {
  /**
   * 解析 unified diff 格式
   */
  static parse(llmResponse: string): DiffParseResult {
    log.info(`Parsing diff response (${llmResponse.length} chars)`);

    try {
      // 1. 从响应中提取 diff 代码块
      const diffText = this.extractDiffBlock(llmResponse);

      if (!diffText) {
        log.warn('No diff block found in response');
        return {
          success: false,
          diffs: [],
          rawText: llmResponse,
          error: 'No unified diff format found in response',
        };
      }

      // 2. 解析 diff 文本
      const diffs = this.parseDiffText(diffText);

      if (diffs.length === 0) {
        log.warn('Failed to parse any diffs');
        return {
          success: false,
          diffs: [],
          rawText: llmResponse,
          error: 'Could not parse unified diff format',
        };
      }

      log.info(`Parsed ${diffs.length} diffs successfully`);
      return {
        success: true,
        diffs,
        rawText: llmResponse,
      };
    } catch (error) {
      const err = error as { message: string };
      log.error(`Parse error: ${err.message}`);
      return {
        success: false,
        diffs: [],
        rawText: llmResponse,
        error: err.message,
      };
    }
  }

  /**
   * 从 LLM 响应中提取 diff 代码块
   */
  private static extractDiffBlock(response: string): string {
    // 1. 尝试从 ```diff ... ``` 代码块中提取
    const diffBlockRegex = /```diff\s*\n([\s\S]*?)\n```/;
    const match = diffBlockRegex.exec(response);
    if (match) {
      return match[1];
    }

    // 2. 尝试从 ``` ... ``` 代码块中提取（没有 diff 标签）
    const codeBlockRegex = /```\s*\n([\s\S]*?)\n```/;
    const codeMatch = codeBlockRegex.exec(response);
    if (codeMatch) {
      const content = codeMatch[1];
      // 检查是否以 --- 开头（unified diff 标记）
      if (content.trim().startsWith('---')) {
        return content;
      }
    }

    // 3. 直接查找 diff 格式（没有代码块）
    if (response.trim().startsWith('---')) {
      return response;
    }

    return '';
  }

  /**
   * 解析 diff 文本，提取文件和 hunk
   */
  private static parseDiffText(diffText: string): CodeDiff[] {
    const diffs: CodeDiff[] = [];
    const lines = diffText.split('\n');

    let currentDiff: CodeDiff | null = null;
    let currentHunk: DiffHunk | null = null;
    let hunkLineIndex = 0;
    let hunkOldLine = 0;
    let hunkNewLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 文件头：--- a/path/to/file
      if (line.startsWith('--- a/')) {
        // 保存前一个 diff（如果存在）
        if (currentDiff && currentHunk) {
          currentDiff.hunks.push(currentHunk);
        }
        if (currentDiff) {
          diffs.push(currentDiff);
        }

        const filePath = line.substring(6).trim();
        currentDiff = {
          filePath,
          hunks: [],
          addedLines: 0,
          removedLines: 0,
        };
        currentHunk = null;
        continue;
      }

      // 文件新路径：+++ b/path/to/file（可选的验证）
      if (line.startsWith('+++ b/')) {
        // 验证路径一致
        const newPath = line.substring(6).trim();
        if (currentDiff && newPath !== currentDiff.filePath) {
          log.warn(`Path mismatch: ${currentDiff.filePath} vs ${newPath}`);
        }
        continue;
      }

      // Hunk 头：@@ -oldStart,oldCount +newStart,newCount @@
      if (line.startsWith('@@')) {
        // 保存前一个 hunk
        if (currentHunk) {
          if (currentDiff) {
            currentDiff.hunks.push(currentHunk);
          }
        }

        // 解析新 hunk
        const hunkMatch = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
        if (hunkMatch) {
          const oldStart = parseInt(hunkMatch[1], 10);
          const oldCount = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1;
          const newStart = parseInt(hunkMatch[3], 10);
          const newCount = hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1;

          currentHunk = {
            oldStart,
            oldCount,
            newStart,
            newCount,
            lines: [],
          };
          hunkLineIndex = 0;
          hunkOldLine = oldStart;
          hunkNewLine = newStart;
        }
        continue;
      }

      // 处理 hunk 内的行
      if (currentHunk) {
        if (line.length === 0 && hunkLineIndex === 0) {
          // 跳过空行
          continue;
        }

        // 上下文行：以空格开头
        if (line.startsWith(' ')) {
          currentHunk.lines.push({
            type: 'context',
            content: line.substring(1),
          });
          hunkOldLine++;
          hunkNewLine++;
          hunkLineIndex++;
        }
        // 删除行：以 - 开头
        else if (line.startsWith('-')) {
          currentHunk.lines.push({
            type: 'remove',
            content: line.substring(1),
          });
          currentDiff!.removedLines++;
          hunkOldLine++;
          hunkLineIndex++;
        }
        // 新增行：以 + 开头
        else if (line.startsWith('+')) {
          currentHunk.lines.push({
            type: 'add',
            content: line.substring(1),
          });
          currentDiff!.addedLines++;
          hunkNewLine++;
          hunkLineIndex++;
        }
        // 其他行（可能是空白行或格式问题）
        else if (line === '') {
          // 空行，可能表示 hunk 结束
          continue;
        }
      }
    }

    // 保存最后的 hunk 和 diff
    if (currentHunk) {
      if (currentDiff) {
        currentDiff.hunks.push(currentHunk);
      }
    }
    if (currentDiff) {
      diffs.push(currentDiff);
    }

    return diffs;
  }

  /**
   * 验证解析的 diff 是否合理
   */
  static validate(diff: CodeDiff): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 路径检查
    if (!diff.filePath || diff.filePath.length === 0) {
      errors.push('File path is empty');
    }
    if (diff.filePath && diff.filePath.length > 500) {
      errors.push('File path is too long');
    }

    // Hunk 检查
    if (diff.hunks.length === 0) {
      errors.push('No hunks found in diff');
    }

    for (let i = 0; i < diff.hunks.length; i++) {
      const hunk = diff.hunks[i];

      // 检查行号有效性
      if (hunk.oldStart < 1) {
        errors.push(`Hunk ${i}: old start line must be >= 1`);
      }
      if (hunk.newStart < 1) {
        errors.push(`Hunk ${i}: new start line must be >= 1`);
      }

      // 检查行数一致性
      if (hunk.lines.length === 0) {
        errors.push(`Hunk ${i}: no lines in hunk`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
