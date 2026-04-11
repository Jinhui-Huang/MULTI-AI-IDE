import type { ExtToWebMsg, WebToExtMsg } from '../../src/types/protocol';

interface VsCodeApi {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
    __vscodeApi?: VsCodeApi;
  }
}

// acquireVsCodeApi 全局只能调用一次 —— 缓存到 window 上以防模块被重复求值
const vscodeApi: VsCodeApi =
  window.__vscodeApi ??
  (window.__vscodeApi =
    window.acquireVsCodeApi?.() ?? { postMessage: () => {}, getState: () => undefined, setState: () => {} });

export function postMessage(msg: WebToExtMsg) {
  vscodeApi.postMessage(msg);
}

export function onMessage(handler: (msg: ExtToWebMsg) => void) {
  window.addEventListener('message', (event) => {
    handler(event.data as ExtToWebMsg);
  });
}