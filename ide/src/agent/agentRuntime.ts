import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import { createLogger } from '../core/logger';

const log = createLogger('AgentRuntime');

export interface FileInfo {
  path: string;
  content: string;
  size: number;
}

export interface CommandResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export interface FileChange {
  path: string;
  content: string;
  action: 'create' | 'modify' | 'delete';
}

/**
 * AgentRuntime: 直接访问文件系统和执行命令的核心引擎
 *
 * 这是 Agent 与真实系统交互的接口，类似 Claude Code 的设计
 *
 * 特点:
 * - 直接文件系统访问 (无 postMessage 延迟)
 * - 直接命令执行 (npm, git, shell 等)
 * - 同步和异步支持
 * - 完整的错误处理和日志
 */
export class AgentRuntime {
  private projectRoot: string;
  private workspaceRoot: string;

  constructor(projectRoot?: string) {
    // 如果没有指定，使用当前工作目录的 ide/src
    this.projectRoot = projectRoot || process.cwd();
    this.workspaceRoot = this.findWorkspaceRoot(this.projectRoot);
    log.info(`AgentRuntime initialized: ${this.projectRoot}`);
  }

  /**
   * 找到 package.json 所在的目录作为工作空间根
   */
  private findWorkspaceRoot(startPath: string): string {
    let current = startPath;
    while (current !== path.dirname(current)) {
      if (fs.existsSync(path.join(current, 'package.json'))) {
        return current;
      }
      current = path.dirname(current);
    }
    return startPath;
  }

  // ===== 文件操作 =====

  /**
   * 读取文件内容
   */
  async readFile(filePath: string): Promise<string> {
    try {
      const fullPath = this.resolvePath(filePath);
      log.info(`Reading file: ${fullPath}`);
      const content = fs.readFileSync(fullPath, 'utf-8');
      return content;
    } catch (error) {
      const err = error as { message: string };
      log.error(`Failed to read file ${filePath}: ${err.message}`);
      throw new Error(`Cannot read file: ${filePath}\n${err.message}`);
    }
  }

  /**
   * 写入文件
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const fullPath = this.resolvePath(filePath);
      log.info(`Writing file: ${fullPath}`);

      // 创建目录如果不存在
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        log.info(`Created directory: ${dir}`);
      }

      fs.writeFileSync(fullPath, content, 'utf-8');
      log.info(`File written successfully: ${fullPath}`);
    } catch (error) {
      const err = error as { message: string };
      log.error(`Failed to write file ${filePath}: ${err.message}`);
      throw new Error(`Cannot write file: ${filePath}\n${err.message}`);
    }
  }

  /**
   * 获取文件信息
   */
  async getFileInfo(filePath: string): Promise<FileInfo> {
    try {
      const fullPath = this.resolvePath(filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const stat = fs.statSync(fullPath);

      return {
        path: filePath,
        content,
        size: stat.size,
      };
    } catch (error) {
      const err = error as { message: string };
      throw new Error(`Cannot get file info: ${filePath}\n${err.message}`);
    }
  }

  /**
   * 列出目录内容
   */
  async listDirectory(dirPath: string, recursive: boolean = false): Promise<string[]> {
    try {
      const fullPath = this.resolvePath(dirPath);
      log.info(`Listing directory: ${fullPath} (recursive: ${recursive})`);

      const files: string[] = [];

      const walk = (dir: string, prefix: string = '') => {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          // 跳过隐藏文件和 node_modules
          if (item.startsWith('.') || item === 'node_modules') continue;

          const itemPath = path.join(dir, item);
          const relativePath = prefix ? `${prefix}/${item}` : item;
          const stat = fs.statSync(itemPath);

          if (stat.isDirectory()) {
            files.push(relativePath + '/');
            if (recursive) {
              walk(itemPath, relativePath);
            }
          } else {
            files.push(relativePath);
          }
        }
      };

      walk(fullPath);
      return files;
    } catch (error) {
      const err = error as { message: string };
      throw new Error(`Cannot list directory: ${dirPath}\n${err.message}`);
    }
  }

