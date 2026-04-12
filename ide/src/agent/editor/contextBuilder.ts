import * as fs from 'fs';
import { createLogger } from '../../core/logger';
import { CodeIndexer, CodeFile } from './codeIndexer';
import type { ParsedIntent } from './intentParser';

const log = createLogger('ContextBuilder');

export interface CodeContext {
  fileContent: string;           // 完整文件内容
  fileOverview: string;          // 文件结构概览
  relevantSnippets: string[];    // 相关代码片段
  codeStyle: string;             // 代码风格指南
  relatedAPIs: string;           // 相关 API 文档
  implementationGuide: string;   // 实现指南（来自 NEXT_STEPS.md）
  imports: string[];             // 依赖导入
}

/**
 * 上下文构建器：为 AI 生成完整的代码修改上下文
 *
 * 功能：
 * 1. 读取目标文件内容
 * 2. 提取相关代码片段
 * 3. 收集代码风格信息
 * 4. 查询相关 API 文档
 * 5. 提取实现指南
 */
export class ContextBuilder {
  private indexer: CodeIndexer;
  private styleGuide: string = '';
  private apiDocuments: Map<string, string> = new Map();

  constructor(indexer: CodeIndexer) {
    this.indexer = indexer;
    this.loadStaticResources();
  }

  /**
   * 加载静态资源（代码规范、API 文档等）
   */
  private loadStaticResources(): void {
    // 加载代码规范
    try {
      // 简化版规范（完整版应该从外部文件读取）
      this.styleGuide = this.getDefaultStyleGuide();
      log.info('Code style guide loaded');
    } catch (error) {
      log.warn('Failed to load code style guide');
    }

    // 初始化 API 文档
    this.initializeAPIDocs();
  }

  /**
   * 获取默认代码规范
   */
  private getDefaultStyleGuide(): string {
    return `## TypeScript 代码规范

### 错误处理
\`\`\`typescript
try {
  // 代码
} catch (error) {
  const err = error as { message: string };
  log.error(\`Failed: \${err.message}\`);
  throw error;
}
\`\`\`

### 日志记录
- 使用 createLogger('ComponentName')
- log.info() 信息
- log.warn() 警告
- log.error() 错误

### 异步操作
- 使用 async/await，不用 .then()
- 完整的 try-catch 处理
- 添加日志记录

### 类型系统
- 避免 any 类型
- 使用类型断言 as
- 完整的接口定义

### 命名规范
- 常量: UPPER_SNAKE_CASE
- 变量: camelCase
- 类: PascalCase
- 私有成员: 下划线前缀 _private

### 代码结构
- 导入在顶部
- 日志对象在导入后
- 类定义：属性 → 构造函数 → 公共方法 → 私有方法`;
  }

  /**
   * 初始化 API 文档
   */
  private initializeAPIDocs(): void {
    // ToolRegistry API
    this.apiDocuments.set(
      'ToolRegistry',
      `## ToolRegistry API

class ToolRegistry {
  register(tool: ToolDefinition): void         // 注册工具
  execute(toolId: string, params: any): Promise<string>  // 执行工具
  getAll(): ToolDefinition[]                   // 获取所有工具
  getToolsForPrompt(): string                  // AI 上下文格式化
}`
    );

    // TaskQueue API
    this.apiDocuments.set(
      'TaskQueue',
      `## TaskQueue API

class TaskQueue {
  enqueue(task: AgentTask): void               // 加入队列
  execute(toolRegistry, chatController): Promise<void>  // 执行队列
  on(listener: TaskEventListener): void        // 事件监听
  getCurrentTask(): AgentTask | undefined      // 当前任务
  cancel(taskId: string): boolean              // 取消任务
}`
    );

    // DevAgent API
    this.apiDocuments.set(
      'DevAgent',
      `## DevAgent API

class DevAgent {
  constructor(toolRegistry, chatController)    // 初始化
  async submitTask(objective: string): Promise<string>  // 提交任务
  onTaskUpdate(listener): void                 // 监听更新
  cancelTask(taskId: string): boolean          // 取消任务
  getToolRegistry(): ToolRegistry              // 获取注册表
}`
    );
  }

  /**
   * 为给定的意图构建完整上下文
   */
  async buildContext(intent: ParsedIntent): Promise<CodeContext> {
    log.info(`Building context for: ${intent.filePath}`);

    try {
      // 1. 读取目标文件
      const fileContent = this.readFile(intent.filePath);
      if (!fileContent) {
        throw new Error(`Cannot read file: ${intent.filePath}`);
      }

      // 2. 获取文件概览
      const fileOverview = this.indexer.getFileOverview(intent.filePath);

      // 3. 提取相关代码片段
      const relevantSnippets = this.extractRelevantSnippets(
        intent,
        fileContent
      );

      // 4. 收集相关 API 文档
      const relatedAPIs = this.collectRelatedAPIs(intent, fileContent);

      // 5. 提取实现指南
      const implementationGuide = this.extractImplementationGuide(intent);

      // 6. 提取导入信息
      const imports = this.extractImports(fileContent);

      const context: CodeContext = {
        fileContent,
        fileOverview,
        relevantSnippets,
        codeStyle: this.styleGuide,
        relatedAPIs,
        implementationGuide,
        imports,
      };

      log.info('Context built successfully');
      return context;
    } catch (error) {
      const err = error as { message: string };
      log.error(`Failed to build context: ${err.message}`);
      throw error;
    }
  }

