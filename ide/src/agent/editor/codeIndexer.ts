import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../../core/logger';

const log = createLogger('CodeIndexer');

export interface MethodInfo {
  name: string;
  startLine: number;
  endLine: number;
  signature: string;
  isAsync: boolean;
  isPrivate: boolean;
}

export interface ClassInfo {
  name: string;
  startLine: number;
  endLine: number;
  methods: MethodInfo[];
  properties: string[];
}

export interface CodeFile {
  path: string;
  name: string;
  content: string;
  classes: ClassInfo[];
  functions: MethodInfo[];
  imports: string[];
  exports: string[];
}

/**
 * 代码索引器：快速定位和解析代码文件
 *
 * 功能：
 * 1. 索引项目中的所有 TypeScript 文件
 * 2. 解析文件结构（类、方法、函数）
 * 3. 快速查找文件和符号
 * 4. 提取相关代码片段
 */
export class CodeIndexer {
  private index: Map<string, CodeFile> = new Map();
  private projectRoot: string = 'ide/src'; // 扩展到整个 ide/src 目录

  /**
   * 索引整个 agent 项目
   */
  indexProject(): void {
    log.info(`Indexing project: ${this.projectRoot}`);

    this.indexDirectory(this.projectRoot);
    log.info(`Indexed ${this.index.size} files`);
  }

