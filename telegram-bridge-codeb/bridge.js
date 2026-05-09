require('dotenv').config({
  path: process.env.CODEX_BRIDGE_ENV || require('path').join(__dirname, '.env'),
});

const TelegramBot = require('node-telegram-bot-api');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { telegramFormat, splitHtmlForTelegram } = require('telegram-markdown-formatter');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED = (process.env.ALLOWED_CHAT_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const DEFAULT_CWD = process.env.DEFAULT_CWD || process.cwd();
const CODEX_BIN = process.env.CODEX_BIN || 'codex';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'gpt-5.4';
const SANDBOX = process.env.CODEX_SANDBOX || 'workspace-write';
const FULL_AUTO = String(process.env.CODEX_FULL_AUTO || 'true').toLowerCase() === 'true';
const DANGEROUS_BYPASS =
  String(process.env.CODEX_DANGEROUS_BYPASS || 'false').toLowerCase() === 'true';
const SKIP_GIT_REPO_CHECK =
  String(process.env.CODEX_SKIP_GIT_REPO_CHECK || 'false').toLowerCase() === 'true';

const AVAILABLE_MODELS = (process.env.AVAILABLE_MODELS || 'gpt-5.4,gpt-5.4-mini,gpt-5.3-codex')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Team config: comma-separated "username:role" pairs for all bots in the team
// e.g. TEAM_BOTS=MyCodexAiForHuianBot:planner,MyCodexBAiForHuianBot:implementer
const TEAM_BOTS = (process.env.TEAM_BOTS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((entry) => {
    const idx = entry.indexOf(':');
    return idx > 0
      ? { username: entry.slice(0, idx).trim(), role: entry.slice(idx + 1).trim() }
      : { username: entry.trim(), role: '' };
  });

const LOCK_FILE = path.join(__dirname, '.bridge.pid');
const DOWNLOAD_DIR = path.join(os.tmpdir(), 'telegram-codex-downloads');
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);

// Ensure download directory exists
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

if (!TOKEN) throw new Error('TELEGRAM_BOT_TOKEN missing');
if (ALLOWED.length === 0) throw new Error('ALLOWED_CHAT_IDS missing');

const isProcessAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
};

const acquireLock = () => {
  let existingPid = null;
  try {
    existingPid = Number(fs.readFileSync(LOCK_FILE, 'utf8').trim());
  } catch (_) {}
  if (isProcessAlive(existingPid)) {
    console.error(`bridge already running as PID ${existingPid}; exiting`);
    process.exit(1);
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));
};

const releaseLock = () => {
  try {
    const pid = Number(fs.readFileSync(LOCK_FILE, 'utf8').trim());
    if (pid === process.pid) fs.unlinkSync(LOCK_FILE);
  } catch (_) {}
};

acquireLock();
process.on('exit', releaseLock);
process.on('SIGINT', () => {
  releaseLock();
  process.exit(0);
});
process.on('SIGTERM', () => {
  releaseLock();
  process.exit(0);
});

const bot = new TelegramBot(TOKEN, { polling: true });
let botInfo = { id: 0, username: '' };
bot.getMe().then((info) => {
  botInfo = info;
  console.log(`bot identity: @${info.username} (id=${info.id})`);
});
const sessions = new Map();
const LOG_FILE = path.join(__dirname, 'codex-audit.log');

const getSession = (chatId) => {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { cwd: DEFAULT_CWD, sessionId: null, busy: false, model: DEFAULT_MODEL });
  }
  return sessions.get(chatId);
};

const audit = (chatId, kind, text) => {
  const line = `[${new Date().toISOString()}] ${chatId} ${kind}: ${String(text).slice(0, 500)}\n`;
  fs.appendFile(LOG_FILE, line, () => {});
};

const isAllowed = (chatId) => ALLOWED.includes(String(chatId));

