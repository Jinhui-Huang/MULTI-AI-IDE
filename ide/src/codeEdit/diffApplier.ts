import * as path from 'path';
import { AgentRuntime } from '../agent/agentRuntime';
import { createLogger } from '../core/logger';
import { CodeDiff, DiffHunk } from '../types/protocol';

const log = createLogger('DiffApplier');

export interface ApplyDiffResult {
  success: boolean;
  filePath: string;
  originalContent: string;
  newContent: string;
  error?: string;
  appliedHunks?: number;
}

/**
 * Diff 应用器
 * 将 unified diff patch 应用到文件
 */
export class DiffApplier {
  private runtime: AgentRuntime;

  constructor(projectRoot: string) {
    this.runtime = new AgentRuntime(projectRoot);
  }

  /**
   * 应用单个 diff 到文件
   */
  async apply(diff: CodeDiff): Promise<ApplyDiffResult> {
    log.info(`Applying diff to: ${diff.filePath}`);

    try {
      // 1. 解析文件路径（处理 a/ b/ 前缀）
      const filePath = this.normalizePath(diff.filePath);
      log.debug(`Normalized path: ${filePath}`);

      // 2. 读取原文件
      let originalContent: string;
      try {
        originalContent = await this.runtime.readFile(filePath);
      } catch (error) {
        log.warn(`File not found: ${filePath}, treating as new file`);
        originalContent = '';
      }

      // 3. 应用所有 hunk
      let newContent = originalContent;
      let appliedHunks = 0;

      // 从后往前应用 hunk，避免行号偏移问题
      for (let i = diff.hunks.length - 1; i >= 0; i--) {
        const hunk = diff.hunks[i];

        try {
          newContent = this.applyHunk(newContent, hunk);
          appliedHunks++;
          log.debug(`Applied hunk ${i} (${hunk.lines.length} lines)`);
        } catch (error) {
          const err = error as { message: string };
          log.error(`Failed to apply hunk ${i}: ${err.message}`);
          throw new Error(`Failed to apply hunk ${i}: ${err.message}`);
        }
      }

      // 4. 写入文件
      await this.runtime.writeFile(filePath, newContent);
      log.info(`File updated: ${filePath} (${appliedHunks} hunks applied)`);

      return {
        success: true,
        filePath,
        originalContent,
        newContent,
        appliedHunks,
      };
    } catch (error) {
      const err = error as { message: string };
      log.error(`Apply failed: ${err.message}`);
      return {
        success: false,
        filePath: diff.filePath,
        originalContent: '',
        newContent: '',
        error: err.message,
      };
    }
  }

  /**
   * 应用单个 hunk 到文件内容
   * 支持灵活的上下文行匹配（忽略尾部空格）
   */
  private applyHunk(content: string, hunk: DiffHunk): string {
    const lines = content.split('\n');

    // 找到 hunk 的起始行
    // 注意：hunk.oldStart 是 1-indexed，而数组是 0-indexed
    let hunkStartLine = hunk.oldStart - 1;

    log.debug(`Applying hunk: oldStart=${hunk.oldStart}, oldCount=${hunk.oldCount}, newStart=${hunk.newStart}, newCount=${hunk.newCount}`);
    log.debug(`File has ${lines.length} lines, hunk starts at line ${hunkStartLine + 1}`);

    // 尝试通过 context 行找到正确的起始行（处理行号偏移）
    const contextLines = hunk.lines.filter(l => l.type === 'context');

    if (contextLines.length > 0 && hunkStartLine >= 0) {
      // 尝试精确匹配
      let matchFound = true;

      // 先尝试原始行号
      for (let i = 0; i < contextLines.length && hunkStartLine + i < lines.length; i++) {
        const fileLine = lines[hunkStartLine + i];
        const diffLine = contextLines[i].content;
        if (fileLine.trim() !== diffLine.trim()) {
          matchFound = false;
          break;
        }
      }

      // 如果精确匹配失败，尝试在前后50行范围内找匹配位置
      if (!matchFound && contextLines.length > 0) {
        log.debug(`Exact match failed, searching in range [${Math.max(0, hunkStartLine - 50)}, ${Math.min(lines.length, hunkStartLine + 50)}]`);

        const firstContextLine = contextLines[0].content.trim();
        const searchStart = Math.max(0, hunkStartLine - 50);
        const searchEnd = Math.min(lines.length, hunkStartLine + 50);

        for (let i = searchStart; i < searchEnd; i++) {
          if (lines[i].trim() === firstContextLine) {
            // 验证后续行也匹配
            let allMatch = true;
            for (let j = 0; j < contextLines.length && i + j < lines.length; j++) {
              if (lines[i + j].trim() !== contextLines[j].content.trim()) {
                allMatch = false;
                break;
              }
            }

            if (allMatch) {
              log.debug(`Found matching context at line ${i + 1}, adjusting hunk start`);
              hunkStartLine = i;
              matchFound = true;
              break;
            }
          }
        }

        if (!matchFound) {
          log.warn(`Could not find matching context lines, proceeding with original position`);
        }
      }
    }

    // 应用 hunk（更宽松的验证）
    let deleteCount = 0;
    const insertLines: string[] = [];
    let currentLineIndex = 0;

    for (const diffLine of hunk.lines) {
      if (diffLine.type === 'context') {
        const fileLine = lines[hunkStartLine + currentLineIndex];
        if (fileLine !== undefined) {
          insertLines.push(fileLine); // 使用原文件的行（保留原始格式）
        } else {
          insertLines.push(diffLine.content); // 回退到 diff 中的行
        }
        deleteCount++;
        currentLineIndex++;
      } else if (diffLine.type === 'remove') {
        deleteCount++;
        currentLineIndex++;
      } else if (diffLine.type === 'add') {
        insertLines.push(diffLine.content);
      }
    }

    // 执行替换
    if (hunkStartLine + deleteCount > lines.length) {
      log.warn(`Hunk extends beyond file (hunkStartLine=${hunkStartLine}, deleteCount=${deleteCount}, fileLines=${lines.length})`);
      deleteCount = Math.max(0, lines.length - hunkStartLine);
    }

    lines.splice(hunkStartLine, deleteCount, ...insertLines);

    return lines.join('\n');
  }

  /**
   * 标准化文件路径
   * 处理 --- a/ 和 +++ b/ 前缀，以及路径格式
   */
  private normalizePath(filePath: string): string {
    let normalized = filePath;

    // 移除 a/ 或 b/ 前缀
    if (normalized.startsWith('a/')) {
      normalized = normalized.substring(2);
    } else if (normalized.startsWith('b/')) {
      normalized = normalized.substring(2);
    }

    // 移除开头的 / 或 \ （如果有的话）
    // 确保路径是相对路径而不是绝对路径
    while (normalized.startsWith('/') || normalized.startsWith('\\')) {
      normalized = normalized.substring(1);
    }

    // 统一路径分隔符为 /（用于 AgentRuntime）
    normalized = normalized.replace(/\\/g, '/');

    log.debug(`normalizePath: "${filePath}" -> "${normalized}"`);
    return normalized;
  }
}
