import { AIProvider, ChatRequest, StreamChunk } from './types';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';

const providers: Record<string, AIProvider> = {
  anthropic: new AnthropicProvider(),
  openai: new OpenAIProvider(),
  ollama: new OpenAIProvider(),
  gemini: new OpenAIProvider(),
};

const defaultBaseUrls: Record<string, string> = {
  ollama: 'http://localhost:11434/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
};

const noKeyRequired = new Set(['ollama']);

export class AIGateway {
  getProvider(name: string): AIProvider {
    const provider = providers[name];
    if (!provider) {
      throw new Error(`Unknown provider: ${name}. Supported: ${Object.keys(providers).join(', ')}`);
    }
    return provider;
  }

  requiresApiKey(providerName: string): boolean {
    return !noKeyRequired.has(providerName);
  }

  chatStream(
    providerName: string,
    request: ChatRequest,
    apiKey: string,
    baseUrl?: string,
    signal?: AbortSignal,
  ): AsyncIterable<StreamChunk> {
    const provider = this.getProvider(providerName);
    const resolvedBaseUrl = baseUrl || defaultBaseUrls[providerName];
    const resolvedKey = apiKey || 'ollama';
    return provider.chatStream(request, resolvedKey, resolvedBaseUrl, signal);
  }
}
