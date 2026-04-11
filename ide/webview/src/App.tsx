import { useState, useEffect, useRef } from 'react';
import { postMessage } from './vscode';

interface InitPayload {
  theme: 'light' | 'dark';
  config?: {
    provider: string;
    model: string;
  };
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [config, setConfig] = useState<{ provider: string; model: string } | undefined>();
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'testing' | 'disconnected'>('disconnected');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 初始化 WebView
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      switch (msg.type) {
        case 'init':
          const payload = msg.payload as InitPayload;
          setTheme(payload.theme);
          if (payload.config) {
            setConfig(payload.config);
          }
          setConnectionStatus('connected');
          break;
        case 'pong':
          setConnectionStatus('connected');
          break;
        case 'chat/stream':
          // 实时流更新
          break;
        case 'chat/done':
          setIsLoading(false);
          break;
        case 'chat/error':
          setIsLoading(false);
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // 通知 extension WebView 已准备好
    postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // 发送消息到 extension
    postMessage({
      type: 'chat/send',
      payload: { text: input },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTestConnection = async () => {
    setConnectionStatus('testing');
    postMessage({ type: 'ping' });
    // 设置超时，如果 3 秒内没有收到 pong，则认为连接失败
    setTimeout(() => {
      if (connectionStatus === 'testing') {
        setConnectionStatus('disconnected');
      }
    }, 3000);
  };

  const bgColor = theme === 'dark' ? '#1e1e1e' : '#ffffff';
  const textColor = theme === 'dark' ? '#e0e0e0' : '#333333';
  const borderColor = theme === 'dark' ? '#404040' : '#e0e0e0';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: bgColor,
        color: textColor,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${borderColor}`,
          backgroundColor: theme === 'dark' ? '#252526' : '#f3f3f3',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600 }}>AI Agent</h2>
          {config && (
            <div style={{ fontSize: '11px', opacity: 0.7 }}>
              {config.provider} • {config.model}
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '11px',
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor:
                connectionStatus === 'connected'
                  ? '#4ec9b0'
                  : connectionStatus === 'testing'
                    ? '#dcdcaa'
                    : '#f48771',
            }}
          />
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={connectionStatus === 'testing'}
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              backgroundColor: 'transparent',
              color: textColor,
              border: `1px solid ${borderColor}`,
              borderRadius: '3px',
              cursor: connectionStatus === 'testing' ? 'default' : 'pointer',
              opacity: connectionStatus === 'testing' ? 0.6 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            {connectionStatus === 'testing' ? 'Testing...' : 'Test'}
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.5,
              textAlign: 'center',
            }}
          >
            <p style={{ margin: 0 }}>No messages yet. Start a conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: '4px',
              }}
            >
              <div
                style={{
                  maxWidth: '85%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor:
                    msg.role === 'user'
                      ? theme === 'dark'
                        ? '#0066cc'
                        : '#0078d4'
                      : theme === 'dark'
                        ? '#2d2d30'
                        : '#f0f0f0',
                  color: msg.role === 'user' ? '#ffffff' : textColor,
                  wordBreak: 'break-word',
                  fontSize: '13px',
                  lineHeight: '1.4',
                }}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', opacity: 0.7 }}>
            <div style={{ fontSize: '12px' }}>AI is thinking</div>
            <div style={{ display: 'flex', gap: '2px' }}>
              <span style={{ animation: 'blink 1.4s infinite' }}>.</span>
              <span style={{ animation: 'blink 1.4s infinite 0.2s' }}>.</span>
              <span style={{ animation: 'blink 1.4s infinite 0.4s' }}>.</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: `1px solid ${borderColor}`,
          backgroundColor: theme === 'dark' ? '#252526' : '#f3f3f3',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: `1px solid ${borderColor}`,
              borderRadius: '4px',
              backgroundColor: theme === 'dark' ? '#3c3c3c' : '#ffffff',
              color: textColor,
              fontSize: '13px',
              fontFamily: 'inherit',
              outline: 'none',
              transition: 'border-color 0.2s',
              opacity: isLoading ? 0.6 : 1,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#0078d4';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = borderColor;
            }}
          />
          <button
            type="button"
            onClick={handleSendMessage}
            disabled={isLoading || !input.trim()}
            style={{
              padding: '8px 16px',
              backgroundColor: input.trim() && !isLoading ? '#0078d4' : '#cccccc',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: input.trim() && !isLoading ? 'pointer' : 'default',
              fontSize: '13px',
              fontWeight: 500,
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              if (input.trim() && !isLoading) {
                e.currentTarget.style.backgroundColor = '#106ebe';
              }
            }}
            onMouseLeave={(e) => {
              if (input.trim() && !isLoading) {
                e.currentTarget.style.backgroundColor = '#0078d4';
              }
            }}
          >
            Send
          </button>
        </div>
      </div>

      {/* Blinking animation */}
      <style>{`
        @keyframes blink {
          0%, 20%, 50%, 80%, 100% { opacity: 1; }
          40% { opacity: 0.3; }
          60% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

