import type { ExtToWebMsg, WebToExtMsg } from '../../src/types/protocol';

// acquireVsCodeApi 只能调用一次
const vscodeApi = acquireVsCodeApi();

export function postMessage(msg: WebToExtMsg) {
  vscodeApi.postMessage(msg);
}

export function onMessage(handler: (msg: ExtToWebMsg) => void) {
  window.addEventListener('message', (event) => {
    handler(event.data as ExtToWebMsg);
  });
}