const extractGroupMentionPrompt = (msg, text, botInfo) => {
  if (!botInfo.username) return null;
  const normalizedText = String(text || '').trimStart();
  const prefix = `@${botInfo.username}`;
  if (!normalizedText.toLowerCase().startsWith(prefix.toLowerCase())) return null;

  return normalizedText.slice(prefix.length).replace(/\s+/g, ' ').trim();
};

const normalizeHandoffMessage = (text) => String(text || '').replace(/\s+/g, ' ').trim();

const quoteArg = (arg) => {
  const s = String(arg);
  if (!/[ \t"]/u.test(s)) return s;
  return `"${s.replace(/"/g, '\\"')}"`;
};

const spawnCodex = (args, options) => {
  const ext = path.extname(CODEX_BIN).toLowerCase();
  const needsWindowsShell =
    process.platform === 'win32' &&
    (CODEX_BIN.includes(' ') || !ext || ext === '.cmd' || ext === '.bat');
  if (needsWindowsShell) {
    return spawn([quoteArg(CODEX_BIN), ...args.map(quoteArg)].join(' '), [], {
      ...options,
      shell: true,
    });
  }
  return spawn(CODEX_BIN, args, options);
};

// Convert Markdown to Telegram HTML via telegram-markdown-formatter
const markdownToTelegramHtml = (text) => {
  try {
    return telegramFormat(text);
  } catch (_) {
    // Fallback: escape HTML and return as plain text
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};

// Send message with HTML rendering, fallback to plain text
const sendHtml = (chatId, text, extra = {}) =>
  bot
    .sendMessage(chatId, markdownToTelegramHtml(text), { parse_mode: 'HTML', ...extra })
    .catch(() => bot.sendMessage(chatId, text, extra));

const editHtml = (chatId, messageId, text, extra = {}) =>
  bot
    .editMessageText(markdownToTelegramHtml(text), {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      ...extra,
    })
    .catch(() =>
      bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...extra })
    );

const addSharedArgs = (args, session, { resume }) => {
  args.push('--json');
  if (session.model) args.push('--model', session.model);
  if (DANGEROUS_BYPASS) {
    args.push('--dangerously-bypass-approvals-and-sandbox');
  } else if (FULL_AUTO) {
    args.push('--full-auto');
  } else if (!resume && SANDBOX) {
    args.push('--sandbox', SANDBOX);
  }
  if (!resume) {
    args.push('--color', 'never');
    args.push('--cd', session.cwd);
    if (SKIP_GIT_REPO_CHECK) args.push('--skip-git-repo-check');
  }
  return args;
};

// Truncate a string to maxLen, adding ellipsis if needed
const truncate = (s, maxLen) => (s.length > maxLen ? s.slice(0, maxLen) + '…' : s);

// Format a single step for display
const formatStep = (step) => {
  if (step.type === 'message') {
    return step.text;
  }
  if (step.type === 'command') {
    const cmd = truncate(step.command, 200);
    let s = `$ ${cmd}`;
    if (step.status === 'in_progress') {
      s += '\n⏳ running...';
    } else {
      if (step.output) s += '\n```\n' + truncate(step.output.trim(), 800) + '\n```';
      if (step.exit_code !== 0 && step.exit_code != null) s += `\n⚠️ exit ${step.exit_code}`;
    }
    return s;
  }
  if (step.type === 'file_edit') {
    const names = (step.paths || []).map((p) => path.basename(p)).join(', ') || 'file';
    let s = `📝 ${names}`;
    if (step.status === 'in_progress') s += ' — editing...';
    return s;
  }
  return step.raw || '';
};

// Build progress view from accumulated steps, keeping within Telegram limits
const buildProgressView = (steps, maxLen = 3500) => {
  const parts = steps.map(formatStep).filter(Boolean);
  let view = parts.join('\n\n');
  if (view.length <= maxLen) return view;
  // Too long — keep the first message + last N steps that fit
  const head = parts[0] ? parts[0] + '\n\n...\n\n' : '';
  const remaining = parts.slice(1);
  let tail = '';
  for (let i = remaining.length - 1; i >= 0; i--) {
    const candidate = remaining.slice(i).join('\n\n');
    if (head.length + candidate.length <= maxLen) {
      tail = candidate;
    } else break;
  }
  return (head + tail) || view.slice(0, maxLen);
};

const captureSessionId = (evt, session) => {
  if (session.sessionId) return; // already captured, don't overwrite
  const id =
    // Codex CLI outputs: {"type":"thread.started","thread_id":"..."}
    evt.thread_id ||
    evt.session_id ||
    evt.sessionId ||
    (evt.thread && (evt.thread.id || evt.thread.thread_id)) ||
    (evt.session && (evt.session.id || evt.session.session_id)) ||
    (evt.conversation && (evt.conversation.id || evt.conversation.session_id)) ||
    // OpenAI Responses API format: response.created / response.done events
    (evt.response && (evt.response.id || evt.response.session_id));
  if (id && typeof id === 'string') {
    session.sessionId = id;
    console.log(`[session] captured id: ${id}`);
  }
};

const CODEX_TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS) || 10 * 60 * 1000;

