import { execSync } from 'child_process';
import { createLogger } from '../../core/logger';
import type { ToolDefinition } from '../types';

const log = createLogger('execTools');

export const execCommandTool: ToolDefinition = {
  id: 'exec_command',
  name: 'Execute Command',
  description: 'Execute a shell command and return the output',
  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'Shell command to execute',
      required: true,
    },
    {
      name: 'cwd',
      type: 'string',
      description: 'Optional: Working directory',
      required: false,
    },
  ],
  execute: async (params) => {
    const command = String(params.command);
    const cwd = params.cwd ? String(params.cwd) : process.cwd();

    log.info(`Executing command: ${command} (cwd: ${cwd})`);

    try {
      const output = execSync(command, {
        cwd,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });
      log.info(`Command succeeded: ${command}`);
      return output;
    } catch (error) {
      const execError = error as { stderr?: string; stdout?: string; message: string };
      const stderr = execError.stderr || '';
      const stdout = execError.stdout || '';
      const errorMsg = `Command failed: ${execError.message}\nStderr: ${stderr}\nStdout: ${stdout}`;
      log.error(errorMsg);
      return errorMsg;
    }
  },
};

export const runNpmTool: ToolDefinition = {
  id: 'run_npm',
  name: 'Run NPM Script',
  description: 'Run an npm script defined in package.json',
  parameters: [
    {
      name: 'script',
      type: 'string',
      description: 'Script name (e.g., "build", "test", "dev")',
      required: true,
    },
    {
      name: 'cwd',
      type: 'string',
      description: 'Optional: Working directory with package.json',
      required: false,
    },
  ],
  execute: async (params) => {
    const script = String(params.script);
    const cwd = params.cwd ? String(params.cwd) : process.cwd();

    log.info(`Running npm script: ${script} (cwd: ${cwd})`);

    try {
      const output = execSync(`npm run ${script}`, {
        cwd,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });
      log.info(`npm script succeeded: ${script}`);
      return output;
    } catch (error) {
      const execError = error as { stderr?: string; message: string };
      const stderr = execError.stderr || '';
      const errorMsg = `npm script failed: ${execError.message}\nStderr: ${stderr}`;
      log.error(errorMsg);
      return errorMsg;
    }
  },
};

export const runPnpmTool: ToolDefinition = {
  id: 'run_pnpm',
  name: 'Run PNPM Script',
  description: 'Run a pnpm script defined in package.json',
  parameters: [
    {
      name: 'script',
      type: 'string',
      description: 'Script name (e.g., "build", "test", "dev")',
      required: true,
    },
    {
      name: 'cwd',
      type: 'string',
      description: 'Optional: Working directory with package.json',
      required: false,
    },
  ],
  execute: async (params) => {
    const script = String(params.script);
    const cwd = params.cwd ? String(params.cwd) : process.cwd();

    log.info(`Running pnpm script: ${script} (cwd: ${cwd})`);

    try {
      const output = execSync(`pnpm run ${script}`, {
        cwd,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });
      log.info(`pnpm script succeeded: ${script}`);
      return output;
    } catch (error) {
      const execError = error as { stderr?: string; message: string };
      const stderr = execError.stderr || '';
      const errorMsg = `pnpm script failed: ${execError.message}\nStderr: ${stderr}`;
      log.error(errorMsg);
      return errorMsg;
    }
  },
};
