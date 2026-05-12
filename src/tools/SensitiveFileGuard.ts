import * as path from 'path';
import { ConfigStore } from '../storage/ConfigStore';
import { ToolError } from './ToolTypes';

const DEFAULT_SENSITIVE_PATTERNS = [
  '.env',
  '*.pem',
  'id_rsa',
  'id_ed25519',
  'credentials.json',
  'application-prod.yml',
  '*.p12',
  '*.key'
];

export class SensitiveFileGuard {
  constructor(private readonly configStore: ConfigStore) {}

  async assertNotSensitive(relativePath: string): Promise<void> {
    if (await this.isSensitive(relativePath)) {
      throw new ToolError('SENSITIVE_FILE_BLOCKED', `Sensitive file blocked: ${relativePath}`);
    }
  }

  async isSensitive(relativePath: string): Promise<boolean> {
    const patterns = await this.getPatterns();
    const normalized = relativePath.replace(/\\/g, '/');
    const basename = path.posix.basename(normalized);
    return patterns.some((pattern) => this.matches(pattern, normalized, basename));
  }

  private async getPatterns(): Promise<string[]> {
    try {
      const config = await this.configStore.loadToolsConfig();
      return config.sensitiveFileBlocklist.length > 0
        ? config.sensitiveFileBlocklist
        : DEFAULT_SENSITIVE_PATTERNS;
    } catch {
      return DEFAULT_SENSITIVE_PATTERNS;
    }
  }

  private matches(pattern: string, relativePath: string, basename: string): boolean {
    const normalizedPattern = pattern.trim().replace(/\\/g, '/');
    if (!normalizedPattern) {
      return false;
    }

    if (!normalizedPattern.includes('*')) {
      return relativePath === normalizedPattern || basename === normalizedPattern;
    }

    const regex = new RegExp(`^${normalizedPattern
      .split('*')
      .map((part) => this.escapeRegex(part))
      .join('.*')}$`, 'i');
    return regex.test(relativePath) || regex.test(basename);
  }

  private escapeRegex(value: string): string {
    return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
}
