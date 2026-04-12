import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExtToWebMsg, WebToExtMsg, CodeDiff } from '../types/protocol';
import { createLogger } from '../core/logger';
import { ConfigManager } from '../core/config';
import { ChatController } from './chatController';
import { CodeEditAgent } from '../codeEdit/codeEditAgent';
import { AgentRuntime } from '../agent/agentRuntime';

const log = createLogger('chatViewProvider');

interface PendingDiffs {
  messageId: string;
  diffs: CodeDiff[];
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private configManager: ConfigManager;
  private chatController = new ChatController();
  private codeEditAgent?: CodeEditAgent;
  private agentRuntime?: AgentRuntime;
  // 左边 panel 独立的配置状态（不受全局影响）
  private localProvider: string = '';
  private localModel: string = '';
  // Diff 预览状态
  private pendingDiffs: PendingDiffs | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.configManager = ConfigManager.getInstance();
    // 初始化本地配置
    const config = this.configManager.getConfig();
    this.localProvider = config.provider;
    this.localModel = config.model;

    // 初始化代码编辑代理
    const projectRoot = this.resolveProjectRoot();
    if (projectRoot) {
      this.agentRuntime = new AgentRuntime(projectRoot);
      this.codeEditAgent = new CodeEditAgent(projectRoot, this.chatController);
      log.info(`CodeEditAgent initialized in ChatViewProvider with root: ${projectRoot}, provider: ${this.localProvider}`);
    }

