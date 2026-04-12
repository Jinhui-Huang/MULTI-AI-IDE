import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../../core/logger';
import type { ToolDefinition } from '../types';

const log = createLogger('fileTools');

export const readFileTool: ToolDefinition = {
  id: 'read_file',
  name: 'Read File',
  description: 'Read the contents of a file at the given path',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Absolute or relative file path',
      required: true,
    },
    {
      name: 'startLine',
      type: 'number',
      description: 'Optional: Start line number (1-indexed)',
      required: false,
    },
    {
      name: 'endLine',
      type: 'number',
      description: 'Optional: End line number (1-indexed)',
      required: false,
    },
  ],
  execute: async (params) => {
    const filePath = String(params.path);
    log.info(`Reading file: ${filePath}`);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      if (params.startLine || params.endLine) {
        const lines = content.split('\n');
        const start = (Number(params.startLine) || 1) - 1;
        const end = Number(params.endLine) || lines.length;
        const sliced = lines.slice(start, end).join('\n');
        log.info(`Read file ${filePath} lines ${start + 1}-${end}`);
        return sliced;
      }

      log.info(`Read file ${filePath} (${content.length} chars)`);
      return content;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Failed to read file ${filePath}: ${errorMsg}`);
      throw error;
    }
  },
};

export const writeFileTool: ToolDefinition = {
  id: 'write_file',
  name: 'Write File',
  description: 'Write or overwrite the contents of a file',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'File path',
      required: true,
    },
    {
      name: 'content',
      type: 'string',
      description: 'File contents to write',
      required: true,
    },
  ],
  execute: async (params) => {
    const filePath = String(params.path);
    const content = String(params.content);
    log.info(`Writing file: ${filePath} (${content.length} chars)`);

    try {
      // Create parent directory if needed
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        log.info(`Created directory: ${dir}`);
      }

      fs.writeFileSync(filePath, content, 'utf-8');
      log.info(`File written: ${filePath}`);
      return `File written: ${filePath}`;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Failed to write file ${filePath}: ${errorMsg}`);
      throw error;
    }
  },
};

export const listDirTool: ToolDefinition = {
  id: 'list_dir',
  name: 'List Directory',
  description: 'List files and subdirectories in a directory',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Directory path',
      required: true,
    },
  ],
  execute: async (params) => {
    const dirPath = String(params.path);
    log.info(`Listing directory: ${dirPath}`);

    try {
      const files = fs.readdirSync(dirPath);
      const details = files
        .map((file) => {
          const fullPath = path.join(dirPath, file);
          const stat = fs.statSync(fullPath);
          return `${stat.isDirectory() ? '[DIR]' : '[FILE]'} ${file}`;
        })
        .join('\n');

      log.info(`Listed directory ${dirPath} (${files.length} items)`);
      return details;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Failed to list directory ${dirPath}: ${errorMsg}`);
      throw error;
    }
  },
};

export const deleteFileTool: ToolDefinition = {
  id: 'delete_file',
  name: 'Delete File',
  description: 'Delete a file at the given path',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'File path to delete',
      required: true,
    },
  ],
  execute: async (params) => {
    const filePath = String(params.path);
    log.info(`Deleting file: ${filePath}`);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        log.info(`File deleted: ${filePath}`);
        return `File deleted: ${filePath}`;
      } else {
        throw new Error(`File not found: ${filePath}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Failed to delete file ${filePath}: ${errorMsg}`);
      throw error;
    }
  },
};