const runCodex = (prompt, session, onProgress, { images = [] } = {}) =>
  new Promise((resolve) => {
    const lastMessagePath = path.join(
      os.tmpdir(),
      `telegram-codex-last-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`
    );
    const resume = Boolean(session.sessionId);
    const args = resume ? ['exec', 'resume'] : ['exec'];
    addSharedArgs(args, session, { resume });
    args.push('--output-last-message', lastMessagePath);
    for (const img of images) args.push('--image', img);
    if (resume) args.push(session.sessionId);
    args.push('-');

    const child = spawnCodex(args, { cwd: session.cwd, env: process.env });
    let buffer = '';
    let stderr = '';
    let resolved = false;
    const steps = [];
    const itemMap = new Map();

    const finish = (code, overrideStdout) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      let finalMessage = '';
      try {
        finalMessage = fs.readFileSync(lastMessagePath, 'utf8').trim();
      } catch (_) {}
      fs.unlink(lastMessagePath, () => {});
      const files = steps
        .filter((s) => s.type === 'file_edit' && s.status === 'completed')
        .flatMap((s) => s.paths || [])
        .filter(Boolean);
      resolve({
        code,
        stdout: overrideStdout || finalMessage || buildProgressView(steps),
        stderr,
        files,
      });
    };

    const timer = setTimeout(() => {
      if (resolved) return;
      console.error(`[timeout] codex process timed out after ${CODEX_TIMEOUT_MS}ms, killing`);
      try { child.kill('SIGTERM'); } catch (_) {}
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (_) {}
      }, 3000);
      finish(-1, buildProgressView(steps) + '\n\n⚠️ Timed out after ' + Math.round(CODEX_TIMEOUT_MS / 60000) + ' minutes');
    }, CODEX_TIMEOUT_MS);

    const handleEvent = (evt) => {
      captureSessionId(evt, session);
      const item = evt.item;
      if (!item) return;

      if (item.type === 'agent_message') {
        if (!item.text) return;
        if (evt.type === 'item.started') {
          const idx = steps.length;
          steps.push({ type: 'message', text: item.text });
          itemMap.set(item.id, idx);
        } else {
          const idx = itemMap.get(item.id);
          if (idx != null) {
            steps[idx] = { type: 'message', text: item.text };
          } else {
            steps.push({ type: 'message', text: item.text });
          }
        }
        if (onProgress) onProgress(buildProgressView(steps));
      } else if (item.type === 'command_execution') {
        if (evt.type === 'item.started') {
          const idx = steps.length;
          steps.push({
            type: 'command',
            command: item.command || '',
            output: '',
            exit_code: null,
            status: 'in_progress',
          });
          itemMap.set(item.id, idx);
        } else {
          const idx = itemMap.get(item.id);
          const step = {
            type: 'command',
            command: item.command || '',
            output: item.aggregated_output || '',
            exit_code: item.exit_code,
            status: 'completed',
          };
          if (idx != null) {
            steps[idx] = step;
          } else {
            steps.push(step);
          }
        }
        if (onProgress) onProgress(buildProgressView(steps));
      } else if (item.type === 'file_change' || item.type === 'file_edit' || item.type === 'file_write') {
        const paths = item.changes
          ? item.changes.map((c) => c.path).filter(Boolean)
          : [item.path || item.file || ''].filter(Boolean);
        if (evt.type === 'item.started') {
          const idx = steps.length;
          steps.push({ type: 'file_edit', paths, status: 'in_progress' });
          itemMap.set(item.id, idx);
        } else {
          const idx = itemMap.get(item.id);
          const step = { type: 'file_edit', paths, status: 'completed' };
          if (idx != null) steps[idx] = step;
          else steps.push(step);
        }
        if (onProgress) onProgress(buildProgressView(steps));
      }
    };

    child.stdout.on('data', (d) => {
      buffer += d.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          handleEvent(JSON.parse(trimmed));
        } catch (_) {}
      }
    });
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => finish(code));
    child.on('exit', (code) => finish(code));
    child.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      fs.unlink(lastMessagePath, () => {});
      resolve({ code: -1, stdout: '', stderr: err.message });
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });

