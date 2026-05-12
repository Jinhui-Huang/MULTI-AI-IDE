import WebSocket from 'ws';

export class WebSocketClient {
  private ws?: WebSocket;

  connect(
    url: string,
    onEvent: (event: unknown) => void,
    onError?: (error: Error) => void
  ): void {
    this.close();
    this.ws = new WebSocket(url);
    this.ws.on('open', () => console.log('WebSocket connected'));
    this.ws.on('message', (data) => {
      try {
        onEvent(JSON.parse(data.toString()));
      } catch (error) {
        const parseError = error instanceof Error ? error : new Error(String(error));
        if (onError) {
          onError(parseError);
          return;
        }
        console.warn(`WebSocket message parse failed: ${parseError.message}`);
      }
    });
    this.ws.on('error', (error) => {
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    });
    this.ws.on('close', () => console.log('WebSocket closed'));
  }

  close(): void {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
      this.ws.close();
    }
    this.ws = undefined;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
