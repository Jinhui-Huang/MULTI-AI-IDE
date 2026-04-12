import { ChatController } from '../chat/chatController';
import { createLogger } from '../core/logger';
import { CodeDiff } from '../types/protocol';
import { ContextCollector, CollectedContext } from './contextCollector';
import { SearchReplaceApplier, ApplySearchReplaceResult } from './searchReplaceApplier';
import { SearchReplaceParser, SearchReplaceBlock } from './searchReplaceParser';
import { CodeEditPromptBuilder } from './promptBuilder';

const log = createLogger('CodeEditAgent');

/**
 * 代码修改请求检测关键词
 */
const CODE_EDIT_KEYWORDS = [
  // 英文
  'add', 'modify', 'fix', 'refactor', 'rename', 'delete', 'remove', 'implement', 'update', 'change',
  'improve', 'optimize', 'replace', 'rewrite', 'convert', 'transform', 'move', 'copy',
  // 中文
  '添加', '修改', '修复', '重构', '重命名', '删除', '移除', '实现', '更新', '改变',
  '改', '优化', '替换', '重写', '转换', '移动', '复制',
  '给', '帮我', '加个', '改成', '写个', '生成',
];

export interface CodeEditRequest {
  userText: string;
  currentFilePath?: string;
  provider: string;
  model: string;
}

export interface CodeEditResult {
  success: boolean;
  diffs?: CodeDiff[];
  blocks?: SearchReplaceBlock[]; // 原始 SEARCH/REPLACE 块，用于应用
  error?: string;
  rawResponse?: string;
  isCodeRequest: boolean;
}

export interface ApplyResult {
  success: boolean;
  appliedFiles?: string[];
  error?: string;
}

/**
 * 代码编辑代理
 * 整合上下文收集、提示词构造、LLM 调用、diff 解析的完整流程
 */
export class CodeEditAgent {
  private chatController: ChatController;
  private projectRoot: string;
  private contextCollector: ContextCollector;

  constructor(projectRoot: string, chatController: ChatController) {
    this.projectRoot = projectRoot;
    this.chatController = chatController;
    this.contextCollector = new ContextCollector(projectRoot);

    log.info(`CodeEditAgent initialized with project root: ${projectRoot}`);
  }

  /**
   * 检测是否为代码修改请求
   */
  isCodeEditRequest(userText: string): boolean {
    const lowerText = userText.toLowerCase();
    const matchedKeywords = CODE_EDIT_KEYWORDS.filter((keyword) => lowerText.includes(keyword));

    if (matchedKeywords.length > 0) {
      log.debug(`Detected code edit request with keywords: ${matchedKeywords.join(', ')}`);
      return true;
    }

    return false;
  }

