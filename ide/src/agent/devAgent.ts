import { createLogger } from '../core/logger';
import { TaskQueue } from './taskQueue';
import { ToolRegistry } from './toolRegistry';
import type { AgentTask, TaskEventListener } from './types';
import { TaskStatus as TaskStatusEnum } from './types';

const log = createLogger('DevAgent');

export class DevAgent {
  private taskQueue = new TaskQueue();
  private toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
    log.info('DevAgent initialized');
  }

  async submitTask(objective: string): Promise<string> {
    const task: AgentTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'agent_run',
      status: TaskStatusEnum.PENDING,
      objective,
      messages: [
        {
          role: 'user',
          content: objective,
          timestamp: Date.now(),
        },
      ],
      toolCalls: [],
      result: undefined,
      error: undefined,
      createdAt: Date.now(),
      retries: 0,
      maxRetries: 3,
    };

    log.info(`Task submitted: ${task.id}`);

    this.taskQueue.enqueue(task);
    await this.taskQueue.execute(this.toolRegistry);

    return task.result || task.error || 'Unknown result';
  }

  getCurrentTask(): AgentTask | undefined {
    return this.taskQueue.getCurrentTask();
  }

  getTaskQueue(): AgentTask[] {
    return this.taskQueue.getQueue();
  }

  onTaskUpdate(listener: TaskEventListener): void {
    this.taskQueue.on(listener);
  }

  cancelTask(taskId: string): boolean {
    return this.taskQueue.cancel(taskId);
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }
}
