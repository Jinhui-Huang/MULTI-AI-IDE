import { createLogger } from '../core/logger';
import type { ToolDefinition } from './types';

const log = createLogger('ToolRegistry');

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    log.info(`Registering tool: ${tool.id}`);
    this.tools.set(tool.id, tool);
  }

  get(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool descriptions formatted for AI context
   */
  getToolsForPrompt(): string {
    return this.getAll()
      .map(
        (t) =>
          `**${t.id}**: ${t.description}\nParameters: ${JSON.stringify(
            t.parameters.map((p) => ({
              name: p.name,
              type: p.type,
              description: p.description,
              required: p.required,
            }))
          )}`
      )
      .join('\n\n');
  }

  async execute(toolId: string, params: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`);
    }

    log.info(`Executing tool: ${toolId} with params: ${JSON.stringify(params)}`);

    try {
      const result = await tool.execute(params);
      log.info(`Tool ${toolId} completed successfully`);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Tool ${toolId} failed: ${errorMsg}`);
      throw error;
    }
  }
}
