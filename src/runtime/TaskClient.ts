import { ExtensionApiClient } from './ExtensionApiClient';
import { CreateTaskRequest } from '../types/task';
export class TaskClient {
  constructor(private readonly api: ExtensionApiClient) {}
  create(req: CreateTaskRequest): Promise<unknown> { return this.api.post('/api/tasks', req); }
  pause(taskId: string): Promise<unknown> { return this.api.post(`/api/tasks/${taskId}/pause`, {}); }
  resume(taskId: string): Promise<unknown> { return this.api.post(`/api/tasks/${taskId}/resume`, {}); }
  cancel(taskId: string): Promise<unknown> { return this.api.post(`/api/tasks/${taskId}/cancel`, {}); }
}