  /**
   * 读取文件内容
   */
  private readFile(filePath: string): string {
    try {
      // 尝试绝对路径
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
      }

      // 尝试相对路径
      const cwd = process.cwd();
      const fullPath = `${cwd}/${filePath}`;
      if (fs.existsSync(fullPath)) {
        return fs.readFileSync(fullPath, 'utf-8');
      }

      log.warn(`File not found: ${filePath}`);
      return '';
    } catch (error) {
      const err = error as { message: string };
      log.error(`Failed to read file: ${err.message}`);
      return '';
    }
  }

  /**
   * 提取相关代码片段
   */
  private extractRelevantSnippets(intent: ParsedIntent, fileContent: string): string[] {
    const snippets: string[] = [];

    // 1. 如果指定了目标，提取该目标周围的代码
    if (intent.targetName) {
      const targetSnippet = this.extractCodeBlock(fileContent, intent.targetName);
      if (targetSnippet) {
        snippets.push(targetSnippet);
      }
    }

    // 2. 提取类定义（如果修改的是类内的方法）
    const classSnippet = this.extractClassDefinition(fileContent);
    if (classSnippet) {
      snippets.push(classSnippet);
    }

    // 3. 提取 imports 部分
    const importsSnippet = this.extractImportsBlock(fileContent);
    if (importsSnippet) {
      snippets.push(importsSnippet);
    }

    // 4. 提取相关的类型定义
    const typeSnippets = this.extractTypeDefinitions(fileContent);
    snippets.push(...typeSnippets);

    return snippets.filter((s) => s.length > 0);
  }

  /**
   * 提取代码块
   */
  private extractCodeBlock(content: string, targetName: string): string {
    const lines = content.split('\n');
    const startIndex = lines.findIndex((line) => line.includes(targetName));

    if (startIndex === -1) return '';

    // 找到代码块的开始和结束（简单启发式）
    let blockStart = startIndex;
    let blockEnd = startIndex + 1;

    // 回溯找起点
    for (let i = startIndex - 1; i >= 0; i--) {
      if (lines[i].trim() === '' || lines[i].match(/^\s*(\/\/|\/\*|\*)/)) {
        blockStart = i;
      } else if (!lines[i].match(/^\s*(async|private|public|protected|static)/)) {
        break;
      }
    }

    // 前进找终点
    let braceCount = 0;
    let foundBrace = false;
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundBrace = true;
        } else if (char === '}') {
          braceCount--;
          if (foundBrace && braceCount === 0) {
            blockEnd = i + 1;
            break;
          }
        }
      }
      if (foundBrace && braceCount === 0) break;
    }

    return lines.slice(blockStart, blockEnd).join('\n');
  }

  /**
   * 提取类定义的签名
   */
  private extractClassDefinition(content: string): string {
    const classMatch = content.match(/^(export\s+)?class\s+\w+\s*{/m);
    if (!classMatch) return '';

    const startIndex = content.indexOf(classMatch[0]);
    const lines = content.substring(startIndex).split('\n').slice(0, 20); // 前 20 行

    return lines.join('\n');
  }

  /**
   * 提取 imports 块
   */
  private extractImportsBlock(content: string): string {
    const lines = content.split('\n');
    const importLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('import ')) {
        importLines.push(line);
      } else if (importLines.length > 0) {
        break;
      }
    }

    return importLines.join('\n');
  }

  /**
   * 提取类型定义
   */
  private extractTypeDefinitions(content: string): string[] {
    const types: string[] = [];
    const typePattern = /^(export\s+)?(type|interface)\s+\w+\s*[{=]/gm;

    let match;
    while ((match = typePattern.exec(content)) !== null) {
      const startIndex = match.index;
      const typeSnippet = this.extractCodeBlock(content, match[0]);
      if (typeSnippet) {
        types.push(typeSnippet);
      }
    }

    return types;
  }

  /**
   * 收集相关 API 文档
   */
  private collectRelatedAPIs(intent: ParsedIntent, fileContent: string): string {
    const apis: string[] = [];

    // 1. 检查文件中使用的类
    for (const [className, apiDoc] of this.apiDocuments) {
      if (fileContent.includes(className)) {
        apis.push(apiDoc);
      }
    }

    // 2. 根据文件名推荐 API
    if (intent.fileName.includes('taskQueue')) {
      apis.push(this.apiDocuments.get('TaskQueue') || '');
    }
    if (intent.fileName.includes('devAgent')) {
      apis.push(this.apiDocuments.get('DevAgent') || '');
    }
    if (intent.fileName.includes('toolRegistry')) {
      apis.push(this.apiDocuments.get('ToolRegistry') || '');
    }

    return apis.filter((a) => a.length > 0).join('\n\n');
  }

  /**
   * 提取实现指南
   */
  private extractImplementationGuide(intent: ParsedIntent): string {
    // 从 NEXT_STEPS.md 中提取相关部分
    try {
      const nextStepsPath = 'NEXT_STEPS.md';
      const cwd = process.cwd();
      const fullPath = `${cwd}/${nextStepsPath}`;

      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');

        // 简单提取：查找与文件名相关的部分
        const fileName = intent.fileName.replace('.ts', '');
        const lines = content.split('\n');
        const relevant: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (
            line.includes(fileName) ||
            line.includes(intent.targetName || '') ||
            line.includes('DAY 6') ||
            line.includes('实现路线')
          ) {
            // 提取前后上下文
            const start = Math.max(0, i - 2);
            const end = Math.min(lines.length, i + 10);
            relevant.push(...lines.slice(start, end));
          }
        }

        return relevant.join('\n').substring(0, 2000); // 限制长度
      }
    } catch (error) {
      log.debug('Could not load implementation guide');
    }

    return '';
  }

  /**
   * 提取 import 语句
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.startsWith('import ')) {
        imports.push(line);
      }
    }

    return imports;
  }
}
