require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED = (process.env.ALLOWED_CHAT_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const DEFAULT_CWD = process.env.DEFAULT_CWD || process.cwd();
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const PERMISSION_MODE = process.env.PERMISSION_MODE || 'acceptEdits';
const SKIP_PERMISSIONS = String(process.env.SKIP_PERMISSIONS || 'false').toLowerCase() === 'true';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'claude-opus-4-6';

const AVAILABLE_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
];

if (!TOKEN) throw new Error('TELEGRAM_BOT_TOKEN missing');
if (ALLOWED.length === 0) throw new Error('ALLOWED_CHAT_IDS missing');

const bot = new TelegramBot(TOKEN, { polling: true });

const sessions = new Map();
const getSession = (chatId) => {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { cwd: DEFAULT_CWD, sessionId: null, busy: false, model: DEFAULT_MODEL });
  }
  return sessions.get(chatId);
};

const LOG_FILE = path.join(__dirname, 'audit.log');
const audit = (chatId, kind, text) => {
  const line = `[${new Date().toISOString()}] ${chatId} ${kind}: ${String(text).slice(0, 500)}\n`;
  fs.appendFile(LOG_FILE, line, () => {});
};

const isAllowed = (chatId) => ALLOWED.includes(String(chatId));

const runClaude = (prompt, session, onProgress) =>
  new Promise((resolve) => {
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];
    if (SKIP_PERMISSIONS) {
      args.push('--dangerously-skip-permissions');
    } else {
      args.push('--permission-mode', PERMISSION_MODE);
    }
    if (session.model) args.push('--model', session.model);
    if (session.sessionId) args.push('--resume', session.sessionId);
    const child = spawn(CLAUDE_BIN, args, { cwd: session.cwd, shell: true });
    let buffer = '';
    let latestAssistant = '';
    let finalResult = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      buffer += d.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const evt = JSON.parse(trimmed);
          if (evt.session_id) session.sessionId = evt.session_id;
          if (evt.type === 'assistant' && evt.message && evt.message.content) {
            let text = '';
            for (const c of evt.message.content) {
              if (c.type === 'text') text += c.text;
              else if (c.type === 'tool_use') text += `\n[tool: ${c.name}]`;
            }
            if (text) {
              latestAssistant = text;
              if (onProgress) onProgress(text);
            }
          } else if (evt.type === 'result') {
            finalResult = evt.result || latestAssistant;
          }
        } catch (_) {}
      }
    });
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => {
      resolve({ code, stdout: finalResult || latestAssistant, stderr });
    });
    child.on('error', (err) => resolve({ code: -1, stdout: '', stderr: err.message }));
  });

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  if (!isAllowed(chatId)) {
    audit(chatId, 'DENY', text);
    return bot.sendMessage(chatId, 'unauthorized');
  }
  if (!text) return;
  audit(chatId, 'IN', text);
  const session = getSession(chatId);

  if (text === '/start' || text === '/help') {
    return bot.sendMessage(
      chatId,
      [
        'Claude Code bridge ready.',
        '',
        'Commands:',
        '/model — show current model',
        '/model <name> — switch model',
        '/models — list available models',
        '/cwd — show working dir',
        '/cd <path> — change working dir',
        '/reset — new session',
        '/status — show state',
        '',
        'Anything else is sent as a prompt to Claude Code.',
      ].join('\n')
    );
  }
  if (text === '/model') return bot.sendMessage(chatId, 'model: ' + session.model);
  if (text.startsWith('/model ')) {
    const m = text.slice(7).trim();
    if (!AVAILABLE_MODELS.includes(m)) {
      return bot.sendMessage(chatId, 'unknown model. use /models to list');
    }
    session.model = m;
    session.sessionId = null;
    return bot.sendMessage(chatId, 'model -> ' + m + ' (session cleared)');
  }
  if (text === '/models') {
    return bot.sendMessage(chatId, 'available:\n' + AVAILABLE_MODELS.join('\n'));
  }
  if (text === '/cwd') return bot.sendMessage(chatId, session.cwd);
  if (text.startsWith('/cd ')) {
    const p = text.slice(4).trim();
    if (!fs.existsSync(p)) return bot.sendMessage(chatId, 'path not found: ' + p);
    session.cwd = p;
    session.sessionId = null;
    return bot.sendMessage(chatId, 'cwd -> ' + p);
  }
  if (text === '/reset') {
    session.sessionId = null;
    return bot.sendMessage(chatId, 'session cleared');
  }
  if (text === '/status') {
    return bot.sendMessage(
      chatId,
      `model: ${session.model}\ncwd: ${session.cwd}\nsession: ${session.sessionId || '(new)'}\nbusy: ${session.busy}`
    );
  }
  if (text.startsWith('/')) return bot.sendMessage(chatId, 'unknown command');

  if (session.busy) return bot.sendMessage(chatId, 'busy, wait for current task');
  session.busy = true;
  const progress = await bot.sendMessage(chatId, '📥 收到，思考中...');
  let lastEdit = 0;
  let lastShown = '';
  const updateProgress = (chunk) => {
    const now = Date.now();
    if (now - lastEdit < 1500) return;
    if (chunk === lastShown) return;
    lastEdit = now;
    lastShown = chunk;
    const display = chunk.length > 3500 ? chunk.slice(0, 3500) + '\n...' : chunk;
    bot
      .editMessageText('💭 ' + display, { chat_id: chatId, message_id: progress.message_id })
      .catch(() => {});
  };
  try {
    const { code, stdout, stderr } = await runClaude(text, session, updateProgress);
    const out = stdout || stderr || `(exit ${code})`;
    audit(chatId, 'OUT', out);
    const MAX = 3500;
    const firstChunk = out.slice(0, MAX);
    const editOk = await bot
      .editMessageText(firstChunk, { chat_id: chatId, message_id: progress.message_id })
      .then(() => true)
      .catch(() => false);
    if (!editOk) {
      await bot.sendMessage(chatId, firstChunk).catch(() => {});
    }
    if (out.length > MAX) {
      for (let i = MAX; i < out.length; i += MAX) {
        await bot.sendMessage(chatId, out.slice(i, i + MAX)).catch(() => {});
      }
    }
  } catch (err) {
    await bot.sendMessage(chatId, 'error: ' + err.message);
  } finally {
    session.busy = false;
  }
});

bot.on('polling_error', (err) => console.error('polling', err.message));
console.log('bridge started, allowed chats:', ALLOWED.join(','));