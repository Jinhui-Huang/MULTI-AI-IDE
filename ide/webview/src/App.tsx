import { useState, useEffect, useRef, useCallback } from 'react';
import { postMessage } from './vscode';
import { MarkdownRenderer } from './MarkdownRenderer';

interface InitPayload {
  theme: 'light' | 'dark';
  config?: { provider: string; model: string };
}

interface ImageAttachment {
  mediaType: string;
  data: string;   // base64
  name?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: ImageAttachment[];
  timestamp: number;
}

interface ProviderConfig {
  id: string;
  name: string;
  type: 'online' | 'local';
  apiKey?: string;
  baseUrl?: string;
  models: string[];
  defaultModel: string;
  enabled: boolean;
}

interface AllProvidersConfig {
  providers: ProviderConfig[];
  activeProviderId: string;
  activeModel: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

type Page = 'chat' | 'settings';

// Load conversations from localStorage
function loadConversations(): Conversation[] {
  try {
    const saved = localStorage.getItem('conversations');
    if (saved) {
      const parsed = JSON.parse(saved) as Conversation[];
      return parsed;
    }
  } catch (err) {
    console.error('Failed to load conversations:', err);
  }
  // Return default conversation if none exist
  return [
    {
      id: `conv-${Date.now()}`,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
    },
  ];
}

function generateConversationTitle(messages: Message[]): string {
  if (messages.length === 0) return 'New Chat';
  const firstMessage = messages.find((m) => m.role === 'user');
  if (firstMessage && typeof firstMessage.content === 'string') {
    return firstMessage.content.slice(0, 50) + (firstMessage.content.length > 50 ? '...' : '');
  }
  return 'Chat';
}

export default function App() {
  const [page, setPage] = useState<Page>('chat');
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations());
  const [currentConvId, setCurrentConvId] = useState<string>(conversations[0]?.id || '');
  const currentConv = conversations.find((c) => c.id === currentConvId);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentMsgId, setCurrentMsgId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [config, setConfig] = useState<{ provider: string; model: string } | undefined>();
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'testing' | 'disconnected'>('disconnected');
  const [providersConfig, setProvidersConfig] = useState<AllProvidersConfig | null>(null);
  const [testingProviders, setTestingProviders] = useState<Record<string, 'testing' | 'success' | 'error'>>({});
  const [testMessages, setTestMessages] = useState<Record<string, string>>({});
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const [systemPrompt, setSystemPrompt] = useState<string>('You are a helpful AI assistant. Help the user with their coding questions and tasks.');

  const messages = currentConv?.messages || [];

  const setMessages = useCallback((updater: Message[] | ((prev: Message[]) => Message[])) => {
    setConversations((prevConvs) => {
      const updated = prevConvs.map((c) => {
        if (c.id === currentConvId) {
          // 使用 conversation 中的最新消息，而不是闭包中的旧 messages
          const newMessages = typeof updater === 'function' ? updater(c.messages) : updater;
          const title = c.title === 'New Chat' && newMessages.length > 0 ? generateConversationTitle(newMessages) : c.title;
          return { ...c, messages: newMessages, title };
        }
        return c;
      });
      return updated;
    });
  }, [currentConvId]);  // ← 修复：移除 messages，只依赖 currentConvId
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Conversation management helpers
  const updateMessages = useCallback((updater: (msgs: Message[]) => Message[]) => {
    setConversations((prevConvs) => {
      const updated = prevConvs.map((c) => {
        if (c.id === currentConvId) {
          return { ...c, messages: updater(c.messages) };
        }
        return c;
      });
      return updated;
    });
  }, [currentConvId]);

  const createNewConversation = useCallback(() => {
    const newConv: Conversation = {
      id: `conv-${Date.now()}`,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
    };
    setConversations((prev) => [newConv, ...prev]);
    setCurrentConvId(newConv.id);
  }, []);

  const deleteConversation = useCallback((convId: string) => {
    const remaining = conversations.filter((c) => c.id !== convId);
    if (remaining.length === 0) {
      createNewConversation();
    } else {
      setConversations(remaining);
      if (currentConvId === convId) {
        setCurrentConvId(remaining[0].id);
      }
    }
  }, [conversations, currentConvId, createNewConversation]);

