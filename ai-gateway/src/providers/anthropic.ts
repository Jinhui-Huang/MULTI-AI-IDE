import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, ChatRequest, StreamChunk, ContentPart } from '../types';

function toAnthropicContent(content: string | ContentPart[]): string | Anthropic.MessageCreateParams['messages'][number]['content'] {
  if (typeof content === 'string') return content;

  return content.map((part) => {
    if (part.type === 'text') {
      return { type: 'text' as const, text: part.text };
    }
    return {
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: part.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: part.data,
      },
    };
  });
}

export class AnthropicProvider implements AIProvider {
  async *chatStream(
    request: ChatRequest,
    apiKey: string,
    baseUrl?: string,
    signal?: AbortSignal,
  ): AsyncIterable<StreamChunk> {
    const client = new Anthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });

    const systemMsg = request.messages.find((m) => m.role === 'system');
    const messages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: toAnthropicContent(m.content),
      }));

    try {
      const stream = client.messages.stream({
        model: request.model,
        max_tokens: request.maxTokens ?? 4096,
        ...(systemMsg && typeof systemMsg.content === 'string' ? { system: systemMsg.content } : {}),
        messages,
      }, { signal });

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if ('text' in delta) {
            yield { type: 'delta', content: delta.text };
          }
        }
      }
      yield { type: 'done' };
    } catch (err: unknown) {
      if (signal?.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      yield { type: 'error', error: message };
    }
  }
}
