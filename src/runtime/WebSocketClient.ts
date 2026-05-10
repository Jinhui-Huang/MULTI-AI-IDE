import { EventEmitter } from 'events';
import { StreamEvent } from '../types/messages';

export class WebSocketClient extends EventEmitter {
  private ws?: WebSocket;
  private reconnect = true;
  constructor(private readonly urlFactory: () => string) { super(); }
  connect(): void {
    const url = this.urlFactory();
    this.ws = new WebSocket(url);
    this.ws.onmessage = (event) => this.emit('event', JSON.parse(String(event.data)) as StreamEvent);
    this.ws.onerror = (event) => this.emit('error', event);
    this.ws.onclose = () => { if (this.reconnect) setTimeout(() => this.connect(), 1500); };
  }
  close(): void { this.reconnect = false; this.ws?.close(); }
}
