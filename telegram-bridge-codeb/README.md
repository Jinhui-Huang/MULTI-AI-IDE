# Telegram Codex Bridge

Minimal Node.js bridge for driving the local Codex CLI from a new Telegram bot.

## Setup

1. Create a new Telegram bot with `@BotFather` and copy its token.
2. Copy `.env.example` to `.env`.
3. Set `TELEGRAM_BOT_TOKEN` and `ALLOWED_CHAT_IDS`.
4. Make sure the local Codex CLI works in this shell:
   ```
   codex --version
   ```
5. Install dependencies:
   ```
   cd telegram-bridge-code
   npm install
   ```
6. Start the bridge:
   ```
   npm start
   ```

## Commands

- `/model` - show current model
- `/model <name>` - switch model and reset the session
- `/models` - list configured models
- `/cwd` - show working directory
- `/cd <path>` - switch working directory and reset the session
- `/reset` - start a fresh Codex session
- `/status` - show current state
- anything else - sent to `codex exec`

Multi-turn context is preserved by resuming the Codex session id until `/reset`, `/cd`, or `/model` clears it.

## Security

- `ALLOWED_CHAT_IDS` is the Telegram whitelist.
- Keep `.env` private. It is ignored by this folder's `.gitignore`.
- Default execution uses `CODEX_FULL_AUTO=true`, which maps to `codex exec --full-auto` and keeps execution sandboxed in the workspace.
- Keep `CODEX_DANGEROUS_BYPASS=false` unless you intentionally want Codex to run without approvals and without sandboxing.
- If Git for Windows/MSYS commands fail with `couldn't create signal pipe, Win32 error 5`, start this bridge outside the Codex sandbox and set `CODEX_DANGEROUS_BYPASS=true` for that trusted local bot.
- Every in/out message is appended to `codex-audit.log`.
