import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { postMessage } from './vscode';

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);

// 通知扩展 WebView 已就绪
postMessage({ type: 'ready' });