# Telegram ↔ Claude Code Bridge

Minimal Node.js bridge so you can drive `claude` CLI on this machine from Telegram.

## Setup

1. **Create bot**: Telegram → `@BotFather` → `/newbot` → copy token.
2. **Get your chat id**: message `@userinfobot`, copy your numeric id.
3. **Install Claude Code CLI** and make sure `claude --version` works in a normal shell.
4. **Install deps**:
   ```
   cd telegram-bridge
   npm install
   ```
5. **Configure**:
   ```
   cp .env.example .env
   ```
   Edit `.env`: set `TELEGRAM_BOT_TOKEN`, `ALLOWED_CHAT_IDS` (comma-separated), `DEFAULT_CWD`.
6. **Run**:
   ```
   npm start
   ```
   Send `/start` to your bot from Telegram.

## Commands

- `/cwd` — print working dir
- `/cd <path>` — switch working dir (also resets session)
- `/reset` — start a fresh Claude session
- `/status` — show state
- anything else → sent as a prompt to Claude Code

Multi-turn context is preserved via `--resume <session_id>` until you `/reset` or `/cd`.

## Run as Windows service

Option A — pm2:
```
npm i -g pm2 pm2-windows-startup
pm2 start bridge.js --name claude-bridge
pm2 save
pm2-startup install
```

Option B — Task Scheduler: create a task "At log on" running `node d:\ai-agent-ide\multi-ai-ide\telegram-bridge\bridge.js`.

## Security

- `ALLOWED_CHAT_IDS` whitelist is the only gate — keep your bot token private.
- `PERMISSION_MODE=acceptEdits` auto-approves file edits. Use `default` if you want Claude to ask (but then you can't approve from Telegram easily). For destructive commands, prefer `plan` mode and manually run follow-ups.
- Every in/out message is appended to `audit.log`.
- Bridge refuses new prompts while one is running (per chat).