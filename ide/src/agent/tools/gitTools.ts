import { execSync } from 'child_process';
import { createLogger } from '../../core/logger';
import type { ToolDefinition } from '../types';

const log = createLogger('gitTools');

export const gitStatusTool: ToolDefinition = {
  id: 'git_status',
  name: 'Git Status',
  description: 'Get current git status',
  parameters: [
    {
      name: 'cwd',
      type: 'string',
      description: 'Repository root directory',
      required: false,
    },
  ],
  execute: async (params) => {
    const cwd = params.cwd ? String(params.cwd) : process.cwd();

    log.info(`Git status in: ${cwd}`);

    try {
      const output = execSync('git status --short', {
        cwd,
        encoding: 'utf-8',
      });
      log.info(`Git status succeeded`);
      return output || '(no changes)';
    } catch (error) {
      const gitError = error as { message: string };
      const errorMsg = `Git status failed: ${gitError.message}`;
      log.error(errorMsg);
      throw new Error(errorMsg);
    }
  },
};

export const gitDiffTool: ToolDefinition = {
  id: 'git_diff',
  name: 'Git Diff',
  description: 'Show changes between commits, branches, or working tree',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Optional: File path to diff',
      required: false,
    },
    {
      name: 'staged',
      type: 'boolean',
      description: 'Show staged changes (default: false)',
      required: false,
    },
  ],
  execute: async (params) => {
    const filePath = params.path ? ` "${String(params.path)}"` : '';
    const staged = params.staged ? ' --staged' : '';

    log.info(`Git diff${staged}${filePath}`);

    try {
      const output = execSync(`git diff${staged}${filePath}`, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });
      log.info(`Git diff succeeded`);
      return output || '(no diff)';
    } catch (error) {
      const gitError = error as { message: string };
      const errorMsg = `Git diff failed: ${gitError.message}`;
      log.error(errorMsg);
      throw new Error(errorMsg);
    }
  },
};

export const gitCommitTool: ToolDefinition = {
  id: 'git_commit',
  name: 'Git Commit',
  description: 'Create a new commit with staged changes',
  parameters: [
    {
      name: 'message',
      type: 'string',
      description: 'Commit message',
      required: true,
    },
  ],
  execute: async (params) => {
    const message = String(params.message);

    log.info(`Creating commit: ${message}`);

    try {
      execSync(`git add -A`, { encoding: 'utf-8' });
      const output = execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
        encoding: 'utf-8',
      });
      log.info(`Commit created: ${message}`);
      return output;
    } catch (error) {
      const gitError = error as { message: string };
      const errorMsg = `Git commit failed: ${gitError.message}`;
      log.error(errorMsg);
      throw new Error(errorMsg);
    }
  },
};

export const gitLogTool: ToolDefinition = {
  id: 'git_log',
  name: 'Git Log',
  description: 'Show commit history',
  parameters: [
    {
      name: 'limit',
      type: 'number',
      description: 'Number of commits to show (default: 10)',
      required: false,
    },
  ],
  execute: async (params) => {
    const limit = Number(params.limit) || 10;

    log.info(`Git log (limit: ${limit})`);

    try {
      const output = execSync(`git log --oneline -n ${limit}`, {
        encoding: 'utf-8',
      });
      log.info(`Git log succeeded`);
      return output;
    } catch (error) {
      const gitError = error as { message: string };
      const errorMsg = `Git log failed: ${gitError.message}`;
      log.error(errorMsg);
      throw new Error(errorMsg);
    }
  },
};
