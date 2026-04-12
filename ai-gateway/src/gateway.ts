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
    // Check if provider is registered
    if (providers[name]) {
      return providers[name];
    }
    // For unknown providers, assume they are local and use OpenAIProvider
    // This allows user-defined local model providers to work
    return new OpenAIProvider();
  }

  requiresApiKey(providerName: string): boolean {
    // Known providers that don't need API keys
    if (noKeyRequired.has(providerName)) {
      return false;
    }
    // Unknown providers (user-defined local ones) don't need API keys
    if (!Object.prototype.hasOwnProperty.call(providers, providerName)) {
      return false;
    }
    return true;
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