// Download a Telegram file to local disk, return the local path
const downloadTelegramFile = async (fileId, suggestedName) => {
  const filePath = await bot.downloadFile(fileId, DOWNLOAD_DIR);
  if (suggestedName) {
    const dest = path.join(DOWNLOAD_DIR, `${Date.now()}-${suggestedName}`);
    try {
      fs.renameSync(filePath, dest);
      return dest;
    } catch (_) {}
  }
  return filePath;
};

// Send a local file to Telegram as photo or document
const sendFileToTelegram = async (chatId, filePath) => {
  if (!fs.existsSync(filePath)) return;
  const ext = path.extname(filePath).toLowerCase();
  const caption = path.basename(filePath);
  try {
    if (IMAGE_EXTS.has(ext) && ext !== '.svg') {
      await bot.sendPhoto(chatId, filePath, { caption });
    } else {
      await bot.sendDocument(chatId, filePath, { caption });
    }
  } catch (err) {
    console.error('[sendFile]', filePath, err.message);
  }
};

// Extract attached files (photos, documents) from a Telegram message
const extractAttachments = async (msg) => {
  const images = [];
  const documents = [];

  // Photo: array of sizes, pick the largest
  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    const localPath = await downloadTelegramFile(largest.file_id, `photo_${largest.file_id}.jpg`);
    images.push(localPath);
  }

  // Document
  if (msg.document) {
    const doc = msg.document;
    const name = doc.file_name || `file_${doc.file_id}`;
    const localPath = await downloadTelegramFile(doc.file_id, name);
    const ext = path.extname(name).toLowerCase();
    if (IMAGE_EXTS.has(ext)) {
      images.push(localPath);
    } else {
      documents.push(localPath);
    }
  }

  return { images, documents };
};

// Short ID mapping for callback_data (Telegram has 64-byte limit)
let cbIdCounter = 0;
const cbIdToPath = new Map();
const pathToCbId = new Map();

const getCbId = (fullPath) => {
  if (pathToCbId.has(fullPath)) return pathToCbId.get(fullPath);
  const id = String(++cbIdCounter);
  cbIdToPath.set(id, fullPath);
  pathToCbId.set(fullPath, id);
  return id;
};