  /**
   * 分析用户请求并生成 diff
   * 不立即应用，只返回 diff 供用户预览
   */
  async analyze(req: CodeEditRequest): Promise<CodeEditResult> {
    log.info(`[ANALYZE] Starting analysis`);
    log.info(`[ANALYZE] Request: "${req.userText.substring(0, 50)}..."`);
    log.info(`[ANALYZE] Provider: ${req.provider}, Model: ${req.model}`);
    log.info(`[ANALYZE] CurrentFile: ${req.currentFilePath}`);

    const isCodeRequest = this.isCodeEditRequest(req.userText);
    log.info(`[ANALYZE] isCodeRequest: ${isCodeRequest}`);

    // 如果没有当前文件或不是代码编辑请求，返回失败让调用者走普通聊天路径
    if (!req.currentFilePath || !isCodeRequest) {
      return {
        success: false,
        isCodeRequest,
        error: 'Not a code edit request or no current file',
      };
    }

    try {
      // 1. 收集代码上下文
      log.info(`[ANALYZE] 📂 Collecting context...`);
      const context = await this.contextCollector.collect(req.currentFilePath);
      log.info(`[ANALYZE]    ✓ Collected ${context.totalTokens}/${context.tokenBudget} tokens from ${context.relatedFiles.length + 1} files`);

      // 2. 检测 LLM 类型，构建提示词
      log.info(`[ANALYZE] 🔨 Building prompts...`);
      const llmType = CodeEditPromptBuilder.detectType(req.provider);
      const systemPrompt = CodeEditPromptBuilder.buildSystemPrompt(llmType);
      const userPrompt = CodeEditPromptBuilder.buildUserPrompt(context, req.userText);
      log.info(`[ANALYZE]    ✓ Built for LLM type: ${llmType}`);
      log.info(`[ANALYZE]    System prompt length: ${systemPrompt.length}, User prompt length: ${userPrompt.length}`);

      // 3. 调用 LLM
      log.info(`🤖 Calling LLM (${req.provider}/${req.model})...`);
      let llmResponse: string;
      try {
        llmResponse = await this.callLLM(systemPrompt, userPrompt, req.provider);
        log.info(`   ✓ Received response (${llmResponse.length} chars)`);

        if (!llmResponse || llmResponse.length === 0) {
          return {
            success: false,
            isCodeRequest: true,
            error: 'LLM returned empty response',
          };
        }
      } catch (llmError) {
        const err = llmError as { message: string };
        log.error(`LLM call failed: ${err.message}`);
        return {
          success: false,
          isCodeRequest: true,
          error: `LLM call failed: ${err.message}`,
        };
      }

      // 4. 解析 SEARCH/REPLACE 块
      log.info(`📋 Parsing SEARCH/REPLACE blocks...`);
      const parseResult = SearchReplaceParser.parse(llmResponse);

      if (!parseResult.success) {
        log.warn(`   ✗ Parse failed: ${parseResult.error}`);
        return {
          success: false,
          isCodeRequest: true,
          error: parseResult.error,
          rawResponse: llmResponse,
        };
      }

      log.info(`   ✓ Parsed ${parseResult.blocks.length} SEARCH/REPLACE blocks successfully`);
      parseResult.blocks.forEach((block, i) => {
        log.info(`     [${i + 1}] search: ${block.search.length} chars, replace: ${block.replace.length} chars`);
      });

      // 转换为 CodeDiff 格式以保持兼容性（用于 UI 展示）
      const diffs = this.convertBlocksToDiffs(req.currentFilePath!, parseResult.blocks);

      return {
        success: true,
        isCodeRequest: true,
        diffs,
        blocks: parseResult.blocks, // 保存原始块以供应用
        rawResponse: llmResponse,
      };
    } catch (error) {
      const err = error as { message: string };
      log.error(`Analysis failed: ${err.message}`);
      return {
        success: false,
        isCodeRequest: true,
        error: err.message,
      };
    }
  }

  /**
   * 应用 SEARCH/REPLACE 块到文件
   * diffs 是从 analyze 返回的 CodeDiff 格式（用于 UI 展示）
   * 但实际应用时需要从原始块中提取真实数据
   */
  async applyDiffs(diffs: CodeDiff[], blocks?: SearchReplaceBlock[]): Promise<ApplyResult> {
    log.info(`[SR-APPLY] Applying ${blocks?.length || diffs.length} modifications...`);

    if (!blocks || blocks.length === 0) {
      return {
        success: false,
        error: 'No search/replace blocks provided',
      };
    }

    const appliedFiles: string[] = [];
    const errors: string[] = [];

    // 按文件分组块（暂时假设所有块都针对当前文件）
    const applier = new SearchReplaceApplier(this.projectRoot);

    try {
      // 应用所有块到当前文件
      const filePath = diffs[0].filePath;
      const result = await applier.apply(filePath, blocks);

      if (result.success) {
        appliedFiles.push(result.filePath);
        log.info(`[SR-APPLY] ✓ Applied ${result.appliedBlocks}/${blocks.length} blocks to ${result.filePath}`);

        if (result.failedBlocks.length > 0) {
          result.failedBlocks.forEach((failed) => {
            errors.push(`Block ${failed.blockIndex}: ${failed.error}`);
            log.warn(`[SR-APPLY] Block ${failed.blockIndex} failed: ${failed.error}`);
          });
        }
      } else {
        errors.push(`${filePath}: ${result.error}`);
        log.error(`[SR-APPLY] ✗ Failed to apply blocks: ${result.error}`);
      }
    } catch (error) {
      const err = error as { message: string };
      errors.push(`Error: ${err.message}`);
      log.error(`[SR-APPLY] ✗ Exception: ${err.message}`);
    }

    if (appliedFiles.length === 0) {
      return {
        success: false,
        error: errors.length > 0 ? errors[0] : 'Failed to apply modifications',
      };
    }

    return {
      success: true,
      appliedFiles,
    };
  }

