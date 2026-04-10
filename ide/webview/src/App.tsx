import React, { useState, useEffect, useRef } from 'react';
import { postMessage, onMessage } from './vscode';
import type { ExtToWebMsg } from '../../src/types/protocol';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState('');
  const bottomRef               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onMessage((msg: ExtToWebMsg) => {
      switch (msg.type) {
        case 'chat/stream':
          setMessages(prev => prev.map(m =>
            m.id === msg.payload.id
              ? { ...m, content: m.content + msg.payload.delta }
              : m
          ));
          break;
        case 'chat/done':
          break;
        case 'chat/error':
          setMessages(prev => prev.map(m =>
            m.id === msg.payload.id
              ? { ...m, content: `[Error] ${msg.payload.message}` }
              : m
          ));
          break;
      }
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function send() {
    const text = input.trim();
    if (!text) return;
    const id = Date.now().toString();
    setMessages(prev => [
      ...prev,
      { id,            role: 'user',      content: text },
      { id: id + '_r', role: 'assistant', content: '' },
    ]);
    setInput('');
    postMessage({ type: 'chat/send', payload: { text } });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '8px' }}>
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: '8px' }}>
        {messages.map(m => (
          <div key={m.id} style={{ marginBottom: '8px', opacity: m.role === 'user' ? 1 : 0.85 }}>
            <strong>{m.role === 'user' ? 'You' : 'AI'}:</strong>
            <pre style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}>{m.content || '…'}</pre>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', gap: '4px' }}>
        <textarea
          style={{ flex: 1, resize: 'none', height: '60px' }}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask AI... (Enter to send, Shift+Enter for newline)"
        />
        <button onClick={send}>Send</button>
      </div>
    </div>
  );
}
