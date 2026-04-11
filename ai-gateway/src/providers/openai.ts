import OpenAI from 'openai';
import { AIProvider, ChatRequest, StreamChunk, ContentPart } from '../types';
import type { ChatCompletionMessageParam, ChatCompletionContentPart } from 'openai/resources/chat/completions';

function toOpenAIContent(content: string | ContentPart[]): string | ChatCompletionContentPart[] {
  if (typeof content === 'string') return content;

  return content.map((part): ChatCompletionContentPart => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text };
    }
    return {
      type: 'image_url',
      image_url: { url: `data:${part.mediaType};base64,${part.data}` },
    };
  });
}

export class OpenAIProvider implements AIProvider {
  async *chatStream(
    request: ChatRequest,
    apiKey: string,
    baseUrl?: string,
    signal?: AbortSignal,
  ): AsyncIterable<StreamChunk> {
    const client = new OpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });

    const messages: ChatCompletionMessageParam[] = request.messages.map((m) => ({
      role: m.role,
      content: toOpenAIContent(m.content),
    } as ChatCompletionMessageParam));

    try {
      const stream = await client.chat.completions.create({
        model: request.model,
        max_tokens: request.maxTokens ?? 4096,
        messages,
        stream: true,
      }, { signal });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield { type: 'delta', content: delta };
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