  /**
   * 递归索引目录
   */
  private indexDirectory(dirPath: string): void {
    try {
      const files = fs.readdirSync(dirPath);

      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          // 跳过 node_modules 等
          if (!file.startsWith('.') && file !== 'node_modules') {
            this.indexDirectory(fullPath);
          }
        } else if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
          this.indexFile(fullPath);
        }
      }
    } catch (error) {
      log.warn(`Failed to index directory ${dirPath}: ${error}`);
    }
  }

  /**
   * 索引单个文件
   */
  private indexFile(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const fileName = path.basename(filePath);

      const codeFile: CodeFile = {
        path: filePath,
        name: fileName,
        content,
        classes: this.parseClasses(content),
        functions: this.parseFunctions(content),
        imports: this.parseImports(content),
        exports: this.parseExports(content),
      };

      this.index.set(filePath, codeFile);
      log.debug(`Indexed file: ${fileName}`);
    } catch (error) {
      log.warn(`Failed to index file ${filePath}: ${error}`);
    }
  }

  /**
   * 从内容中解析类定义
   */
  private parseClasses(content: string): ClassInfo[] {
    const classes: ClassInfo[] = [];
    const classPattern = /^(export\s+)?(class|interface)\s+(\w+)/gm;

    let match;
    while ((match = classPattern.exec(content)) !== null) {
      const className = match[3];
      const startLine = content.substring(0, match.index).split('\n').length;

      // 简单估计：找到下一个 class 或文件末尾
      const nextClassMatch = classPattern.exec(content);
      const endLine = nextClassMatch
        ? content.substring(0, nextClassMatch.index).split('\n').length
        : content.split('\n').length;

      // 重置正则的 lastIndex
      if (nextClassMatch) {
        classPattern.lastIndex -= nextClassMatch[0].length;
      }

      const classContent = content.substring(match.index, match.index + 2000);
      const methods = this.parseMethodsFromClass(classContent, startLine);

      classes.push({
        name: className,
        startLine,
        endLine,
        methods,
        properties: [],
      });
    }

    return classes;
  }

  /**
   * 从类内容中解析方法
   */
  private parseMethodsFromClass(classContent: string, classStartLine: number): MethodInfo[] {
    const methods: MethodInfo[] = [];
    const methodPattern = /(async\s+)?(\w+)\s*\(([^)]*)\)\s*[:;{]/g;

    let match;
    while ((match = methodPattern.exec(classContent)) !== null) {
      const isAsync = !!match[1];
      const methodName = match[2];

      // 跳过构造函数参数等
      if (methodName === 'constructor' || methodName === 'interface') {
        continue;
      }

      const isPrivate = classContent.substring(0, match.index).match(/private\s+\w+\s*$/);
      const signature = match[0];

      methods.push({
        name: methodName,
        startLine: classStartLine + classContent.substring(0, match.index).split('\n').length,
        endLine: classStartLine + classContent.substring(0, match.index).split('\n').length + 5, // 估计
        signature: signature.trim(),
        isAsync,
        isPrivate: !!isPrivate,
      });
    }

    return methods;
  }

  /**
   * 从内容中解析函数定义
   */
  private parseFunctions(content: string): MethodInfo[] {
    const functions: MethodInfo[] = [];
    const funcPattern = /^(export\s+)?(async\s+)?function\s+(\w+)\s*\(/gm;

    let match;
    while ((match = funcPattern.exec(content)) !== null) {
      const functionName = match[3];
      const isAsync = !!match[2];
      const startLine = content.substring(0, match.index).split('\n').length;

      functions.push({
        name: functionName,
        startLine,
        endLine: startLine + 10,
        signature: match[0],
        isAsync,
        isPrivate: false,
      });
    }

    return functions;
  }

  /**
   * 解析 import 语句
   */
  private parseImports(content: string): string[] {
    const imports: string[] = [];
    const importPattern = /^import\s+.*from\s+['"](.*)['"]/gm;

    let match;
    while ((match = importPattern.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  /**
   * 解析 export 语句
   */
  private parseExports(content: string): string[] {
    const exports: string[] = [];
    const exportPattern = /^export\s+(class|function|interface|const|type)\s+(\w+)/gm;

    let match;
    while ((match = exportPattern.exec(content)) !== null) {
      exports.push(match[2]);
    }

    return exports;
  }

  /**
   * 查找文件
   */
  findFile(filePath: string): CodeFile | undefined {
    // 完整路径匹配
    if (this.index.has(filePath)) {
      return this.index.get(filePath);
    }

    // 文件名匹配
    const baseName = path.basename(filePath);
    for (const [key, file] of this.index) {
      if (file.name === baseName) {
        return file;
      }
    }

    return undefined;
  }

  /**
   * 查找类
   */
  findClass(filePath: string, className: string): ClassInfo | undefined {
    const file = this.findFile(filePath);
    if (!file) return undefined;

    return file.classes.find((c) => c.name === className);
  }

  /**
   * 查找方法
   */
  findMethod(filePath: string, className: string, methodName: string): MethodInfo | undefined {
    const classInfo = this.findClass(filePath, className);
    if (!classInfo) return undefined;

    return classInfo.methods.find((m) => m.name === methodName);
  }

  /**
   * 获取文件相关的导入和被导入
   */
  getRelatedFiles(filePath: string): CodeFile[] {
    const file = this.findFile(filePath);
    if (!file) return [];

    const related: CodeFile[] = [];

    // 1. 文件导入的其他文件
    for (const importPath of file.imports) {
      const resolvedPath = this.resolveImportPath(filePath, importPath);
      const imported = this.findFile(resolvedPath);
      if (imported) {
        related.push(imported);
      }
    }

    // 2. 导入这个文件的文件
    for (const [key, otherFile] of this.index) {
      if (otherFile.imports.some((imp) => this.importsFile(filePath, imp))) {
        related.push(otherFile);
      }
    }

    return related;
  }

  /**
   * 解析导入路径
   */
  private resolveImportPath(fromFile: string, importPath: string): string {
    if (importPath.startsWith('.')) {
      const dir = path.dirname(fromFile);
      return path.normalize(path.join(dir, importPath));
    }
    return importPath;
  }

  /**
   * 检查导入是否匹配文件
   */
  private importsFile(filePath: string, importPath: string): boolean {
    const baseName = path.basename(filePath).replace('.ts', '');
    return importPath.includes(baseName);
  }

  /**
   * 获取指定行数的代码上下文
   */
  getCodeContext(filePath: string, startLine: number, endLine: number): string {
    const file = this.findFile(filePath);
    if (!file) return '';

    const lines = file.content.split('\n');
    const start = Math.max(0, startLine - 1);
    const end = Math.min(lines.length, endLine);

    return lines.slice(start, end).join('\n');
  }

  /**
   * 获取文件的概览
   */
  getFileOverview(filePath: string): string {
    const file = this.findFile(filePath);
    if (!file) return '';

    let overview = `## File: ${file.name}\n\n`;

    if (file.imports.length > 0) {
      overview += '### Imports\n';
      file.imports.forEach((imp) => {
        overview += `- ${imp}\n`;
      });
      overview += '\n';
    }

    if (file.classes.length > 0) {
      overview += '### Classes\n';
      file.classes.forEach((cls) => {
        overview += `- **${cls.name}** (lines ${cls.startLine}-${cls.endLine})\n`;
        cls.methods.forEach((method) => {
          overview += `  - ${method.isAsync ? 'async ' : ''}${method.name}()\n`;
        });
      });
      overview += '\n';
    }

    if (file.functions.length > 0) {
      overview += '### Functions\n';
      file.functions.forEach((func) => {
        overview += `- ${func.isAsync ? 'async ' : ''}${func.name}()\n`;
      });
      overview += '\n';
    }

    if (file.exports.length > 0) {
      overview += '### Exports\n';
      file.exports.forEach((exp) => {
        overview += `- ${exp}\n`;
      });
    }

    return overview;
  }
}