// Build inline keyboard buttons for a directory listing
const buildDirButtons = (dirPath, cwdRoot) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  const files = entries.filter((e) => e.isFile()).sort((a, b) => a.name.localeCompare(b.name));
  const skipDirs = new Set(['node_modules', '.git', '__pycache__', '.next', 'dist', '.cache']);
  const visibleDirs = dirs.filter((d) => !skipDirs.has(d.name));

  const resolved = path.resolve(dirPath);
  const rootResolved = path.resolve(cwdRoot);
  const buttons = [];

  // Parent directory
  if (resolved !== rootResolved) {
    buttons.push([{ text: '📁 ..', callback_data: `d:${getCbId(path.dirname(resolved))}` }]);
  }

  // Directories (2 per row)
  for (let i = 0; i < visibleDirs.length; i += 2) {
    const row = [{ text: `📁 ${visibleDirs[i].name}`, callback_data: `d:${getCbId(path.join(resolved, visibleDirs[i].name))}` }];
    if (visibleDirs[i + 1]) {
      row.push({ text: `📁 ${visibleDirs[i + 1].name}`, callback_data: `d:${getCbId(path.join(resolved, visibleDirs[i + 1].name))}` });
    }
    buttons.push(row);
  }

  // Files (2 per row)
  for (let i = 0; i < files.length; i += 2) {
    const ext = path.extname(files[i].name).toLowerCase();
    const icon = IMAGE_EXTS.has(ext) ? '🖼' : '📄';
    const row = [{ text: `${icon} ${files[i].name}`, callback_data: `f:${getCbId(path.join(resolved, files[i].name))}` }];
    if (files[i + 1]) {
      const ext2 = path.extname(files[i + 1].name).toLowerCase();
      const icon2 = IMAGE_EXTS.has(ext2) ? '🖼' : '📄';
      row.push({ text: `${icon2} ${files[i + 1].name}`, callback_data: `f:${getCbId(path.join(resolved, files[i + 1].name))}` });
    }
    buttons.push(row);
  }

  return { buttons, resolved, dirCount: visibleDirs.length, fileCount: files.length };
};

// List directory as a new message
const listDirectory = async (chatId, dirPath, cwdRoot) => {
  try {
    const { buttons, resolved, dirCount, fileCount } = buildDirButtons(dirPath, cwdRoot);
    if (buttons.length === 0) {
      return bot.sendMessage(chatId, `📂 ${resolved}\n(empty)`);
    }
    const header = `📂 ${resolved}\n${dirCount} folders, ${fileCount} files`;
    return bot.sendMessage(chatId, header, { reply_markup: { inline_keyboard: buttons } });
  } catch (err) {
    return bot.sendMessage(chatId, 'cannot read: ' + err.message);
  }
};

