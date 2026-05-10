import * as path from 'path';
export class PathGuard {
  constructor(private readonly workspaceRoot: string) {}
  resolveInside(relativeOrAbsolutePath: string): string {
    const root = path.resolve(this.workspaceRoot);
    const target = path.resolve(root, relativeOrAbsolutePath);
    if (!target.startsWith(root + path.sep) && target !== root) {
      throw new Error(`Path is outside workspace: ${relativeOrAbsolutePath}`);
    }
    return target;
  }
  isSensitive(filePath: string, patterns: string[]): boolean {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    return patterns.some(p => {
      const pat = p.toLowerCase().replace(/\*/g, '');
      return normalized.includes(pat);
    });
  }
}