  /**
   * 删除文件或目录
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      const fullPath = this.resolvePath(filePath);
      log.info(`Deleting: ${fullPath}`);

      if (fs.statSync(fullPath).isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }

      log.info(`Deleted successfully: ${fullPath}`);
    } catch (error) {
      const err = error as { message: string };
      throw new Error(`Cannot delete: ${filePath}\n${err.message}`);
    }
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(filePath);
      return fs.existsSync(fullPath);
    } catch {
      return false;
    }
  }

  // ===== 命令执行 =====

  /**
   * 执行命令并等待完成
   */
  async executeCommand(command: string, options?: { cwd?: string }): Promise<CommandResult> {
    try {
      const cwd = options?.cwd ? this.resolvePath(options.cwd) : this.workspaceRoot;
      const startTime = Date.now();

      log.info(`Executing command: ${command}`);
      log.info(`Working directory: ${cwd}`);

      try {
        const stdout = execSync(command, {
          cwd,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          maxBuffer: 10 * 1024 * 1024, // 10MB
        });

        const duration = Date.now() - startTime;
        log.info(`Command succeeded in ${duration}ms`);

        return {
          command,
          stdout,
          stderr: '',
          exitCode: 0,
          duration,
        };
      } catch (error: any) {
        const duration = Date.now() - startTime;
        const stderr = error.stderr?.toString() || error.message || '';
        const stdout = error.stdout?.toString() || '';

        log.warn(`Command failed in ${duration}ms with exit code ${error.status}`);

        return {
          command,
          stdout,
          stderr,
          exitCode: error.status || 1,
          duration,
        };
      }
    } catch (error) {
      const err = error as { message: string };
      throw new Error(`Cannot execute command: ${command}\n${err.message}`);
    }
  }

  /**
   * 执行命令并流式返回输出
   */
  async *executeCommandStream(
    command: string,
    options?: { cwd?: string }
  ): AsyncIterable<{ type: 'stdout' | 'stderr' | 'exit'; data: string }> {
    const cwd = options?.cwd ? this.resolvePath(options.cwd) : this.workspaceRoot;
    log.info(`Executing command (streaming): ${command}`);

    try {
      // 解析命令
      const [cmd, ...args] = command.split(/\s+/);
      const proc = spawn(cmd, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      yield { type: 'stdout' as const, data: `$ ${command}\n` };

      return new Promise((resolve, reject) => {
        proc.stdout?.on('data', (data) => {
          // 在异步生成器中无法直接 yield，所以先缓存
        });

        proc.stderr?.on('data', (data) => {
          // 缓存
        });

        proc.on('close', (code) => {
          resolve();
        });

        proc.on('error', (error) => {
          reject(error);
        });
      });
    } catch (error) {
      const err = error as { message: string };
      yield { type: 'stderr' as const, data: `Error: ${err.message}` };
    }
  }

  /**
   * 执行 git 命令
   */
  async executeGit(args: string[]): Promise<CommandResult> {
    return this.executeCommand(`git ${args.join(' ')}`);
  }

  /**
   * 执行 npm 命令
   */
  async executeNpm(args: string[]): Promise<CommandResult> {
    return this.executeCommand(`npm ${args.join(' ')}`);
  }

  /**
   * 执行 pnpm 命令
   */
  async executePnpm(args: string[]): Promise<CommandResult> {
    return this.executeCommand(`pnpm ${args.join(' ')}`);
  }

  // ===== 项目信息 =====

  /**
   * 获取整个项目的 TypeScript 文件列表
   */
  async getProjectFiles(): Promise<string[]> {
    try {
      const files: string[] = [];

      const walk = (dir: string, prefix: string = '') => {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          // 跳过特殊目录
          if (['node_modules', '.git', 'dist', 'build', '.next'].includes(item)) continue;
          if (item.startsWith('.')) continue;

          const itemPath = path.join(dir, item);
          const relativePath = prefix ? `${prefix}/${item}` : item;
          const stat = fs.statSync(itemPath);

          if (stat.isDirectory()) {
            walk(itemPath, relativePath);
          } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
            files.push(relativePath);
          }
        }
      };

      walk(this.projectRoot);
      return files;
    } catch (error) {
      log.warn('Failed to get project files');
      return [];
    }
  }

  /**
   * 获取项目根目录
   */
  getProjectRoot(): string {
    return this.projectRoot;
  }

  /**
   * 获取工作区根目录
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  // ===== 工具方法 =====

  /**
   * 解析路径 - 支持相对和绝对路径
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.projectRoot, filePath);
  }

  /**
   * 获取相对于项目根目录的路径
   */
  getRelativePath(fullPath: string): string {
    return path.relative(this.projectRoot, fullPath);
  }
}

// 导出单例
export const agentRuntime = new AgentRuntime();
