export type TaskStatus =
  | 'created' | 'planning' | 'waiting_plan_approval' | 'analyzing_codebase' | 'developing_patch'
  | 'reviewing' | 'waiting_patch_approval' | 'applying_patch' | 'testing' | 'fixing'
  | 'completed' | 'failed' | 'cancelled' | 'paused';

export interface ContextRefs {
  currentFile?: boolean;
  selection?: boolean;
  terminalError?: boolean;
  gitDiff?: boolean;
  files?: string[];
}

export interface CreateTaskRequest {
  workspaceRoot: string;
  userRequest: string;
  teamId: string;
  workflowId: string;
  mode: 'auto' | 'semi-auto' | 'manual';
  targetAgent?: string;
  contextRefs: ContextRefs;
}

export interface TaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  currentStep?: string;
}
