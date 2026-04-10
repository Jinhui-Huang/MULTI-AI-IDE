// 扩展 → WebView 的消息类型
export type ExtToWebMsg =
  | { type: 'init';         payload: { theme: 'light' | 'dark' } }
  | { type: 'chat/stream';  payload: { id: string; delta: string } }
  | { type: 'chat/done';    payload: { id: string } }
  | { type: 'chat/error';   payload: { id: string; message: string } };

// WebView → 扩展 的消息类型
export type WebToExtMsg =
  | { type: 'chat/send';    payload: { text: string } }
  | { type: 'chat/cancel';  payload: { id: string } }
  | { type: 'ready' };