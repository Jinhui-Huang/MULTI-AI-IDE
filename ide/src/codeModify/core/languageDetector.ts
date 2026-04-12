/**
 * 语言检测系统
 */

import * as path from 'path';
import { SupportedLanguage, LanguageConfig } from './types';
import { createLogger } from '../../core/logger';

const log = createLogger('LanguageDetector');

/**
 * 语言检测和配置管理
 */
export class LanguageDetector {
  /**
   * 从文件路径检测编程语言
   */
  static detectLanguage(filePath: string): SupportedLanguage | null {
    const ext = path.extname(filePath).toLowerCase();

    const extensionMap: Record<string, SupportedLanguage> = {
      '.java': 'java',
      '.py': 'python',
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.cc': 'cpp',
      '.cxx': 'cpp',
      '.c': 'cpp',
      '.cs': 'csharp',
      '.kt': 'kotlin',
      '.swift': 'swift',
    };

    const detected = extensionMap[ext];
    if (detected) {
      log.info(`[LangDetect] Detected language: ${detected} for ${filePath}`);
      return detected;
    }

    log.warn(`[LangDetect] Unknown file extension: ${ext}`);
    return null;
  }

  /**
   * 获取语言配置
   */
  static getLanguageConfig(language: SupportedLanguage): LanguageConfig | null {
    const configs = this.getAllLanguageConfigs();
    return configs[language] || null;
  }

  /**
   * 获取所有语言配置
   */
  static getAllLanguageConfigs(): Record<SupportedLanguage, LanguageConfig> {
    return {
      java: {
        language: 'java',
        fileExtensions: ['.java'],
        formatter: 'google-java-format',
        useTreeSitter: false, // Java 用 JDTLS/LSP
        lspServer: 'eclipse-jdt',
        adapter: null!, // Will be injected
      },
      python: {
        language: 'python',
        fileExtensions: ['.py'],
        formatter: 'black',
        useTreeSitter: false, // Python 用 Pylance/LSP
        lspServer: 'pylance',
        adapter: null!,
      },
      javascript: {
        language: 'javascript',
        fileExtensions: ['.js', '.jsx'],
        formatter: 'prettier',
        useTreeSitter: true, // 用 Tree-sitter
        adapter: null!,
      },
      typescript: {
        language: 'typescript',
        fileExtensions: ['.ts', '.tsx'],
        formatter: 'prettier',
        useTreeSitter: false, // TypeScript 用 LSP
        lspServer: 'typescript-language-server',
        adapter: null!,
      },
      go: {
        language: 'go',
        fileExtensions: ['.go'],
        formatter: 'gofmt',
        useTreeSitter: false, // Go 用 gopls/LSP
        lspServer: 'gopls',
        adapter: null!,
      },
      rust: {
        language: 'rust',
        fileExtensions: ['.rs'],
        formatter: 'rustfmt',
        useTreeSitter: true,
        adapter: null!,
      },
      cpp: {
        language: 'cpp',
        fileExtensions: ['.cpp', '.cc', '.cxx', '.c', '.h', '.hpp'],
        formatter: 'clang-format',
        useTreeSitter: true,
        adapter: null!,
      },
      csharp: {
        language: 'csharp',
        fileExtensions: ['.cs'],
        formatter: 'dotnet-format',
        useTreeSitter: true,
        adapter: null!,
      },
      kotlin: {
        language: 'kotlin',
        fileExtensions: ['.kt'],
        formatter: 'ktlint',
        useTreeSitter: true,
        adapter: null!,
      },
      swift: {
        language: 'swift',
        fileExtensions: ['.swift'],
        formatter: 'swiftformat',
        useTreeSitter: true,
        adapter: null!,
      },
    };
  }

  /**
   * 检查是否支持该语言
   */
  static isLanguageSupported(language: SupportedLanguage): boolean {
    const configs = this.getAllLanguageConfigs();
    return language in configs;
  }

  /**
   * 根据文件路径获取完整的语言配置
   */
  static getLanguageConfigByFile(filePath: string): LanguageConfig | null {
    const language = this.detectLanguage(filePath);
    if (!language) {
      return null;
    }
    return this.getLanguageConfig(language);
  }
}

/**
 * 语言能力检查
 */
export class LanguageCapabilities {
  /**
   * 检查是否可以用 LSP 处理
   */
  static canUseLSP(language: SupportedLanguage): boolean {
    const config = LanguageDetector.getLanguageConfig(language);
    return config?.lspServer != null;
  }

  /**
   * 检查是否可以用 Tree-sitter 处理
   */
  static canUseTreeSitter(language: SupportedLanguage): boolean {
    const config = LanguageDetector.getLanguageConfig(language);
    return config?.useTreeSitter ?? false;
  }

  /**
   * 获取建议的处理方法（优先级）
   */
  static getRecommendedApproach(language: SupportedLanguage): 'lsp' | 'tree-sitter' | 'fallback' {
    // 优先用 LSP（更准确）
    if (this.canUseLSP(language)) {
      return 'lsp';
    }
    // 其次用 Tree-sitter
    if (this.canUseTreeSitter(language)) {
      return 'tree-sitter';
    }
    // 降级到规范化 + SEARCH/REPLACE
    return 'fallback';
  }
}