  // Streaming buffer: accumulate deltas and flush on rAF
  const streamBufferRef = useRef<string>('');
  const rafRef = useRef<number>(0);
  const isStreamingRef = useRef(false);

  const flushStreamBuffer = useCallback(() => {
    rafRef.current = 0;
    const buffered = streamBufferRef.current;
    if (!buffered) return;
    streamBufferRef.current = '';

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant' && isStreamingRef.current) {
        const updated = [...prev];
        updated[updated.length - 1] = { ...last, content: last.content + buffered };
        return updated;
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      switch (msg.type) {
        case 'init': {
          const payload = msg.payload as InitPayload;
          setTheme(payload.theme);
          if (payload.config) setConfig(payload.config);
          setConnectionStatus('connected');
          break;
        }
        case 'pong':
          setConnectionStatus('connected');
          break;
        case 'chat/stream': {
          const streamId = msg.payload.id;
          const delta = msg.payload.delta as string;

          if (!isStreamingRef.current) {
            // First chunk: create the assistant message immediately
            isStreamingRef.current = true;
            setMessages((prev) => [
              ...prev,
              { id: streamId, role: 'assistant', content: delta, timestamp: Date.now() },
            ]);
          } else {
            // Subsequent chunks: buffer and flush on rAF
            streamBufferRef.current += delta;
            if (!rafRef.current) {
              rafRef.current = requestAnimationFrame(flushStreamBuffer);
            }
          }
          break;
        }
        case 'chat/done':
          // Flush any remaining buffer
          if (streamBufferRef.current) {
            flushStreamBuffer();
          }
          isStreamingRef.current = false;
          setIsLoading(false);
          setCurrentMsgId(null);
          break;
        case 'chat/error':
          isStreamingRef.current = false;
          streamBufferRef.current = '';
          setIsLoading(false);
          setCurrentMsgId(null);
          setMessages((prev) => [
            ...prev,
            { id: msg.payload.id, role: 'assistant', content: `**Error:** ${msg.payload.message}`, timestamp: Date.now() },
          ]);
          break;
        case 'chat/clear':
          isStreamingRef.current = false;
          streamBufferRef.current = '';
          setMessages([]);
          setIsLoading(false);
          break;
        case 'settings/providers':
          setProvidersConfig(msg.payload as AllProvidersConfig);
          setPage('settings');
          break;
        case 'settings/testResult': {
          const r = msg.payload as { providerId: string; success: boolean; message: string };
          setTestingProviders((prev) => ({ ...prev, [r.providerId]: r.success ? 'success' : 'error' }));
          setTestMessages((prev) => ({ ...prev, [r.providerId]: r.message }));
          break;
        }
        case 'settings/detectResult': {
          const r = msg.payload as { success: boolean; providers?: ProviderConfig[]; message: string };
          setTestMessages((prev) => ({ ...prev, 'detect-local': r.message }));
          setTestingProviders((prev) => ({ ...prev, 'detect-local': r.success ? 'success' : 'error' }));

          if (r.success && r.providers) {
            // Save all detected providers to backend
            r.providers.forEach((provider) => {
              postMessage({ type: 'settings/saveProvider', payload: provider });
            });

            // Refresh provider list after all saves
            setTimeout(() => {
              postMessage({ type: 'settings/getProviders' });
            }, 800);
          }
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    postMessage({ type: 'ready' });
    return () => {
      window.removeEventListener('message', handleMessage);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [flushStreamBuffer]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Persist conversations to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('conversations', JSON.stringify(conversations));
    } catch (err) {
      console.error('Failed to save conversations:', err);
    }
  }, [conversations]);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxWidth = 1024;
          const maxHeight = 1024;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height *= maxWidth / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width *= maxHeight / height;
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL(file.type || 'image/png', 0.85));
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const readFileAsBase64 = async (file: File): Promise<ImageAttachment> => {
    // Size limit: 5MB
    if (file.size > 5 * 1024 * 1024) {
      throw new Error(`Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB > 5MB)`);
    }

    // Compress image
    const compressedDataUrl = await compressImage(file);
    const base64 = compressedDataUrl.split(',')[1];
    return { mediaType: file.type || 'image/png', data: base64, name: file.name };
  };

  const addImages = async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    try {
      const attachments = await Promise.all(imageFiles.map(readFileAsBase64));
      setPendingImages((prev) => [...prev, ...attachments]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to process image';
      console.error('Image error:', message);
      alert(`Image error: ${message}`);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addImages(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addImages(imageFiles);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      addImages(Array.from(e.dataTransfer.files));
    }
  };

  const removePendingImage = (idx: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSendMessage = () => {
    if (!input.trim() && pendingImages.length === 0) return;
    const images = pendingImages.length > 0 ? [...pendingImages] : undefined;
    const userMessage: Message = { id: `msg-${Date.now()}`, role: 'user', content: input, images, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setPendingImages([]);
    setIsLoading(true);
    setCurrentMsgId(userMessage.id);
    streamBufferRef.current = '';
    isStreamingRef.current = false;
    postMessage({ type: 'chat/send', payload: { text: input, images } });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTestConnection = () => {
    setConnectionStatus('testing');
    postMessage({ type: 'ping' });
    setTimeout(() => {
      setConnectionStatus((s) => (s === 'testing' ? 'disconnected' : s));
    }, 3000);
  };

  const openSettings = () => {
    postMessage({ type: 'settings/getProviders' });
  };

  const exportChat = (format: 'markdown' | 'json') => {
    if (messages.length === 0) return;

    let content = '';
    if (format === 'markdown') {
      content = messages
        .map((msg) => {
          const prefix = msg.role === 'user' ? '### User' : '### Assistant';
          const body = typeof msg.content === 'string' ? msg.content : msg.content.map((p) => p.type === 'text' ? (p as any).text : '[image]').join('\n');
          return `${prefix}\n${body}`;
        })
        .join('\n\n');
      content = `# Chat Export\n\n${content}`;
    } else {
      content = JSON.stringify(messages, null, 2);
    }

    const blob = new Blob([content], { type: format === 'markdown' ? 'text/markdown' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_${new Date().toISOString().slice(0, 10)}.${format === 'markdown' ? 'md' : 'json'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const bgColor = theme === 'dark' ? '#1e1e1e' : '#ffffff';
  const textColor = theme === 'dark' ? '#e0e0e0' : '#333333';
  const borderColor = theme === 'dark' ? '#404040' : '#e0e0e0';
  const headerBg = theme === 'dark' ? '#252526' : '#f3f3f3';
  const inputBg = theme === 'dark' ? '#3c3c3c' : '#ffffff';
  const cardBg = theme === 'dark' ? '#2d2d30' : '#f5f5f5';

  if (page === 'settings') {
    return (
      <SettingsPage
        theme={theme}
        bgColor={bgColor}
        textColor={textColor}
        borderColor={borderColor}
        headerBg={headerBg}
        inputBg={inputBg}
        cardBg={cardBg}
        providersConfig={providersConfig}
        testingProviders={testingProviders}
        testMessages={testMessages}
        systemPrompt={systemPrompt}
        onBack={() => setPage('chat')}
        onRefresh={() => postMessage({ type: 'settings/getProviders' })}
        onSystemPromptChange={setSystemPrompt}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: bgColor, color: textColor, fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${borderColor}`, backgroundColor: headerBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: '0 0 2px 0', fontSize: '15px', fontWeight: 600 }}>AI Agent</h2>
          {config && (
            <div style={{ fontSize: '11px', opacity: 0.6 }}>
              {config.provider} / {config.model}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: connectionStatus === 'connected' ? '#4ec9b0' : connectionStatus === 'testing' ? '#dcdcaa' : '#f48771' }} />
          <button type="button" onClick={handleTestConnection} disabled={connectionStatus === 'testing'} style={{ ...smallBtnStyle(borderColor, textColor), opacity: connectionStatus === 'testing' ? 0.6 : 1 }}>
            {connectionStatus === 'testing' ? '...' : 'Test'}
          </button>
          {messages.length > 0 && (
            <div style={{ display: 'flex', gap: '3px' }}>
              <button type="button" onClick={() => exportChat('markdown')} style={{ ...smallBtnStyle(borderColor, textColor), fontSize: '10px', padding: '2px 6px' }}>MD</button>
              <button type="button" onClick={() => exportChat('json')} style={{ ...smallBtnStyle(borderColor, textColor), fontSize: '10px', padding: '2px 6px' }}>JSON</button>
            </div>
          )}
          <button type="button" onClick={openSettings} style={smallBtnStyle(borderColor, textColor)}>
            Settings
          </button>
        </div>
      </div>

      {/* Conversation Tabs */}
      <div style={{ display: 'flex', gap: '4px', padding: '6px 12px', borderBottom: `1px solid ${borderColor}`, backgroundColor: headerBg, overflowX: 'auto' }}>
        {conversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => setCurrentConvId(conv.id)}
            style={{
              padding: '4px 8px',
              backgroundColor: conv.id === currentConvId ? (theme === 'dark' ? '#4ec9b0' : '#0078d4') : borderColor,
              color: conv.id === currentConvId ? '#fff' : textColor,
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>{conv.title.length > 20 ? conv.title.slice(0, 20) + '...' : conv.title}</span>
            {conversations.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(conv.id);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: conv.id === currentConvId ? '#fff' : textColor,
                  cursor: 'pointer',
                  padding: '0',
                  fontSize: '12px',
                  opacity: 0.7,
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={createNewConversation}
          style={{
            padding: '4px 8px',
            backgroundColor: 'transparent',
            border: `1px solid ${borderColor}`,
            borderRadius: '3px',
            color: textColor,
            cursor: 'pointer',
            fontSize: '11px',
          }}
        >
          + New
        </button>
      </div>

      {/* Messages Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {messages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '13px' }}>Start a conversation...</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} theme={theme} isStreaming={isStreamingRef.current && isLoading && msg === messages[messages.length - 1] && msg.role === 'assistant'} />
          ))
        )}
        {isLoading && !messages.some(m => m.role === 'assistant' && isStreamingRef.current) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: theme === 'dark' ? '#4ec9b0' : '#0078d4', animation: 'bounce 1.4s infinite ease-in-out', animationDelay: '0s' }} />
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: theme === 'dark' ? '#4ec9b0' : '#0078d4', animation: 'bounce 1.4s infinite ease-in-out', animationDelay: '0.2s' }} />
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: theme === 'dark' ? '#4ec9b0' : '#0078d4', animation: 'bounce 1.4s infinite ease-in-out', animationDelay: '0.4s' }} />
            </div>
            <button type="button" onClick={() => { if (currentMsgId) postMessage({ type: 'chat/cancel', payload: { id: currentMsgId } }); }}
              style={{ padding: '2px 8px', fontSize: '11px', backgroundColor: 'transparent', color: '#f48771', border: '1px solid #f48771', borderRadius: '3px', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div
        style={{ padding: '10px 14px', borderTop: `1px solid ${borderColor}`, backgroundColor: headerBg }}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}>
            <button type="button" onClick={() => { if (currentMsgId) postMessage({ type: 'chat/cancel', payload: { id: currentMsgId } }); }}
              style={{ padding: '3px 10px', fontSize: '11px', backgroundColor: 'transparent', color: '#f48771', border: '1px solid #f48771', borderRadius: '3px', cursor: 'pointer' }}>
              Stop generating
            </button>
          </div>
        )}

        {/* Pending images preview */}
        {pendingImages.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
            {pendingImages.map((img, idx) => (
              <div key={idx} style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden', border: `1px solid ${borderColor}` }}>
                <img src={`data:${img.mediaType};base64,${img.data}`} alt={img.name || 'image'}
                  style={{ height: '60px', maxWidth: '100px', objectFit: 'cover', display: 'block' }} />
                <button type="button" onClick={() => removePendingImage(idx)}
                  style={{
                    position: 'absolute', top: '2px', right: '2px', width: '16px', height: '16px',
                    borderRadius: '50%', border: 'none', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff',
                    fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1, padding: 0,
                  }}>
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
          <input type="file" ref={fileInputRef} accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isLoading}
            title="Upload image"
            style={{
              padding: '6px 8px', backgroundColor: 'transparent', color: textColor,
              border: `1px solid ${borderColor}`, borderRadius: '6px', cursor: 'pointer',
              fontSize: '16px', lineHeight: 1, height: '36px', opacity: isLoading ? 0.4 : 0.7,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Ask anything... (paste or drop images)"
            disabled={isLoading}
            rows={1}
            style={{
              flex: 1, padding: '8px 12px', border: `1px solid ${borderColor}`, borderRadius: '6px',
              backgroundColor: inputBg, color: textColor, fontSize: '13px', fontFamily: 'inherit',
              outline: 'none', opacity: isLoading ? 0.6 : 1, resize: 'none',
              minHeight: '36px', maxHeight: '120px', lineHeight: '1.4',
            }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 120) + 'px';
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#0078d4'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = borderColor; }}
          />
          <button type="button" onClick={handleSendMessage} disabled={isLoading || (!input.trim() && pendingImages.length === 0)}
            style={{
              padding: '8px 14px',
              backgroundColor: (input.trim() || pendingImages.length > 0) && !isLoading ? '#0078d4' : (theme === 'dark' ? '#555' : '#ccc'),
              color: '#ffffff', border: 'none', borderRadius: '6px',
              cursor: (input.trim() || pendingImages.length > 0) && !isLoading ? 'pointer' : 'default', fontSize: '13px', fontWeight: 500,
              height: '36px', transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => { if ((input.trim() || pendingImages.length > 0) && !isLoading) e.currentTarget.style.backgroundColor = '#106ebe'; }}
            onMouseLeave={(e) => { if ((input.trim() || pendingImages.length > 0) && !isLoading) e.currentTarget.style.backgroundColor = '#0078d4'; }}>
            Send
          </button>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ==================== Message Bubble ====================

interface MessageBubbleProps {
  msg: Message;
  theme: 'light' | 'dark';
  isStreaming: boolean;
}

function MessageBubble({ msg, theme, isStreaming }: MessageBubbleProps) {
  const isDark = theme === 'dark';

  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '85%', padding: '8px 14px', borderRadius: '12px 12px 2px 12px',
          backgroundColor: isDark ? '#0e639c' : '#0078d4', color: '#fff',
          fontSize: '13px', lineHeight: '1.5', wordBreak: 'break-word',
        }}>
          {msg.images && msg.images.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', marginBottom: msg.content ? '6px' : 0, flexWrap: 'wrap' }}>
              {msg.images.map((img, idx) => (
                <img key={idx} src={`data:${img.mediaType};base64,${img.data}`} alt={img.name || 'image'}
                  style={{ maxHeight: '120px', maxWidth: '200px', borderRadius: '4px', objectFit: 'contain', cursor: 'pointer' }}
                  onClick={() => {
                    const w = window.open('');
                    if (w) { w.document.write(`<img src="data:${img.mediaType};base64,${img.data}" style="max-width:100%" />`); }
                  }}
                />
              ))}
            </div>
          )}
          {msg.content && <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div style={{
        maxWidth: '95%', width: '100%', padding: '10px 14px', borderRadius: '2px 12px 12px 12px',
        backgroundColor: isDark ? '#252530' : '#f4f4f8',
        border: `1px solid ${isDark ? '#333345' : '#e8e8ee'}`,
      }}>
        <MarkdownRenderer content={msg.content} theme={theme} />
        {isStreaming && (
          <span style={{
            display: 'inline-block', width: '2px', height: '14px', marginLeft: '2px',
            backgroundColor: isDark ? '#4ec9b0' : '#0078d4', verticalAlign: 'text-bottom',
            animation: 'cursorBlink 0.8s step-end infinite',
          }} />
        )}
      </div>
    </div>
  );
}

function smallBtnStyle(borderColor: string, textColor: string): React.CSSProperties {
  return { padding: '2px 8px', fontSize: '11px', backgroundColor: 'transparent', color: textColor, border: `1px solid ${borderColor}`, borderRadius: '3px', cursor: 'pointer' };
}

// ==================== Settings Page ====================

interface SettingsPageProps {
  theme: 'light' | 'dark';
  bgColor: string;
  textColor: string;
  borderColor: string;
  headerBg: string;
  inputBg: string;
  cardBg: string;
  providersConfig: AllProvidersConfig | null;
  testingProviders: Record<string, 'testing' | 'success' | 'error'>;
  testMessages: Record<string, string>;
  systemPrompt: string;
  onBack: () => void;
  onRefresh: () => void;
  onSystemPromptChange: (prompt: string) => void;
}

function SettingsPage({ theme, bgColor, textColor, borderColor, headerBg, inputBg, cardBg, providersConfig, testingProviders, testMessages, systemPrompt, onBack, onRefresh, onSystemPromptChange }: SettingsPageProps) {
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const [showAddLocal, setShowAddLocal] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newLocal, setNewLocal] = useState<ProviderConfig>({ id: '', name: '', type: 'local', baseUrl: 'http://localhost:11434/v1', models: ['llama3'], defaultModel: 'llama3', enabled: true });

  useEffect(() => { onRefresh(); }, []);

  const providers = providersConfig?.providers ?? [];
  const onlineProviders = providers.filter((p) => p.type === 'online');
  const localProviders = providers.filter((p) => p.type === 'local');

  const handleSaveProvider = (provider: ProviderConfig) => {
    postMessage({ type: 'settings/saveProvider', payload: provider });
    setEditingProvider(null);
  };

  const handleSetActive = (providerId: string, model: string) => {
    postMessage({ type: 'settings/setActive', payload: { providerId, model } });
  };

  const handleTestProvider = (providerId: string) => {
    postMessage({ type: 'settings/testProvider', payload: { providerId } });
  };

  const handleDetectLocalModels = (baseUrl: string) => {
    postMessage({ type: 'settings/detectLocalModels', payload: { baseUrl } });
  };

  const handleAddLocal = () => {
    if (!newLocal.id || !newLocal.name) return;
    postMessage({ type: 'settings/saveProvider', payload: newLocal });
    setShowAddLocal(false);
    setNewLocal({ id: '', name: '', type: 'local', baseUrl: 'http://localhost:11434/v1', models: ['llama3'], defaultModel: 'llama3', enabled: true });
  };

  const handleDeleteProvider = (id: string) => {
    postMessage({ type: 'settings/deleteProvider', payload: { id } });
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 10px', border: `1px solid ${borderColor}`, borderRadius: '4px', backgroundColor: inputBg, color: textColor, fontSize: '12px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 600, marginBottom: '4px', display: 'block', opacity: 0.8 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: bgColor, color: textColor, fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${borderColor}`, backgroundColor: headerBg, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button type="button" onClick={onBack} style={{ ...smallBtnStyle(borderColor, textColor), fontSize: '13px', padding: '4px 10px' }}>Back</button>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>AI Settings</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', opacity: 0.9 }}>Online AI Providers</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
          {onlineProviders.map((p) => (
            <ProviderCard key={p.id} provider={p} isActive={providersConfig?.activeProviderId === p.id} activeModel={providersConfig?.activeModel ?? ''}
              theme={theme} cardBg={cardBg} borderColor={borderColor} textColor={textColor} inputBg={inputBg}
              testStatus={testingProviders[p.id]} testMessage={testMessages[p.id]} isEditing={editingProvider?.id === p.id}
              onEdit={() => setEditingProvider({ ...p })} onSave={handleSaveProvider} onCancel={() => setEditingProvider(null)}
              onSetActive={handleSetActive} onTest={handleTestProvider} editingProvider={editingProvider} setEditingProvider={setEditingProvider}
              inputStyle={inputStyle} labelStyle={labelStyle} />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, margin: 0, opacity: 0.9 }}>Local AI (Offline)</h3>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" onClick={() => handleDetectLocalModels('http://localhost:11434/v1')} style={{ ...smallBtnStyle(borderColor, textColor), fontSize: '11px' }}>Auto-detect</button>
            <button type="button" onClick={() => setShowAddLocal(!showAddLocal)} style={{ ...smallBtnStyle(borderColor, textColor), fontSize: '11px' }}>+ Add Local</button>
          </div>
        </div>
        {testMessages['detect-local'] && (
          <div style={{ fontSize: '11px', marginBottom: '8px', padding: '8px', borderRadius: '4px', backgroundColor: testingProviders['detect-local'] === 'success' ? 'rgba(78, 201, 176, 0.1)' : 'rgba(244, 135, 113, 0.1)', color: testingProviders['detect-local'] === 'success' ? '#4ec9b0' : '#f48771' }}>
            {testMessages['detect-local']}
          </div>
        )}

        {showAddLocal && (
          <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: cardBg, border: `1px solid ${borderColor}`, marginBottom: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label style={labelStyle}>ID (unique, e.g. "ollama-2")</label>
                <input style={inputStyle} value={newLocal.id} onChange={(e) => setNewLocal({ ...newLocal, id: e.target.value })} placeholder="ollama-local" />
              </div>
              <div>
                <label style={labelStyle}>Display Name</label>
                <input style={inputStyle} value={newLocal.name} onChange={(e) => setNewLocal({ ...newLocal, name: e.target.value })} placeholder="My Local Ollama" />
              </div>
              <div>
                <label style={labelStyle}>Base URL</label>
                <input style={inputStyle} value={newLocal.baseUrl} onChange={(e) => setNewLocal({ ...newLocal, baseUrl: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Models (comma-separated)</label>
                <input style={inputStyle} value={newLocal.models.join(', ')} onChange={(e) => setNewLocal({ ...newLocal, models: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
              </div>
              <div>
                <label style={labelStyle}>Default Model</label>
                <input style={inputStyle} value={newLocal.defaultModel} onChange={(e) => setNewLocal({ ...newLocal, defaultModel: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button type="button" onClick={handleAddLocal} style={{ padding: '6px 14px', fontSize: '12px', backgroundColor: '#0078d4', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
                <button type="button" onClick={() => setShowAddLocal(false)} style={smallBtnStyle(borderColor, textColor)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {localProviders.map((p) => (
            <ProviderCard key={p.id} provider={p} isActive={providersConfig?.activeProviderId === p.id} activeModel={providersConfig?.activeModel ?? ''}
              theme={theme} cardBg={cardBg} borderColor={borderColor} textColor={textColor} inputBg={inputBg}
              testStatus={testingProviders[p.id]} testMessage={testMessages[p.id]} isEditing={editingProvider?.id === p.id}
              onEdit={() => setEditingProvider({ ...p })} onSave={handleSaveProvider} onCancel={() => setEditingProvider(null)}
              onSetActive={handleSetActive} onTest={handleTestProvider} onDelete={handleDeleteProvider}
              editingProvider={editingProvider} setEditingProvider={setEditingProvider} inputStyle={inputStyle} labelStyle={labelStyle} />
          ))}
          {localProviders.length === 0 && !showAddLocal && (
            <div style={{ fontSize: '12px', opacity: 0.5, textAlign: 'center', padding: '16px' }}>No local providers configured.</div>
          )}
        </div>

        {/* Advanced Settings */}
        <div style={{ marginTop: '24px', borderTop: `1px solid ${borderColor}`, paddingTop: '16px' }}>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              width: '100%',
              padding: '8px 12px',
              backgroundColor: 'transparent',
              border: `1px solid ${borderColor}`,
              borderRadius: '4px',
              color: textColor,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            Advanced Settings
            <span style={{ opacity: 0.6 }}>{showAdvanced ? '▼' : '▶'}</span>
          </button>

          {showAdvanced && (
            <div style={{ marginTop: '12px', padding: '12px', backgroundColor: cardBg, borderRadius: '4px', border: `1px solid ${borderColor}` }}>
              <label style={labelStyle}>System Prompt</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => onSystemPromptChange(e.target.value)}
                style={{
                  ...inputStyle,
                  height: '100px',
                  resize: 'vertical',
                  fontFamily: 'Consolas, monospace',
                  fontSize: '11px'
                }}
                placeholder="You are a helpful AI assistant..."
              />
              <div style={{ fontSize: '11px', marginTop: '6px', opacity: 0.6 }}>
                This prompt will be sent with every message to guide the AI's behavior.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== Provider Card ====================

interface ProviderCardProps {
  provider: ProviderConfig;
  isActive: boolean;
  activeModel: string;
  theme: 'light' | 'dark';
  cardBg: string;
  borderColor: string;
  textColor: string;
  inputBg: string;
  testStatus?: 'testing' | 'success' | 'error';
  testMessage?: string;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (p: ProviderConfig) => void;
  onCancel: () => void;
  onSetActive: (id: string, model: string) => void;
  onTest: (id: string) => void;
  onDelete?: (id: string) => void;
  editingProvider: ProviderConfig | null;
  setEditingProvider: (p: ProviderConfig | null) => void;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
}

function ProviderCard({ provider, isActive, activeModel, theme, cardBg, borderColor, textColor, inputBg, testStatus, testMessage, isEditing, onEdit, onSave, onCancel, onSetActive, onTest, onDelete, editingProvider, setEditingProvider, inputStyle, labelStyle }: ProviderCardProps) {
  const activeBorder = isActive ? (theme === 'dark' ? '#4ec9b0' : '#0078d4') : borderColor;

  if (isEditing && editingProvider) {
    return (
      <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: cardBg, border: `2px solid ${activeBorder}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>{provider.name}</div>
          {provider.type === 'online' && (
            <div>
              <label style={labelStyle}>API Key</label>
              <input type="password" style={inputStyle} value={editingProvider.apiKey ?? ''} onChange={(e) => setEditingProvider({ ...editingProvider, apiKey: e.target.value })} placeholder="Enter API Key..." />
            </div>
          )}
          <div>
            <label style={labelStyle}>Base URL {provider.type === 'online' ? '(optional override)' : ''}</label>
            <input style={inputStyle} value={editingProvider.baseUrl ?? ''} onChange={(e) => setEditingProvider({ ...editingProvider, baseUrl: e.target.value })} placeholder={provider.type === 'local' ? 'http://localhost:11434/v1' : 'Leave empty for default'} />
          </div>
          <div>
            <label style={labelStyle}>Models (comma-separated)</label>
            <input style={inputStyle} value={editingProvider.models.join(', ')} onChange={(e) => setEditingProvider({ ...editingProvider, models: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          </div>
          <div>
            <label style={labelStyle}>Default Model</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={editingProvider.defaultModel} onChange={(e) => setEditingProvider({ ...editingProvider, defaultModel: e.target.value })}>
              {editingProvider.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button type="button" onClick={() => onSave(editingProvider)} style={{ padding: '6px 14px', fontSize: '12px', backgroundColor: '#0078d4', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
            <button type="button" onClick={onCancel} style={smallBtnStyle(borderColor, textColor)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 12px', borderRadius: '6px', backgroundColor: cardBg, border: `2px solid ${activeBorder}`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600, fontSize: '13px' }}>{provider.name}</span>
          {isActive && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', backgroundColor: theme === 'dark' ? '#4ec9b0' : '#0078d4', color: '#fff' }}>Active</span>}
          <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', backgroundColor: provider.type === 'local' ? '#6a9955' : '#569cd6', color: '#fff' }}>
            {provider.type === 'local' ? 'Local' : 'Online'}
          </span>
        </div>
      </div>
      <div style={{ fontSize: '11px', opacity: 0.7 }}>
        {provider.type === 'online' && <>API Key: {provider.apiKey ? 'Configured' : 'Not set'}</>}
        {provider.type === 'local' && <>URL: {provider.baseUrl}</>}
        {' • '}Models: {provider.models.length}
      </div>
      {testStatus && (
        <div style={{ fontSize: '11px', color: testStatus === 'success' ? '#4ec9b0' : testStatus === 'error' ? '#f48771' : '#dcdcaa' }}>
          {testStatus === 'testing' ? 'Testing...' : testMessage}
        </div>
      )}
      <div style={{ display: 'flex', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
        <button type="button" onClick={onEdit} style={smallBtnStyle(borderColor, textColor)}>Edit</button>
        <button type="button" onClick={() => onTest(provider.id)} style={smallBtnStyle(borderColor, textColor)}>Test</button>
        {!isActive && (
          <button type="button" onClick={() => onSetActive(provider.id, provider.defaultModel)} style={{ ...smallBtnStyle(borderColor, textColor), color: '#0078d4', borderColor: '#0078d4' }}>Use This</button>
        )}
        {isActive && (
          <select style={{ padding: '2px 6px', fontSize: '11px', backgroundColor: 'transparent', color: textColor, border: `1px solid ${borderColor}`, borderRadius: '3px', cursor: 'pointer' }}
            value={activeModel} onChange={(e) => onSetActive(provider.id, e.target.value)}>
            {provider.models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        {onDelete && !isActive && (
          <button type="button" onClick={() => onDelete(provider.id)} style={{ ...smallBtnStyle(borderColor, textColor), color: '#f48771', borderColor: '#f48771' }}>Delete</button>
        )}
      </div>
    </div>
  );
}
