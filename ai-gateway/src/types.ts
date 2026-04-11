export interface ImageContent {
  type: 'image';
  mediaType: string;   // e.g. "image/png", "image/jpeg"
  data: string;        // base64 encoded
}

export interface TextContent {
  type: 'text';
  text: string;
}

export type ContentPart = TextContent | ImageContent;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  model: string;
  maxTokens?: number;
}

export interface StreamChunk {
  type: 'delta' | 'done' | 'error';
  content?: string;
  error?: string;
}

export interface AIProvider {
  chatStream(
    request: ChatRequest,
    apiKey: string,
    baseUrl?: string,
    signal?: AbortSignal,
  ): AsyncIterable<StreamChunk>;
}