// Edit existing message with directory listing (for inline navigation)
const listDirectoryEdit = async (chatId, messageId, dirPath, cwdRoot) => {
  try {
    const { buttons, resolved, dirCount, fileCount } = buildDirButtons(dirPath, cwdRoot);
    if (buttons.length === 0) {
      return bot.editMessageText(`📂 ${resolved}\n(empty)`, { chat_id: chatId, message_id: messageId });
    }
    const header = `📂 ${resolved}\n${dirCount} folders, ${fileCount} files`;
    return bot.editMessageText(header, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (err) {
    return bot.editMessageText('cannot read: ' + err.message, { chat_id: chatId, message_id: messageId });
  }
};

// Handle inline keyboard clicks for file browsing
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  if (!isAllowed(chatId)) return bot.answerCallbackQuery(query.id, { text: 'unauthorized' });

  const data = query.data || '';
  const session = getSession(chatId);

  if (data.startsWith('d:')) {
    const dirPath = cbIdToPath.get(data.slice(2));
    if (!dirPath) return bot.answerCallbackQuery(query.id, { text: 'expired, use /file again' });
    await bot.answerCallbackQuery(query.id);
    return listDirectoryEdit(chatId, query.message.message_id, dirPath, session.cwd);
  }

  if (data.startsWith('f:')) {
    const filePath = cbIdToPath.get(data.slice(2));
    if (!filePath) return bot.answerCallbackQuery(query.id, { text: 'expired, use /file again' });
    await bot.answerCallbackQuery(query.id, { text: 'Sending...' });
    if (!fs.existsSync(filePath)) return bot.sendMessage(chatId, 'file not found: ' + filePath);
    return sendFileToTelegram(chatId, filePath);
  }

  await bot.answerCallbackQuery(query.id);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || msg.caption || '').trim();
  const hasAttachment = !!(msg.photo || msg.document);
  audit(
    chatId,
    'RAW',
    JSON.stringify({
      fromId: msg.from && msg.from.id,
      fromUsername: msg.from && msg.from.username,
      fromIsBot: msg.from && msg.from.is_bot,
      chatType: msg.chat && msg.chat.type,
      text,
      hasAttachment,
    })
  );
  if (!isAllowed(chatId)) {
    audit(chatId, 'DENY', text);
    return bot.sendMessage(chatId, 'unauthorized');
  }
  if (!text && !hasAttachment) return;

  // ── Group chat filtering ──
  // Rules: message must start with @BotName, bot only reads content after that first mention
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
  let groupPromptText = '';
  if (isGroup) {
    // Ignore own messages
    if (msg.from && msg.from.id === botInfo.id) return;
    groupPromptText = extractGroupMentionPrompt(msg, text, botInfo);
    if (groupPromptText == null) return;
  }

  audit(chatId, 'IN', text + (hasAttachment ? ' [+attachment]' : ''));
  const session = getSession(chatId);

  // In group chats, use the extracted text after @BotName for command matching
  const cmd = isGroup ? groupPromptText : text;

  if (cmd === '/start' || cmd === '/help') {
    return bot.sendMessage(
      chatId,
      [
        'Codex bridge ready.',
        '',
        'Commands:',
        '/model - show current model',
        '/model <name> - switch model',
        '/models - list available models',
        '/cwd - show working dir',
        '/cd <path> - change working dir and reset session',
        '/reset - new Codex session',
        '/status - show state',
        '/file <path> - download a file from server',
        '',
        'Send text, photos, or files as prompts to Codex.',
        isGroup ? '\nIn groups: @' + botInfo.username + ' /command' : '',
      ].filter(Boolean).join('\n')
    );
  }
  if (cmd === '/model') return bot.sendMessage(chatId, 'model: ' + session.model);
  if (cmd.startsWith('/model ')) {
    const model = cmd.slice(7).trim();
    if (!AVAILABLE_MODELS.includes(model)) {
      return bot.sendMessage(chatId, 'unknown model. use /models to list');
    }
    session.model = model;
    session.sessionId = null;
    return bot.sendMessage(chatId, 'model -> ' + model + ' (session cleared)');
  }
  if (cmd === '/models') {
    return bot.sendMessage(chatId, 'available:\n' + AVAILABLE_MODELS.join('\n'));
  }
  if (cmd === '/cwd') return bot.sendMessage(chatId, session.cwd);
  if (cmd.startsWith('/cd ')) {
    const nextCwd = path.resolve(session.cwd, cmd.slice(4).trim());
    if (!fs.existsSync(nextCwd)) return bot.sendMessage(chatId, 'path not found: ' + nextCwd);
    session.cwd = nextCwd;
    session.sessionId = null;
    return bot.sendMessage(chatId, 'cwd -> ' + nextCwd);
  }
  if (cmd === '/reset') {
    session.sessionId = null;
    return bot.sendMessage(chatId, 'session cleared');
  }
  if (cmd === '/status') {
    return bot.sendMessage(
      chatId,
      [
        `model: ${session.model}`,
        `cwd: ${session.cwd}`,
        `session: ${session.sessionId || '(new)'}`,
        `busy: ${session.busy}`,
      ].join('\n')
    );
  }
  // /file — browse and download files
  if (cmd === '/file' || cmd === '/files') {
    return listDirectory(chatId, session.cwd, session.cwd);
  }
  if (cmd.startsWith('/file ')) {
    const target = path.resolve(session.cwd, cmd.slice(6).trim());
    if (!fs.existsSync(target)) return bot.sendMessage(chatId, 'not found: ' + target);
    if (fs.statSync(target).isDirectory()) return listDirectory(chatId, target, session.cwd);
    return sendFileToTelegram(chatId, target);
  }
  if (cmd.startsWith('/') && !hasAttachment) return bot.sendMessage(chatId, 'unknown command');

  if (session.busy) return bot.sendMessage(chatId, 'busy, wait for current task');
  session.busy = true;

  // Download attachments
  let attachedImages = [];
  let attachedDocs = [];
  try {
    if (hasAttachment) {
      try {
        const att = await extractAttachments(msg);
        attachedImages = att.images;
        attachedDocs = att.documents;
      } catch (err) {
        console.error('[download]', err.message);
      }
    }

    // Build prompt: in group use only the text after @BotName, in private use full text
    let prompt = isGroup ? groupPromptText : (text || '');

    // In group chats with team bots configured, add team context so the AI
    // knows about its teammates and can hand off work via @mentions
    if (isGroup && TEAM_BOTS.length > 0) {
      const selfEntry = TEAM_BOTS.find(
        (tb) => tb.username.toLowerCase() === botInfo.username.toLowerCase(),
      );
      const selfRole = selfEntry ? selfEntry.role : 'assistant';
      const peers = TEAM_BOTS.filter(
        (tb) => tb.username.toLowerCase() !== botInfo.username.toLowerCase(),
      );
      const teamBlock = [
        `[Team context] You are @${botInfo.username}, role: ${selfRole}.`,
        peers.length > 0
          ? 'Teammates: ' + peers.map((p) => `@${p.username} (${p.role})`).join(', ')
          : '',
        'If you need another bot to continue, end your response with exactly:',
        'HANDOFF @<bot_username>: <task description for that bot>',
        'Only include one HANDOFF line and only if you genuinely need another bot.',
      ]
        .filter(Boolean)
        .join('\n');
      prompt = teamBlock + '\n\n' + prompt;
    }

    if (attachedDocs.length > 0) {
      const docPaths = attachedDocs.map((d) => path.basename(d)).join(', ');
      if (prompt) prompt += '\n\n';
      prompt += `[Attached files saved to: ${attachedDocs.join(', ')}]\n`;
      prompt += `Please read and process these files: ${docPaths}`;
    }
    if (!prompt && attachedImages.length > 0) {
      prompt = 'Please analyze this image.';
    }

    const MAX_TIMEOUT_RETRIES = 3;
    let currentPrompt = prompt;
    let currentImages = attachedImages;
    let progressMsg = await bot.sendMessage(chatId, 'Received. Codex is working...');

    for (let attempt = 0; attempt <= MAX_TIMEOUT_RETRIES; attempt++) {
      let lastEdit = 0;
      let lastShown = '';
      const updateProgress = (chunk) => {
        const now = Date.now();
        if (now - lastEdit < 800 || chunk === lastShown) return;
        lastEdit = now;
        lastShown = chunk;
        const display = chunk.length > 3500 ? chunk.slice(0, 3500) + '\n...' : chunk;
        editHtml(chatId, progressMsg.message_id, '⏳ Working...\n\n' + display).catch(() => {});
      };

      const { code, stdout, stderr, files } = await runCodex(currentPrompt, session, updateProgress, {
        images: currentImages,
      });

      const isTimeout = code === -1 && (stdout || '').includes('Timed out after');

      if (isTimeout && attempt < MAX_TIMEOUT_RETRIES) {
        const progressSoFar = (stdout || '').replace(/\n\n⚠️ Timed out after.*$/, '').trim();
        audit(chatId, 'TIMEOUT_RETRY', `attempt ${attempt + 1}/${MAX_TIMEOUT_RETRIES}`);

        await editHtml(
          chatId, progressMsg.message_id,
          `⏳ Timed out, continuing automatically (${attempt + 1}/${MAX_TIMEOUT_RETRIES})...\n\n${progressSoFar.slice(0, 2000)}`,
        ).catch(() => {});

        // Keep session so codex resumes where it left off
        currentPrompt = [
          'Continue the following task. Do NOT repeat work already done.',
          '',
          'Progress so far:',
          progressSoFar.slice(0, 3000),
          '',
          'Original task:',
          prompt,
        ].join('\n');
        currentImages = [];
        progressMsg = await bot.sendMessage(chatId, `Continuing... (retry ${attempt + 1}/${MAX_TIMEOUT_RETRIES})`);
        continue;
      }

      const out = stdout || stderr || `(exit ${code})`;
      audit(chatId, 'OUT', out);
      const html = markdownToTelegramHtml(out);
      const chunks = splitHtmlForTelegram(html);
      const editOk = await bot
        .editMessageText(chunks[0], {
          chat_id: chatId,
          message_id: progressMsg.message_id,
          parse_mode: 'HTML',
        })
        .then(() => true)
        .catch(() => false);
      if (!editOk) await sendHtml(chatId, out.slice(0, 3500)).catch(() => {});
      for (let i = 1; i < chunks.length; i++) {
        await bot
          .sendMessage(chatId, chunks[i], { parse_mode: 'HTML' })
          .catch(() => sendHtml(chatId, chunks[i]).catch(() => {}));
      }
      const SENDABLE_EXTS = new Set([
        ...IMAGE_EXTS, '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
        '.xlsx', '.xls', '.docx', '.doc', '.pptx', '.csv',
        '.mp3', '.mp4', '.wav', '.avi', '.mov', '.webm',
      ]);
      if (files && files.length > 0) {
        for (const f of files) {
          const fullPath = path.isAbsolute(f) ? f : path.resolve(session.cwd, f);
          const ext = path.extname(fullPath).toLowerCase();
          if (SENDABLE_EXTS.has(ext)) {
            await sendFileToTelegram(chatId, fullPath);
          }
        }
      }

      // ── Group handoff: detect "HANDOFF @BotName: ..." OR "@BotName" mention in codex response ──
      if (isGroup && TEAM_BOTS.length > 0) {
        let handoffSent = false;
        const handoffMatch = out.match(/HANDOFF\s+@(\S+):\s*([\s\S]*)/i);
        if (handoffMatch) {
          const targetUsername = handoffMatch[1];
          const handoffMessage = handoffMatch[2].trim();
          const targetBot = TEAM_BOTS.find(
            (tb) => tb.username.toLowerCase() === targetUsername.toLowerCase(),
          );
          if (targetBot && handoffMessage) {
            audit(chatId, 'HANDOFF', `@${botInfo.username} -> @${targetBot.username}`);
            const outbound = normalizeHandoffMessage(
              `@${targetBot.username} [from @${botInfo.username}] ${handoffMessage}`
            );
            await bot.sendMessage(
              chatId,
              outbound,
            ).catch(() => {});
            handoffSent = true;
          }
        }
        // Fallback: if no HANDOFF keyword but output @mentions a teammate,
        // re-send as a new message so the other bot's bot.on('message') fires
        // (editMessageText only triggers 'edited_message' which bots don't listen to)
        if (!handoffSent) {
          for (const peer of TEAM_BOTS) {
            if (peer.username.toLowerCase() === botInfo.username.toLowerCase()) continue;
            const mentionPattern = new RegExp(`@${peer.username}\\b`, 'i');
            if (mentionPattern.test(out)) {
              audit(chatId, 'MENTION_FORWARD', `@${botInfo.username} -> @${peer.username}`);
              const outbound = normalizeHandoffMessage(
                `@${peer.username} [from @${botInfo.username}] ${out.replace(mentionPattern, '').trim()}`
              );
              await bot.sendMessage(chatId, outbound.slice(0, 4000)).catch(() => {});
              break; // only forward to the first mentioned peer
            }
          }
        }
      }
      break;
    }
  } catch (err) {
    await bot.sendMessage(chatId, 'error: ' + err.message).catch(() => {});
  } finally {
    session.busy = false;
    for (const f of [...attachedImages, ...attachedDocs]) {
      fs.unlink(f, () => {});
    }
  }
});

bot.on('polling_error', (err) => {
  console.error('polling', err.message);
  if (String(err.message).includes('409 Conflict')) {
    bot.stopPolling()
      .catch(() => {})
      .finally(() => process.exit(1));
  }
});
console.log('codex bridge started, allowed chats:', ALLOWED.join(','));
