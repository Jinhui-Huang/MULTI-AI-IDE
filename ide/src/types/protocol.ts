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

// Unified Diff 格式相关类型
export interface DiffLine {
  type: 'context' | 'add' | 'remove';
  content: string;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface CodeDiff {
  filePath: string;
  hunks: DiffHunk[];
  addedLines: number;
  removedLines: number;
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
  | { type: 'chat/operationButtons'; payload: { id: string; buttons: Array<{ id: string; label: string; action: string; style: string }> } }
  | { type: 'code/diffPreview'; payload: { messageId: string; diffs: CodeDiff[] } }
  | { type: 'code/applyResult'; payload: { success: boolean; appliedFiles?: string[]; error?: string } }
  | { type: 'current_file_changed'; payload: { filePath: string | null; fileName: string | null; exists: boolean } }
  | { type: 'settings/providers'; payload: AllProvidersConfig }
  | { type: 'settings/testResult'; payload: { providerId: string; success: boolean; message: string } }
  | { type: 'settings/detectResult'; payload: { success: boolean; providers?: ProviderConfig[]; message: string } };

// WebView → 扩展 的消息类型
export type WebToExtMsg =
  | { type: 'ready' }
  | { type: 'ping' }
  | { type: 'chat/send'; payload: { text: string; images?: ImageAttachment[] } }
  | { type: 'chat/cancel'; payload: { id: string } }
  | { type: 'chat/applyOperations'; payload: {} }
  | { type: 'chat/cancelOperations'; payload: {} }
  | { type: 'chat/autoApply'; payload: {} }
  | { type: 'code/applyDiffs'; payload: { messageId: string } }
  | { type: 'code/rejectDiffs'; payload: { messageId: string } }
  | { type: 'settings/open' }
  | { type: 'settings/getProviders' }
  | { type: 'settings/saveProvider'; payload: ProviderConfig }
  | { type: 'settings/deleteProvider'; payload: { id: string } }
  | { type: 'settings/setActive'; payload: { providerId: string; model: string } }
  | { type: 'settings/testProvider'; payload: { providerId: string } };
