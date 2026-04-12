import { createLogger } from '../core/logger';
import { ToolRegistry } from './toolRegistry';
import type { AgentTask, TaskEventListener } from './types';
import { TaskStatus as TaskStatusEnum } from './types';

const log = createLogger('TaskQueue');

export class TaskQueue {
  private queue: AgentTask[] = [];
  private currentTask?: AgentTask;
  private listeners: TaskEventListener[] = [];
  private isProcessing = false;

  enqueue(task: AgentTask): void {
    log.info(`Task enqueued: ${task.id} - ${task.objective}`);
    this.queue.push(task);
  }

  async execute(toolRegistry: ToolRegistry): Promise<void> {
    if (this.isProcessing) {
      log.warn('Already processing tasks, skipping');
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      this.currentTask = this.queue.shift()!;
      this.currentTask.status = TaskStatusEnum.RUNNING;
      this.currentTask.startedAt = Date.now();
      this.emit(this.currentTask);

      log.info(`Task started: ${this.currentTask.id}`);

      try {
        // Simulate AI agent processing by running tool calls
        // In a real scenario, this would call ChatController with AI gateway
        await this.processTask(this.currentTask, toolRegistry);

        this.currentTask.status = TaskStatusEnum.COMPLETED;
        this.currentTask.completedAt = Date.now();
        log.info(`Task completed: ${this.currentTask.id}`);
      } catch (error) {
        this.currentTask.retries++;
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (this.currentTask.retries < this.currentTask.maxRetries) {
          log.warn(
            `Task failed, retrying (${this.currentTask.retries}/${this.currentTask.maxRetries}): ${errorMsg}`
          );
          this.currentTask.status = TaskStatusEnum.PENDING;
          this.queue.unshift(this.currentTask);
        } else {
          log.error(`Task failed (max retries reached): ${errorMsg}`);
          this.currentTask.status = TaskStatusEnum.FAILED;
          this.currentTask.error = errorMsg;
          this.currentTask.completedAt = Date.now();
        }
      }

      this.emit(this.currentTask);
    }

    this.isProcessing = false;
  }

  private async processTask(task: AgentTask, toolRegistry: ToolRegistry): Promise<void> {
    // Parse and execute tool calls from task objective
    // This is a simplified version - in real scenario, this would be driven by AI response

    const toolCallPattern = /<tool\s+id="([^"]+)">([\s\S]*?)<\/tool>/g;
    let match;

    while ((match = toolCallPattern.exec(task.objective)) !== null) {
      const toolId = match[1];
      const paramsXml = match[2];
      const params = this.parseToolParams(paramsXml);

      const toolCallId = `tool-${Date.now()}-${Math.random()}`;

      try {
        const result = await toolRegistry.execute(toolId, params);

        task.toolCalls.push({
          id: toolCallId,
          toolId,
          params,
          result,
          timestamp: Date.now(),
        });

        task.messages.push({
          role: 'tool',
          content: `Tool ${toolId} result: ${result}`,
          timestamp: Date.now(),
        });

        log.info(`Tool ${toolId} executed successfully`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        task.toolCalls.push({
          id: toolCallId,
          toolId,
          params,
          error: errorMsg,
          timestamp: Date.now(),
        });

        task.messages.push({
          role: 'tool',
          content: `Tool ${toolId} error: ${errorMsg}`,
          timestamp: Date.now(),
        });

        log.error(`Tool ${toolId} failed: ${errorMsg}`);
      }

      this.emit(task);
    }

    task.result = `Task completed. Executed ${task.toolCalls.length} tool calls.`;
  }

  private parseToolParams(xml: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    const paramPattern = /<param\s+name="([^"]+)">([^<]*)<\/param>/g;
    let match;

    while ((match = paramPattern.exec(xml)) !== null) {
      params[match[1]] = match[2];
    }

    return params;
  }

  on(listener: TaskEventListener): void {
    this.listeners.push(listener);
  }

  private emit(task: AgentTask): void {
    this.listeners.forEach((l) => {
      try {
        l(task);
      } catch (error) {
        log.error(`Error in task listener: ${error}`);
      }
    });
  }

  getCurrentTask(): AgentTask | undefined {
    return this.currentTask;
  }

  getQueue(): AgentTask[] {
    return [...this.queue];
  }

  cancel(taskId: string): boolean {
    if (this.currentTask?.id === taskId) {
      this.currentTask.status = TaskStatusEnum.CANCELLED;
      return true;
    }

    const index = this.queue.findIndex((t) => t.id === taskId);
    if (index > -1) {
      this.queue[index].status = TaskStatusEnum.CANCELLED;
      return true;
    }

    return false;
  }
}