    // 监听编辑器变化，动态更新 projectRoot 和发送当前文件信息
    vscode.window.onDidChangeActiveTextEditor(() => {
      this.updateProjectRoot();
      this.sendCurrentFileInfo();
    });
  }

  /**
   * 根据当前打开的文件动态解析 projectRoot
   */
  private resolveProjectRoot(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined;
    }

    // 如果有当前编辑器，使用其所在位置
    const currentFile = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (currentFile) {
      for (const folder of workspaceFolders) {
        if (currentFile.startsWith(folder.uri.fsPath)) {
          return folder.uri.fsPath;
        }
      }
    }

    // 默认使用第一个 workspace 文件夹
    return workspaceFolders[0].uri.fsPath;
  }

  /**
   * 当编辑器切换时，更新 projectRoot（如果需要）
   */
  private updateProjectRoot(): void {
    const newRoot = this.resolveProjectRoot();
    if (newRoot && (!this.agentRuntime || newRoot !== this.agentRuntime.getProjectRoot())) {
      log.info(`Updating projectRoot to: ${newRoot}`);
      this.agentRuntime = new AgentRuntime(newRoot);
      this.codeEditAgent = new CodeEditAgent(newRoot, this.chatController);
    }
  }

  /**
   * 向 WebView 发送当前文件信息
   */
  private sendCurrentFileInfo(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.postMessage({
        type: 'current_file_changed',
        payload: {
          filePath: null,
          fileName: null,
          exists: false,
        },
      });
      return;
    }

    const filePath = editor.document.uri.fsPath;
    const fileName = editor.document.fileName.split(/[\\/]/).pop() || '';

    this.postMessage({
      type: 'current_file_changed',
      payload: {
        filePath,
        fileName,
        exists: true,
      },
    });

    log.info(`Sent current file info: ${fileName} (${filePath})`);
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: WebToExtMsg) => {
      this.handleMessage(msg);
    });
  }

  postMessage(msg: ExtToWebMsg) {
    this.view?.webview.postMessage(msg);
  }

  private async handleMessage(msg: WebToExtMsg) {
    switch (msg.type) {
      case 'ready': {
        this.postMessage({
          type: 'init',
          payload: {
            theme: vscode.window.activeColorTheme.kind === 1 ? 'light' : 'dark',
            config: {
              provider: this.localProvider,
              model: this.localModel,
            },
          },
        });
        // 在 WebView 准备好后发送当前文件信息
        this.sendCurrentFileInfo();
        break;
      }
      case 'ping':
        log.info('Received ping from WebView');
        this.postMessage({ type: 'pong' });
        break;
      case 'chat/send':
        log.info(`User: ${msg.payload.text}${msg.payload.images?.length ? ` [+${msg.payload.images.length} images]` : ''}`);
        this.handleChatSend(msg.payload.text, msg.payload.images);
        break;
      case 'chat/cancel':
        this.chatController.cancel();
        break;

      // Settings handlers
      case 'settings/getProviders': {
        const allConfig = await this.configManager.getAllProvidersConfig();
        // 返回本地配置的 activeProviderId，而不是全局配置
        const configForWebView = {
          ...allConfig,
          activeProviderId: this.localProvider,
          activeModel: this.localModel,
        };
        log.info(`[LEFT PANEL] Sending settings/providers: activeProviderId=${this.localProvider} (local), global=${allConfig.activeProviderId}`);
        this.postMessage({ type: 'settings/providers', payload: configForWebView });
        break;
      }
      case 'settings/saveProvider': {
        const providerData = { ...msg.payload };
        const realApiKey = providerData.apiKey;
        if (realApiKey && realApiKey !== '••••••••') {
          await this.configManager.setApiKeyForProvider(providerData.id, realApiKey);
        }
        providerData.apiKey = undefined;
        await this.configManager.saveProviderConfig(providerData);
        const updated = await this.configManager.getAllProvidersConfig();
        this.postMessage({ type: 'settings/providers', payload: updated });
        break;
      }
      case 'settings/deleteProvider': {
        await this.configManager.deleteProviderConfig(msg.payload.id);
        const updated = await this.configManager.getAllProvidersConfig();
        this.postMessage({ type: 'settings/providers', payload: updated });
        break;
      }
      case 'settings/setActive': {
        // 更新左边 panel 的本地配置（不影响全局）
        this.localProvider = msg.payload.providerId;
        this.localModel = msg.payload.model;
        log.info(`[LEFT PANEL] Provider changed: ${this.localProvider}/${this.localModel}`);

        this.postMessage({
          type: 'init',
          payload: {
            theme: vscode.window.activeColorTheme.kind === 1 ? 'light' : 'dark',
            config: { provider: this.localProvider, model: this.localModel },
          },
        });

        // 获取全局配置，但替换 activeProviderId 为本地配置
        const updatedConfig = await this.configManager.getAllProvidersConfig();
        const configForWebView = {
          ...updatedConfig,
          activeProviderId: this.localProvider,  // ← 关键：使用本地配置
          activeModel: this.localModel,
        };
        this.postMessage({ type: 'settings/providers', payload: configForWebView });
        break;
      }
      case 'settings/testProvider': {
        await this.handleTestProvider(msg.payload.providerId);
        break;
      }
      case 'settings/detectLocalModels': {
        await this.handleDetectLocalModels(msg.payload.baseUrl || 'http://localhost:11434/v1');
        break;
      }
      case 'settings/open':
        break;

      // Code diff handlers
      case 'code/applyDiffs': {
        await this.handleApplyDiffs();
        break;
      }
      case 'code/rejectDiffs': {
        await this.handleRejectDiffs();
        break;
      }
    }
  }

  /**
   * 应用待处理的 diff
   */
  private async handleApplyDiffs(): Promise<void> {
    if (!this.pendingDiffs || !this.codeEditAgent) {
      log.warn('[CHAT] No pending diffs to apply');
      return;
    }

    const { messageId, diffs } = this.pendingDiffs;

    try {
      log.info(`[CODE-EDIT] Applying ${diffs.length} diffs...`);
      const result = await this.codeEditAgent.applyDiffs(diffs);

      if (result.success) {
        // 刷新编辑器
        if (result.appliedFiles && result.appliedFiles.length > 0) {
          for (const filePath of result.appliedFiles) {
            const uri = vscode.Uri.file(filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { preview: false });
          }
        }

        this.postMessage({
          type: 'code/applyResult',
          payload: {
            success: true,
            appliedFiles: result.appliedFiles,
          },
        });

        log.info(`[CODE-EDIT] ✅ Applied ${result.appliedFiles?.length || 0} files`);
      } else {
        this.postMessage({
          type: 'code/applyResult',
          payload: {
            success: false,
            error: result.error,
          },
        });

        log.error(`[CODE-EDIT] ✗ Apply failed: ${result.error}`);
      }
    } catch (error) {
      const err = error as { message: string };
      log.error(`[CODE-EDIT] Error applying diffs: ${err.message}`);
      this.postMessage({
        type: 'code/applyResult',
        payload: {
          success: false,
          error: err.message,
        },
      });
    } finally {
      this.pendingDiffs = null;
      this.postMessage({ type: 'chat/done', payload: { id: messageId } });
    }
  }

  /**
   * 拒绝待处理的 diff
   */
  private async handleRejectDiffs(): Promise<void> {
    if (!this.pendingDiffs) {
      log.warn('[CODE-EDIT] No pending diffs to reject');
      return;
    }

    const { messageId } = this.pendingDiffs;

    log.info('[CODE-EDIT] Diffs rejected by user');
    this.pendingDiffs = null;

    this.postMessage({
      type: 'code/applyResult',
      payload: {
        success: false,
        error: 'User rejected the changes',
      },
    });

    this.postMessage({ type: 'chat/done', payload: { id: messageId } });
  }


  clearHistory() {
    this.chatController.clearHistory();
    this.postMessage({ type: 'chat/clear' });
  }

  private async handleDetectLocalModels(baseUrl: string) {
    try {
      // Extract base URL for ollama API (remove /v1 suffix if present)
      const ollamaBaseUrl = baseUrl.replace(/\/v1\/?$/, '');
      const tagsUrl = `${ollamaBaseUrl}/api/tags`;

      log.info(`Detecting local models from: ${tagsUrl}`);

      const response = await fetch(tagsUrl, { timeout: 5000 });
      if (!response.ok) {
        this.postMessage({ type: 'settings/detectResult', payload: { success: false, message: `Failed to detect models: ${response.statusText}` } });
        return;
      }

      const data = (await response.json()) as { models: Array<{ name: string }> };
      const models = data.models?.map((m) => m.name) ?? [];

      if (models.length === 0) {
        this.postMessage({ type: 'settings/detectResult', payload: { success: false, message: 'No models found running on Ollama' } });
        return;
      }

      log.info(`Detected ${models.length} models: ${models.join(', ')}`);

      // Generate provider configs for each model
      const providers = models.map((modelName) => ({
        id: modelName,
        name: modelName,
        type: 'local' as const,
        baseUrl: baseUrl,
        models: [modelName],
        defaultModel: modelName,
        enabled: true,
      }));

      this.postMessage({ type: 'settings/detectResult', payload: { success: true, providers, message: `Found ${models.length} models` } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Failed to detect local models: ${message}`);
      this.postMessage({ type: 'settings/detectResult', payload: { success: false, message: `Connection failed: ${message}` } });
    }
  }

  private async handleTestProvider(providerId: string) {
    try {
      const providers = await this.configManager.getProviderConfigs();
      const provider = providers.find((p) => p.id === providerId);
      if (!provider) {
        this.postMessage({ type: 'settings/testResult', payload: { providerId, success: false, message: 'Provider not found' } });
        return;
      }

      const apiKey = provider.type === 'online' ? await this.configManager.getApiKeyForProvider(providerId) : undefined;
      if (provider.type === 'online' && !apiKey) {
        this.postMessage({ type: 'settings/testResult', payload: { providerId, success: false, message: 'API Key not configured' } });
        return;
      }

      const { AIGateway } = await import('../../../ai-gateway/src');
      const gateway = new AIGateway();
      const abortController = new AbortController();
      setTimeout(() => abortController.abort(), 10000);

      const stream = gateway.chatStream(
        providerId,
        { messages: [{ role: 'user', content: 'Hi' }], model: provider.defaultModel, maxTokens: 10 },
        apiKey || 'ollama',
        provider.baseUrl || undefined,
        abortController.signal,
      );

      for await (const chunk of stream) {
        if (chunk.type === 'delta' || chunk.type === 'done') {
          this.postMessage({ type: 'settings/testResult', payload: { providerId, success: true, message: 'Connection successful' } });
          abortController.abort();
          return;
        }
        if (chunk.type === 'error') {
          this.postMessage({ type: 'settings/testResult', payload: { providerId, success: false, message: chunk.error || 'Unknown error' } });
          return;
        }
      }
      this.postMessage({ type: 'settings/testResult', payload: { providerId, success: true, message: 'Connection successful' } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('aborted')) {
        this.postMessage({ type: 'settings/testResult', payload: { providerId, success: true, message: 'Connection successful' } });
      } else {
        this.postMessage({ type: 'settings/testResult', payload: { providerId, success: false, message } });
      }
    }
  }

  private async handleChatSend(text: string, images?: import('../types/protocol').ImageAttachment[]) {
    const id = `msg-${Date.now()}`;
    try {
      const currentFilePath = vscode.window.activeTextEditor?.document.uri.fsPath;

      log.info(`[CHAT] User message: "${text}"`);
      log.info(`[CHAT] currentFile: ${currentFilePath}, codeEditAgentReady: ${!!this.codeEditAgent}`);

      // 检测是否为代码编辑请求
      const isCodeRequest = this.codeEditAgent?.isCodeEditRequest(text) ?? false;

      if (isCodeRequest && currentFilePath && this.codeEditAgent) {
        // 代码修改请求：使用 CodeEditAgent 处理
        log.info(`[CODE-EDIT] Code request detected`);

        this.postMessage({
          type: 'chat/stream',
          payload: { id, delta: '🔧 代码编辑模式启动...\n' },
        });

        try {
          // 显示步骤
          this.postMessage({
            type: 'chat/stream',
            payload: { id, delta: '\n📋 分析流程：\n' },
          });

          this.postMessage({
            type: 'chat/stream',
            payload: { id, delta: '1️⃣  收集代码上下文...\n' },
          });

          this.postMessage({
            type: 'chat/stream',
            payload: { id, delta: '2️⃣  构建提示词...\n' },
          });

          this.postMessage({
            type: 'chat/stream',
            payload: { id, delta: '3️⃣  调用 AI 生成 diff...\n' },
          });

          const analyzeResult = await this.codeEditAgent.analyze({
            userText: text,
            currentFilePath,
            provider: this.localProvider,
            model: this.localModel,
          });

          if (analyzeResult.success && analyzeResult.diffs && analyzeResult.diffs.length > 0) {
            log.info(`[CODE-EDIT] ✅ Generated ${analyzeResult.diffs.length} diffs`);

            this.postMessage({
              type: 'chat/stream',
              payload: { id, delta: '\n✅ 成功生成修改建议：\n\n' },
            });

            // 显示修改摘要
            for (const diff of analyzeResult.diffs) {
              const fileName = diff.filePath.split(/[\\/]/).pop() || diff.filePath;
              this.postMessage({
                type: 'chat/stream',
                payload: {
                  id,
                  delta: `  📝 ${fileName}: +${diff.addedLines}/-${diff.removedLines}\n`,
                },
              });
            }

            this.postMessage({
              type: 'chat/stream',
              payload: { id, delta: '\n等待你的确认...\n' },
            });

            // 保存待应用的 diff
            this.pendingDiffs = { messageId: id, diffs: analyzeResult.diffs };

            // 发送 diff 预览给 WebView
            this.postMessage({
              type: 'code/diffPreview',
              payload: {
                messageId: id,
                diffs: analyzeResult.diffs,
              },
            });

            log.info(`[CODE-EDIT] Diff preview sent to WebView`);
          } else if (!analyzeResult.success) {
            log.warn(`[CODE-EDIT] ✗ Analysis failed: ${analyzeResult.error}`);

            this.postMessage({
              type: 'chat/stream',
              payload: {
                id,
                delta: `\n❌ 代码分析失败：${analyzeResult.error}\n\n您可以尝试用普通聊天提问。\n`,
              },
            });

            this.postMessage({ type: 'chat/done', payload: { id } });
          } else {
            log.warn(`[CODE-EDIT] No diffs generated`);

            this.postMessage({
              type: 'chat/stream',
              payload: {
                id,
                delta: '\nℹ️  AI 认为无需修改代码。\n',
              },
            });

            this.postMessage({ type: 'chat/done', payload: { id } });
          }
        } catch (agentErr: unknown) {
          const agentMessage = agentErr instanceof Error ? agentErr.message : String(agentErr);
          log.error(`[CODE-EDIT] Error: ${agentMessage}`);

          this.postMessage({
            type: 'chat/stream',
            payload: { id, delta: `\n❌ 代码编辑出错：${agentMessage}\n` },
          });

          this.postMessage({ type: 'chat/done', payload: { id } });
        }
      } else {
        // 普通聊天请求
        log.info(`[CHAT] Regular chat message`);

        let chatText = text;
        if (currentFilePath) {
          const fileName = currentFilePath.split(/[\\/]/).pop() || 'unknown';
          chatText = `${text}\n\n[System: Current file: ${fileName}]`;
          log.info(`[CHAT] Added file context hint for: ${fileName}`);
        }

        let fullResponse = '';
        for await (const chunk of this.chatController.sendMessage(chatText, images, this.localProvider, this.localModel)) {
          if (chunk.type === 'delta') {
            fullResponse += chunk.content ?? '';
            this.postMessage({ type: 'chat/stream', payload: { id, delta: chunk.content ?? '' } });
          } else if (chunk.type === 'done') {
            this.postMessage({ type: 'chat/done', payload: { id } });
          } else if (chunk.type === 'error') {
            this.postMessage({ type: 'chat/error', payload: { id, message: chunk.error ?? 'Unknown error' } });
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`[CHAT] Error: ${message}`);
      this.postMessage({ type: 'chat/error', payload: { id, message } });
    }
  }


  private getHtml(webview: vscode.Webview): string {
    const isDev = process.env.VITE_DEV === 'true';
    const nonce = getNonce();

    if (isDev) {
      const cspSource = webview.cspSource;
      return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${cspSource} 'unsafe-inline';
             img-src ${cspSource} data: blob:;
             script-src 'nonce-${nonce}' http://localhost:5173 ws://localhost:5173 'unsafe-inline';" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="http://localhost:5173/@vite/client"></script>
  <script type="module" nonce="${nonce}" src="http://localhost:5173/src/main.tsx"></script>
</body>
</html>`;
    } else {
      const distUri = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
      const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'main.js'));
      const cssPath = vscode.Uri.joinPath(distUri, 'main.css');
      const hasCss = fs.existsSync(cssPath.fsPath);
      const styleTag = hasCss
        ? `<link rel="stylesheet" href="${webview.asWebviewUri(cssPath)}" />`
        : '';

      return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             img-src ${webview.cspSource} data: blob:;
             script-src 'nonce-${nonce}';" />
  ${styleTag}
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
  }
}

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