  /**
   * 将 SEARCH/REPLACE 块转换为 CodeDiff 格式（用于 UI 展示）
   */
  private convertBlocksToDiffs(filePath: string, blocks: SearchReplaceBlock[]): CodeDiff[] {
    log.debug(`[SR-CONVERT] Converting ${blocks.length} blocks to CodeDiff format`);

    const diffs: CodeDiff[] = [];

    for (const block of blocks) {
      const searchLines = block.search.split('\n');
      const replaceLines = block.replace.split('\n');

      // 简单计算：删除的行数 = search 行数 - 1（合并相同部分）
      // 新增的行数 = replace 行数
      const addedLines = Math.max(0, replaceLines.length - searchLines.length);
      const removedLines = Math.max(0, searchLines.length - replaceLines.length);

      diffs.push({
        filePath,
        hunks: [
          {
            oldStart: 1,
            oldCount: searchLines.length,
            newStart: 1,
            newCount: replaceLines.length,
            lines: this.createDiffLines(block),
          },
        ],
        addedLines,
        removedLines,
      });
    }

    return diffs;
  }

  /**
   * 从 SEARCH/REPLACE 块创建 DiffLine 数组（用于 UI 展示）
   */
  private createDiffLines(block: SearchReplaceBlock) {
    const lines: Array<{ type: 'context' | 'add' | 'remove'; content: string }> = [];

    const searchLines = block.search.split('\n');
    const replaceLines = block.replace.split('\n');

    // 标记已删除的行
    for (const line of searchLines) {
      lines.push({ type: 'remove', content: line });
    }

    // 标记已新增的行
    for (const line of replaceLines) {
      lines.push({ type: 'add', content: line });
    }

    return lines;
  }

  /**
   * 调用 LLM 获取响应
   * 使用 ChatController 的流式能力
   * 添加超时保护防止无限等待
   */
  private async callLLM(systemPrompt: string, userPrompt: string, provider: string): Promise<string> {
    let fullResponse = '';
    let streamComplete = false;
    let streamError: string | null = null;

    // 在用户提示词前加上系统提示词
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    log.debug(`[LLM] System prompt: ${systemPrompt.substring(0, 100)}...`);
    log.debug(`[LLM] User prompt: ${userPrompt.substring(0, 100)}...`);
    log.info(`[LLM] Starting stream with prompt length: ${fullPrompt.length}`);

    // 设置超时 - Gemini 可能需要更长时间（60 秒）
    const isGemini = provider?.toLowerCase().includes('gemini') ?? false;
    const timeoutMs = isGemini ? 60000 : 45000; // Gemini: 60s, 其他: 45s

    log.info(`[LLM] Using ${timeoutMs}ms timeout for ${provider}`);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`LLM stream timeout after ${timeoutMs}ms - no response from API (provider: ${provider})`));
      }, timeoutMs);
    });

    try {
      const stream = this.chatController.sendMessage(fullPrompt);

      // 使用 Promise.race 实现超时
      const streamPromise = (async () => {
        let chunkCount = 0;

        for await (const chunk of stream) {
          chunkCount++;

          if (chunk.type === 'delta') {
            fullResponse += chunk.content || '';
            log.debug(`[LLM] Delta chunk ${chunkCount}: ${chunk.content?.length || 0} chars`);
          } else if (chunk.type === 'done') {
            log.info(`[LLM] Stream done after ${chunkCount} chunks`);
            streamComplete = true;
            break;
          } else if (chunk.type === 'error') {
            streamError = chunk.error || 'Unknown error';
            log.error(`[LLM] Stream error: ${streamError}`);
            throw new Error(streamError);
          } else {
            // Log unknown chunk types for debugging
            log.debug(`[LLM] Received chunk type: ${(chunk as any).type}, keys: ${Object.keys(chunk).join(', ')}`);
          }
        }

        if (!streamComplete && chunkCount === 0) {
          log.warn(`[LLM] No chunks received from stream`);
        }
      })();

      // 等待流完成或超时
      await Promise.race([streamPromise, timeoutPromise]);

      if (streamError) {
        throw new Error(streamError);
      }

      // 即使没有 'done' 信号，只要有内容就算成功
      if (fullResponse && fullResponse.length > 0) {
        log.info(`[LLM] Total response: ${fullResponse.length} chars, streamComplete: ${streamComplete}`);
        return fullResponse;
      }

      // 只有在确实没有任何内容时才报错
      log.error('[LLM] Received empty response from LLM (chunkCount: 0, fullResponse length: 0)');
      throw new Error('LLM returned empty response');
    } catch (error) {
      const err = error as { message: string };
      log.error(`[LLM] Stream error: ${err.message}`);
      throw error;
    }
  }
}
