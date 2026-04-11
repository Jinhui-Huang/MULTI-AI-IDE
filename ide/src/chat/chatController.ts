import { AIGateway, ChatMessage, ContentPart } from '../../../ai-gateway/src';
import { ConfigManager } from '../core/config';
import { createLogger } from '../core/logger';
import type { ImageAttachment } from '../types/protocol';

const log = createLogger('chatController');

export class ChatController {
  private gateway = new AIGateway();
  private history: ChatMessage[] = [];
  private abortController?: AbortController;

  async *sendMessage(text: string, images?: ImageAttachment[]): AsyncIterable<{ type: 'delta' | 'done' | 'error'; content?: string; error?: string }> {
    const configManager = ConfigManager.getInstance();
    const config = configManager.getConfig();
    const apiKey = await configManager.getApiKeyForProvider(config.provider);

    if (!apiKey && this.gateway.requiresApiKey(config.provider)) {
      yield { type: 'error', error: `API key not set for ${config.provider}. Open Settings to configure.` };
      return;
    }

    const providers = await configManager.getProviderConfigs();
    const providerConfig = providers.find((p) => p.id === config.provider);
    const baseUrl = config.baseUrl || providerConfig?.baseUrl || undefined;

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

    log.info(`Sending to ${config.provider}/${config.model}${images?.length ? ` with ${images.length} image(s)` : ''}`);

    let fullResponse = '';

    try {
      const stream = this.gateway.chatStream(
        config.provider,
        {
          messages: [...this.history],
          model: config.model,
        },
        apiKey || 'ollama',
        baseUrl,
        this.abortController.signal,
      );

      for await (const chunk of stream) {
        if (chunk.type === 'delta' && chunk.content) {
          fullResponse += chunk.content;
          yield chunk;
        } else if (chunk.type === 'error') {
          yield chunk;
          return;
        }
      }

      this.history.push({ role: 'assistant', content: fullResponse });
      yield { type: 'done' };
    } catch (err: unknown) {
      if (this.abortController.signal.aborted) {
        yield { type: 'done' };
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
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
}
