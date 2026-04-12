import { ChatController } from '../chat/chatController';
import { createLogger } from '../core/logger';
import { CodeDiff } from '../types/protocol';
import { ContextCollector, CollectedContext } from './contextCollector';
import { DiffApplier, ApplyDiffResult } from './diffApplier';
import { DiffParser, DiffParseResult } from './diffParser';
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
        llmResponse = await this.callLLM(systemPrompt, userPrompt);
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

      // 4. 解析 diff
      log.info(`📋 Parsing diff format...`);
      const parseResult = DiffParser.parse(llmResponse);

      if (!parseResult.success) {
        log.warn(`   ✗ Parse failed: ${parseResult.error}`);
        return {
          success: false,
          isCodeRequest: true,
          error: parseResult.error,
          rawResponse: llmResponse,
        };
      }

      log.info(`   ✓ Parsed ${parseResult.diffs.length} diffs successfully`);
      parseResult.diffs.forEach((diff, i) => {
        log.info(`     [${i + 1}] ${diff.filePath}: +${diff.addedLines}/-${diff.removedLines}`);
      });

      return {
        success: true,
        isCodeRequest: true,
        diffs: parseResult.diffs,
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
   * 应用 diff 到文件
   */
  async applyDiffs(diffs: CodeDiff[]): Promise<ApplyResult> {
    log.info(`Applying ${diffs.length} diffs...`);

    const appliedFiles: string[] = [];
    const errors: string[] = [];

    const applier = new DiffApplier(this.projectRoot);

    for (const diff of diffs) {
      try {
        const result = await applier.apply(diff);

        if (result.success) {
          appliedFiles.push(result.filePath);
          log.info(`✓ Applied ${result.filePath}`);
        } else {
          errors.push(`${diff.filePath}: ${result.error}`);
          log.error(`✗ Failed to apply ${diff.filePath}: ${result.error}`);
        }
      } catch (error) {
        const err = error as { message: string };
        errors.push(`${diff.filePath}: ${err.message}`);
        log.error(`✗ Error applying ${diff.filePath}: ${err.message}`);
      }
    }

    if (appliedFiles.length === 0 && errors.length > 0) {
      return {
        success: false,
        error: `Failed to apply diffs: ${errors.join('; ')}`,
      };
    }

    return {
      success: true,
      appliedFiles,
    };
  }

  /**
   * 调用 LLM 获取响应
   * 使用 ChatController 的流式能力
   */
  private async callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
    let fullResponse = '';

    // 在用户提示词前加上系统提示词
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    log.debug(`[LLM] System prompt: ${systemPrompt.substring(0, 100)}...`);
    log.debug(`[LLM] User prompt: ${userPrompt.substring(0, 100)}...`);

    const stream = this.chatController.sendMessage(fullPrompt);

    for await (const chunk of stream) {
      if (chunk.type === 'delta') {
        fullResponse += chunk.content || '';
        log.debug(`[LLM] Delta: ${chunk.content?.length || 0} chars`);
      } else if (chunk.type === 'done') {
        log.debug(`[LLM] Stream done`);
      } else if (chunk.type === 'error') {
        log.error(`[LLM] Stream error: ${chunk.error}`);
        throw new Error(chunk.error || 'LLM stream error');
      }
    }

    log.debug(`[LLM] Total response: ${fullResponse.length} chars`);
    return fullResponse;
  }
}
