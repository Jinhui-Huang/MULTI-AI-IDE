import { AIGateway, ChatMessage, ContentPart } from '../../../ai-gateway/src';
import { ConfigManager } from '../core/config';
import { createLogger } from '../core/logger';
import type { ImageAttachment } from '../types/protocol';

const log = createLogger('chatController');

export class ChatController {
  private gateway = new AIGateway();
  private history: ChatMessage[] = [];
  private abortController?: AbortController;
  private readonly maxContextTokens = 4000; // Token budget for context window
  private lastRequestTime = 0;
  private readonly minRequestInterval = 500; // 最少间隔 500ms，防止速率限制

  async *sendMessage(
    text: string,
    images?: ImageAttachment[],
    overrideProvider?: string,
    overrideModel?: string,
  ): AsyncIterable<{ type: 'delta' | 'done' | 'error'; content?: string; error?: string }> {
    const configManager = ConfigManager.getInstance();
    const config = configManager.getConfig();

    // 使用传入的 provider/model，否则使用全局配置
    const activeProvider = overrideProvider || config.provider;
    const activeModel = overrideModel || config.model;

    // 检查请求频率，防止触发速率限制 (429 Error)
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      log.warn(`[sendMessage] Request too frequent, waiting ${waitTime}ms to avoid rate limit`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();

    log.info(`[sendMessage] Using provider=${activeProvider}, model=${activeModel} (override=${!!overrideProvider})`);

    const apiKey = await configManager.getApiKeyForProvider(activeProvider);

    if (!apiKey && this.gateway.requiresApiKey(activeProvider)) {
      yield { type: 'error', error: `API key not set for ${activeProvider}. Open Settings to configure.` };
      return;
    }

    const providers = await configManager.getProviderConfigs();
    const providerConfig = providers.find((p) => p.id === activeProvider);
    const baseUrl = providerConfig?.baseUrl || undefined;

    let content: string | ContentPart[];
    if (images && images.length > 0) {
      const parts: ContentPart[] = images.map((img) => ({
        type: 'image' as const,
        mediaType: img.mediaType,
        data: img.data,
      }));
      if (text.trim()) {
        parts.push({ type: 'text' as const, text });
      }
      content = parts;
    } else {
      content = text;
    }

    this.history.push({ role: 'user', content });

    this.abortController = new AbortController();

    log.info(`Sending to ${activeProvider}/${activeModel}${images?.length ? ` with ${images.length} image(s)` : ''}`);

    let fullResponse = '';

    try {
      // Get system prompt and prepend it to messages
      const systemPrompt = await configManager.getSystemPrompt();

      // Trim conversation history to fit within token budget
      const trimmedHistory = this.trimMessages(this.history, this.maxContextTokens);

      const messagesWithSystem: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...trimmedHistory,
      ];

      log.info(`[sendMessage] Calling gateway.chatStream with messages=${messagesWithSystem.length}, baseUrl=${baseUrl}`);

      // 确保有有效的 API Key（Ollama 使用默认值，其他 Provider 需要真实 Key）
      if (!apiKey && this.gateway.requiresApiKey(activeProvider)) {
        log.error(`[sendMessage] No API Key for provider=${activeProvider}`);
        yield { type: 'error', error: `API key not set for ${activeProvider}. Open Settings to configure.` };
        return;
      }

      const stream = this.gateway.chatStream(
        activeProvider,
        {
          messages: messagesWithSystem,
          model: activeModel,
        },
        apiKey || 'ollama',
        baseUrl,
        this.abortController.signal,
      );

      log.info(`[sendMessage] Stream created, starting iteration...`);

      let chunkCount = 0;
      for await (const chunk of stream) {
        chunkCount++;
        if (chunk.type === 'delta' && chunk.content) {
          log.info(`[sendMessage] Delta chunk ${chunkCount}: ${chunk.content.length} chars`);
          fullResponse += chunk.content;
          yield chunk;
        } else if (chunk.type === 'error') {
          log.error(`[sendMessage] Error chunk: ${chunk.error}`);
          yield chunk;
          return;
        }
      }
      log.info(`[sendMessage] Stream completed, total chunks=${chunkCount}`);

      this.history.push({ role: 'assistant', content: fullResponse });
      yield { type: 'done' };
    } catch (err: unknown) {
      if (this.abortController.signal.aborted) {
        yield { type: 'done' };
        return;
      }
      const message = err instanceof Error ? err.message : String(err);

      // 处理速率限制错误
      if (message.includes('429')) {
        const helpMessage = `API 速率限制 (429)：您的请求过于频繁。\n\n可能的原因：\n1. 请求发送过快 - 请等待几秒后重试\n2. 免费额度已用完 - 请检查您的API配额\n3. 账户速率限制 - 请稍后重试\n\n建议：等待 30-60 秒后重新尝试，或检查您的 ${activeProvider} API 账户配额。`;
        log.error(`Chat error (Rate Limited): ${message}`);
        yield { type: 'error', error: helpMessage };
        return;
      }

      log.error(`Chat error: ${message}`);
      yield { type: 'error', error: message };
    }
  }

  cancel() {
    this.abortController?.abort();
    this.abortController = undefined;
  }

  clearHistory() {
    this.history = [];
    log.info('Chat history cleared');
  }

  // ==================== Context Management ====================

  /**
   * Estimate token count for a message
   * Rough estimation: 1 token ≈ 4 characters
   */
  private estimateTokens(msg: ChatMessage): number {
    let content = '';
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content
        .map((part) => {
          if (part.type === 'text') return part.text;
          if (part.type === 'image') return '[image]'; // Images count minimal tokens
          return '';
        })
        .join('');
    }
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(content.length / 4);
  }

  /**
   * Trim messages to fit within token budget
   * Keeps system prompt + most recent messages
   */
  private trimMessages(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
    let tokenCount = 0;
    const result: ChatMessage[] = [];

    // Reverse iterate to keep most recent messages
    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = this.estimateTokens(messages[i]);
      if (tokenCount + msgTokens > maxTokens && result.length > 0) {
        // Stop if adding this message would exceed budget (but keep at least one message)
        break;
      }
      result.unshift(messages[i]);
      tokenCount += msgTokens;
    }

    log.info(`Context window: ${tokenCount}/${maxTokens} tokens, ${result.length} messages`);
    return result;
  }
}
