// Provider 配置类型
export interface ProviderConfig {
  id: string;
  name: string;
  type: 'online' | 'local';
  apiKey?: string;
  baseUrl?: string;
  models: string[];
  defaultModel: string;
  enabled: boolean;
}

export interface AllProvidersConfig {
  providers: ProviderConfig[];
  activeProviderId: string;
  activeModel: string;
}

// 图片附件
export interface ImageAttachment {
  mediaType: string;   // e.g. "image/png"
  data: string;        // base64 (no data: prefix)
  name?: string;
}

// 扩展 → WebView 的消息类型
export type ExtToWebMsg =
  | {
      type: 'init';
      payload: {
        theme: 'light' | 'dark';
        config?: {
          provider: string;
          model: string;
        };
      };
    }
  | { type: 'pong' }
  | { type: 'chat/stream'; payload: { id: string; delta: string } }
  | { type: 'chat/done'; payload: { id: string } }
  | { type: 'chat/error'; payload: { id: string; message: string } }
  | { type: 'chat/clear' }
  | { type: 'settings/providers'; payload: AllProvidersConfig }
  | { type: 'settings/testResult'; payload: { providerId: string; success: boolean; message: string } };

// WebView → 扩展 的消息类型
export type WebToExtMsg =
  | { type: 'ready' }
  | { type: 'ping' }
  | { type: 'chat/send'; payload: { text: string; images?: ImageAttachment[] } }
  | { type: 'chat/cancel'; payload: { id: string } }
  | { type: 'settings/open' }
  | { type: 'settings/getProviders' }
  | { type: 'settings/saveProvider'; payload: ProviderConfig }
  | { type: 'settings/deleteProvider'; payload: { id: string } }
  | { type: 'settings/setActive'; payload: { providerId: string; model: string } }
  | { type: 'settings/testProvider'; payload: { providerId: string } };
